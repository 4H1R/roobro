package meetings

import (
	"context"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/4H1R/roobro/internal/domain"
)

type MemoryRepository struct {
	mu             sync.RWMutex
	meetings       map[string]*domain.Meeting
	analyticsState map[string]*meetingAnalyticsState
	chats          map[string]*meetingChat
	now            func() time.Time
	creates        *rate.Limiter
}

const (
	maxMeetings         = 100
	maxChatSessions     = 100
	maxChatMessages     = 200
	maxAnalyticsEntries = 1024
	maxBannedIdentities = 1000
	unusedMeetingTTL    = time.Hour
	endedMeetingTTL     = 15 * time.Minute
	chatSessionTTL      = 12 * time.Hour
	chatIdleTTL         = 5 * time.Minute
)

type meetingAnalyticsState struct {
	processedEventIDs  map[string]struct{}
	seenParticipants   map[string]struct{}
	activeParticipants map[string]struct{}
	seenTrackIDs       map[string]struct{}
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{
		meetings:       make(map[string]*domain.Meeting),
		chats:          make(map[string]*meetingChat),
		analyticsState: make(map[string]*meetingAnalyticsState),
		now:            time.Now,
		creates:        rate.NewLimiter(rate.Every(time.Second), 10),
	}
}

func (r *MemoryRepository) Create(_ context.Context, meeting *domain.Meeting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanupLocked()
	if len(r.meetings) >= maxMeetings {
		return domain.ErrCapacity
	}
	if !r.creates.AllowN(r.now(), 1) {
		return domain.ErrRateLimited
	}
	if _, exists := r.meetings[meeting.Code]; exists {
		return domain.ErrCapacity
	}
	r.meetings[meeting.Code] = cloneMeeting(meeting)
	r.meetings[meeting.Code].LastActivityAt = r.now()
	r.analyticsState[meeting.Code] = newMeetingAnalyticsState()
	r.chats[meeting.Code] = &meetingChat{sessions: make(map[string]chatSession), joins: rate.NewLimiter(10, 20), sends: rate.NewLimiter(10, 20)}
	return nil
}

func (r *MemoryRepository) ByCode(_ context.Context, code string) (*domain.Meeting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanupLocked()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, domain.ErrMeetingNotFound
	}
	return cloneMeeting(meeting), nil
}

func (r *MemoryRepository) ByLiveKitRoomName(_ context.Context, roomName string) (*domain.Meeting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanupLocked()
	for _, meeting := range r.meetings {
		if meeting.LiveKitRoomName == roomName {
			return cloneMeeting(meeting), nil
		}
	}
	return nil, domain.ErrMeetingNotFound
}

func (r *MemoryRepository) Activate(_ context.Context, code string, at time.Time) (*domain.Meeting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanupLocked()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return nil, domain.ErrMeetingEnded
	}
	if meeting.Status == domain.MeetingCreated {
		meeting.Status = domain.MeetingActive
		meeting.StartedAt = &at
	}
	meeting.LastActivityAt = r.now()
	return cloneMeeting(meeting), nil
}

func (r *MemoryRepository) BanParticipant(_ context.Context, code, identity string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return false, domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return false, domain.ErrMeetingEnded
	}
	if participantIsBanned(meeting, identity) {
		return false, nil
	}
	if len(meeting.BannedParticipantIdentities) >= maxBannedIdentities {
		return false, domain.ErrCapacity
	}
	meeting.BannedParticipantIdentities = append(meeting.BannedParticipantIdentities, identity)
	for token, session := range r.chats[code].sessions {
		if session.identity == identity {
			delete(r.chats[code].sessions, token)
		}
	}
	return true, nil
}

func (r *MemoryRepository) Finish(_ context.Context, code string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return domain.ErrMeetingNotFound
	}
	if meeting.Status != domain.MeetingEnded {
		meeting.Status = domain.MeetingEnded
		meeting.EndedAt = &at
		meeting.Analytics.CurrentParticipants = 0
		delete(r.chats, code)
		delete(r.analyticsState, code)
	}
	return nil
}

// Cleanup is also called on reads/admission; the server timer releases unused
// and ended state even when there is no traffic. Active meetings end via the
// LiveKit empty-room webhook or host, and always count against the hard cap.
func (r *MemoryRepository) Cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanupLocked()
	for _, chat := range r.chats {
		for token, session := range chat.sessions {
			if session.expired(r.now()) {
				delete(chat.sessions, token)
			}
		}
	}
}

func (r *MemoryRepository) cleanupLocked() {
	now := r.now()
	for code, meeting := range r.meetings {
		expired := meeting.Status == domain.MeetingCreated && now.Sub(meeting.CreatedAt) >= unusedMeetingTTL
		expired = expired || (meeting.Status == domain.MeetingEnded && meeting.EndedAt != nil && now.Sub(*meeting.EndedAt) >= endedMeetingTTL)
		expired = expired || (meeting.Demo && meeting.Status == domain.MeetingActive && now.Sub(meeting.LastActivityAt) >= chatIdleTTL)
		if expired {
			delete(r.meetings, code)
			delete(r.chats, code)
			delete(r.analyticsState, code)
		}
	}
}

func (r *MemoryRepository) RecordAnalyticsEvent(_ context.Context, roomName string, event domain.MeetingAnalyticsEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	code, meeting, ok := r.meetingByRoomName(roomName)
	if !ok {
		return domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return nil
	}
	if event.Kind == domain.MeetingAnalyticsParticipantLeft {
		// Bind departure to both identity and the exact session. Older clients
		// or participants that modify their attributes fall back to idle expiry.
		for token, session := range r.chats[code].sessions {
			if session.identity == event.ParticipantIdentity && event.ChatSessionID == domain.ChatSessionID(token) {
				delete(r.chats[code].sessions, token)
			}
		}
	}
	if len(event.ID) > 256 || len(event.ParticipantIdentity) > 256 || len(event.TrackID) > 256 {
		meeting.Analytics.Truncated = true
		return nil
	}

	state := r.analyticsState[code]
	if state == nil {
		state = newMeetingAnalyticsState()
		r.analyticsState[code] = state
	}
	// Stop accepting new detailed analytics once its bounded deduplication
	// window fills. Mark totals as partial instead of silently forgetting IDs.
	for _, entry := range []struct {
		value string
		set   map[string]struct{}
	}{
		{event.ID, state.processedEventIDs},
		{event.ParticipantIdentity, state.seenParticipants},
		{event.TrackID, state.seenTrackIDs},
	} {
		if entry.value != "" {
			if _, exists := entry.set[entry.value]; !exists && len(entry.set) >= maxAnalyticsEntries {
				meeting.Analytics.Truncated = true
				if event.Kind == domain.MeetingAnalyticsParticipantLeft {
					delete(state.activeParticipants, event.ParticipantIdentity)
					meeting.Analytics.CurrentParticipants = len(state.activeParticipants)
				}
				if event.Kind == domain.MeetingAnalyticsRoomFinished {
					clear(state.activeParticipants)
					meeting.Analytics.CurrentParticipants = 0
				}
				return nil
			}
		}
	}
	if event.ID != "" {
		if _, processed := state.processedEventIDs[event.ID]; processed {
			return nil
		}
		state.processedEventIDs[event.ID] = struct{}{}
	}

	switch event.Kind {
	case domain.MeetingAnalyticsParticipantJoined:
		if event.ParticipantIdentity == "" {
			return nil
		}
		meeting.Analytics.ParticipantJoins++
		if _, seen := state.seenParticipants[event.ParticipantIdentity]; !seen {
			state.seenParticipants[event.ParticipantIdentity] = struct{}{}
			meeting.Analytics.UniqueParticipants++
		}
		state.activeParticipants[event.ParticipantIdentity] = struct{}{}
		meeting.Analytics.CurrentParticipants = len(state.activeParticipants)
		if meeting.Analytics.CurrentParticipants > meeting.Analytics.PeakParticipants {
			meeting.Analytics.PeakParticipants = meeting.Analytics.CurrentParticipants
		}
	case domain.MeetingAnalyticsParticipantLeft:
		delete(state.activeParticipants, event.ParticipantIdentity)
		meeting.Analytics.CurrentParticipants = len(state.activeParticipants)
	case domain.MeetingAnalyticsCameraActivated,
		domain.MeetingAnalyticsScreenShareActivated,
		domain.MeetingAnalyticsMicrophoneActivated:
		if event.TrackID != "" {
			if _, seen := state.seenTrackIDs[event.TrackID]; seen {
				return nil
			}
			state.seenTrackIDs[event.TrackID] = struct{}{}
		}
		switch event.Kind {
		case domain.MeetingAnalyticsCameraActivated:
			meeting.Analytics.CameraActivations++
		case domain.MeetingAnalyticsScreenShareActivated:
			meeting.Analytics.ScreenShareActivations++
		case domain.MeetingAnalyticsMicrophoneActivated:
			meeting.Analytics.MicrophoneActivations++
		}
	case domain.MeetingAnalyticsParticipantModerated:
		meeting.Analytics.ParticipantsRemoved++
		if event.Banned {
			meeting.Analytics.ParticipantsBanned++
		}
	case domain.MeetingAnalyticsRoomFinished:
		clear(state.activeParticipants)
		meeting.Analytics.CurrentParticipants = 0
	}
	return nil
}

func (r *MemoryRepository) meetingByRoomName(roomName string) (string, *domain.Meeting, bool) {
	for code, meeting := range r.meetings {
		if meeting.LiveKitRoomName == roomName {
			return code, meeting, true
		}
	}
	return "", nil, false
}

func newMeetingAnalyticsState() *meetingAnalyticsState {
	return &meetingAnalyticsState{
		processedEventIDs:  make(map[string]struct{}),
		seenParticipants:   make(map[string]struct{}),
		activeParticipants: make(map[string]struct{}),
		seenTrackIDs:       make(map[string]struct{}),
	}
}

func cloneMeeting(meeting *domain.Meeting) *domain.Meeting {
	copy := *meeting
	copy.BannedParticipantIdentities = append([]string(nil), meeting.BannedParticipantIdentities...)
	return &copy
}

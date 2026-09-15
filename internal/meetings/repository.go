package meetings

import (
	"context"
	"sync"

	"github.com/4H1R/roobro/internal/domain"
)

type MemoryRepository struct {
	mu             sync.RWMutex
	meetings       map[string]*domain.Meeting
	analyticsState map[string]*meetingAnalyticsState
	chats          map[string]*meetingChat
}

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
	}
}

func (r *MemoryRepository) Create(_ context.Context, meeting *domain.Meeting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.meetings[meeting.Code] = cloneMeeting(meeting)
	r.analyticsState[meeting.Code] = newMeetingAnalyticsState()
	r.chats[meeting.Code] = &meetingChat{sessions: make(map[string]chatSession)}
	return nil
}

func (r *MemoryRepository) ByCode(_ context.Context, code string) (*domain.Meeting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, domain.ErrMeetingNotFound
	}
	return cloneMeeting(meeting), nil
}

func (r *MemoryRepository) ByLiveKitRoomName(_ context.Context, roomName string) (*domain.Meeting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, meeting := range r.meetings {
		if meeting.LiveKitRoomName == roomName {
			return cloneMeeting(meeting), nil
		}
	}
	return nil, domain.ErrMeetingNotFound
}

func (r *MemoryRepository) Update(_ context.Context, meeting *domain.Meeting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.meetings[meeting.Code]
	if !ok {
		return domain.ErrMeetingNotFound
	}
	updated := cloneMeeting(meeting)
	// Preserve fields mutated atomically by analytics and settings methods when
	// lifecycle or moderation updates were based on an older meeting snapshot.
	updated.Analytics = current.Analytics
	updated.ChatHistoryEnabled = current.ChatHistoryEnabled
	r.meetings[meeting.Code] = updated
	return nil
}

func (r *MemoryRepository) RecordAnalyticsEvent(_ context.Context, roomName string, event domain.MeetingAnalyticsEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	code, meeting, ok := r.meetingByRoomName(roomName)
	if !ok {
		return domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded && event.Kind != domain.MeetingAnalyticsRoomFinished {
		return nil
	}

	state := r.analyticsState[code]
	if state == nil {
		state = newMeetingAnalyticsState()
		r.analyticsState[code] = state
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

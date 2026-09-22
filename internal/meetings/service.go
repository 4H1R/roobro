package meetings

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/4H1R/roobro/internal/domain"
)

type service struct {
	repository domain.MeetingRepository
	livekit    domain.LiveKitClient
	now        func() time.Time
}

const (
	roomMaxParticipants = uint32(100)
	roomEmptyTimeout    = uint32(5 * 60)
)

func NewService(repository domain.MeetingRepository, livekit domain.LiveKitClient) domain.MeetingService {
	return &service{repository: repository, livekit: livekit, now: time.Now}
}

func (s *service) Create(ctx context.Context, input domain.CreateMeetingDTO) (*domain.CreateMeetingResponse, error) {
	id := uuid.NewString()
	code := shortCode()
	hostToken := secretToken()
	meeting := &domain.Meeting{ID: id, Code: code, Title: strings.TrimSpace(input.Title), LiveKitRoomName: "roobro-" + id, Status: domain.MeetingCreated, ChatHistoryEnabled: true, HostToken: hostToken, CreatedAt: s.now().UTC(), Demo: !s.livekit.Configured()}
	if err := s.repository.Create(ctx, meeting); err != nil {
		return nil, fmt.Errorf("meetings service create: %w", err)
	}
	return &domain.CreateMeetingResponse{Meeting: meeting, HostToken: hostToken}, nil
}

func (s *service) Get(ctx context.Context, code string) (*domain.Meeting, error) {
	return s.repository.ByCode(ctx, normalizeCode(code))
}

func (s *service) Join(ctx context.Context, code string, input domain.JoinMeetingDTO, hostToken string) (*domain.JoinMeetingResponse, error) {
	meeting, err := s.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	if meeting.Status == domain.MeetingEnded {
		return nil, domain.ErrMeetingEnded
	}
	identity, err := participantIdentity(meeting.ID, input.ParticipantID)
	if err != nil {
		return nil, err
	}
	if participantIsBanned(meeting, identity) {
		return nil, domain.ErrParticipantBanned
	}

	if meeting.Status == domain.MeetingCreated {
		if err := s.livekit.CreateRoom(ctx, meeting.LiveKitRoomName, roomMaxParticipants, roomEmptyTimeout, roomEmptyTimeout); err != nil {
			return nil, fmt.Errorf("meetings service join: %w", err)
		}
		active, err := s.repository.Activate(ctx, meeting.Code, s.now().UTC())
		if err != nil {
			// End may have completed while CreateRoom was in flight. Compensate
			// even if the caller disconnected, using a bounded cleanup context.
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			if cleanupErr := s.livekit.DeleteRoom(cleanupCtx, meeting.LiveKitRoomName); cleanupErr != nil {
				return nil, fmt.Errorf("meetings service activation (%v), cleanup: %w", err, cleanupErr)
			}
			return nil, err
		}
		meeting = active
	}

	isHost := hostToken != "" && hostToken == meeting.HostToken
	chatToken := secretToken()
	token, err := s.livekit.GenerateToken(meeting.LiveKitRoomName, identity, strings.TrimSpace(input.Name), isHost, chatToken)
	if err != nil {
		return nil, fmt.Errorf("meetings service token: %w", err)
	}
	role := "participant"
	if isHost {
		role = "host"
	}
	chat, err := s.repository.OpenChatSession(ctx, meeting.Code, identity, strings.TrimSpace(input.Name), chatToken)
	if err != nil {
		return nil, err
	}
	return &domain.JoinMeetingResponse{ChatToken: chatToken, Chat: chat, Meeting: meeting, Token: token, ServerURL: s.livekit.PublicURL(), Role: role, Identity: identity, Demo: !s.livekit.Configured()}, nil
}

func (s *service) ModerateParticipant(ctx context.Context, code string, input domain.ModerateParticipantDTO, hostToken string) error {
	meeting, err := s.Get(ctx, code)
	if err != nil {
		return err
	}
	if hostToken == "" || hostToken != meeting.HostToken {
		return domain.ErrHostRequired
	}
	if meeting.Status == domain.MeetingEnded {
		return domain.ErrMeetingEnded
	}
	identity, err := validateParticipantIdentity(input.Identity)
	if err != nil {
		return err
	}
	newlyBanned := false
	if input.Ban {
		newlyBanned, err = s.repository.BanParticipant(ctx, meeting.Code, identity)
		if err != nil {
			return fmt.Errorf("meetings service ban participant: %w", err)
		}
	}
	if err := s.livekit.RemoveParticipant(ctx, meeting.LiveKitRoomName, identity); err != nil {
		return fmt.Errorf("meetings service remove participant: %w", err)
	}
	if err := s.repository.RevokeChatSessions(ctx, meeting.Code, identity); err != nil {
		return err
	}
	if err := s.repository.RecordAnalyticsEvent(ctx, meeting.LiveKitRoomName, domain.MeetingAnalyticsEvent{Kind: domain.MeetingAnalyticsParticipantModerated, ParticipantIdentity: identity, Banned: newlyBanned}); err != nil {
		return fmt.Errorf("meetings service record moderation analytics: %w", err)
	}
	return nil
}

func (s *service) End(ctx context.Context, code, hostToken string) (*domain.Meeting, error) {
	meeting, err := s.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	if hostToken == "" || hostToken != meeting.HostToken {
		return nil, domain.ErrHostRequired
	}
	// Commit terminal state before external deletion. A retry still attempts
	// deletion if LiveKit was temporarily unavailable on the first call.
	if err := s.finish(ctx, meeting); err != nil {
		return nil, err
	}
	if err := s.livekit.DeleteRoom(ctx, meeting.LiveKitRoomName); err != nil {
		return nil, fmt.Errorf("meetings service end room: %w", err)
	}
	if err := s.repository.RecordAnalyticsEvent(ctx, meeting.LiveKitRoomName, domain.MeetingAnalyticsEvent{Kind: domain.MeetingAnalyticsRoomFinished}); err != nil {
		return nil, fmt.Errorf("meetings service finish analytics: %w", err)
	}
	return s.Get(ctx, meeting.Code)
}

func (s *service) HandleRoomFinished(ctx context.Context, roomName string) error {
	meeting, err := s.repository.ByLiveKitRoomName(ctx, roomName)
	if err != nil {
		return err
	}
	if meeting.Status != domain.MeetingEnded {
		if err := s.finish(ctx, meeting); err != nil {
			return err
		}
	}
	if err := s.repository.RecordAnalyticsEvent(ctx, roomName, domain.MeetingAnalyticsEvent{Kind: domain.MeetingAnalyticsRoomFinished}); err != nil {
		return fmt.Errorf("meetings service finish analytics: %w", err)
	}
	return nil
}

func (s *service) HandleAnalyticsEvent(ctx context.Context, roomName string, event domain.MeetingAnalyticsEvent) error {
	if err := s.repository.RecordAnalyticsEvent(ctx, roomName, event); err != nil {
		return fmt.Errorf("meetings service record analytics: %w", err)
	}
	return nil
}

func (s *service) finish(ctx context.Context, meeting *domain.Meeting) error {
	if err := s.repository.Finish(ctx, meeting.Code, s.now().UTC()); err != nil {
		return fmt.Errorf("meetings service end: %w", err)
	}
	return nil
}

func normalizeCode(value string) string { return strings.ToLower(strings.TrimSpace(value)) }

func participantIdentity(meetingID, participantID string) (string, error) {
	participantID = strings.TrimSpace(participantID)
	if participantID == "" {
		participantID = uuid.NewString()
	}
	if len(participantID) < 16 || len(participantID) > 128 {
		return "", domain.ErrInvalidParticipant
	}
	for _, character := range participantID {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') && character != '-' && character != '_' {
			return "", domain.ErrInvalidParticipant
		}
	}
	sum := sha256.Sum256([]byte(meetingID + "\x00" + participantID))
	return "guest-" + hex.EncodeToString(sum[:]), nil
}

func validateParticipantIdentity(identity string) (string, error) {
	identity = strings.TrimSpace(identity)
	if !strings.HasPrefix(identity, "guest-") {
		return "", domain.ErrInvalidParticipant
	}
	encoded := strings.TrimPrefix(identity, "guest-")
	decoded, err := hex.DecodeString(encoded)
	if err != nil || len(decoded) != sha256.Size {
		return "", domain.ErrInvalidParticipant
	}
	return "guest-" + strings.ToLower(encoded), nil
}

func participantIsBanned(meeting *domain.Meeting, identity string) bool {
	for _, bannedIdentity := range meeting.BannedParticipantIdentities {
		if bannedIdentity == identity {
			return true
		}
	}
	return false
}

func shortCode() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return strings.ReplaceAll(uuid.NewString()[:11], "-", "")
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b[:3]) + "-" + string(b[3:7]) + "-" + string(b[7:])
}

func secretToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return uuid.NewString()
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (s *service) GetChat(ctx context.Context, code, token string) (domain.ChatState, error) {
	return s.repository.GetChat(ctx, normalizeCode(code), token)
}
func (s *service) SendChat(ctx context.Context, code, token, text string) (domain.ChatMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" || len([]rune(text)) > 2000 {
		return domain.ChatMessage{}, domain.ErrInvalidChatMessage
	}
	return s.repository.SendChat(ctx, normalizeCode(code), token, text, s.now().UnixMilli())
}
func (s *service) SetChatHistory(ctx context.Context, code string, enabled bool, hostToken string) (*domain.Meeting, error) {
	meeting, err := s.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	if hostToken == "" || hostToken != meeting.HostToken {
		return nil, domain.ErrHostRequired
	}
	return s.repository.SetChatHistory(ctx, meeting.Code, enabled)
}

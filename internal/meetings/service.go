package meetings

import (
	"context"
	"crypto/rand"
	"encoding/base64"
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
	meeting := &domain.Meeting{ID: id, Code: code, Title: strings.TrimSpace(input.Title), LiveKitRoomName: "roobro-" + id, Status: domain.MeetingCreated, HostToken: hostToken, CreatedAt: s.now().UTC()}
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

	if meeting.Status == domain.MeetingCreated {
		if err := s.livekit.CreateRoom(ctx, meeting.LiveKitRoomName, roomMaxParticipants, roomEmptyTimeout, roomEmptyTimeout); err != nil {
			return nil, fmt.Errorf("meetings service join: %w", err)
		}
		now := s.now().UTC()
		meeting.Status = domain.MeetingActive
		meeting.StartedAt = &now
		if err := s.repository.Update(ctx, meeting); err != nil {
			return nil, fmt.Errorf("meetings service join update: %w", err)
		}
	}

	identity := "guest-" + uuid.NewString()
	isHost := hostToken != "" && hostToken == meeting.HostToken
	token, err := s.livekit.GenerateToken(meeting.LiveKitRoomName, identity, strings.TrimSpace(input.Name), isHost)
	if err != nil {
		return nil, fmt.Errorf("meetings service token: %w", err)
	}
	role := "participant"
	if isHost {
		role = "host"
	}
	return &domain.JoinMeetingResponse{Meeting: meeting, Token: token, ServerURL: s.livekit.PublicURL(), Role: role, Identity: identity, Demo: !s.livekit.Configured()}, nil
}

func (s *service) End(ctx context.Context, code, hostToken string) (*domain.Meeting, error) {
	meeting, err := s.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	if hostToken == "" || hostToken != meeting.HostToken {
		return nil, domain.ErrHostRequired
	}
	if meeting.Status == domain.MeetingEnded {
		return meeting, nil
	}
	if err := s.livekit.DeleteRoom(ctx, meeting.LiveKitRoomName); err != nil {
		return nil, fmt.Errorf("meetings service end room: %w", err)
	}
	if err := s.finish(ctx, meeting); err != nil {
		return nil, err
	}
	return meeting, nil
}

func (s *service) HandleRoomFinished(ctx context.Context, roomName string) error {
	meeting, err := s.repository.ByLiveKitRoomName(ctx, roomName)
	if err != nil {
		return err
	}
	if meeting.Status == domain.MeetingEnded {
		return nil
	}
	return s.finish(ctx, meeting)
}

func (s *service) finish(ctx context.Context, meeting *domain.Meeting) error {
	now := s.now().UTC()
	meeting.Status = domain.MeetingEnded
	meeting.EndedAt = &now
	if err := s.repository.Update(ctx, meeting); err != nil {
		return fmt.Errorf("meetings service end: %w", err)
	}
	return nil
}

func normalizeCode(value string) string { return strings.ToLower(strings.TrimSpace(value)) }

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

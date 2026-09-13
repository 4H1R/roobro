package meetings

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/4H1R/roobro/internal/domain"
)

type fakeLiveKit struct {
	createdRoom      string
	emptyTimeout     uint32
	departureTimeout uint32
	deletedRoom      string
	removedRoom      string
	removedIdentity  string
}

func (f *fakeLiveKit) CreateRoom(_ context.Context, roomName string, _, emptyTimeout, departureTimeout uint32) error {
	f.createdRoom = roomName
	f.emptyTimeout = emptyTimeout
	f.departureTimeout = departureTimeout
	return nil
}
func (f *fakeLiveKit) DeleteRoom(_ context.Context, roomName string) error {
	f.deletedRoom = roomName
	return nil
}
func (f *fakeLiveKit) RemoveParticipant(_ context.Context, roomName, identity string) error {
	f.removedRoom = roomName
	f.removedIdentity = identity
	return nil
}
func (*fakeLiveKit) GenerateToken(_, identity, _ string, _ bool) (string, error) {
	return "token-" + identity, nil
}

func TestHostCanKickAndBanParticipant(t *testing.T) {
	ctx := context.Background()
	livekit := &fakeLiveKit{}
	service := NewService(NewMemoryRepository(), livekit)
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)

	const participantID = "f7c1430e-5a4f-4eba-9831-d478530fca8c"
	joined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: participantID}, "")
	require.NoError(t, err)

	err = service.ModerateParticipant(ctx, created.Meeting.Code, domain.ModerateParticipantDTO{Identity: joined.Identity, Ban: true}, "wrong")
	require.ErrorIs(t, err, domain.ErrHostRequired)

	err = service.ModerateParticipant(ctx, created.Meeting.Code, domain.ModerateParticipantDTO{Identity: joined.Identity, Ban: true}, created.HostToken)
	require.NoError(t, err)
	require.Equal(t, created.Meeting.LiveKitRoomName, livekit.removedRoom)
	require.Equal(t, joined.Identity, livekit.removedIdentity)
	meeting, err := service.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, 1, meeting.Analytics.ParticipantsRemoved)
	require.Equal(t, 1, meeting.Analytics.ParticipantsBanned)

	_, err = service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: participantID}, "")
	require.ErrorIs(t, err, domain.ErrParticipantBanned)

	_, err = service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: "b58ac063-e772-44c1-bdf1-75d31cff1f30"}, "")
	require.NoError(t, err)
}

func TestKickDoesNotBanParticipant(t *testing.T) {
	ctx := context.Background()
	service := NewService(NewMemoryRepository(), &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)

	const participantID = "f7c1430e-5a4f-4eba-9831-d478530fca8c"
	joined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: participantID}, "")
	require.NoError(t, err)
	require.NoError(t, service.ModerateParticipant(ctx, created.Meeting.Code, domain.ModerateParticipantDTO{Identity: joined.Identity}, created.HostToken))
	meeting, err := service.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, 1, meeting.Analytics.ParticipantsRemoved)
	require.Zero(t, meeting.Analytics.ParticipantsBanned)

	_, err = service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: participantID}, "")
	require.NoError(t, err)
}
func (*fakeLiveKit) PublicURL() string { return "ws://livekit.test" }
func (*fakeLiveKit) Configured() bool  { return true }

func TestMeetingLifecycle(t *testing.T) {
	ctx := context.Background()
	livekit := &fakeLiveKit{}
	service := NewService(NewMemoryRepository(), livekit)
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)
	require.NotEmpty(t, created.HostToken)
	require.Equal(t, domain.MeetingCreated, created.Meeting.Status)

	joined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara"}, created.HostToken)
	require.NoError(t, err)
	require.Equal(t, "host", joined.Role)
	require.Equal(t, domain.MeetingActive, joined.Meeting.Status)
	require.Equal(t, uint32(300), livekit.emptyTimeout)
	require.Equal(t, uint32(300), livekit.departureTimeout)

	_, err = service.End(ctx, created.Meeting.Code, "wrong")
	require.ErrorIs(t, err, domain.ErrHostRequired)
	ended, err := service.End(ctx, created.Meeting.Code, created.HostToken)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingEnded, ended.Status)
	require.Equal(t, created.Meeting.LiveKitRoomName, livekit.deletedRoom)
}

func TestRoomFinishedEndsMeeting(t *testing.T) {
	ctx := context.Background()
	repository := NewMemoryRepository()
	service := NewService(repository, &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)
	_, err = service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara"}, created.HostToken)
	require.NoError(t, err)
	require.NoError(t, service.HandleAnalyticsEvent(ctx, created.Meeting.LiveKitRoomName, domain.MeetingAnalyticsEvent{
		ID:                  "join-1",
		Kind:                domain.MeetingAnalyticsParticipantJoined,
		ParticipantIdentity: "guest-one",
	}))

	err = service.HandleRoomFinished(ctx, created.Meeting.LiveKitRoomName)
	require.NoError(t, err)
	meeting, err := service.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingEnded, meeting.Status)
	require.NotNil(t, meeting.EndedAt)
	require.Equal(t, 1, meeting.Analytics.ParticipantJoins)
	require.Zero(t, meeting.Analytics.CurrentParticipants)
}

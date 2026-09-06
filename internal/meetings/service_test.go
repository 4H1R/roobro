package meetings

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/4H1R/roobro/internal/domain"
)

type fakeLiveKit struct{}

func (fakeLiveKit) CreateRoom(context.Context, string, uint32) error { return nil }
func (fakeLiveKit) GenerateToken(_, identity, _ string, _ bool) (string, error) {
	return "token-" + identity, nil
}
func (fakeLiveKit) PublicURL() string { return "ws://livekit.test" }
func (fakeLiveKit) Configured() bool  { return true }

func TestMeetingLifecycle(t *testing.T) {
	ctx := context.Background()
	service := NewService(NewMemoryRepository(), fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)
	require.NotEmpty(t, created.HostToken)
	require.Equal(t, domain.MeetingCreated, created.Meeting.Status)

	joined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara"}, created.HostToken)
	require.NoError(t, err)
	require.Equal(t, "host", joined.Role)
	require.Equal(t, domain.MeetingActive, joined.Meeting.Status)

	_, err = service.End(ctx, created.Meeting.Code, "wrong")
	require.ErrorIs(t, err, domain.ErrHostRequired)
	ended, err := service.End(ctx, created.Meeting.Code, created.HostToken)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingEnded, ended.Status)
}

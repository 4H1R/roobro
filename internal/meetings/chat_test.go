package meetings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/4H1R/roobro/internal/domain"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestChatHistorySettingAndLateJoins(t *testing.T) {
	ctx := context.Background()
	repository := NewMemoryRepository()
	service := NewService(repository, &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Team meeting"})
	require.NoError(t, err)
	require.True(t, created.Meeting.ChatHistoryEnabled)
	host, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Host"}, created.HostToken)
	require.NoError(t, err)
	first, err := service.SendChat(ctx, created.Meeting.Code, host.ChatToken, "Earlier message")
	require.NoError(t, err)
	require.Equal(t, "Host", first.Name)
	late, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Late guest"}, "")
	require.NoError(t, err)
	require.Equal(t, []domain.ChatMessage{first}, late.Chat.Messages)
	_, err = service.SetChatHistory(ctx, created.Meeting.Code, false, "wrong")
	require.ErrorIs(t, err, domain.ErrHostRequired)
	_, err = service.SetChatHistory(ctx, created.Meeting.Code, false, created.HostToken)
	require.NoError(t, err)
	// Repeated activation must preserve a concurrently changed setting.
	_, err = repository.Activate(ctx, created.Meeting.Code, created.Meeting.CreatedAt)
	require.NoError(t, err)
	after, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "New guest"}, "")
	require.NoError(t, err)
	require.False(t, after.Chat.HistoryEnabled)
	require.Empty(t, after.Chat.Messages)
	second, err := service.SendChat(ctx, created.Meeting.Code, host.ChatToken, "After joining")
	require.NoError(t, err)
	chat, err := service.GetChat(ctx, created.Meeting.Code, after.ChatToken)
	require.NoError(t, err)
	require.Equal(t, []domain.ChatMessage{second}, chat.Messages)
	chat, err = service.GetChat(ctx, created.Meeting.Code, host.ChatToken)
	require.NoError(t, err)
	require.Len(t, chat.Messages, 2)
	_, err = service.SetChatHistory(ctx, created.Meeting.Code, true, created.HostToken)
	require.NoError(t, err)
	chat, err = service.GetChat(ctx, created.Meeting.Code, after.ChatToken)
	require.NoError(t, err)
	require.Equal(t, []domain.ChatMessage{first, second}, chat.Messages)
}

func TestChatAccessIsScopedAndRevoked(t *testing.T) {
	ctx := context.Background()
	service := NewService(NewMemoryRepository(), &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Private meeting"})
	require.NoError(t, err)
	other, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Other meeting"})
	require.NoError(t, err)
	guest, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest"}, "")
	require.NoError(t, err)
	_, err = service.GetChat(ctx, created.Meeting.Code, "")
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
	_, err = service.GetChat(ctx, other.Meeting.Code, guest.ChatToken)
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
	for _, text := range []string{"  ", strings.Repeat("a", 2001)} {
		_, err = service.SendChat(ctx, created.Meeting.Code, guest.ChatToken, text)
		require.ErrorIs(t, err, domain.ErrInvalidChatMessage)
	}
	require.NoError(t, service.ModerateParticipant(ctx, created.Meeting.Code, domain.ModerateParticipantDTO{Identity: guest.Identity}, created.HostToken))
	_, err = service.SendChat(ctx, created.Meeting.Code, guest.ChatToken, "Removed")
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
	rejoined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest"}, "")
	require.NoError(t, err)
	_, err = service.End(ctx, created.Meeting.Code, created.HostToken)
	require.NoError(t, err)
	_, err = service.GetChat(ctx, created.Meeting.Code, rejoined.ChatToken)
	require.ErrorIs(t, err, domain.ErrMeetingEnded)
}

func TestChatSettingsEndpointAcceptsFalseAndRequiresHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := NewService(NewMemoryRepository(), &fakeLiveKit{})
	created, err := service.Create(context.Background(), domain.CreateMeetingDTO{Title: "Meeting settings"})
	require.NoError(t, err)
	router := gin.New()
	NewHandler(service, "key", "secret").RegisterRoutes(router.Group("/api/v1"))
	for _, test := range []struct {
		body, token string
		status      int
	}{
		{`{"chat_history_enabled":false}`, "", http.StatusForbidden},
		{`{}`, created.HostToken, http.StatusBadRequest},
		{`{"chat_history_enabled":false}`, created.HostToken, http.StatusOK},
	} {
		request := httptest.NewRequest(http.MethodPatch, "/api/v1/meetings/"+created.Meeting.Code+"/settings", strings.NewReader(test.body))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Host-Token", test.token)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equal(t, test.status, response.Code, response.Body.String())
	}
	meeting, err := service.Get(context.Background(), created.Meeting.Code)
	require.NoError(t, err)
	require.False(t, meeting.ChatHistoryEnabled)
}

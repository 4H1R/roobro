package meetings

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/4H1R/roobro/internal/domain"
	"github.com/4H1R/roobro/internal/platform/httpx"
	"github.com/gin-gonic/gin"
	lk "github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
	"github.com/stretchr/testify/require"
)

func TestOversizedBodiesRejectedBeforeHandlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, route := range []struct {
		method, path string
		limit        int
	}{
		{"POST", "/meetings", httpx.MaxJSONBody},
		{"POST", "/meetings/code/join", httpx.MaxJSONBody},
		{"POST", "/meetings/code/chat", httpx.MaxJSONBody},
		{"PATCH", "/meetings/code/settings", httpx.MaxJSONBody},
		{"POST", "/meetings/code/participants/identity/remove", httpx.MaxJSONBody},
		{"POST", "/meetings/code/end", httpx.MaxJSONBody},
		{"POST", "/livekit/webhook", httpx.MaxWebhookBody},
	} {
		for _, unknownLength := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/%v", route.path, unknownLength), func(t *testing.T) {
				router := gin.New()
				// A nil service proves rejection occurs before any service call.
				NewHandler(nil, "key", "secret").RegisterRoutes(router.Group("/api/v1"))
				for _, body := range []string{
					`{"ignored":"` + strings.Repeat("x", route.limit) + `"}`,
					`{"title":"Valid title"}` + strings.Repeat(" ", route.limit),
				} {
					request := httptest.NewRequest(route.method, "/api/v1"+route.path, strings.NewReader(body))
					if unknownLength {
						request.ContentLength = -1
						request.TransferEncoding = []string{"chunked"}
					}
					response := httptest.NewRecorder()
					router.ServeHTTP(response, request)
					require.Equal(t, http.StatusRequestEntityTooLarge, response.Code)
				}
			})
		}
	}
}

func TestBodyLimitAllowsNormalAndUnicodeRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := NewMemoryRepository()
	svc := NewService(repo, &fakeLiveKit{})
	created, err := svc.Create(context.Background(), domain.CreateMeetingDTO{Title: "Meeting"})
	require.NoError(t, err)
	joined, err := svc.Join(context.Background(), created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest"}, "")
	require.NoError(t, err)
	router := gin.New()
	NewHandler(svc, "key", "secret").RegisterRoutes(router.Group("/api/v1"))
	request := httptest.NewRequest("POST", "/api/v1/meetings/"+created.Meeting.Code+"/chat", strings.NewReader(`{"text":"`+strings.Repeat(`\ud83d\ude00`, 2000)+`"}`))
	request.Header.Set("X-Chat-Token", joined.ChatToken)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
	request = httptest.NewRequest("POST", "/api/v1/livekit/webhook", strings.NewReader(`{}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusUnauthorized, response.Code)
	// Existing signed webhook tests exercise an authentic accepted control.
}

func TestMeetingCapacityAndExpiration(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	for i := 0; i < maxMeetings; i++ {
		now = now.Add(time.Second)
		require.NoError(t, r.Create(ctx, &domain.Meeting{Code: fmt.Sprint(i), Status: domain.MeetingCreated, CreatedAt: now}))
	}
	require.ErrorIs(t, r.Create(ctx, &domain.Meeting{Code: "overflow"}), domain.ErrCapacity)
	now = now.Add(unusedMeetingTTL)
	r.Cleanup()
	require.Empty(t, r.meetings)
	require.Empty(t, r.chats)
	require.Empty(t, r.analyticsState)
	require.NoError(t, r.Create(ctx, &domain.Meeting{Code: "new", Status: domain.MeetingCreated, CreatedAt: now}))
	_, err := r.Activate(ctx, "new", now)
	require.NoError(t, err)
	require.NoError(t, r.Finish(ctx, "new", now))
	require.Empty(t, r.chats)
	require.Empty(t, r.analyticsState)
	_, err = r.ByCode(ctx, "new")
	require.NoError(t, err) // Keep the ended summary briefly.
	now = now.Add(endedMeetingTTL)
	r.Cleanup()
	_, err = r.ByCode(ctx, "new")
	require.ErrorIs(t, err, domain.ErrMeetingNotFound)
}

func TestChatBoundsPreserveIDsAndHistoryPrivacy(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	require.NoError(t, r.Create(ctx, &domain.Meeting{Code: "room", Status: domain.MeetingActive, ChatHistoryEnabled: true}))
	_, err := r.OpenChatSession(ctx, "room", "sender", "Sender", "token")
	require.NoError(t, err)
	for i := 1; i <= maxChatMessages+25; i++ {
		now = now.Add(time.Second)
		message, err := r.SendChat(ctx, "room", "token", "message", now.UnixMilli())
		require.NoError(t, err)
		require.Equal(t, i, message.ID)
	}
	_, err = r.SetChatHistory(ctx, "room", false)
	require.NoError(t, err)
	late, err := r.OpenChatSession(ctx, "room", "late", "Late", "late-token")
	require.NoError(t, err)
	require.Empty(t, late.Messages)
	for i := 0; i < maxChatMessages+10; i++ {
		now = now.Add(time.Second)
		_, err := r.SendChat(ctx, "room", "token", "new", now.UnixMilli())
		require.NoError(t, err)
	}
	late, err = r.GetChat(ctx, "room", "late-token")
	require.NoError(t, err)
	require.Len(t, late.Messages, maxChatMessages)
	for _, message := range late.Messages {
		require.Greater(t, message.ID, maxChatMessages+25)
	}
	_, err = r.SetChatHistory(ctx, "room", true)
	require.NoError(t, err)
	state, err := r.GetChat(ctx, "room", "token")
	require.NoError(t, err)
	require.Len(t, state.Messages, maxChatMessages)
	require.Equal(t, 2*maxChatMessages+35, state.Messages[len(state.Messages)-1].ID)
	require.Len(t, r.chats["room"].messages, maxChatMessages)
}

func TestSessionLimitsRejoinAndExpiry(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	require.NoError(t, r.Create(ctx, &domain.Meeting{Code: "room", Status: domain.MeetingActive}))
	for i := 0; i < maxChatSessions; i++ {
		now = now.Add(time.Second)
		_, err := r.OpenChatSession(ctx, "room", fmt.Sprint(i), "Guest", fmt.Sprint(i))
		require.NoError(t, err)
	}
	_, err := r.OpenChatSession(ctx, "room", "extra", "Guest", "extra")
	require.ErrorIs(t, err, domain.ErrCapacity)
	_, err = r.OpenChatSession(ctx, "room", "0", "Guest", "replacement")
	require.NoError(t, err)
	require.Len(t, r.chats["room"].sessions, maxChatSessions)
	_, err = r.GetChat(ctx, "room", "0")
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
	now = now.Add(chatSessionTTL)
	_, err = r.GetChat(ctx, "room", "replacement")
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
	_, err = r.OpenChatSession(ctx, "room", "fresh", "Guest", "fresh")
	require.NoError(t, err)
	require.Len(t, r.chats["room"].sessions, 1)
}

func TestRepositoryRateBudgetsAndAnalyticsBounds(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	for i := 0; i < 10; i++ {
		require.NoError(t, r.Create(ctx, &domain.Meeting{Code: fmt.Sprint(i), LiveKitRoomName: fmt.Sprint(i), Status: domain.MeetingActive}))
	}
	require.ErrorIs(t, r.Create(ctx, &domain.Meeting{Code: "extra"}), domain.ErrRateLimited)
	for i := 0; i < 20; i++ {
		_, err := r.OpenChatSession(ctx, "0", "same", "Guest", fmt.Sprint(i))
		require.NoError(t, err)
	}
	_, err := r.OpenChatSession(ctx, "0", "same", "Guest", "extra")
	require.ErrorIs(t, err, domain.ErrRateLimited)
	for i := 0; i < 20; i++ {
		_, err := r.SendChat(ctx, "0", "19", "text", 0)
		require.NoError(t, err)
	}
	_, err = r.SendChat(ctx, "0", "19", "text", 0)
	require.ErrorIs(t, err, domain.ErrRateLimited)
	for i := 0; i < maxAnalyticsEntries+50; i++ {
		require.NoError(t, r.RecordAnalyticsEvent(ctx, "0", domain.MeetingAnalyticsEvent{ID: fmt.Sprint(i), ParticipantIdentity: fmt.Sprint(i), Kind: domain.MeetingAnalyticsParticipantJoined}))
	}
	require.Len(t, r.analyticsState["0"].processedEventIDs, maxAnalyticsEntries)
	require.Len(t, r.analyticsState["0"].seenParticipants, maxAnalyticsEntries)
	require.LessOrEqual(t, len(r.analyticsState["0"].activeParticipants), maxAnalyticsEntries)
	require.True(t, r.meetings["0"].Analytics.Truncated)
}

func TestAtomicBansAndTerminalLifecycle(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	require.NoError(t, r.Create(ctx, &domain.Meeting{Code: "room", Status: domain.MeetingCreated, CreatedAt: now}))
	_, err := r.Activate(ctx, "room", now)
	require.NoError(t, err)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := r.BanParticipant(ctx, "room", fmt.Sprint(i))
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	meeting, err := r.ByCode(ctx, "room")
	require.NoError(t, err)
	require.Len(t, meeting.BannedParticipantIdentities, 50)
	_, err = r.SetChatHistory(ctx, "room", true)
	require.NoError(t, err)
	require.NoError(t, r.Finish(ctx, "room", now))
	require.NoError(t, r.Finish(ctx, "room", now.Add(time.Hour)))
	_, err = r.Activate(ctx, "room", now.Add(time.Hour))
	require.ErrorIs(t, err, domain.ErrMeetingEnded)
	_, err = r.BanParticipant(ctx, "room", "extra")
	require.ErrorIs(t, err, domain.ErrMeetingEnded)
	meeting, err = r.ByCode(ctx, "room")
	require.NoError(t, err)
	require.Equal(t, now, *meeting.EndedAt)
	require.True(t, meeting.ChatHistoryEnabled)
	require.Len(t, meeting.BannedParticipantIdentities, 50)
}

type delayedLiveKit struct {
	fakeLiveKit
	entered chan struct{}
	release chan struct{}
	deletes atomic.Int32
	tokens  atomic.Int32
}

func (f *delayedLiveKit) CreateRoom(context.Context, string, uint32, uint32, uint32) error {
	close(f.entered)
	<-f.release
	return nil
}
func (f *delayedLiveKit) DeleteRoom(context.Context, string) error { f.deletes.Add(1); return nil }
func (f *delayedLiveKit) GenerateToken(string, string, string, bool, string) (string, error) {
	f.tokens.Add(1)
	return "token", nil
}

func TestDelayedInitialJoinCannotUndoEnd(t *testing.T) {
	ctx := context.Background()
	livekit := &delayedLiveKit{entered: make(chan struct{}), release: make(chan struct{})}
	r := NewMemoryRepository()
	s := NewService(r, livekit)
	created, err := s.Create(ctx, domain.CreateMeetingDTO{Title: "Meeting"})
	require.NoError(t, err)
	result := make(chan error, 1)
	go func() {
		_, err := s.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest"}, "")
		result <- err
	}()
	<-livekit.entered
	_, err = s.End(ctx, created.Meeting.Code, created.HostToken)
	require.NoError(t, err)
	close(livekit.release)
	require.ErrorIs(t, <-result, domain.ErrMeetingEnded)
	require.Equal(t, int32(0), livekit.tokens.Load())
	require.Equal(t, int32(2), livekit.deletes.Load())
	meeting, err := s.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingEnded, meeting.Status)
	require.Empty(t, r.chats)
}

func TestDeparturesReleaseSlotsAndCannotRevokeARejoin(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	s := NewService(r, &fakeLiveKit{}).(*service)
	s.now = r.now
	created, err := s.Create(ctx, domain.CreateMeetingDTO{Title: "Continuing meeting"})
	require.NoError(t, err)
	router := gin.New()
	NewHandler(s, "key", "secret").RegisterRoutes(router.Group("/api/v1"))
	leave := func(joined *domain.JoinMeetingResponse, eventID string) {
		response := sendLiveKitWebhook(t, router, "key", "secret", &lk.WebhookEvent{
			Id: eventID, Event: webhook.EventParticipantLeft,
			Room:        &lk.Room{Name: created.Meeting.LiveKitRoomName},
			Participant: &lk.ParticipantInfo{Identity: joined.Identity, Attributes: map[string]string{domain.ChatSessionAttribute: domain.ChatSessionID(joined.ChatToken)}},
		})
		require.Equal(t, http.StatusNoContent, response.Code)
	}
	for i := 0; i < maxChatSessions+10; i++ {
		now = now.Add(time.Second)
		joined, err := s.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest", ParticipantID: fmt.Sprintf("participant-%016d", i)}, "")
		require.NoError(t, err)
		leave(joined, fmt.Sprint(i))
		require.Empty(t, r.chats[created.Meeting.Code].sessions)
	}
	input := domain.JoinMeetingDTO{Name: "Returning guest", ParticipantID: "returning-participant"}
	old, err := s.Join(ctx, created.Meeting.Code, input, "")
	require.NoError(t, err)
	current, err := s.Join(ctx, created.Meeting.Code, input, "")
	require.NoError(t, err)
	leave(old, "delayed-old-departure")
	_, err = s.GetChat(ctx, created.Meeting.Code, current.ChatToken)
	require.NoError(t, err)
	_, err = s.GetChat(ctx, created.Meeting.Code, domain.ChatSessionID(current.ChatToken))
	require.ErrorIs(t, err, domain.ErrChatUnauthorized) // Correlation is not authorization.
	leave(current, "current-departure")
	_, err = s.GetChat(ctx, created.Meeting.Code, current.ChatToken)
	require.ErrorIs(t, err, domain.ErrChatUnauthorized)
}

type demoLiveKit struct{ fakeLiveKit }

func (*demoLiveKit) Configured() bool { return false }

func TestAbandonedDemoMeetingsReleaseCapacity(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	now := time.Now()
	r.now = func() time.Time { return now }
	s := NewService(r, &demoLiveKit{}).(*service)
	s.now = r.now
	var last *domain.JoinMeetingResponse
	for i := 0; i < maxMeetings; i++ {
		now = now.Add(time.Second)
		created, err := s.Create(ctx, domain.CreateMeetingDTO{Title: "Demo"})
		require.NoError(t, err)
		last, err = s.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Guest"}, "")
		require.NoError(t, err)
	}
	_, err := s.Create(ctx, domain.CreateMeetingDTO{Title: "Full"})
	require.ErrorIs(t, err, domain.ErrCapacity)
	// A still-open demo keeps its session alive by polling; ordinary Leave
	// unmounts polling, so every other abandoned demo expires.
	now = now.Add(chatIdleTTL - time.Second)
	_, err = s.GetChat(ctx, last.Meeting.Code, last.ChatToken)
	require.NoError(t, err)
	now = now.Add(2 * time.Second)
	r.Cleanup()
	require.Len(t, r.meetings, 1)
	_, err = s.Create(ctx, domain.CreateMeetingDTO{Title: "Available again"})
	require.NoError(t, err)
}

func TestBanCapacityDoesNotForgetExistingBans(t *testing.T) {
	ctx := context.Background()
	r := NewMemoryRepository()
	require.NoError(t, r.Create(ctx, &domain.Meeting{Code: "room", Status: domain.MeetingActive}))
	for i := 0; i < maxBannedIdentities; i++ {
		_, err := r.BanParticipant(ctx, "room", fmt.Sprint(i))
		require.NoError(t, err)
	}
	_, err := r.BanParticipant(ctx, "room", "extra")
	require.ErrorIs(t, err, domain.ErrCapacity)
	_, err = r.OpenChatSession(ctx, "room", "0", "Banned", "token")
	require.ErrorIs(t, err, domain.ErrParticipantBanned)
}

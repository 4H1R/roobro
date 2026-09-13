package meetings

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/utils/protojson"
	"github.com/livekit/protocol/webhook"
	"github.com/stretchr/testify/require"

	"github.com/4H1R/roobro/internal/domain"
)

func TestRoomFinishedWebhookEndsMeeting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "test-key"
	const apiSecret = "test-secret"
	ctx := context.Background()
	service := NewService(NewMemoryRepository(), &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)

	payload, err := protojson.Marshal(&livekit.WebhookEvent{
		Event: webhook.EventRoomFinished,
		Room:  &livekit.Room{Name: created.Meeting.LiveKitRoomName},
	})
	require.NoError(t, err)
	checksum := sha256.Sum256(payload)
	token, err := auth.NewAccessToken(apiKey, apiSecret).
		SetValidFor(time.Minute).
		SetSha256(base64.StdEncoding.EncodeToString(checksum[:])).
		ToJWT()
	require.NoError(t, err)

	router := gin.New()
	NewHandler(service, apiKey, apiSecret).RegisterRoutes(router.Group("/api/v1"))
	request := httptest.NewRequest(http.MethodPost, "/api/v1/livekit/webhook", bytes.NewReader(payload))
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	meeting, err := service.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingEnded, meeting.Status)
}

func TestModerationEndpointRequiresHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	livekit := &fakeLiveKit{}
	service := NewService(NewMemoryRepository(), livekit)
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)
	joined, err := service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Sara", ParticipantID: "fingerprint-visitor-1234567890"}, "")
	require.NoError(t, err)

	router := gin.New()
	NewHandler(service, "test-key", "test-secret").RegisterRoutes(router.Group("/api/v1"))
	path := "/api/v1/meetings/" + created.Meeting.Code + "/participants/" + joined.Identity + "/remove"

	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{"ban":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Host-Token", "wrong")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusForbidden, response.Code)

	request = httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{"ban":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Host-Token", created.HostToken)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, joined.Identity, livekit.removedIdentity)
}

func TestLiveKitWebhooksUpdateMeetingAnalytics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "test-key"
	const apiSecret = "test-secret"
	ctx := context.Background()
	service := NewService(NewMemoryRepository(), &fakeLiveKit{})
	created, err := service.Create(ctx, domain.CreateMeetingDTO{Title: "Design review"})
	require.NoError(t, err)
	_, err = service.Join(ctx, created.Meeting.Code, domain.JoinMeetingDTO{Name: "Host"}, created.HostToken)
	require.NoError(t, err)

	router := gin.New()
	NewHandler(service, apiKey, apiSecret).RegisterRoutes(router.Group("/api/v1"))
	room := &livekit.Room{Name: created.Meeting.LiveKitRoomName}
	events := []*livekit.WebhookEvent{
		{Id: "join-1", Event: webhook.EventParticipantJoined, Room: room, Participant: &livekit.ParticipantInfo{Identity: "guest-one"}},
		{Id: "join-2", Event: webhook.EventParticipantJoined, Room: room, Participant: &livekit.ParticipantInfo{Identity: "guest-two"}},
		{Id: "join-2", Event: webhook.EventParticipantJoined, Room: room, Participant: &livekit.ParticipantInfo{Identity: "guest-two"}},
		{Id: "left-1", Event: webhook.EventParticipantLeft, Room: room, Participant: &livekit.ParticipantInfo{Identity: "guest-one"}},
		{Id: "camera-1", Event: webhook.EventTrackPublished, Room: room, Track: &livekit.TrackInfo{Sid: "track-camera", Source: livekit.TrackSource_CAMERA}},
		{Id: "camera-retry", Event: webhook.EventTrackPublished, Room: room, Track: &livekit.TrackInfo{Sid: "track-camera", Source: livekit.TrackSource_CAMERA}},
		{Id: "screen-1", Event: webhook.EventTrackPublished, Room: room, Track: &livekit.TrackInfo{Sid: "track-screen", Source: livekit.TrackSource_SCREEN_SHARE}},
		{Id: "microphone-1", Event: webhook.EventTrackPublished, Room: room, Track: &livekit.TrackInfo{Sid: "track-microphone", Source: livekit.TrackSource_MICROPHONE}},
	}
	for _, event := range events {
		response := sendLiveKitWebhook(t, router, apiKey, apiSecret, event)
		require.Equal(t, http.StatusNoContent, response.Code)
	}

	meeting, err := service.Get(ctx, created.Meeting.Code)
	require.NoError(t, err)
	require.Equal(t, domain.MeetingAnalytics{
		ParticipantJoins:       2,
		UniqueParticipants:     2,
		CurrentParticipants:    1,
		PeakParticipants:       2,
		CameraActivations:      1,
		ScreenShareActivations: 1,
		MicrophoneActivations:  1,
	}, meeting.Analytics)
}

func sendLiveKitWebhook(t *testing.T, router http.Handler, apiKey, apiSecret string, event *livekit.WebhookEvent) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := protojson.Marshal(event)
	require.NoError(t, err)
	checksum := sha256.Sum256(payload)
	token, err := auth.NewAccessToken(apiKey, apiSecret).
		SetValidFor(time.Minute).
		SetSha256(base64.StdEncoding.EncodeToString(checksum[:])).
		ToJWT()
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/livekit/webhook", bytes.NewReader(payload))
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

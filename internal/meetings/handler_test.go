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

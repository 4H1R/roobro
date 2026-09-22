package livekit

import (
	"testing"

	"github.com/4H1R/roobro/internal/config"
	"github.com/4H1R/roobro/internal/domain"
	"github.com/livekit/protocol/auth"
	"github.com/stretchr/testify/require"
)

func TestRoomTokenCorrelatesSessionWithoutDisclosingChatCapability(t *testing.T) {
	client := NewClient(&config.Config{LiveKitHost: "http://localhost:7880", LiveKitAPIKey: "key", LiveKitSecret: "test-secret"})
	jwt, err := client.GenerateToken("room", "guest", "Guest", false, "private-chat-token")
	require.NoError(t, err)
	verifier, err := auth.ParseAPIToken(jwt)
	require.NoError(t, err)
	_, claims, err := verifier.Verify("test-secret")
	require.NoError(t, err)
	require.Equal(t, domain.ChatSessionID("private-chat-token"), claims.Attributes[domain.ChatSessionAttribute])
	require.NotEqual(t, "private-chat-token", claims.Attributes[domain.ChatSessionAttribute])
	require.False(t, claims.Video.RoomAdmin)
	require.Equal(t, "room", claims.Video.Room)
}

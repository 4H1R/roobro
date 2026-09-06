package livekit

import (
	"context"
	"fmt"
	"time"

	"github.com/livekit/protocol/auth"
	lk "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"

	"github.com/4H1R/roobro/internal/config"
)

type Client struct {
	roomClient *lksdk.RoomServiceClient
	host       string
	publicURL  string
	apiKey     string
	apiSecret  string
}

func NewClient(cfg *config.Config) *Client {
	var roomClient *lksdk.RoomServiceClient
	if cfg.LiveKitAPIKey != "" && cfg.LiveKitSecret != "" {
		roomClient = lksdk.NewRoomServiceClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitSecret)
	}
	return &Client{roomClient: roomClient, host: cfg.LiveKitHost, publicURL: cfg.LiveKitPublicURL, apiKey: cfg.LiveKitAPIKey, apiSecret: cfg.LiveKitSecret}
}

func (c *Client) Configured() bool  { return c.roomClient != nil }
func (c *Client) PublicURL() string { return c.publicURL }

func (c *Client) CreateRoom(ctx context.Context, name string, maxParticipants uint32) error {
	if !c.Configured() {
		return nil
	}
	if maxParticipants == 0 {
		maxParticipants = 100
	}
	_, err := c.roomClient.CreateRoom(ctx, &lk.CreateRoomRequest{Name: name, EmptyTimeout: 600, MaxParticipants: maxParticipants})
	if err != nil {
		return fmt.Errorf("creating LiveKit room: %w", err)
	}
	return nil
}

func (c *Client) GenerateToken(roomName, identity, name string, host bool) (string, error) {
	if !c.Configured() {
		return "", nil
	}
	grant := &auth.VideoGrant{RoomJoin: true, Room: roomName, RoomAdmin: host}
	grant.SetCanSubscribe(true)
	grant.SetCanPublish(true)
	grant.SetCanPublishData(true)
	grant.SetCanUpdateOwnMetadata(true)
	grant.SetCanPublishSources([]lk.TrackSource{lk.TrackSource_MICROPHONE, lk.TrackSource_CAMERA, lk.TrackSource_SCREEN_SHARE, lk.TrackSource_SCREEN_SHARE_AUDIO})

	token, err := auth.NewAccessToken(c.apiKey, c.apiSecret).
		SetVideoGrant(grant).
		SetIdentity(identity).
		SetName(name).
		SetValidFor(12 * time.Hour).
		ToJWT()
	if err != nil {
		return "", fmt.Errorf("generating LiveKit token: %w", err)
	}
	return token, nil
}

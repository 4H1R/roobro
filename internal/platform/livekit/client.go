package livekit

import (
	"context"
	"fmt"
	"time"

	"github.com/livekit/protocol/auth"
	lk "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"

	"github.com/4H1R/roobro/internal/config"
	"github.com/4H1R/roobro/internal/domain"
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

func (c *Client) CreateRoom(ctx context.Context, name string, maxParticipants, emptyTimeout, departureTimeout uint32) error {
	if !c.Configured() {
		return nil
	}
	if maxParticipants == 0 {
		maxParticipants = 100
	}
	_, err := c.roomClient.CreateRoom(ctx, &lk.CreateRoomRequest{
		Name:             name,
		EmptyTimeout:     emptyTimeout,
		DepartureTimeout: departureTimeout,
		MaxParticipants:  maxParticipants,
	})
	if err != nil {
		return fmt.Errorf("creating LiveKit room: %w", err)
	}
	return nil
}

func (c *Client) DeleteRoom(ctx context.Context, name string) error {
	if !c.Configured() {
		return nil
	}
	rooms, err := c.roomClient.ListRooms(ctx, &lk.ListRoomsRequest{Names: []string{name}})
	if err != nil {
		return fmt.Errorf("finding LiveKit room: %w", err)
	}
	if len(rooms.Rooms) == 0 {
		return nil
	}
	if _, err := c.roomClient.DeleteRoom(ctx, &lk.DeleteRoomRequest{Room: name}); err != nil {
		return fmt.Errorf("deleting LiveKit room: %w", err)
	}
	return nil
}

func (c *Client) RemoveParticipant(ctx context.Context, roomName, identity string) error {
	if !c.Configured() {
		return nil
	}
	if _, err := c.roomClient.RemoveParticipant(ctx, &lk.RoomParticipantIdentity{Room: roomName, Identity: identity, RevokeTokenTs: time.Now().Unix()}); err != nil {
		return fmt.Errorf("removing LiveKit participant: %w", err)
	}
	return nil
}

func (c *Client) GenerateToken(roomName, identity, name string, host bool, chatToken string) (string, error) {
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
		SetAttributes(map[string]string{domain.ChatSessionAttribute: domain.ChatSessionID(chatToken)}).
		SetValidFor(12 * time.Hour).
		ToJWT()
	if err != nil {
		return "", fmt.Errorf("generating LiveKit token: %w", err)
	}
	return token, nil
}

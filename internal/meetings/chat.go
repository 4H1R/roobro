package meetings

import (
	"context"
	"time"

	"github.com/4H1R/roobro/internal/domain"
	"golang.org/x/time/rate"
)

type chatSession struct {
	identity    string
	name        string
	joinedAfter int
	expiresAt   time.Time
	lastSeen    time.Time
}

func (s chatSession) expired(now time.Time) bool {
	return !now.Before(s.expiresAt) || now.Sub(s.lastSeen) >= chatIdleTTL
}

type meetingChat struct {
	messages []domain.ChatMessage
	sessions map[string]chatSession
	lastID   int
	joins    *rate.Limiter
	sends    *rate.Limiter
}

func (r *MemoryRepository) OpenChatSession(_ context.Context, code, identity, name, token string) (domain.ChatState, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return domain.ChatState{}, domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return domain.ChatState{}, domain.ErrMeetingEnded
	}
	if participantIsBanned(meeting, identity) {
		return domain.ChatState{}, domain.ErrParticipantBanned
	}
	chat := r.chats[code]
	now := r.now()
	if !chat.joins.AllowN(now, 1) {
		return domain.ChatState{}, domain.ErrRateLimited
	}
	for key, session := range chat.sessions {
		if session.expired(now) {
			delete(chat.sessions, key)
		}
	}
	// LiveKit permits one connection per identity. Replace its old chat token
	// on rejoin, without resetting the room's admission/message budgets.
	existingToken := ""
	for key, session := range chat.sessions {
		if session.identity == identity {
			existingToken = key
			break
		}
	}
	if existingToken == "" && len(chat.sessions) >= maxChatSessions {
		return domain.ChatState{}, domain.ErrCapacity
	}
	delete(chat.sessions, existingToken)
	session := chatSession{identity: identity, name: name, joinedAfter: chat.lastID, expiresAt: now.Add(chatSessionTTL), lastSeen: now}
	chat.sessions[token] = session
	meeting.LastActivityAt = now
	return chatSnapshot(meeting, chat, session), nil
}

func (r *MemoryRepository) chatAccess(code, token string) (*domain.Meeting, *meetingChat, chatSession, error) {
	r.cleanupLocked()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, nil, chatSession{}, domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return nil, nil, chatSession{}, domain.ErrMeetingEnded
	}
	chat := r.chats[code]
	session, ok := chat.sessions[token]
	if token == "" || !ok {
		return nil, nil, chatSession{}, domain.ErrChatUnauthorized
	}
	if session.expired(r.now()) {
		delete(chat.sessions, token)
		return nil, nil, chatSession{}, domain.ErrChatUnauthorized
	}
	if participantIsBanned(meeting, session.identity) {
		return nil, nil, chatSession{}, domain.ErrParticipantBanned
	}
	session.lastSeen = r.now()
	chat.sessions[token] = session
	meeting.LastActivityAt = session.lastSeen
	return meeting, chat, session, nil
}

func chatSnapshot(meeting *domain.Meeting, chat *meetingChat, session chatSession) domain.ChatState {
	start := 0
	if !meeting.ChatHistoryEnabled {
		for start < len(chat.messages) && chat.messages[start].ID <= session.joinedAfter {
			start++
		}
	}
	messages := append([]domain.ChatMessage{}, chat.messages[start:]...)
	return domain.ChatState{HistoryEnabled: meeting.ChatHistoryEnabled, Messages: messages}
}

func (r *MemoryRepository) GetChat(_ context.Context, code, token string) (domain.ChatState, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	meeting, chat, session, err := r.chatAccess(code, token)
	if err != nil {
		return domain.ChatState{}, err
	}
	return chatSnapshot(meeting, chat, session), nil
}

func (r *MemoryRepository) SendChat(_ context.Context, code, token, text string, sentAt int64) (domain.ChatMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, chat, session, err := r.chatAccess(code, token)
	if err != nil {
		return domain.ChatMessage{}, err
	}
	if !chat.sends.AllowN(r.now(), 1) {
		return domain.ChatMessage{}, domain.ErrRateLimited
	}
	chat.lastID++
	message := domain.ChatMessage{ID: chat.lastID, Identity: session.identity, Name: session.name, Text: text, SentAt: sentAt}
	if len(chat.messages) == maxChatMessages {
		copy(chat.messages, chat.messages[1:])
		chat.messages[len(chat.messages)-1] = message
	} else {
		chat.messages = append(chat.messages, message)
	}
	return message, nil
}

func (r *MemoryRepository) SetChatHistory(_ context.Context, code string, enabled bool) (*domain.Meeting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, domain.ErrMeetingNotFound
	}
	if meeting.Status == domain.MeetingEnded {
		return nil, domain.ErrMeetingEnded
	}
	meeting.ChatHistoryEnabled = enabled
	return cloneMeeting(meeting), nil
}

func (r *MemoryRepository) RevokeChatSessions(_ context.Context, code, identity string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	chat, ok := r.chats[code]
	if !ok {
		if meeting := r.meetings[code]; meeting != nil && meeting.Status == domain.MeetingEnded {
			return nil
		}
		return domain.ErrMeetingNotFound
	}
	for token, session := range chat.sessions {
		if session.identity == identity {
			delete(chat.sessions, token)
		}
	}
	return nil
}

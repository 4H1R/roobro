package meetings

import (
	"context"
	"github.com/4H1R/roobro/internal/domain"
)

type chatSession struct {
	identity    string
	name        string
	joinedAfter int
}
type meetingChat struct {
	messages []domain.ChatMessage
	sessions map[string]chatSession
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
	session := chatSession{identity: identity, name: name, joinedAfter: len(chat.messages)}
	chat.sessions[token] = session
	return chatSnapshot(meeting, chat, session), nil
}

func (r *MemoryRepository) chatAccess(code, token string) (*domain.Meeting, *meetingChat, chatSession, error) {
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
	if participantIsBanned(meeting, session.identity) {
		return nil, nil, chatSession{}, domain.ErrParticipantBanned
	}
	return meeting, chat, session, nil
}

func chatSnapshot(meeting *domain.Meeting, chat *meetingChat, session chatSession) domain.ChatState {
	start := 0
	if !meeting.ChatHistoryEnabled {
		start = session.joinedAfter
	}
	messages := append([]domain.ChatMessage{}, chat.messages[start:]...)
	return domain.ChatState{HistoryEnabled: meeting.ChatHistoryEnabled, Messages: messages}
}

func (r *MemoryRepository) GetChat(_ context.Context, code, token string) (domain.ChatState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
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
	message := domain.ChatMessage{ID: len(chat.messages) + 1, Identity: session.identity, Name: session.name, Text: text, SentAt: sentAt}
	chat.messages = append(chat.messages, message)
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
		return domain.ErrMeetingNotFound
	}
	for token, session := range chat.sessions {
		if session.identity == identity {
			delete(chat.sessions, token)
		}
	}
	return nil
}

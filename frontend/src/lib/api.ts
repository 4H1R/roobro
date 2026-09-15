import FingerprintJS from "@fingerprintjs/fingerprintjs"

export interface MeetingAnalytics {
  participant_joins: number
  unique_participants: number
  current_participants: number
  peak_participants: number
  camera_activations: number
  screen_share_activations: number
  microphone_activations: number
  participants_removed: number
  participants_banned: number
}

export interface StoredChatMessage {
  id: number
  identity: string
  name: string
  text: string
  sentAt: number
}

export interface ChatState {
  history_enabled: boolean
  messages: StoredChatMessage[]
}

export interface Meeting {
  chat_history_enabled?: boolean
  id: string
  code: string
  title: string
  status: "created" | "active" | "ended"
  created_at: string
  started_at?: string
  ended_at?: string
  analytics?: MeetingAnalytics
}

export interface JoinResult {
  chat_token?: string
  chat?: ChatState
  meeting: Meeting
  token: string
  server_url: string
  role: "host" | "participant"
  identity: string
  demo: boolean
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

const participantIDStorageKey = "roobro:participant-id"
let fingerprintAgent: ReturnType<typeof FingerprintJS.load> | null = null

async function getParticipantID() {
  let fallbackID: string = crypto.randomUUID()
  try {
    const stored = localStorage.getItem(participantIDStorageKey)
    fallbackID = stored || fallbackID
    if (!stored) localStorage.setItem(participantIDStorageKey, fallbackID)
  } catch {
    // Continue with the in-memory UUID when storage is unavailable.
  }

  try {
    fingerprintAgent ??= FingerprintJS.load({ monitoring: false })
    const agent = await fingerprintAgent
    return (await agent.get()).visitorId
  } catch {
    return fallbackID
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  })
  const payload = (await response.json()) as Envelope<T>
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message ?? "Request failed")
  return payload.data
}

export async function createMeeting(title: string) {
  return request<{ meeting: Meeting; host_token: string }>("/meetings", { method: "POST", body: JSON.stringify({ title }) })
}

export async function getMeeting(code: string) {
  return request<Meeting>(`/meetings/${encodeURIComponent(code)}`)
}

export async function joinMeeting(code: string, name: string, hostToken?: string) {
  const participantID = await getParticipantID()
  return request<JoinResult>(`/meetings/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: hostToken ? { "X-Host-Token": hostToken } : undefined,
    body: JSON.stringify({ name, participant_id: participantID })
  })
}

export async function removeMeetingParticipant(code: string, identity: string, ban: boolean, hostToken: string) {
  return request<{ removed: boolean; banned: boolean }>(`/meetings/${encodeURIComponent(code)}/participants/${encodeURIComponent(identity)}/remove`, {
    method: "POST",
    headers: { "X-Host-Token": hostToken },
    body: JSON.stringify({ ban }),
  })
}

export async function endMeeting(code: string, hostToken: string) {
  return request<Meeting>(`/meetings/${encodeURIComponent(code)}/end`, { method: "POST", headers: { "X-Host-Token": hostToken } })
}

export function meetingStorageKey(code: string) { return `roobro:host:${code}` }

export function getMeetingChat(code: string, chatToken: string) {
  return request<ChatState>(`/meetings/${encodeURIComponent(code)}/chat`, { headers: { "X-Chat-Token": chatToken } })
}

export function sendMeetingChat(code: string, chatToken: string, text: string) {
  return request<StoredChatMessage>(`/meetings/${encodeURIComponent(code)}/chat`, {
    method: "POST", headers: { "X-Chat-Token": chatToken }, body: JSON.stringify({ text }),
  })
}

export function setMeetingChatHistory(code: string, enabled: boolean, hostToken: string) {
  return request<Meeting>(`/meetings/${encodeURIComponent(code)}/settings`, {
    method: "PATCH", headers: { "X-Host-Token": hostToken }, body: JSON.stringify({ chat_history_enabled: enabled }),
  })
}

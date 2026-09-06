export interface Meeting {
  id: string
  code: string
  title: string
  status: "created" | "active" | "ended"
  created_at: string
  started_at?: string
  ended_at?: string
}

export interface JoinResult {
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
  return request<JoinResult>(`/meetings/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: hostToken ? { "X-Host-Token": hostToken } : undefined,
    body: JSON.stringify({ name })
  })
}

export async function endMeeting(code: string, hostToken: string) {
  return request<Meeting>(`/meetings/${encodeURIComponent(code)}/end`, { method: "POST", headers: { "X-Host-Token": hostToken } })
}

export function meetingStorageKey(code: string) { return `roobro:host:${code}` }

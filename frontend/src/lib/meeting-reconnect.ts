import { DisconnectReason } from "livekit-client"

import { APIError } from "@/lib/api"

export interface MediaChoice {
  micOn: boolean
  cameraOn: boolean
}

export interface MeetingResume extends MediaChoice {
  displayName: string
  savedAt: number
}

export const MEETING_RESUME_TTL_MS = 30 * 60 * 1000
export const MAX_REJOIN_ATTEMPTS = 8
const MAX_REJOIN_DELAY_MS = 15_000

const resumeStorageKey = (code: string) => `roobro:resume:${code}`

function withSessionStorage<T>(action: (storage: Storage) => T): T | null {
  try {
    return action(sessionStorage)
  } catch {
    // Private mode or a full quota only costs the reload-resume convenience.
    return null
  }
}

export function saveMeetingResume(code: string, resume: Omit<MeetingResume, "savedAt">, now = Date.now()) {
  withSessionStorage((storage) => storage.setItem(resumeStorageKey(code), JSON.stringify({ ...resume, savedAt: now })))
}

export function clearMeetingResume(code: string) {
  withSessionStorage((storage) => storage.removeItem(resumeStorageKey(code)))
}

export function readMeetingResume(code: string, now = Date.now()): MeetingResume | null {
  return withSessionStorage((storage) => {
    const value: unknown = JSON.parse(storage.getItem(resumeStorageKey(code)) ?? "null")
    if (!value || typeof value !== "object") return null
    const { displayName, micOn, cameraOn, savedAt } = value as Record<string, unknown>
    if (typeof displayName !== "string" || displayName.trim().length < 2) return null
    if (typeof micOn !== "boolean" || typeof cameraOn !== "boolean" || typeof savedAt !== "number") return null
    if (savedAt > now || now - savedAt > MEETING_RESUME_TTL_MS) return null
    return { displayName, micOn, cameraOn, savedAt }
  })
}

export type DisconnectOutcome = "finished" | "leave" | "rejoin"

/**
 * LiveKit reports a disconnect only after its own resume attempts failed, e.g.
 * when a mobile browser froze the backgrounded tab. Those get a fresh token
 * and a new connection; deliberate exits do not.
 */
export function disconnectOutcome(reason: DisconnectReason | undefined): DisconnectOutcome {
  switch (reason) {
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return "finished"
    case DisconnectReason.CLIENT_INITIATED:
    case DisconnectReason.PARTICIPANT_REMOVED:
    case DisconnectReason.DUPLICATE_IDENTITY:
    case DisconnectReason.USER_REJECTED:
      return "leave"
    default:
      return "rejoin"
  }
}

export function isRetryableJoinError(error: unknown) {
  if (!(error instanceof APIError)) return true
  return error.status >= 500 || error.status === 408 || error.status === 429
}

export function rejoinDelay(attempt: number) {
  return Math.min(1000 * 2 ** (attempt - 1), MAX_REJOIN_DELAY_MS)
}

/** Offline time does not count against the delay, so a dead network cannot burn every attempt. */
export function waitForRejoinAttempt(delay: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      if (navigator.onLine !== false) resolve()
      else window.addEventListener("online", () => resolve(), { once: true })
    }, delay)
  })
}

// @vitest-environment jsdom

import { DisconnectReason } from "livekit-client"
import { beforeEach, describe, expect, it } from "vitest"

import { APIError } from "@/lib/api"
import { clearMeetingResume, disconnectOutcome, isRetryableJoinError, MEETING_RESUME_TTL_MS, readMeetingResume, rejoinDelay, saveMeetingResume } from "@/lib/meeting-reconnect"

describe("meeting resume record", () => {
  beforeEach(() => sessionStorage.clear())

  it("round-trips the name and media choices", () => {
    saveMeetingResume("ABC", { displayName: "Ali", micOn: false, cameraOn: true }, 1_000)
    expect(readMeetingResume("ABC", 2_000)).toEqual({ displayName: "Ali", micOn: false, cameraOn: true, savedAt: 1_000 })
    expect(readMeetingResume("OTHER", 2_000)).toBeNull()
  })

  it("expires so a tab restored much later does not rejoin a stale call", () => {
    saveMeetingResume("ABC", { displayName: "Ali", micOn: true, cameraOn: true }, 0)
    expect(readMeetingResume("ABC", MEETING_RESUME_TTL_MS)).not.toBeNull()
    expect(readMeetingResume("ABC", MEETING_RESUME_TTL_MS + 1)).toBeNull()
  })

  it("ignores cleared or malformed records", () => {
    saveMeetingResume("ABC", { displayName: "Ali", micOn: true, cameraOn: true }, 0)
    clearMeetingResume("ABC")
    expect(readMeetingResume("ABC", 0)).toBeNull()
    sessionStorage.setItem("roobro:resume:ABC", "{not json")
    expect(readMeetingResume("ABC", 0)).toBeNull()
    sessionStorage.setItem("roobro:resume:ABC", JSON.stringify({ displayName: "A", micOn: true, cameraOn: true, savedAt: 0 }))
    expect(readMeetingResume("ABC", 0)).toBeNull()
  })
})

describe("disconnectOutcome", () => {
  it.each([
    [DisconnectReason.ROOM_DELETED, "finished"],
    [DisconnectReason.ROOM_CLOSED, "finished"],
    [DisconnectReason.CLIENT_INITIATED, "leave"],
    [DisconnectReason.PARTICIPANT_REMOVED, "leave"],
    [DisconnectReason.DUPLICATE_IDENTITY, "leave"],
    [DisconnectReason.SIGNAL_CLOSE, "rejoin"],
    [DisconnectReason.CONNECTION_TIMEOUT, "rejoin"],
    [DisconnectReason.SERVER_SHUTDOWN, "rejoin"],
    [undefined, "rejoin"],
  ] as const)("maps %s to %s", (reason, outcome) => {
    expect(disconnectOutcome(reason)).toBe(outcome)
  })
})

describe("rejoin retry policy", () => {
  it("backs off exponentially up to a ceiling", () => {
    expect([1, 2, 3, 4, 5, 6].map(rejoinDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000])
  })

  it.each([
    [new TypeError("Failed to fetch"), true],
    [new APIError("busy", 503), true],
    [new APIError("slow down", 429), true],
    [new APIError("banned", 403, "participant_banned"), false],
    [new APIError("bad request", 400), false],
  ])("treats %s as retryable: %s", (error, retryable) => {
    expect(isRetryableJoinError(error)).toBe(retryable)
  })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

const fingerprintMocks = vi.hoisted(() => ({
  load: vi.fn(() => Promise.resolve({ get: () => Promise.resolve({ visitorId: "fingerprint-visitor-1234567890" }) })),
}))

vi.mock("@fingerprintjs/fingerprintjs", () => ({ default: { load: fingerprintMocks.load } }))

import { joinMeeting, removeMeetingParticipant } from "@/lib/api"

describe("meeting participant identity and moderation API", () => {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Pick<Response, "ok" | "status" | "json">> => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { removed: true, banned: false } }),
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal("fetch", fetchMock)
  })

  it("uses the browser fingerprint as the anonymous participant ID without monitoring", async () => {
    await joinMeeting("abc-123", "Ali")

    expect(fingerprintMocks.load).toHaveBeenCalledWith({ monitoring: false })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Ali", participant_id: "fingerprint-visitor-1234567890" })
  })

  it("sends host-authorized kick and ban requests", async () => {
    await removeMeetingParticipant("abc-123", "guest-123", true, "host-secret")

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/meetings/abc-123/participants/guest-123/remove", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-Host-Token": "host-secret" }),
      body: JSON.stringify({ ban: true }),
    }))
  })

  it("preserves the API error code for localized meeting messages", async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 410,
      json: async () => ({ success: false, error: { code: "meeting_ended", message: "This meeting has ended." } }),
    }))

    await expect(joinMeeting("abc-123", "Ali")).rejects.toMatchObject({
      code: "meeting_ended",
      status: 410,
    })
  })
})

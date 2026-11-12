import { describe, expect, it } from "vitest"

import { pickSpotlightTrack } from "@/lib/spotlight-track"

const track = (identity: string, source: "camera" | "screen_share", { isLocal = false, video = true } = {}) => ({
  participant: { identity, isLocal },
  source,
  publication: video ? { isMuted: false } : undefined,
})

describe("pickSpotlightTrack", () => {
  const me = track("me", "camera", { isLocal: true })
  const sara = track("sara", "camera")
  const reza = track("reza", "camera", { video: false })

  it("prefers a remote screen share over any camera", () => {
    const share = track("reza", "screen_share")
    expect(pickSpotlightTrack([me, sara, share], ["sara"], null)).toBe(share)
  })

  it("follows the current remote speaker, even with their camera off", () => {
    expect(pickSpotlightTrack([me, sara, reza], ["me", "reza"], null)).toBe(reza)
  })

  it("keeps the last remote speaker during silence", () => {
    expect(pickSpotlightTrack([me, sara, reza], [], "reza")).toBe(reza)
  })

  it("falls back to a remote camera that is actually sending video", () => {
    expect(pickSpotlightTrack([me, reza, sara], [], null)).toBe(sara)
  })

  it("shows the local camera when alone and nothing when there are no tiles", () => {
    expect(pickSpotlightTrack([me], ["me"], null)).toBe(me)
    expect(pickSpotlightTrack([], [], null)).toBeNull()
  })
})

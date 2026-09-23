import { describe, expect, it } from "vitest"
import { fingerprintMedia } from "@/lib/shared-playback"

describe("local media fingerprint", () => {
  it("matches renamed copies and detects different content and sizes", async () => {
    const original = new File(["same movie"], "movie.mp4")
    expect(await fingerprintMedia(original)).toBe(await fingerprintMedia(new File(["same movie"], "renamed.mp4")))
    expect(await fingerprintMedia(original)).not.toBe(await fingerprintMedia(new File(["diff movie"], "movie.mp4")))
    expect(await fingerprintMedia(original)).not.toBe(await fingerprintMedia(new File(["same movie!"], "movie.mp4")))
  })

  it("reads bounded samples from a large file, including its middle and end", async () => {
    const bytes = new Uint8Array(1024 * 1024)
    const original = await fingerprintMedia(new File([bytes], "large.mp4"))
    bytes[512 * 1024] = 1
    expect(await fingerprintMedia(new File([bytes], "large.mp4"))).not.toBe(original)
    bytes[512 * 1024] = 0
    bytes[bytes.length - 1] = 1
    expect(await fingerprintMedia(new File([bytes], "large.mp4"))).not.toBe(original)
  })
})

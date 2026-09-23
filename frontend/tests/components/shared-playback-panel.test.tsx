// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SharedPlaybackPanel } from "@/components/shared-playback-panel"
import { loadLocalPlaybackMedia } from "@/lib/local-playback-media"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/local-playback-media", () => ({ loadLocalPlaybackMedia: vi.fn() }))

const local = { url: "blob:film", media: { fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 100 }, audio: false }

describe("local shared playback panel", () => {
  let root: Root
  let container: HTMLDivElement
  let paused: boolean
  let revoke: ReturnType<typeof vi.fn>
  const click = async (label: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label)
    expect(button, label).toBeDefined()
    await act(async () => button!.click())
  }
  const choose = async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["film"], "film.mp4")] })
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })))
  }
  beforeEach(async () => {
    vi.useFakeTimers()
    paused = true
    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => paused)
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4)
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => { paused = false })
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => { paused = true })
    revoke = vi.fn()
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke })
    vi.mocked(loadLocalPlaybackMedia).mockResolvedValue(local)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<SharedPlaybackPanel identity="self" />))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("loads locally, joins explicitly, shares controls and keeps volume individual", async () => {
    await choose()
    expect(loadLocalPlaybackMedia).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal))
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("selected")
    await click("playback.start")
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("matching")
    await click("playback.join")
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("ready")
    expect(paused).toBe(true)
    await click("playback.play")
    await act(async () => vi.advanceTimersByTime(400))
    expect(paused).toBe(false)
    expect(container.querySelector("video")?.volume).toBe(0.7)
    await click("playback.pause")
    await act(async () => vi.advanceTimersByTime(100))
    expect(paused).toBe(true)
    await click("playback.stop")
    expect(container.querySelector(".playback-session")).toBeNull()
    expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:film")
  })

  it("keeps the player alive when hidden and releases its object URL on unmount", async () => {
    await choose()
    const player = container.querySelector("video")
    await act(async () => root.render(<SharedPlaybackPanel identity="self" />))
    container.hidden = true
    expect(container.querySelector("video")).toBe(player)
    expect(revoke).not.toHaveBeenCalled()
    await act(async () => root.render(null))
    expect(revoke).toHaveBeenCalledWith("blob:film")
  })

  it("rejects a different local copy without changing the shared film", async () => {
    await choose()
    await click("playback.start")
    vi.mocked(loadLocalPlaybackMedia).mockResolvedValue({ ...local, url: "blob:other", media: { ...local.media, fingerprint: "b".repeat(64) } })
    await choose()
    expect(container.querySelector('[role="status"]')?.textContent).toBe("playback.mismatch")
    expect(container.querySelector(".playback-session")?.textContent).toContain("film.mp4")
    expect(container.querySelector(".playback-controls")).toBeNull()
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("mismatch")
    expect(paused).toBe(true)
  })

  it("offers a gesture retry when audible playback is blocked", async () => {
    await choose()
    await click("playback.start")
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException("Autoplay blocked", "NotAllowedError"))
    await click("playback.join")
    expect(container.textContent).toContain("playback.enableAudio")
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("blocked")
    await click("playback.enableAudio")
    expect(container.textContent).not.toContain("playback.enableAudio")
  })

  it("shows preparation until playback is actually available without interrupting the pending join", async () => {
    await choose()
    await click("playback.start")
    let finish: () => void = () => undefined
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => {
      paused = false
      return new Promise<void>((resolve) => { finish = resolve })
    })
    await click("playback.join")
    await act(async () => vi.advanceTimersByTime(500))
    expect(paused).toBe(false)
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("buffering")
    expect(container.querySelector<HTMLButtonElement>(".playback-primary")?.disabled).toBe(true)
    await act(async () => finish())
    expect(container.querySelector('.playback-readiness li')?.getAttribute("data-status")).toBe("ready")
    expect(paused).toBe(true)
  })

  it("shows a file error and never starts a session for unsupported media", async () => {
    vi.mocked(loadLocalPlaybackMedia).mockRejectedValueOnce(new Error("unsupported"))
    await choose()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("playback.unsupported")
    expect(container.querySelector(".playback-primary")).toBeNull()
  })
})

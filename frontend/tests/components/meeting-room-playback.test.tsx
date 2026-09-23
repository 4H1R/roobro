// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { MeetingRoom } from "@/components/meeting-room"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl", language: "fa" } }) }))
vi.mock("@/lib/local-playback-media", () => ({ loadLocalPlaybackMedia: async () => ({
  url: "blob:film", media: { fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 100 }, audio: false,
}) }))

it("keeps shared playback running across desktop panels and reopens it from the mobile menu", async () => {
  vi.useFakeTimers()
  let paused = true
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => paused)
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => { paused = false })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => { paused = true })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const click = async (selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(selector)
    expect(button, selector).not.toBeNull()
    await act(async () => button!.click())
  }
  try {
    await act(async () => root.render(<MeetingRoom
      result={{ meeting: { id: "1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() }, role: "participant", identity: "self", token: "", server_url: "", demo: true }}
      displayName="Ali" code="ABC123" cameraOn={false} micOn={false}
      onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined}
    />))
    const sidebar = container.querySelector<HTMLElement>(".playback-sidebar")!
    expect(sidebar.hidden).toBe(true)
    await click('button[aria-label="room.playback"]')
    expect(sidebar.hidden).toBe(false)
    const input = sidebar.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["film"], "film.mp4")] })
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })))
    await click(".playback-primary") // Start the room session.
    await click(".playback-primary") // Join local playback.
    await click('button[aria-label="playback.play"]')
    await act(async () => vi.advanceTimersByTime(400))
    expect(paused).toBe(false)
    const player = sidebar.querySelector("video")
    await click('button[aria-label="playback.expand"]')
    expect(sidebar.classList.contains("is-expanded")).toBe(true)
    expect(sidebar.querySelector("video")).toBe(player)
    expect(paused).toBe(false)
    expect(sidebar.querySelector('.playback-readiness li')?.textContent).toContain("Ali")
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    expect(sidebar.classList.contains("is-expanded")).toBe(false)
    expect(document.activeElement?.getAttribute("aria-label")).toBe("playback.expand")
    await click('button[aria-label="playback.expand"]')

    await click('button[aria-label="playback.close"]')
    await click('.desktop-secondary-controls button[aria-label="room.chat"]')
    await act(async () => vi.advanceTimersByTime(500))
    expect(sidebar.hidden).toBe(true)
    expect(sidebar.classList.contains("is-expanded")).toBe(false)
    expect(sidebar.querySelector("video")).toBe(player)
    expect(paused).toBe(false)
    await click(".mobile-more")
    const mobileAction = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === "room.playback")!
    await act(async () => mobileAction.click())
    expect(sidebar.hidden).toBe(false)
    expect(sidebar.querySelector("video")).toBe(player)
  } finally {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})

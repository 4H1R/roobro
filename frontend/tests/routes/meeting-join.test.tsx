// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  code: "FIRST",
  getMeeting: vi.fn(),
  joinMeeting: vi.fn(),
  endMeeting: vi.fn(),
  removeMeetingParticipant: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({ options, useParams: () => ({ code: mocks.code }) }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<object>(),
  getMeeting: mocks.getMeeting,
  joinMeeting: mocks.joinMeeting,
  meetingStorageKey: (code: string) => `host:${code}`,
  endMeeting: mocks.endMeeting,
  removeMeetingParticipant: mocks.removeMeetingParticipant,
}))
vi.mock("@/lib/meeting-sounds", () => ({ prepareMeetingSounds: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock("@/components/meeting-room", () => ({
  MeetingRoom: ({ code, displayName, cameraOn, micOn, onEnd, onLeave, onConnectionLost, onMediaChange, onModerateParticipant }: {
    code: string
    displayName: string
    cameraOn: boolean
    micOn: boolean
    onEnd: () => Promise<void>
    onLeave: () => void
    onConnectionLost: () => void
    onMediaChange: (media: { micOn: boolean; cameraOn: boolean }) => void
    onModerateParticipant: (identity: string, ban: boolean) => Promise<void>
  }) => {
    useEffect(() => {
      mocks.connect(code)
      return () => { mocks.disconnect(code) }
    }, [code])
    return <div data-room-audio={code} data-display-name={displayName} data-camera-on={cameraOn} data-mic-on={micOn}>
      <button data-action="end" onClick={() => void onEnd()} />
      <button data-action="leave" onClick={onLeave} />
      <button data-action="lose-connection" onClick={onConnectionLost} />
      <button data-action="camera-on" onClick={() => onMediaChange({ micOn, cameraOn: true })} />
      <button data-action="moderate" onClick={() => void onModerateParticipant("user", true).catch(() => {})} />
    </div>
  },
}))

import { APIError } from "@/lib/api"
import { ThemeProvider } from "@/components/theme-toggle"
import { Route } from "@/routes/meet.$code"

const Page = Route.options.component as React.ComponentType
const meeting = (code: string) => ({ id: code, code, title: code, status: "active" as const, created_at: "2026-09-16" })
const joined = (code: string) => ({ meeting: meeting(code), token: "token", server_url: "wss://example.test", role: "participant", identity: "user", demo: false })

describe("meeting connection requires Join", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.code = "FIRST"
    mocks.getMeeting.mockImplementation(async (code: string) => meeting(code))
    mocks.joinMeeting.mockImplementation(async (code: string) => joined(code))
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem("roobro:remembered-name", "Ali")
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } })
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const render = async () => { await act(async () => root.render(<ThemeProvider><Page /></ThemeProvider>)) }
  const join = async () => {
    const button = container.querySelector<HTMLButtonElement>(".join-now")
    expect(button?.textContent).toBe("lobby.join")
    await act(async () => button?.click())
  }

  it("does not mount room audio or connect until Join is clicked", async () => {
    await render()
    expect(mocks.joinMeeting).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(container.querySelector("[data-room-audio]")).toBeNull()
    await join()
    expect(mocks.joinMeeting).toHaveBeenCalledWith("FIRST", "Ali", undefined)
    expect(mocks.connect).toHaveBeenCalledWith("FIRST")
    expect(container.querySelector("[data-display-name]")?.getAttribute("data-display-name")).toBe("Ali")
  })

  it("starts with the camera off and microphone on, then joins with those choices", async () => {
    const getUserMedia = vi.spyOn(navigator.mediaDevices, "getUserMedia")
    await render()
    expect(container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOff"]')?.getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.micOn"]')?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector(".camera-preview video")).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
    await join()
    expect(container.querySelector("[data-room-audio]")?.getAttribute("data-camera-on")).toBe("false")
    expect(container.querySelector("[data-room-audio]")?.getAttribute("data-mic-on")).toBe("true")
  })

  it("keeps media choices changed in the lobby when joining", async () => {
    await render()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOff"]')!.click()
      container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.micOn"]')!.click()
    })
    expect(container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOn"]')?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.micOff"]')?.getAttribute("aria-pressed")).toBe("false")
    await join()
    expect(container.querySelector("[data-room-audio]")?.getAttribute("data-camera-on")).toBe("true")
    expect(container.querySelector("[data-room-audio]")?.getAttribute("data-mic-on")).toBe("false")
  })

  it("disconnects the previous room immediately when opening another meeting", async () => {
    await render()
    await join()
    let resolveMeeting!: (value: ReturnType<typeof meeting>) => void
    mocks.getMeeting.mockImplementation(() => new Promise((resolve) => { resolveMeeting = resolve }))
    mocks.code = "SECOND"
    await render()
    expect(container.querySelector("[data-room-audio]")).toBeNull()
    expect(mocks.disconnect).toHaveBeenCalledWith("FIRST")
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    await act(async () => resolveMeeting(meeting("SECOND")))
    expect(container.querySelector("[data-room-audio]")).toBeNull()
    await join()
    expect(mocks.connect).toHaveBeenLastCalledWith("SECOND")
  })

  it("ignores an old Join response after opening another meeting", async () => {
    await render()
    let resolveJoin!: (value: ReturnType<typeof joined>) => void
    mocks.joinMeeting.mockImplementation(() => new Promise((resolve) => { resolveJoin = resolve }))
    await join()
    mocks.code = "SECOND"
    await render()
    localStorage.setItem("roobro:remembered-name", "New name")
    await act(async () => resolveJoin(joined("FIRST")))
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(container.querySelector("[data-room-audio]")).toBeNull()
    expect(localStorage.getItem("roobro:remembered-name")).toBe("New name")
  })

  it("does not report a failed Join from a previous meeting", async () => {
    await render()
    let rejectJoin!: (error: Error) => void
    mocks.joinMeeting.mockImplementation(() => new Promise((_resolve, reject) => { rejectJoin = reject }))
    await join()
    mocks.code = "SECOND"
    await render()
    await act(async () => rejectJoin(new Error("Old meeting failed")))
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(container.querySelector(".join-now")?.textContent).toBe("lobby.join")
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it.each([
    [404, "meeting_not_found", "lobby.notFound"],
    [410, "meeting_ended", "lobby.ended"],
    [500, "internal_error", "lobby.joinFailed"],
    [410, "internal_error", "lobby.joinFailed"],
    [410, undefined, "lobby.ended"],
  ] as const)("uses a localized toast for Join error HTTP %i (%s)", async (status, code, message) => {
    mocks.joinMeeting.mockRejectedValue(new APIError("English API error", status, code))
    await render()
    await join()
    expect(mocks.toastError).toHaveBeenCalledWith(message)
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it("shows the ended page when the meeting lookup returns HTTP 410", async () => {
    mocks.getMeeting.mockRejectedValue(new APIError("This meeting has ended.", 410, "meeting_ended"))
    await render()
    expect(container.textContent).toContain("lobby.ended")
    expect(container.textContent).not.toContain("lobby.notFound")
  })

  it.each([
    ["end", 410, "endMeeting", "meeting_ended", "lobby.ended"],
    ["end", 403, "endMeeting", "host_required", "room.endFailed"],
    ["moderate", 410, "removeMeetingParticipant", "meeting_ended", "lobby.ended"],
    ["moderate", 403, "removeMeetingParticipant", "host_required", "room.moderationFailed"],
  ] as const)("uses a localized toast when %s fails with HTTP %i", async (action, status, request, code, message) => {
    sessionStorage.setItem("host:FIRST", "host-token")
    mocks[request].mockRejectedValue(new APIError("English API error", status, code))
    await render()
    await join()
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click())
    expect(mocks.toastError).toHaveBeenCalledWith(message)
  })

  it("stops the local preview when switching meetings during camera startup", async () => {
    const stop = vi.fn<MediaStreamTrack["stop"]>()
    const track = { stop } as unknown as MediaStreamTrack
    const stream = { getTracks: () => [track] } as MediaStream
    let resolvePreview!: (stream: MediaStream) => void
    vi.spyOn(navigator.mediaDevices, "getUserMedia")
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePreview = resolve }))
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOff"]')!.click())
    mocks.code = "SECOND"
    await render()
    await act(async () => resolvePreview(stream))
    expect(stop).toHaveBeenCalledOnce()
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  describe("staying in the call after the connection drops", () => {
    const resumeKey = "roobro:resume:FIRST"
    const click = async (action: string) => {
      await act(async () => container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click())
    }

    it("fetches a fresh token and reconnects with the current media choices", async () => {
      await render()
      await join()
      await click("camera-on")
      await click("lose-connection")
      expect(mocks.joinMeeting).toHaveBeenCalledTimes(2)
      expect(mocks.disconnect).toHaveBeenCalledWith("FIRST")
      expect(mocks.connect).toHaveBeenCalledTimes(2)
      expect(container.querySelector("[data-room-audio]")?.getAttribute("data-camera-on")).toBe("true")
    })

    it("keeps retrying through transient failures while showing a rejoining screen", async () => {
      vi.useFakeTimers()
      try {
        await render()
        await join()
        mocks.joinMeeting.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await click("lose-connection")
        expect(container.textContent).toContain("room.rejoining")
        expect(container.querySelector("[data-room-audio]")).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
        expect(mocks.joinMeeting).toHaveBeenCalledTimes(3)
        expect(container.querySelector("[data-room-audio]")).not.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it("shows the ended page instead of retrying when the meeting is over", async () => {
      await render()
      await join()
      mocks.joinMeeting.mockRejectedValueOnce(new APIError("ended", 410, "meeting_ended"))
      await click("lose-connection")
      expect(container.textContent).toContain("lobby.ended")
      expect(sessionStorage.getItem(resumeKey)).toBeNull()
    })

    it("returns to the lobby when a banned participant tries to rejoin", async () => {
      await render()
      await join()
      mocks.joinMeeting.mockRejectedValueOnce(new APIError("banned", 403, "participant_banned"))
      await click("lose-connection")
      expect(mocks.joinMeeting).toHaveBeenCalledTimes(2)
      expect(mocks.toastError).toHaveBeenCalledWith("room.rejoinFailed")
      expect(container.querySelector(".join-now")).not.toBeNull()
    })

    it("stops looping when every fresh connection drops straight away", async () => {
      await render()
      await join()
      for (let drop = 0; drop < 4; drop++) await click("lose-connection")
      expect(mocks.joinMeeting).toHaveBeenCalledTimes(4)
      expect(mocks.toastError).toHaveBeenCalledWith("room.rejoinFailed")
      expect(container.querySelector(".join-now")).not.toBeNull()
    })

    it("rejoins without the lobby after the browser reloads or restores a discarded tab", async () => {
      await render()
      await join()
      expect(JSON.parse(sessionStorage.getItem(resumeKey)!)).toMatchObject({ displayName: "Ali", micOn: true, cameraOn: false })
      const saved = sessionStorage.getItem(resumeKey)!
      act(() => root.unmount())
      sessionStorage.setItem(resumeKey, saved)
      root = createRoot(container)
      await render()
      expect(container.querySelector(".join-now")).toBeNull()
      expect(mocks.joinMeeting).toHaveBeenCalledTimes(2)
      expect(mocks.joinMeeting).toHaveBeenLastCalledWith("FIRST", "Ali", undefined)
      expect(container.querySelector("[data-display-name]")?.getAttribute("data-display-name")).toBe("Ali")
    })

    it("forgets the call when the user leaves on purpose", async () => {
      await render()
      await join()
      await click("leave")
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" })
      act(() => root.unmount())
      root = createRoot(container)
      expect(sessionStorage.getItem(resumeKey)).toBeNull()
    })
  })
})

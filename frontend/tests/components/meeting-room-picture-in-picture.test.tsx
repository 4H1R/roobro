// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ParticipantTile: () => null,
  RoomAudioRenderer: () => null,
  StartAudio: () => null,
  useParticipants: () => [],
  useRoomContext: () => ({ on: vi.fn(), off: vi.fn() }),
  useSpeakingParticipants: () => [],
  useTracks: () => [],
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl", language: "fa" } }) }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => ({ playParticipantJoinedSound: vi.fn(), playParticipantLeftSound: vi.fn() }))

import { MeetingRoom } from "@/components/meeting-room"

type PipWindow = Window & { close: () => void }

describe("meeting picture-in-picture", () => {
  let container: HTMLDivElement
  let root: Root
  let frame: HTMLIFrameElement
  let pipWindow: PipWindow
  let requestWindow: ReturnType<typeof vi.fn>
  let actionHandlers: Map<string, (() => void) | null>
  const onLeave = vi.fn()

  beforeEach(() => {
    onLeave.mockClear()
    frame = document.createElement("iframe")
    document.body.append(frame)
    pipWindow = frame.contentWindow as PipWindow
    pipWindow.close = () => pipWindow.dispatchEvent(new Event("pagehide"))
    requestWindow = vi.fn(async () => pipWindow)
    Object.defineProperty(window, "documentPictureInPicture", { configurable: true, value: { window: null, requestWindow } })
    actionHandlers = new Map()
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: { setActionHandler: (action: string, handler: (() => void) | null) => actionHandlers.set(action, handler) } })
    document.documentElement.dataset.theme = "dark"
    document.documentElement.setAttribute("dir", "rtl")
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    frame.remove()
    Reflect.deleteProperty(window, "documentPictureInPicture")
    Reflect.deleteProperty(navigator, "mediaSession")
  })

  const render = () => act(async () => root.render(
    <MeetingRoom
      result={{ meeting: { id: "m", code: "ABC123", title: "Standup", status: "active", created_at: new Date().toISOString() }, token: "", server_url: "", role: "participant", identity: "demo-user", demo: true }}
      displayName="Ali"
      code="ABC123"
      cameraOn={false}
      micOn
      onLeave={onLeave}
      onEnd={() => undefined}
      onFinished={() => undefined}
    />,
  ))
  const pipButton = () => container.querySelector<HTMLButtonElement>('.main-controls button[title="room.pictureInPicture"]')
  const pipControl = (title: string) => pipWindow.document.querySelector<HTMLButtonElement>(`.meeting-pip-controls button[title="${title}"]`)

  it("opens automatically from the browser's tab-switch action with working call controls", async () => {
    await render()
    const enterPip = actionHandlers.get("enterpictureinpicture")
    expect(enterPip).toBeTypeOf("function")

    await act(async () => enterPip!())
    expect(requestWindow).toHaveBeenCalledOnce()
    expect(pipWindow.document.documentElement.dataset.theme).toBe("dark")
    expect(pipWindow.document.documentElement.getAttribute("dir")).toBe("rtl")
    expect(pipWindow.document.querySelector(".meeting-pip-avatar")?.textContent).toBe("A")
    expect(pipButton()?.getAttribute("aria-pressed")).toBe("true")

    await act(async () => pipControl("lobby.micOn")!.click())
    expect(pipControl("lobby.micOff")).not.toBeNull()
    expect(container.querySelector('.media-toggle[title="lobby.micOff"]')).not.toBeNull()

    await act(async () => pipControl("room.leave")!.click())
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it("toggles from the control bar and follows theme changes while open", async () => {
    await render()
    await act(async () => pipButton()!.click())
    expect(pipWindow.document.querySelector(".meeting-pip")).not.toBeNull()

    await act(async () => { document.documentElement.dataset.theme = "light" })
    expect(pipWindow.document.documentElement.dataset.theme).toBe("light")

    await act(async () => pipButton()!.click())
    expect(pipWindow.document.querySelector(".meeting-pip")).toBeNull()
    expect(pipButton()?.getAttribute("aria-pressed")).toBe("false")
  })

  it("unregisters the automatic action when leaving the room", async () => {
    await render()
    act(() => root.unmount())
    root = createRoot(container)
    expect(actionHandlers.get("enterpictureinpicture")).toBeNull()
  })

  it("hides the control when the browser has no picture-in-picture at all", async () => {
    Reflect.deleteProperty(window, "documentPictureInPicture")
    await render()
    expect(pipButton()).toBeNull()
  })
})

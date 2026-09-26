// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type RoomListener = (...args: unknown[]) => void

const roomListeners = new Map<string, RoomListener>()
const publishData = vi.fn((_payload: Uint8Array, _options?: { reliable?: boolean; topic?: string }) => Promise.resolve())
const room = {
  localParticipant: { publishData },
  on: vi.fn((event: string, listener: RoomListener) => {
    roomListeners.set(event, listener)
    return room
  }),
  off: vi.fn((event: string, listener: RoomListener) => {
    if (roomListeners.get(event) === listener) roomListeners.delete(event)
    return room
  }),
}
const apiMocks = vi.hoisted(() => ({
  getMeetingChat: vi.fn(),
  sendMeetingChat: vi.fn(),
}))
vi.mock("@/lib/api", async (importOriginal) => ({ ...await importOriginal<object>(), ...apiMocks }))

const soundMocks = vi.hoisted(() => ({
  playMessageReceivedSound: vi.fn(),
  playMessageSentSound: vi.fn(),
  playParticipantJoinedSound: vi.fn(),
  playParticipantLeftSound: vi.fn(),
}))

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ParticipantTile: () => null,
  RoomAudioRenderer: () => null,
  useParticipants: () => [],
  useRoomContext: () => room,
  useTracks: () => [],
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { dir: () => "ltr", language: "en" },
  }),
}))

vi.mock("@/components/shared-playback-panel", () => ({ SharedPlaybackPanel: () => null }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => soundMocks)

import { MeetingRoom } from "@/components/meeting-room"

describe("meeting room chat", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    apiMocks.getMeetingChat.mockResolvedValue({ history_enabled: true, messages: [] })
    apiMocks.sendMeetingChat.mockResolvedValue({ id: 1, identity: "local-user", name: "Ali", text: "Hello from Ali", sentAt: Date.now() })
    roomListeners.clear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(
      <MeetingRoom
        result={{
          meeting: { id: "meeting-1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() },
          chat_token: "chat-token",
          token: "token",
          server_url: "wss://example.test",
          role: "participant",
          identity: "local-user",
          demo: false,
        }}
        displayName="Ali"
        code="ABC123"
        cameraOn={false}
        micOn
        onLeave={() => undefined}
        onEnd={() => undefined}
        onFinished={() => undefined}
      />,
    ))
    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.chat"]')?.click())
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function chatViewport() {
    const viewport = container.querySelector<HTMLDivElement>(".messages")!
    let scrollTop = 0
    // jsdom has no layout: give the real message list a two-message viewport.
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 200 },
      scrollHeight: { configurable: true, get: () => Math.max(200, viewport.querySelectorAll(".message").length * 100) },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.max(0, Math.min(value, viewport.scrollHeight - viewport.clientHeight)) },
      },
    })
    return viewport
  }

  async function pollMessages(count: number) {
    apiMocks.getMeetingChat.mockResolvedValue({ history_enabled: true, messages: Array.from({ length: count }, (_, index) => ({
      id: index + 1, identity: "remote-user", name: "Bajal", text: `Message ${index + 1}`, sentAt: 1_700_000_000_000 + index,
    })) })
    await act(async () => vi.advanceTimersByTimeAsync(1000))
  }

  function scrollTo(viewport: HTMLDivElement, top: number) {
    act(() => {
      viewport.scrollTop = top
      viewport.dispatchEvent(new Event("scroll"))
    })
  }

  it("follows new messages when the list first overflows and while at the bottom", async () => {
    const viewport = chatViewport()
    await pollMessages(3)
    expect(viewport.scrollTop).toBe(100)
    await pollMessages(6)
    expect(viewport.scrollTop).toBe(400)
  })

  it("preserves the reading position when scrolled up and resumes following at the bottom", async () => {
    const viewport = chatViewport()
    await pollMessages(6)
    scrollTo(viewport, 100)
    await pollMessages(7)
    expect(viewport.scrollTop).toBe(100)

    scrollTo(viewport, viewport.scrollHeight - viewport.clientHeight)
    await pollMessages(8)
    expect(viewport.scrollTop).toBe(600)
  })

  it.each([false, true])("respects the scroll position when sending a message (scrolled up: %s)", async (scrolledUp) => {
    const viewport = chatViewport()
    await pollMessages(6)
    scrollTo(viewport, scrolledUp ? 100 : 400)
    apiMocks.sendMeetingChat.mockResolvedValue({ id: 7, identity: "local-user", name: "Ali", text: "New message", sentAt: Date.now() })
    const input = container.querySelector<HTMLInputElement>(".chat-form input")!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "New message")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => container.querySelector(".chat-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(viewport.scrollTop).toBe(scrolledUp ? 100 : 500)
  })

  it("sends authenticated API chat and plays a cue", async () => {
    const input = container.querySelector<HTMLInputElement>(".chat-form input")
    const form = container.querySelector<HTMLFormElement>(".chat-form")
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set

    act(() => {
      setValue?.call(input, "Hello from Ali")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))

    expect(apiMocks.sendMeetingChat).toHaveBeenCalledWith("ABC123", "chat-token", "Hello from Ali")
    expect(publishData).not.toHaveBeenCalled()
    expect(soundMocks.playMessageSentSound).toHaveBeenCalledOnce()
    expect(container.querySelector(".message-own")?.textContent).toContain("Hello from Ali")
  })

  it("renders chat history returned by an authenticated poll", async () => {
    apiMocks.getMeetingChat.mockResolvedValue({ history_enabled: true, messages: [
      { id: 1, identity: "remote-user", name: "Bajal", text: "Hello from Bajal", sentAt: 1_700_000_000_000 },
    ] })
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(apiMocks.getMeetingChat).toHaveBeenCalledWith("ABC123", "chat-token")

    expect(container.textContent).toContain("Bajal")
    expect(container.textContent).toContain("Hello from Bajal")
    expect(container.querySelector(".message-other")?.textContent).toContain("Hello from Bajal")
    expect(soundMocks.playMessageReceivedSound).not.toHaveBeenCalled()
  })

  it("shows and clears an unread badge and plays a cue for unseen messages", async () => {
    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.chat"]')?.click())
    apiMocks.getMeetingChat.mockResolvedValue({ history_enabled: true, messages: [
      { id: 1, identity: "remote-user", name: "Bajal", text: "Are you there?", sentAt: Date.now() },
    ] })
    await act(async () => vi.advanceTimersByTimeAsync(1000))

    expect(soundMocks.playMessageReceivedSound).toHaveBeenCalledOnce()
    expect([...container.querySelectorAll(".chat-unread-badge")].map((badge) => badge.textContent)).toEqual(["1", "1"])

    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.chat"]')?.click())
    expect(container.querySelector(".chat-unread-badge")).toBeNull()
  })
})

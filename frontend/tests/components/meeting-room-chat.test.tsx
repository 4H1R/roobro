// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RoomEvent } from "livekit-client"
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

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => soundMocks)

import { MeetingRoom } from "@/components/meeting-room"

describe("meeting room chat", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.clearAllMocks()
    roomListeners.clear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(
      <MeetingRoom
        result={{
          meeting: { id: "meeting-1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() },
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
  })

  it("publishes a reliable chat packet and plays a cue when sending", async () => {
    const input = container.querySelector<HTMLInputElement>(".chat-form input")
    const form = container.querySelector<HTMLFormElement>(".chat-form")
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set

    act(() => {
      setValue?.call(input, "Hello from Ali")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))

    expect(publishData).toHaveBeenCalledOnce()
    const [payload, options] = publishData.mock.calls[0]
    expect(options).toEqual({ reliable: true, topic: "roobro-chat" })
    expect(JSON.parse(new TextDecoder().decode(payload))).toMatchObject({ text: "Hello from Ali" })
    expect(soundMocks.playMessageSentSound).toHaveBeenCalledOnce()
    expect(container.querySelector(".message-own")?.textContent).toContain("Hello from Ali")
  })

  it("renders chat packets received from another participant", async () => {
    const packet = new TextEncoder().encode(JSON.stringify({ text: "Hello from Bajal", sentAt: 1_700_000_000_000 }))

    await act(async () => roomListeners.get(RoomEvent.DataReceived)?.(
      packet,
      { identity: "remote-user", name: "Bajal" },
      undefined,
      "roobro-chat",
    ))

    expect(container.textContent).toContain("Bajal")
    expect(container.textContent).toContain("Hello from Bajal")
    expect(container.querySelector(".message-other")?.textContent).toContain("Hello from Bajal")
    expect(soundMocks.playMessageReceivedSound).not.toHaveBeenCalled()
  })

  it("shows and clears an unread badge and plays a cue for unseen messages", async () => {
    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.chat"]')?.click())
    const packet = new TextEncoder().encode(JSON.stringify({ text: "Are you there?", sentAt: 1_700_000_000_000 }))

    await act(async () => roomListeners.get(RoomEvent.DataReceived)?.(
      packet,
      { identity: "remote-user", name: "Bajal" },
      undefined,
      "roobro-chat",
    ))

    expect(soundMocks.playMessageReceivedSound).toHaveBeenCalledOnce()
    expect([...container.querySelectorAll(".chat-unread-badge")].map((badge) => badge.textContent)).toEqual(["1", "1"])

    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.chat"]')?.click())
    expect(container.querySelector(".chat-unread-badge")).toBeNull()
  })
})

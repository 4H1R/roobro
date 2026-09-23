// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RoomEvent } from "livekit-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type RoomListener = (...args: unknown[]) => void

let dataListener: RoomListener | undefined
const publishData = vi.fn((_payload: Uint8Array, _options: { reliable: boolean; topic: string }) => Promise.resolve())
const room = {
  localParticipant: { publishData },
  on: vi.fn((event: string, listener: RoomListener) => {
    if (event === RoomEvent.DataReceived) dataListener = listener
    return room
  }),
  off: vi.fn(() => room),
}

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
    t: (key: string, values?: Record<string, string>) => `${key}${values?.emoji ? ` ${values.emoji}` : ""}`,
    i18n: { dir: () => "ltr", language: "en" },
  }),
}))

vi.mock("@/components/shared-playback-panel", () => ({ SharedPlaybackPanel: () => null }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => ({
  playMessageSentSound: vi.fn(),
  playParticipantJoinedSound: vi.fn(),
  playParticipantLeftSound: vi.fn(),
}))

import { MeetingRoom } from "@/components/meeting-room"

describe("meeting room reactions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.clearAllMocks()
    dataListener = undefined
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
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("opens the picker and publishes the selected reaction", async () => {
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="room.reactions"]')
    act(() => toggle?.click())

    expect(toggle?.getAttribute("aria-expanded")).toBe("true")
    const thumbsUp = Array.from(container.querySelectorAll<HTMLButtonElement>(".reaction-picker button")).find((button) => button.textContent === "👍")
    expect(thumbsUp).toBeDefined()
    await act(async () => thumbsUp?.click())

    expect(container.querySelector<HTMLButtonElement>('[aria-label="room.reactions"]')?.getAttribute("aria-expanded")).toBe("false")
    expect(container.querySelector(".reaction-bubble")?.textContent).toContain("👍")
    expect(container.querySelector(".reaction-bubble")?.textContent).toContain("Ali")
    expect(publishData).toHaveBeenCalledOnce()
    const [payload, options] = publishData.mock.calls[0]
    expect(options).toEqual({ reliable: true, topic: "roobro-reaction" })
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual({ emoji: "👍" })
  })

  it("shows valid reactions received from another participant", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ emoji: "🎉" }))
    await act(async () => dataListener?.(payload, { identity: "remote-user", name: "Bajal" }, undefined, "roobro-reaction"))

    expect(container.querySelector(".reaction-bubble")?.textContent).toContain("🎉")
    expect(container.querySelector(".reaction-bubble")?.textContent).toContain("Bajal")
  })

  it("keeps simultaneous reactions in stable horizontal lanes", async () => {
    await act(async () => dataListener?.(new TextEncoder().encode(JSON.stringify({ emoji: "😢" })), { identity: "user-1", name: "Ali" }, undefined, "roobro-reaction"))
    await act(async () => dataListener?.(new TextEncoder().encode(JSON.stringify({ emoji: "😮" })), { identity: "user-2", name: "Test" }, undefined, "roobro-reaction"))

    const bubbles = Array.from(container.querySelectorAll<HTMLElement>(".reaction-bubble"))
    const lanes = bubbles.map((bubble) => bubble.style.getPropertyValue("--reaction-lane"))

    expect(bubbles).toHaveLength(2)
    expect(lanes.every(Boolean)).toBe(true)
    expect(new Set(lanes).size).toBe(2)
  })
})

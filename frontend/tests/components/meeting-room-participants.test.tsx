// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RoomEvent } from "livekit-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const participants = [
  { identity: "local-user", name: "Ali", isLocal: true, isMicrophoneEnabled: true },
  { identity: "remote-user", name: "Bajal", isLocal: false, isMicrophoneEnabled: false },
]
const tracks: Array<{ participant: { identity: string; name: string }; source: string }> = []
const roomListeners = new Map<string, () => void>()
const room = {
  on: vi.fn((event: string, listener: () => void) => {
    roomListeners.set(event, listener)
    return room
  }),
  off: vi.fn((event: string, listener: () => void) => {
    if (roomListeners.get(event) === listener) roomListeners.delete(event)
    return room
  }),
}
const soundMocks = vi.hoisted(() => ({ playParticipantJoinedSound: vi.fn(), playParticipantLeftSound: vi.fn() }))

vi.mock("@livekit/components-react", () => ({
  AudioTrack: () => null,
  ConnectionQualityIndicator: () => null,
  ParticipantName: ({ children, participant }: { children?: React.ReactNode; participant: { name: string } }) => <span>{participant.name}{children}</span>,
  ParticipantPlaceholder: () => null,
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ParticipantTile: ({ children, trackRef }: { children?: React.ReactNode; trackRef: (typeof tracks)[number] }) => (
    <div className="participant-tile">{children ?? <span>{trackRef.participant.name}{trackRef.source === "screen_share" ? "'s screen" : ""}</span>}</div>
  ),
  RoomAudioRenderer: () => null,
  useLocalParticipant: () => ({ localParticipant: participants[0] }),
  useParticipants: () => participants,
  useRoomContext: () => room,
  useTracks: () => tracks,
  VideoTrack: () => null,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key === "room.sharedScreen" ? "صفحهٔ اشتراکی" : key,
    i18n: { dir: () => "ltr", language: "en" },
  }),
}))

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => soundMocks)

import { MeetingRoom } from "@/components/meeting-room"

describe("meeting room participant roster", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    roomListeners.clear()
    tracks.length = 0
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("shows every LiveKit participant and the live participant count", async () => {
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

    const peopleButton = container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.people"]')
    expect(peopleButton?.querySelector("span")?.textContent).toBe("2")

    act(() => peopleButton?.click())

    const roster = container.querySelectorAll(".people-list")
    expect(roster).toHaveLength(2)
    expect(container.textContent).toContain("Ali")
    expect(container.textContent).toContain("Bajal")
    expect(container.querySelector(".participant-menu-trigger")).toBeNull()
  })

  it("localizes the screen-share tile label instead of using LiveKit's English possessive", async () => {
    tracks.push({ participant: { identity: "remote-screen", name: "علیرضا" }, source: "screen_share" })

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

    expect(container.querySelector(".participant-tile")?.textContent).toBe("علیرضا — صفحهٔ اشتراکی")
    expect(container.textContent).not.toContain("screen")
  })

  it("plays the join cue only when LiveKit reports a new remote participant", async () => {
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

    expect(soundMocks.playParticipantJoinedSound).not.toHaveBeenCalled()

    act(() => roomListeners.get(RoomEvent.ParticipantConnected)?.())

    expect(soundMocks.playParticipantJoinedSound).toHaveBeenCalledOnce()
  })

  it("plays the leave cue when LiveKit reports a remote participant disconnect", async () => {
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

    expect(soundMocks.playParticipantLeftSound).not.toHaveBeenCalled()

    act(() => roomListeners.get(RoomEvent.ParticipantDisconnected)?.())

    expect(soundMocks.playParticipantLeftSound).toHaveBeenCalledOnce()
  })

  it("shows kick and ban actions to the host for remote participants only", async () => {
    const onModerateParticipant = vi.fn(() => Promise.resolve())
    await act(async () => root.render(
      <MeetingRoom
        result={{
          meeting: { id: "meeting-1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() },
          token: "token",
          server_url: "wss://example.test",
          role: "host",
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
        onModerateParticipant={onModerateParticipant}
      />,
    ))

    act(() => container.querySelector<HTMLButtonElement>('.side-controls button[aria-label="room.people"]')?.click())
    expect(container.querySelectorAll(".participant-menu-trigger")).toHaveLength(1)

    act(() => container.querySelector<HTMLButtonElement>(".participant-menu-trigger")?.click())
    const actions = container.querySelectorAll<HTMLButtonElement>(".participant-moderation-menu button")
    expect(actions).toHaveLength(2)
    expect(actions[0]?.textContent).toContain("room.removeParticipant")
    expect(actions[1]?.textContent).toContain("room.banParticipant")

    await act(async () => actions[0]?.click())
    expect(onModerateParticipant).toHaveBeenCalledWith("remote-user", false)
  })
})

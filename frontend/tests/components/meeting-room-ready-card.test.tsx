// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const participantState = vi.hoisted(() => ({ current: [] as Array<{ identity: string; name: string; isLocal: boolean; isMicrophoneEnabled: boolean }> }))
const writeText = vi.fn(() => Promise.resolve())

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ParticipantTile: () => null,
  RoomAudioRenderer: () => null,
  useParticipants: () => participantState.current,
  useRoomContext: () => ({ on: vi.fn(), off: vi.fn() }),
  useTracks: () => [],
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { dir: () => "ltr", language: "en" },
  }),
}))

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/meeting-sounds", () => ({
  playMessageSentSound: vi.fn(),
  playParticipantJoinedSound: vi.fn(),
  playParticipantLeftSound: vi.fn(),
}))

import { MeetingRoom } from "@/components/meeting-room"

const result = {
  meeting: { id: "meeting-1", code: "ABC123", title: "Test", status: "active" as const, created_at: new Date().toISOString() },
  token: "",
  server_url: "",
  role: "host" as const,
  identity: "demo-user",
  demo: true,
}

describe("new meeting invite card", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    participantState.current = []
    writeText.mockClear()
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("shows the invite card for a just-created meeting and lets the host dismiss it", async () => {
    await act(async () => root.render(<MeetingRoom result={result} displayName="Ali" code="ABC123" justCreated cameraOn={false} micOn={false} onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined} />))

    const card = container.querySelector<HTMLElement>(".meeting-ready-card")
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain("room.meetingReady")
    expect(card?.textContent).toContain("room.addOthers")

    await act(async () => {
      card?.querySelector<HTMLButtonElement>('[aria-label="room.closeInvite"]')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 350))
    })

    expect(container.querySelector(".meeting-ready-card")).toBeNull()
  })

  it("stays hidden for meetings that were already active", async () => {
    await act(async () => root.render(<MeetingRoom result={result} displayName="Ali" code="ABC123" cameraOn={false} micOn={false} onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined} />))

    expect(container.querySelector(".meeting-ready-card")).toBeNull()
  })

  it("dismisses the card when another participant joins", async () => {
    const liveResult = { ...result, token: "token", server_url: "wss://example.test", demo: false }
    participantState.current = [{ identity: "demo-user", name: "Ali", isLocal: true, isMicrophoneEnabled: false }]
    await act(async () => root.render(<MeetingRoom result={liveResult} displayName="Ali" code="ABC123" justCreated cameraOn={false} micOn={false} onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined} />))
    expect(container.querySelector(".meeting-ready-card")).not.toBeNull()

    participantState.current = [...participantState.current, { identity: "guest-user", name: "Bajal", isLocal: false, isMicrophoneEnabled: true }]
    await act(async () => root.render(<MeetingRoom result={liveResult} displayName="Ali" code="ABC123" justCreated cameraOn={false} micOn={false} onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined} />))
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 350)))

    expect(container.querySelector(".meeting-ready-card")).toBeNull()
  })

  it("keeps the invite button unchanged when the link-copy control is used", async () => {
    await act(async () => root.render(<MeetingRoom result={result} displayName="Ali" code="ABC123" justCreated cameraOn={false} micOn={false} onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined} />))
    const inviteButton = container.querySelector<HTMLButtonElement>(".invite-others")
    const copyButton = container.querySelector<HTMLButtonElement>('.meeting-link button[aria-label="room.copyLink"]')

    await act(async () => {
      copyButton?.click()
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/")
    expect(inviteButton?.textContent).toContain("room.addOthers")
    expect(inviteButton?.textContent).not.toContain("common.copied")
  })
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ParticipantTile: () => null,
  RoomAudioRenderer: () => null,
  useParticipants: () => [],
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
  playParticipantJoinedSound: vi.fn(),
  playParticipantLeftSound: vi.fn(),
}))

import { MeetingRoom } from "@/components/meeting-room"

describe("meeting room raise-hand control", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("becomes selected when clicked and can be cleared", async () => {
    await act(async () => root.render(
      <MeetingRoom
        result={{
          meeting: { id: "meeting-1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() },
          token: "",
          server_url: "",
          role: "participant",
          identity: "demo-user",
          demo: true,
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

    const raiseHandButton = container.querySelector<HTMLButtonElement>('.desktop-secondary-action[title="room.raiseHand"]')

    expect(raiseHandButton?.getAttribute("aria-pressed")).toBe("false")
    expect(raiseHandButton?.classList.contains("active")).toBe(false)

    act(() => raiseHandButton?.click())

    expect(raiseHandButton?.getAttribute("aria-pressed")).toBe("true")
    expect(raiseHandButton?.classList.contains("active")).toBe(true)

    act(() => raiseHandButton?.click())

    expect(raiseHandButton?.getAttribute("aria-pressed")).toBe("false")
    expect(raiseHandButton?.classList.contains("active")).toBe(false)
  })
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setMicrophoneEnabled = vi.fn(() => Promise.resolve())
const setCameraEnabled = vi.fn(() => Promise.resolve())
const setScreenShareEnabled = vi.fn(() => Promise.resolve())
const switchActiveDevice = vi.fn(() => Promise.resolve(true))
const room = {
  localParticipant: {
    publishData: vi.fn(() => Promise.resolve()),
    setMicrophoneEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
  },
  getActiveDevice: vi.fn(() => "default"),
  switchActiveDevice,
  on: vi.fn(),
  off: vi.fn(),
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
    t: (key: string, options?: { number?: number }) => options?.number ? `${key} ${options.number}` : key,
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

const devices = [
  { deviceId: "default", groupId: "audio", kind: "audioinput", label: "Default microphone", toJSON: vi.fn() },
  { deviceId: "usb-mic", groupId: "audio", kind: "audioinput", label: "USB microphone", toJSON: vi.fn() },
  { deviceId: "default", groupId: "video", kind: "videoinput", label: "Default camera", toJSON: vi.fn() },
  { deviceId: "desk-camera", groupId: "video", kind: "videoinput", label: "Desk camera", toJSON: vi.fn() },
] as MediaDeviceInfo[]

describe("meeting room media devices", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(() => Promise.resolve(devices)),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
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
        cameraOn
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

  it("switches the published microphone and camera sources", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="room.chooseMicrophone"]')?.click()
      await Promise.resolve()
    })
    const microphoneOption = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find((button) => button.textContent?.includes("USB microphone"))
    await act(async () => microphoneOption?.click())

    expect(switchActiveDevice).toHaveBeenCalledWith("audioinput", "usb-mic")

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="room.chooseCamera"]')?.click()
      await Promise.resolve()
    })
    const cameraOption = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find((button) => button.textContent?.includes("Desk camera"))
    await act(async () => cameraOption?.click())

    expect(switchActiveDevice).toHaveBeenCalledWith("videoinput", "desk-camera")
  })

  it("mutes and disables video through LiveKit", async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="lobby.micOn"]')?.click())
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="lobby.cameraOn"]')?.click())

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(setCameraEnabled).toHaveBeenCalledWith(false)
  })

  it("starts screen sharing through LiveKit", async () => {
    const shareButton = container.querySelector<HTMLButtonElement>('button[aria-label="room.present"]')
    await act(async () => shareButton?.click())

    expect(setScreenShareEnabled).toHaveBeenCalledWith(true)
    expect(shareButton?.getAttribute("aria-pressed")).toBe("true")

    await act(async () => shareButton?.click())
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false)
  })
})

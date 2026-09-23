// @vitest-environment jsdom

import { act, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ code: "ABC123" }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => null }))
vi.mock("@/components/meeting-room", () => ({ MeetingRoom: () => <div data-room /> }))
vi.mock("@/lib/meeting-sounds", () => ({ prepareMeetingSounds: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<object>(),
  getMeeting: vi.fn(async () => ({ id: "1", code: "ABC123", title: "Test", status: "created" })),
  joinMeeting: vi.fn(async () => ({ role: "participant" })),
  meetingStorageKey: (code: string) => code,
  endMeeting: vi.fn(),
  removeMeetingParticipant: vi.fn(),
}))

import { Route } from "@/routes/meet.$code"
import { joinMeeting } from "@/lib/api"

const Page = Route.options.component as ComponentType

describe("meeting permission intro", () => {
  let container: HTMLDivElement
  let root: Root
  const query = vi.fn()
  const getUserMedia = vi.fn()
  const stop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    query.mockResolvedValue({ state: "prompt" })
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query } })
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = async () => { await act(async () => root.render(<Page />)) }
  const allow = async () => { await act(async () => container.querySelector<HTMLButtonElement>(".join-now")!.click()) }

  it("waits for an explicit click, requests both devices, and allows joining after access", async () => {
    localStorage.setItem("roobro:remembered-name", "Ali")
    await render()
    expect(container.textContent).toContain("lobby.permissionTitle")
    expect(container.querySelector("#display-name")).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(joinMeeting).not.toHaveBeenCalled()

    await allow()
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true, audio: true })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(container.querySelector("#display-name")).not.toBeNull()
    expect(joinMeeting).not.toHaveBeenCalled()
    await act(async () => container.querySelector<HTMLButtonElement>(".join-now")!.click())
    expect(joinMeeting).toHaveBeenCalledWith("ABC123", "Ali", undefined)
    expect(container.querySelector("[data-room]")).not.toBeNull()
  })

  it("skips the intro only when both permissions are already granted", async () => {
    query.mockResolvedValue({ state: "granted" })
    await render()
    expect(query).toHaveBeenCalledWith({ name: "camera" })
    expect(query).toHaveBeenCalledWith({ name: "microphone" })
    expect(container.querySelector(".permission-intro")).toBeNull()
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false })
  })

  it.each(["camera", "microphone"])("allows joining when %s permission updates first after access succeeds", async (first) => {
    localStorage.setItem("roobro:remembered-name", "Ali")
    const cameraPermission = Object.assign(new EventTarget(), { state: "prompt" })
    const microphonePermission = Object.assign(new EventTarget(), { state: "prompt" })
    query.mockImplementation(async ({ name }: { name: string }) => name === "camera" ? cameraPermission : microphonePermission)
    await render()
    await allow()

    const orderedPermissions = first === "camera"
      ? [cameraPermission, microphonePermission]
      : [microphonePermission, cameraPermission]
    for (const permission of orderedPermissions) {
      await act(async () => {
        permission.state = "granted"
        permission.dispatchEvent(new Event("change"))
      })
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expect(container.querySelector("#display-name")).not.toBeNull()
    }

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector("#display-name")).not.toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>(".join-now")!.click())
    expect(joinMeeting).toHaveBeenCalledWith("ABC123", "Ali", undefined)
    expect(container.querySelector("[data-room]")).not.toBeNull()
  })

  it("shows the intro when only camera access has been granted", async () => {
    query.mockImplementation(async ({ name }: { name: string }) => ({ state: name === "camera" ? "granted" : "prompt" }))
    await render()
    expect(container.querySelector(".permission-intro")).not.toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it("keeps joining unavailable after denial and supports retry", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
    await render()
    await allow()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("lobby.permissionBlocked")
    expect(container.querySelector("#display-name")).toBeNull()
    expect(joinMeeting).not.toHaveBeenCalled()
    await allow()
    expect(container.querySelector("#display-name")).not.toBeNull()
  })

  it("falls back to the intro if permission queries are unsupported", async () => {
    query.mockRejectedValue(new TypeError("Unsupported permission"))
    await render()
    expect(getUserMedia).not.toHaveBeenCalled()
    await allow()
    expect(container.querySelector("#display-name")).not.toBeNull()
  })

  it("explains missing devices and unsupported media access", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("No device", "NotFoundError"))
    await render()
    await allow()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("lobby.devicesUnavailable")
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined })
    await allow()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("lobby.mediaUnsupported")
    expect(container.querySelector("#display-name")).toBeNull()
  })

  it("stops a permission stream that resolves after leaving the page", async () => {
    let resolve!: (stream: { getTracks: () => { stop: typeof stop }[] }) => void
    getUserMedia.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await render()
    await allow()
    expect(container.querySelector<HTMLButtonElement>(".join-now")!.disabled).toBe(true)
    await act(async () => root.render(null))
    await act(async () => resolve({ getTracks: () => [{ stop }] }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(joinMeeting).not.toHaveBeenCalled()
  })

  it.each(["denied", "prompt"])("blocks joining when microphone permission becomes %s and recovers when restored", async (state) => {
    const cameraPermission = new EventTarget()
    const microphonePermission = new EventTarget()
    Object.assign(cameraPermission, { state: "granted" })
    Object.assign(microphonePermission, { state: "granted" })
    query.mockImplementation(async ({ name }: { name: string }) => name === "camera" ? cameraPermission : microphonePermission)
    await render()
    expect(container.querySelector("video")).not.toBeNull()
    await act(async () => {
      Object.assign(microphonePermission, { state })
      microphonePermission.dispatchEvent(new Event("change"))
    })
    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("#display-name")).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("lobby.permissionBlocked")
    expect(stop).toHaveBeenCalledTimes(1)
    expect(joinMeeting).not.toHaveBeenCalled()

    await act(async () => {
      Object.assign(microphonePermission, { state: "granted" })
      microphonePermission.dispatchEvent(new Event("change"))
    })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector("#display-name")).not.toBeNull()
    expect(container.querySelector("video")).not.toBeNull()
  })

  it("waits for the device request even if permission events arrive first", async () => {
    const cameraPermission = Object.assign(new EventTarget(), { state: "prompt" })
    const microphonePermission = Object.assign(new EventTarget(), { state: "prompt" })
    query.mockImplementation(async ({ name }: { name: string }) => name === "camera" ? cameraPermission : microphonePermission)
    let resolve!: (stream: { getTracks: () => { stop: typeof stop }[] }) => void
    getUserMedia.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await render()
    await allow()

    for (const permission of [cameraPermission, microphonePermission]) {
      await act(async () => {
        permission.state = "granted"
        permission.dispatchEvent(new Event("change"))
      })
    }
    expect(container.querySelector("#display-name")).toBeNull()
    expect(container.querySelector<HTMLButtonElement>(".join-now")!.disabled).toBe(true)
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    await act(async () => resolve({ getTracks: () => [{ stop }] }))
    expect(container.querySelector("#display-name")).not.toBeNull()
  })

  it("stops a late preview stream after the camera is turned off", async () => {
    query.mockResolvedValue({ state: "granted" })
    let resolve!: (stream: { getTracks: () => { stop: typeof stop }[] }) => void
    getUserMedia.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOn"]')!.click())
    await act(async () => resolve({ getTracks: () => [{ stop }] }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(container.querySelector("video")).toBeNull()
  })

  it("clears a previous preview device error after retry", async () => {
    query.mockResolvedValue({ state: "granted" })
    getUserMedia.mockRejectedValueOnce(new DOMException("No camera", "NotReadableError"))
    await render()
    expect(container.querySelector(".permission-note")?.textContent).toBe("lobby.permission")
    await act(async () => container.querySelector<HTMLButtonElement>('.preview-toggles button[title="lobby.cameraOff"]')!.click())
    expect(container.querySelector(".permission-note")).toBeNull()
    expect(container.querySelector("video")).not.toBeNull()
  })

  it("returns to the intro when preview access is blocked", async () => {
    query.mockResolvedValue({ state: "granted" })
    getUserMedia.mockRejectedValueOnce(new DOMException("Blocked", "SecurityError"))
    await render()
    expect(container.querySelector("#display-name")).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("lobby.permissionBlocked")
  })

})

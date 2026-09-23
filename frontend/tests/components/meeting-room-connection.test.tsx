// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MeetingRoom } from "@/components/meeting-room"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl", language: "fa" } }) }))

describe("meeting connection controls", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<MeetingRoom
      result={{ meeting: { id: "1", code: "ABC123", title: "Test", status: "active", created_at: new Date().toISOString() }, role: "participant", identity: "self", token: "", server_url: "", demo: true }}
      displayName="Ali" code="ABC123" cameraOn={false} micOn={false}
      onLeave={() => undefined} onEnd={() => undefined} onFinished={() => undefined}
    />))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  it("opens diagnostics from the header and closes them with a labelled button", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".connection-state")!
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    await act(async () => trigger.click())
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector(".connection-panel")?.textContent).toContain("connection.demoBody")
    expect(container.querySelector(".connection-metrics")).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="connection.close"]')?.click())
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
  it("opens the same diagnostics from the mobile overflow menu", async () => {
    await act(async () => container.querySelector<HTMLButtonElement>(".mobile-more")?.click())
    const action = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes("room.connection"))
    expect(action).toBeDefined()
    await act(async () => action?.click())
    expect(container.querySelector(".connection-panel")).not.toBeNull()
    expect(container.querySelector(".mobile-more")?.getAttribute("aria-expanded")).toBe("false")
  })
})

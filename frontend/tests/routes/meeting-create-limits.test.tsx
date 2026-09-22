// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), createMeeting: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/api", async (importOriginal) => ({ ...await importOriginal<object>(), createMeeting: mocks.createMeeting }))
import { APIError } from "@/lib/api"
import { Route } from "@/routes/new"
const Page = Route.options.component as React.ComponentType
let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  vi.clearAllMocks()
  sessionStorage.clear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Page />))
  act(() => {
    const input = container.querySelector("input")!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Meeting")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
})
afterEach(() => { act(() => root.unmount()); container.remove() })
const submit = async () => { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }

it.each([413, 429, 503])("shows rejection instead of inventing a demo meeting on HTTP %i", async (status) => {
  mocks.createMeeting.mockRejectedValue(new APIError("Limited", status))
  await submit()
  expect(container.textContent).toContain("create.serviceBusy")
  expect(mocks.navigate).not.toHaveBeenCalled()
  expect(sessionStorage.length).toBe(0)
})

it("still stores host authority and opens successfully created meetings", async () => {
  mocks.createMeeting.mockResolvedValue({ meeting: { code: "room" }, host_token: "host" })
  await submit()
  expect(sessionStorage.getItem("roobro:host:room")).toBe("host")
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/meet/$code", params: { code: "room" } })
})

it("preserves the existing offline demo flow for unavailable APIs", async () => {
  mocks.createMeeting.mockRejectedValue(new TypeError("Network unavailable"))
  await submit()
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/meet/$code", params: { code: expect.stringMatching(/^demo-/) } })
})

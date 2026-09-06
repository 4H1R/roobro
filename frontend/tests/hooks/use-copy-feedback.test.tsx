// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCopyFeedback } from "@/hooks/use-copy-feedback"

function CopyHarness() {
  const { copied, copy } = useCopyFeedback()
  return <button onClick={() => void copy("https://example.com/meet/123")}>{copied ? "کپی شد" : "کپی کد"}</button>
}

describe("useCopyFeedback", () => {
  let container: HTMLDivElement
  let root: Root
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("restores the original label after three seconds", async () => {
    await act(async () => root.render(<CopyHarness />))

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith("https://example.com/meet/123")
    expect(container.querySelector("button")?.textContent).toBe("کپی شد")

    act(() => vi.advanceTimersByTime(2999))
    expect(container.querySelector("button")?.textContent).toBe("کپی شد")

    act(() => vi.advanceTimersByTime(1))
    expect(container.querySelector("button")?.textContent).toBe("کپی کد")
  })
})

import { describe, expect, it } from "vitest"

import { formatMessageTime } from "@/lib/format-message-time"

describe("formatMessageTime", () => {
  it("formats message times with Persian numerals", () => {
    const sentAt = new Date(2026, 0, 2, 9, 5).getTime()

    expect(formatMessageTime(sentAt, "fa")).toBe("۰۹:۰۵")
  })
})

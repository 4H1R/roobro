import { describe, expect, it } from "vitest"

import { formatElapsedTime } from "@/lib/format-elapsed-time"

describe("formatElapsedTime", () => {
  it("formats elapsed time as a stable Persian clock", () => {
    expect(formatElapsedTime(3_723_000, "fa")).toBe("۰۱:۰۲:۰۳")
  })

  it("does not show negative elapsed time for clock skew", () => {
    expect(formatElapsedTime(-1_000, "fa")).toBe("۰۰:۰۰:۰۰")
  })
})

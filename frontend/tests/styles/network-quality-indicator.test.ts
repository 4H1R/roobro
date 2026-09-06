import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8")

describe("participant network quality indicator", () => {
  it("uses a compact persistent badge over participant video", () => {
    expect(styles).toMatch(/\.meeting-room \.lk-participant-tile \.lk-connection-quality\s*\{[^}]*width:\s*30px[^}]*height:\s*26px[^}]*border-radius:\s*999px[^}]*opacity:\s*1/)
  })

  it.each(["excellent", "good", "poor", "unknown"])("defines a distinct %s state", (quality) => {
    expect(styles).toContain(`.lk-connection-quality[data-lk-quality="${quality}"]`)
  })

  it("shares the participant name surface instead of overriding it", () => {
    const badge = styles.match(/\.meeting-room \.lk-participant-tile \.lk-connection-quality\s*\{([^}]*)\}/)?.[1]

    expect(badge).not.toContain("background:")
    expect(badge).not.toContain("border-color:")
    expect(styles).not.toMatch(/html\[data-theme="light"\] \.meeting-room \.lk-connection-quality\s*\{/)
  })
})

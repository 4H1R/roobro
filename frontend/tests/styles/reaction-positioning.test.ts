import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8")

describe("meeting reaction positioning", () => {
  it("positions every reaction independently so sibling removal cannot recenter it", () => {
    expect(styles).toMatch(/\.reaction-bubble\s*\{[^}]*position:\s*absolute/)
    expect(styles).toMatch(/\.reaction-bubble\s*\{[^}]*left:\s*var\(--reaction-lane\)/)
  })
})

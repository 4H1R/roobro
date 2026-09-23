import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

describe("chat message wrapping", () => {
  it("keeps long unbroken messages inside their bubble", () => {
    expect(styles).toMatch(/\.message p\s*\{[^}]*max-width:\s*100%/)
    expect(styles).toMatch(/\.message p\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})

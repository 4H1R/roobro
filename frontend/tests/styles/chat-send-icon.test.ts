import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")

describe("RTL chat send icon", () => {
  it("mirrors the send icon horizontally without turning it upside down", () => {
    const rtlRule = stylesheet.match(/\[dir="rtl"\] \.chat-form svg\s*\{([^}]*)\}/)?.[1]

    expect(rtlRule).toContain("scaleX(-1)")
    expect(rtlRule).not.toContain("rotate(180deg)")
  })
})

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")

describe("light meeting theme", () => {
  it("uses light LiveKit foreground and border tokens", () => {
    expect(stylesheet).toMatch(
      /html\[data-theme="light"\] \.meeting-room\[data-lk-theme\][^{]*\{[^}]*color-scheme:\s*light[^}]*--lk-fg:\s*#12201c[^}]*--lk-border-color:\s*rgba\(18,32,28,\.11\)/s,
    )
  })

  it("gives participant metadata a high-contrast light surface", () => {
    expect(stylesheet).toMatch(
      /html\[data-theme="light"\] \.meeting-room \.lk-participant-metadata-item\s*\{[^}]*background:\s*rgba\(246,249,247,\.88\)[^}]*color:\s*#12201c/s,
    )
  })

  it("recolors LiveKit's white placeholder artwork in light mode", () => {
    expect(stylesheet).toMatch(
      /html\[data-theme="light"\] \.meeting-room \.lk-participant-placeholder path\s*\{[^}]*fill:\s*#6f8f83/s,
    )
  })
})

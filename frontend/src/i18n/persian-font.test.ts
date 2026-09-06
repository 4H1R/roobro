import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Persian typography", () => {
  it("ships every local IRANSansX font referenced by the global stylesheet", () => {
    const projectRoot = resolve(import.meta.dirname, "../..")
    const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")
    const fontFiles = [...stylesheet.matchAll(/url\("(\/fonts\/iransansx\/[^\"]+\.woff2)"\)/g)].map(
      ([, path]) => path
    )

    expect(stylesheet).toContain('@font-face')
    expect(stylesheet).toContain('font-family: "IRANSansX"')
    expect(fontFiles.length).toBeGreaterThanOrEqual(4)

    for (const fontFile of fontFiles) {
      expect(existsSync(resolve(projectRoot, `public${fontFile}`)), `${fontFile} should be bundled`).toBe(true)
    }
  })
})

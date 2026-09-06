import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")

describe("Persian typography", () => {
  it("ships open-source Vazirmatn locally and uses it app-wide", () => {
    const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")
    const rootRoute = readFileSync(resolve(projectRoot, "src/routes/__root.tsx"), "utf8")
    const fontPath = "/fonts/vazirmatn/Vazirmatn.woff2"

    expect(rootRoute).not.toMatch(/cdn\.jsdelivr\.net.*Vazirmatn/i)
    expect(stylesheet).toContain('@font-face')
    expect(stylesheet).toContain(`url("${fontPath}")`)
    expect(existsSync(resolve(projectRoot, `public${fontPath}`))).toBe(true)
    expect(existsSync(resolve(projectRoot, "public/fonts/vazirmatn/OFL.txt"))).toBe(true)
    expect(stylesheet).toContain('--app-font: "Vazirmatn", Tahoma, Arial, sans-serif')
    expect(stylesheet).not.toMatch(/--font-(?:latin|persian)|\bInter\b|Noto Sans/i)
  })

  it("keeps the Persian font inside the LiveKit meeting theme", () => {
    const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")

    expect(stylesheet).toMatch(/--app-font:\s*"Vazirmatn"/)
    expect(stylesheet).toMatch(/\.meeting-room[^}]*--lk-font-family:\s*var\(--app-font\)/s)
    expect(stylesheet).toMatch(/\.room-chrome[^}]*font-family:\s*var\(--app-font\)/s)
  })
})

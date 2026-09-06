import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const room = readFileSync(new URL("../src/components/meeting-room.tsx", import.meta.url), "utf8")
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

describe("mobile meeting controls", () => {
  it("keeps details reachable from an accessible overflow menu", () => {
    expect(room).toContain('className="mobile-more"')
    expect(room).toContain('aria-expanded={mobileMenuOpen}')
    expect(room).toContain('className="mobile-actions-menu"')
    expect(room).toContain('role="menu"')
  })

  it("shows overflow only when the desktop secondary actions are hidden", () => {
    expect(styles).toMatch(/\.mobile-more-wrap\s*\{[^}]*display:\s*none/)
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.desktop-secondary-controls\s*\{[^}]*display:\s*none/)
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.mobile-more\s*\{[^}]*display:\s*grid/)
  })

  it("puts chat directly in the mobile controls", () => {
    expect(room).toContain('mobile-panel-action ${panel === "chat" ? "active" : ""}')
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.mobile-panel-action\s*\{[^}]*display:\s*grid/)
  })

  it("keeps details and people in the overflow menu", () => {
    expect(room).not.toContain('onClick={() => setMobileMenuOpen(false)}><Hand')
    expect(room).toContain('onClick={() => openPanelFromMobileMenu("details")}')
    expect(room).toContain('onClick={() => openPanelFromMobileMenu("people")}')
    expect(room).not.toContain('onClick={() => openPanelFromMobileMenu("chat")}')
  })
})

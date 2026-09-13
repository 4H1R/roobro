import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const meetingRoom = readFileSync(resolve(projectRoot, "src/components/meeting-room.tsx"), "utf8")
const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")

describe("focused video layout", () => {
  it("lets every camera or screen-share tile enter and leave focused view", () => {
    expect(meetingRoom).toContain('className="focus-tile-button"')
    expect(meetingRoom).toContain('t("room.focusTile"')
    expect(meetingRoom).toContain('t("room.restoreGrid")')
    expect(meetingRoom).toContain("onDoubleClick")
  })

  it("places the participant rail to the left of the focused tile on desktop", () => {
    expect(stylesheet).toMatch(/\.live-video-grid--focused\s*\{[^}]*grid-template-columns:\s*minmax\(148px, 220px\) minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.participant-rail\s*\{[^}]*grid-column:\s*1/)
    expect(stylesheet).toMatch(/\.focused-participant\s*\{[^}]*grid-column:\s*2/)
  })

  it("moves the rail below the focused tile on narrow screens", () => {
    expect(stylesheet).toMatch(/@media \(max-width: 820px\)[\s\S]*\.participant-rail\s*\{[^}]*grid-row:\s*2/)
  })
})

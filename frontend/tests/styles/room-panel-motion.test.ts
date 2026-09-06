import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const meetingRoom = readFileSync(resolve(projectRoot, "src/components/meeting-room.tsx"), "utf8")
const stylesheet = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")

describe("room panel motion", () => {
  it("uses one Motion timeline for the stage and panel", () => {
    expect(meetingRoom).toMatch(/<motion\.section className="room-stage" layout transition=\{panelTransition\}/)
    expect(meetingRoom).toMatch(/<motion\.aside className="room-panel"[^>]*transition=\{panelTransition\}/)
  })

  it("removes the exiting panel from layout while both elements animate", () => {
    expect(meetingRoom).toContain('<AnimatePresence initial={false} mode="popLayout">')
  })

  it("does not run a competing CSS grid-column transition", () => {
    const roomLayoutRule = stylesheet.match(/\.room-layout\s*\{([^}]*)\}/)?.[1]

    expect(roomLayoutRule).toMatch(/position:\s*relative/)
    expect(roomLayoutRule).not.toMatch(/transition:\s*grid-template-columns/)
  })
})

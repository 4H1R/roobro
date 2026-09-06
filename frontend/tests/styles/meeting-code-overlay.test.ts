import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const meetingRoom = readFileSync(resolve(import.meta.dirname, "../../src/components/meeting-room.tsx"), "utf8")
const stylesheet = readFileSync(resolve(import.meta.dirname, "../../src/styles.css"), "utf8")

describe("meeting room stage", () => {
  it("does not show the meeting code over participant video or avatars", () => {
    expect(meetingRoom).not.toContain('className="meeting-code"')
    expect(stylesheet).not.toMatch(/\.meeting-code\s*[,{]/)
  })
})

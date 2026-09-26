import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const appStyles = readFileSync(resolve(projectRoot, "src/styles.css"), "utf8")
const liveKitStyles = readFileSync(resolve(projectRoot, "node_modules/@livekit/components-styles/dist/general/components/participant/index.css"), "utf8")

describe("participant tiles on a narrow meeting screen", () => {
  it("keeps peers equally sized, framed, and shows speaking without changing the frame", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 414, height: 896 } })
      await page.setContent(`
        <style>${liveKitStyles}</style><style>${appStyles}</style>
        <main class="meeting-room" data-lk-theme="default">
          <div class="room-chrome">
            <header class="room-header"></header>
            <div class="room-layout"><section class="room-stage">
              <div class="live-video-grid">
                ${[0, 1].map((index) => `
                  <div class="live-participant"><div class="lk-participant-tile" data-lk-source="camera" data-lk-video-muted="true" data-lk-speaking="${index === 0}">
                    ${index === 0 ? '<video class="lk-participant-media-video" width="640" height="480"></video>' : ""}
                    <div class="lk-participant-placeholder"><svg viewBox="0 0 100 100"><circle cx="50" cy="34" r="24"/><path d="M8 100a42 42 0 0 1 84 0"/></svg></div>
                    <div class="lk-participant-metadata"><div class="lk-participant-metadata-item"><span class="lk-participant-name">Person ${index}</span></div></div>
                  </div></div>
                `).join("")}
              </div>
            </section></div>
            <footer class="room-controls" style="height:74px"></footer>
          </div>
        </main>
      `)

      const tiles = page.locator(".lk-participant-tile")
      const first = await tiles.nth(0).boundingBox()
      const second = await tiles.nth(1).boundingBox()
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      expect(Math.abs(first!.height - second!.height)).toBeLessThan(1)
      const avatarWidths = await page.locator(".lk-participant-placeholder svg").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
      expect(Math.abs(avatarWidths[0] - avatarWidths[1])).toBeLessThan(1)

      const frames = await tiles.evaluateAll((elements) => elements.map((element) => {
        const tile = getComputedStyle(element)
        const overlay = getComputedStyle(element, "::after")
        return {
          width: tile.borderTopWidth,
          color: tile.borderTopColor,
          overlayWidth: overlay.borderTopWidth,
        }
      }))
      expect(frames[0].width).toBe("1px")
      expect(frames[0].color).toBe(frames[1].color)
      expect(frames.map((frame) => frame.overlayWidth)).toEqual(["0px", "0px"])
      const speakingEffects = await tiles.evaluateAll((elements) => elements.map((element) => {
        const label = element.querySelector(".lk-participant-name")!
        const bars = getComputedStyle(label, "::before")
        return { content: bars.content, animationName: bars.animationName }
      }))
      expect(speakingEffects[0]).toEqual({ content: '\"\"', animationName: "participant-speaking-bars" })
      expect(speakingEffects[1].animationName).toBe("none")
    } finally {
      await browser.close()
    }
  })
})

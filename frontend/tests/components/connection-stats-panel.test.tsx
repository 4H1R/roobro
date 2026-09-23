import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import "@/i18n"
import { ConnectionStatsPanel, connectionLabel } from "@/components/connection-stats-panel"

describe("your connection panel", () => {
  it("explains demo mode without fabricated metric cards", () => {
    const html = renderToStaticMarkup(<ConnectionStatsPanel demo diagnostics={{ connection: "disconnected", quality: "unknown", status: "loading", stats: undefined }} />)
    expect(html).toContain("آمار واقعی اتصال در حالت پیش‌نمایش در دسترس نیست")
    expect(html).not.toContain("connection-metrics")
  })

  it("keeps missing measurements distinct from measured zero and exposes stream details", () => {
    const html = renderToStaticMarkup(<ConnectionStatsPanel demo={false} diagnostics={{ connection: "connected", quality: "good", status: "ready", stats: {
      protocols: ["udp"], relayed: true, ping: 25, loss: 0, streams: [{ id: "video", direction: "upload", kind: "video", source: "camera", codec: "video/VP8", resolution: "1280 × 720", fps: 30 }],
    } }} />)
    expect(html).toContain("UDP · TURN")
    expect(html).toContain("۲۵ ms")
    expect(html).toContain("۰ %")
    expect(html).toContain("—")
    expect(html).toContain("<details")
    expect(html).toContain("video/VP8")
    expect(html).toContain("دوربین")
  })

  it("prioritizes actual connection state over the last quality estimate", () => {
    expect(connectionLabel("reconnecting", "excellent", false)).toBe("reconnecting")
    expect(connectionLabel("signalReconnecting", "excellent", false)).toBe("reconnecting")
    expect(connectionLabel("disconnected", "excellent", false)).toBe("disconnected")
    expect(connectionLabel("connected", "unknown", false)).toBe("connected")
    const html = renderToStaticMarkup(<ConnectionStatsPanel demo={false} diagnostics={{ connection: "reconnecting", quality: "excellent", status: "loading", stats: undefined }} />)
    expect(html).not.toContain("connection-metrics")
  })
})

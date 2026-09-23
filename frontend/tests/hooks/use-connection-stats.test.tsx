// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RoomEvent, type Room } from "livekit-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useConnectionStats } from "@/hooks/use-connection-stats"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("connection statistics lifecycle", () => {
  let root: Root
  let container: HTMLDivElement
  let current: ReturnType<typeof useConnectionStats>
  const listeners = new Map<string, () => void>()
  const getRTCStatsReport = vi.fn(async (): Promise<RTCStatsReport> => new Map([
    ["out", { id: "out", type: "outbound-rtp", timestamp: Date.now(), bytesSent: Date.now(), kind: "audio" }],
  ]))
  const room = {
    state: "connected",
    localParticipant: { isLocal: true, connectionQuality: "excellent", trackPublications: new Map([
      ["mic", { trackSid: "mic", source: "microphone", isMuted: false, track: { getRTCStatsReport } }],
    ]) },
    remoteParticipants: new Map(),
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    off: vi.fn((event: string) => listeners.delete(event)),
  }
  function Harness({ enabled = true, demo = false }: { enabled?: boolean; demo?: boolean }) {
    current = useConnectionStats(demo ? undefined : room as unknown as Room, enabled)
    return null
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    room.state = "connected"
    room.localParticipant.connectionQuality = "excellent"
    container = document.createElement("div")
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it("only samples while open, polls every two seconds and cleans up", async () => {
    await act(async () => root.render(<Harness enabled={false} />))
    expect(getRTCStatsReport).not.toHaveBeenCalled()
    await act(async () => root.render(<Harness />))
    expect(getRTCStatsReport).toHaveBeenCalledTimes(1)
    expect(current.status).toBe("ready")
    expect(current.stats?.upload).toBeUndefined()
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(getRTCStatsReport).toHaveBeenCalledTimes(2)
    expect(current.stats?.upload).toBe(8000)
    await act(async () => root.render(<Harness enabled={false} />))
    await act(async () => vi.advanceTimersByTimeAsync(6000))
    expect(getRTCStatsReport).toHaveBeenCalledTimes(2)
    expect(current.stats).toBeUndefined()
  })

  it("clears stale measurements on reconnect and restarts with a new baseline", async () => {
    await act(async () => root.render(<Harness />))
    await act(async () => {
      room.state = "reconnecting"
      listeners.get(RoomEvent.ConnectionStateChanged)?.()
    })
    expect(current.connection).toBe("reconnecting")
    expect(current.stats).toBeUndefined()
    await act(async () => vi.advanceTimersByTimeAsync(4000))
    expect(getRTCStatsReport).toHaveBeenCalledTimes(1)
    await act(async () => {
      room.state = "connected"
      listeners.get(RoomEvent.ConnectionStateChanged)?.()
    })
    expect(getRTCStatsReport).toHaveBeenCalledTimes(2)
    expect(current.stats?.upload).toBeUndefined()
  })

  it("recovers after a rejected browser report and updates the closed-panel badge", async () => {
    getRTCStatsReport.mockRejectedValueOnce(new Error("track ended"))
    await act(async () => root.render(<Harness />))
    expect(current.status).toBe("unavailable")
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(current.status).toBe("ready")
    await act(async () => root.render(<Harness enabled={false} />))
    await act(async () => {
      room.localParticipant.connectionQuality = "poor"
      listeners.get(RoomEvent.ConnectionQualityChanged)?.()
    })
    expect(current.quality).toBe("poor")
  })

  it("ignores an in-flight result after closing and never polls demo rooms", async () => {
    let resolve: (report: RTCStatsReport) => void = () => undefined
    getRTCStatsReport.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await act(async () => root.render(<Harness />))
    await act(async () => root.render(<Harness enabled={false} />))
    await act(async () => resolve(new Map()))
    expect(current.stats).toBeUndefined()
    await act(async () => root.render(<Harness demo />))
    await act(async () => vi.advanceTimersByTimeAsync(6000))
    expect(getRTCStatsReport).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})

import { describe, expect, it } from "vitest"

import { summarizeConnectionStats, type TrackReport } from "@/lib/connection-stats"

function report(entries: Record<string, unknown>[], direction: TrackReport["direction"] = "download", key = "track"): TrackReport {
  return { key, direction, source: "camera", report: new Map(entries.map((entry) => [entry.id, entry])) as RTCStatsReport }
}
const inbound = (timestamp: number, bytesReceived: number, packetsReceived: number, packetsLost: number) => ({
  id: "in", type: "inbound-rtp", kind: "video", timestamp, bytesReceived, packetsReceived, packetsLost,
  jitter: 0.012, frameWidth: 1280, frameHeight: 720, framesPerSecond: 30, codecId: "codec", transportId: "transport",
})

describe("connection statistics", () => {
  it("uses interval deltas and converts seconds to milliseconds and bytes to bits", () => {
    const first = summarizeConnectionStats([report([inbound(1000, 100000, 900, 100)])])
    expect(first.stats.download).toBeUndefined()
    expect(first.stats.loss).toBeUndefined()
    const next = summarizeConnectionStats([report([inbound(3000, 150000, 999, 101)])], first.baseline)
    expect(next.stats.download).toBe(200000)
    expect(next.stats.loss).toBe(1)
    expect(next.stats.jitter).toBe(12)
    expect(next.stats.streams[0].resolution).toBe("1280 × 720")
  })

  it("reads server feedback and only the selected transport, ignoring unused candidates", () => {
    const { stats } = summarizeConnectionStats([report([
      { id: "out", type: "outbound-rtp", timestamp: 1000, remoteId: "feedback", transportId: "transport", codecId: "codec" },
      { id: "feedback", type: "remote-inbound-rtp", fractionLost: 0.025, roundTripTime: 0.08, jitter: 0.02, packetsLost: 12 },
      { id: "transport", type: "transport", selectedCandidatePairId: "selected" },
      { id: "selected", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.1, localCandidateId: "local" },
      { id: "unused", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 99 },
      { id: "local", type: "local-candidate", protocol: "udp", candidateType: "relay", address: "private-address" },
      { id: "codec", type: "codec", mimeType: "video/VP8" },
    ], "upload")])
    expect(stats).toMatchObject({ ping: 100, jitter: 20, loss: 2.5, protocols: ["udp"], relayed: true })
    expect(stats.streams[0]).toMatchObject({ packetsLost: 12, codec: "video/VP8" })
    expect(JSON.stringify(stats)).not.toContain("private-address")
  })

  it("deduplicates overlapping reports without mixing publisher and subscriber IDs", () => {
    const entries = [inbound(1000, 100, 10, 0)]
    const result = summarizeConnectionStats([report(entries), report(entries, "download", "second"), report([
      { id: "in", type: "outbound-rtp", timestamp: 1000 },
    ], "upload")])
    expect(result.stats.streams).toHaveLength(2)
  })

  it("does not fabricate zeroes for unavailable, reset, negative or non-finite counters", () => {
    expect(summarizeConnectionStats([]).stats).toEqual({ streams: [], protocols: [], relayed: false, ping: undefined, jitter: undefined, loss: undefined })
    const first = summarizeConnectionStats([report([inbound(1000, 5000, 100, 4)])])
    const reset = summarizeConnectionStats([report([{ ...inbound(3000, 100, 1, -1), jitter: NaN }])], first.baseline)
    expect(reset.stats.download).toBeUndefined()
    expect(reset.stats.loss).toBeUndefined()
    expect(reset.stats.jitter).toBeUndefined()
    expect(reset.stats.streams[0].packetsLost).toBeUndefined()
    expect(summarizeConnectionStats([], first.baseline).baseline.size).toBe(0)
  })

  it("preserves measured zero throughput and zero loss, but not idle loss", () => {
    const first = summarizeConnectionStats([report([inbound(1000, 100, 10, 0)])])
    const idle = summarizeConnectionStats([report([inbound(3000, 100, 10, 0)])], first.baseline)
    expect(idle.stats.download).toBe(0)
    expect(idle.stats.loss).toBeUndefined()
    const active = summarizeConnectionStats([report([inbound(3000, 200, 20, 0)])], first.baseline)
    expect(active.stats.loss).toBe(0)
  })

  it("aggregates simulcast rates and calculates interval jitter-buffer delay", () => {
    const entries = (time: number, bytes: number, delay: number, count: number) => [
      { ...inbound(time, bytes, count, 0), jitterBufferDelay: delay, jitterBufferEmittedCount: count },
      { ...inbound(time, bytes, count, 0), id: "layer2" },
    ]
    const first = summarizeConnectionStats([report(entries(1000, 1000, 1, 10))])
    const next = summarizeConnectionStats([report(entries(3000, 2000, 1.4, 20))], first.baseline)
    expect(next.stats.download).toBe(8000)
    expect(next.stats.streams[0].bufferDelay).toBeCloseTo(40)
  })
})

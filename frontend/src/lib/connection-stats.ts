/** Only retain the fields we display; reports can also contain network addresses. */
export interface MediaStats {
  id: string
  direction: "upload" | "download"
  source: string
  kind: string
  bitrate?: number
  jitter?: number
  loss?: number
  packets?: number
  packetsLost?: number
  codec?: string
  resolution?: string
  fps?: number
  framesDropped?: number
  freezes?: number
  limitation?: string
  bufferDelay?: number
}

export interface ConnectionStats {
  streams: MediaStats[]
  ping?: number
  jitter?: number
  loss?: number
  upload?: number
  download?: number
  protocols: string[]
  relayed: boolean
}

export interface TrackReport {
  key: string
  direction: MediaStats["direction"]
  source: string
  report: RTCStatsReport
}

type Stat = Record<string, unknown>
export type StatsBaseline = Map<string, Stat>
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined
const positive = (value: unknown) => {
  const n = number(value)
  return n !== undefined && n >= 0 ? n : undefined
}
const maximum = (values: (number | undefined)[]) => {
  const valid = values.filter((value): value is number => value !== undefined)
  return valid.length ? Math.max(...valid) : undefined
}
const delta = (current: Stat, previous: Stat | undefined, field: string) => {
  const a = positive(current[field]), b = positive(previous?.[field])
  return a !== undefined && b !== undefined && a >= b ? a - b : undefined
}

/** Interval rates, never lifetime averages. A fresh baseline is built each sample. */
export function summarizeConnectionStats(reports: TrackReport[], previous: StatsBaseline = new Map()) {
  const baseline: StatsBaseline = new Map()
  const stats: ConnectionStats = { streams: [], protocols: [], relayed: false }
  const rtts: number[] = []
  const seen = new Set<string>()
  for (const { key, direction, source, report } of reports) {
    const entries: Stat[] = []
    report.forEach((value) => entries.push(value as Stat))
    const find = (id: unknown) => entries.find((entry) => entry.id === id)
    for (const entry of entries) {
      if (entry.type !== (direction === "upload" ? "outbound-rtp" : "inbound-rtp") || entry.isRemote) continue
      // Reports may overlap on a peer connection (e.g. simulcast).
      const unique = `${direction}:${entry.id}`
      if (seen.has(unique)) continue
      seen.add(unique)
      const id = `${key}:${entry.id}`
      const old = previous.get(id)
      baseline.set(id, entry)
      const elapsed = (number(entry.timestamp) ?? 0) - (number(old?.timestamp) ?? 0)
      const bytes = delta(entry, old, direction === "upload" ? "bytesSent" : "bytesReceived")
      const remote = direction === "upload" ? find(entry.remoteId) : undefined
      const reception = remote ?? (direction === "download" ? entry : undefined)
      const jitter = positive(reception?.jitter)
      const rtt = positive(remote?.roundTripTime)
      if (rtt !== undefined) rtts.push(rtt * 1000)
      const packets = delta(entry, old, "packetsReceived")
      const lost = delta(entry, old, "packetsLost")
      const receivedLoss = elapsed > 0 && packets !== undefined && lost !== undefined && packets + lost > 0 ? lost / (packets + lost) * 100 : undefined
      const fraction = positive(remote?.fractionLost)
      const codec = find(entry.codecId)
      const bufferTime = delta(entry, old, "jitterBufferDelay")
      const bufferCount = delta(entry, old, "jitterBufferEmittedCount")
      stats.streams.push({
        id, direction, source, kind: String(entry.kind ?? entry.mediaType ?? ""),
        bitrate: old && elapsed > 0 && bytes !== undefined ? bytes * 8000 / elapsed : undefined,
        jitter: jitter === undefined ? undefined : jitter * 1000,
        loss: direction === "upload" ? (fraction !== undefined && fraction <= 1 ? fraction * 100 : undefined) : receivedLoss,
        packets: positive(entry[direction === "upload" ? "packetsSent" : "packetsReceived"]),
        packetsLost: positive(reception?.packetsLost),
        codec: typeof codec?.mimeType === "string" ? codec.mimeType : undefined,
        resolution: positive(entry.frameWidth) && positive(entry.frameHeight) ? `${entry.frameWidth} × ${entry.frameHeight}` : undefined,
        fps: positive(entry.framesPerSecond), framesDropped: positive(entry.framesDropped), freezes: positive(entry.freezeCount),
        limitation: typeof entry.qualityLimitationReason === "string" ? entry.qualityLimitationReason : undefined,
        bufferDelay: bufferTime !== undefined && bufferCount ? bufferTime / bufferCount * 1000 : undefined,
      })
      const transport = find(entry.transportId)
      const pair = find(transport?.selectedCandidatePairId)
      if (pair?.type === "candidate-pair" && pair.state === "succeeded") {
        const ping = positive(pair.currentRoundTripTime)
        if (ping !== undefined) rtts.push(ping * 1000)
        const local = find(pair.localCandidateId), remoteCandidate = find(pair.remoteCandidateId)
        if (typeof local?.protocol === "string" && !stats.protocols.includes(local.protocol)) stats.protocols.push(local.protocol)
        if (local?.candidateType === "relay" || remoteCandidate?.candidateType === "relay") stats.relayed = true
      }
    }
  }
  stats.ping = maximum(rtts)
  stats.jitter = maximum(stats.streams.map((stream) => stream.jitter))
  stats.loss = maximum(stats.streams.map((stream) => stream.loss))
  for (const direction of ["upload", "download"] as const) {
    const rates = stats.streams.filter((stream) => stream.direction === direction).map((stream) => stream.bitrate)
    // Do not present an incomplete aggregate as the total.
    if (rates.length && rates.every((rate) => rate !== undefined)) stats[direction] = rates.reduce<number>((sum, rate) => sum + (rate ?? 0), 0)
  }
  return { stats, baseline }
}

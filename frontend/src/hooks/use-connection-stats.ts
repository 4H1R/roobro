import { RoomEvent, type Room } from "livekit-client"
import { useEffect, useState } from "react"

import { summarizeConnectionStats, type ConnectionStats, type StatsBaseline, type TrackReport } from "@/lib/connection-stats"

export function useConnectionStats(room: Room | undefined, enabled: boolean) {
  const [connection, setConnection] = useState(room?.state ?? "disconnected")
  const [quality, setQuality] = useState<string>(room?.localParticipant?.connectionQuality ?? "unknown")
  const [stats, setStats] = useState<ConnectionStats>()
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "partial">("loading")

  useEffect(() => {
    if (!room) return
    const update = () => {
      setConnection(room.state ?? "disconnected")
      setQuality(room.localParticipant?.connectionQuality ?? "unknown")
    }
    update()
    room.on(RoomEvent.ConnectionStateChanged, update)
    room.on(RoomEvent.ConnectionQualityChanged, update)
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, update)
      room.off(RoomEvent.ConnectionQualityChanged, update)
    }
  }, [room])

  useEffect(() => {
    setStats(undefined)
    setStatus("loading")
    if (!room || !enabled || connection !== "connected") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let baseline: StatsBaseline = new Map()
    const poll = async () => {
      const tracks = [room.localParticipant, ...room.remoteParticipants.values()].flatMap((participant) =>
        [...participant.trackPublications.values()].flatMap((publication) => publication.track && !publication.isMuted ? [{
          track: publication.track,
          key: publication.trackSid,
          source: publication.source,
          direction: participant.isLocal ? "upload" as const : "download" as const,
        }] : []))
      const results = await Promise.allSettled(tracks.map(async ({ track, ...metadata }): Promise<TrackReport | undefined> => {
        const report = await track.getRTCStatsReport()
        return report ? { ...metadata, report } : undefined
      }))
      if (cancelled) return
      const reports = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
      const next = summarizeConnectionStats(reports, baseline)
      results.forEach((result, index) => {
        if (result.status === "rejected" || !result.value) next.stats[tracks[index].direction] = undefined
      })
      baseline = next.baseline
      setStats(next.stats)
      setStatus(!next.stats.streams.length ? "unavailable" : reports.length < tracks.length ? "partial" : "ready")
      timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [room, enabled, connection])

  return { connection, quality, stats, status }
}

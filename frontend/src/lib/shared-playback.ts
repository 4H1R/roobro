import { z } from "zod"

export const PLAYBACK_TOPIC = "roobro-playback-v1"
const finiteTime = z.number().finite().nonnegative()
const mediaSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  duration: z.number().finite().positive().max(604800),
})
const sessionSchema = z.object({
  id: z.string().min(1).max(100), media: mediaSchema,
  playing: z.boolean(), position: finiteTime, anchor: finiteTime,
}).refine((session) => session.position <= session.media.duration)
const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), session: sessionSchema.nullable() })
const presenceSchema = z.object({
  revision: z.number().int().nonnegative(),
  sessionId: z.string().max(100).nullable(),
  media: mediaSchema.omit({ name: true }).nullable(),
  status: z.enum(["empty", "loading", "selected", "ready", "blocked", "buffering", "error"]),
})
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), media: mediaSchema }),
  z.object({ action: z.enum(["play", "pause", "stop"]), sessionId: z.string().max(100), fingerprint: z.string().max(64) }),
  z.object({ action: z.literal("seek"), sessionId: z.string().max(100), fingerprint: z.string().max(64), position: finiteTime }),
])
const packetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presence"), presence: presenceSchema }),
  z.object({ type: z.literal("request"), id: z.string().max(100), command: commandSchema }),
  z.object({ type: z.literal("ping"), id: z.string().max(100) }),
  z.object({ type: z.literal("pong"), id: z.string().max(100), now: finiteTime, snapshot: snapshotSchema }),
  z.object({ type: z.literal("state"), snapshot: snapshotSchema }),
])

export type PlaybackMedia = z.infer<typeof mediaSchema>
export type PlaybackSession = z.infer<typeof sessionSchema>
type Snapshot = z.infer<typeof snapshotSchema>
type Command = z.infer<typeof commandSchema>
type Packet = z.infer<typeof packetSchema>
export type PlaybackPresence = Omit<z.infer<typeof presenceSchema>, "revision">
export type PlaybackReadiness = PlaybackPresence["status"] | "matching" | "mismatch" | "away" | "unknown"
export type PlaybackAttendee = { identity: string; name: string; isLocal: boolean; status: PlaybackReadiness }
export type PlaybackView = { session: PlaybackSession | null; ready: boolean; failed: boolean; attendees: PlaybackAttendee[] }
export type PlaybackMember = { identity: string; joinedAt: number; name?: string }

export function playbackPosition(session: PlaybackSession, now: number) {
  return Math.min(session.media.duration, session.position + (session.playing ? Math.max(0, now - session.anchor) / 1000 : 0))
}

type MediaIdentity = Omit<PlaybackMedia, "name"> & { name?: string }
export function matchesMedia(left: MediaIdentity, right: MediaIdentity) {
  return left.fingerprint === right.fingerprint && left.size === right.size && Math.abs(left.duration - right.duration) < 0.25
}

// Sample bounded portions rather than reading an entire multi-gigabyte film into memory.
// This is a mismatch check, not a proof that every byte in the files is identical.
export async function fingerprintMedia(file: File) {
  const chunk = 64 * 1024
  const offsets = [0, Math.max(0, Math.floor((file.size - chunk) / 2)), Math.max(0, file.size - chunk)]
  const parts = await Promise.all(offsets.map((offset) => file.slice(offset, offset + chunk).arrayBuffer()))
  const prefix = new TextEncoder().encode(`roobro-media-v1:${file.size}:`)
  const bytes = new Uint8Array(prefix.length + parts.reduce((sum, part) => sum + part.byteLength, 0))
  bytes.set(prefix)
  let cursor = prefix.length
  for (const part of parts) { bytes.set(new Uint8Array(part), cursor); cursor += part.byteLength }
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** One room-wide timeline. Transport provides authenticated sender identities, never payload identities. */
export class SharedPlayback {
  private members = new Set<string>()
  private memberDetails: PlaybackMember[] = []
  private presence = new Map<string, { value: z.infer<typeof presenceSchema>; receivedAt: number }>()
  private localPresence: z.infer<typeof presenceSchema> = { revision: 0, sessionId: null, media: null, status: "empty" }
  private lastPresence = -Infinity
  private leader: string | undefined
  private online = false
  private snapshot: Snapshot = { revision: 0, session: null }
  private offset = 0
  private ready = false
  private failed = false
  private lastReply = 0
  private lastPing = -Infinity
  private pending = new Map<string, number>()
  private seen = new Set<string>()

  constructor(private readonly options: {
    identity: string
    now: () => number
    id: () => string
    send: (packet: Packet, destination?: string) => Promise<void>
    changed: (view: PlaybackView) => void
  }) {}

  get view(): PlaybackView {
    const session = this.snapshot.session
    const attendees = this.memberDetails.map((member): PlaybackAttendee => {
      const local = member.identity === this.options.identity
      const entry = this.presence.get(member.identity)
      const value = local ? this.localPresence : entry?.value
      let status: PlaybackReadiness = "unknown"
      if (!this.online || (local && !this.ready) || (!local && entry && this.options.now() - entry.receivedAt > 6500)) status = "away"
      else if (value) {
        status = value.status
        if (value.status !== "loading" && value.status !== "error") {
          if (!value.media) status = "empty"
          else if (!session) status = "selected"
          else if (!matchesMedia(value.media, session.media)) status = "mismatch"
          else if (value.sessionId !== session.id || value.status === "selected" || value.status === "empty") status = "matching"
        }
      }
      return { identity: member.identity, name: member.name?.trim() || member.identity, isLocal: local, status }
    })
    return { session: session ? { ...session, anchor: session.anchor - this.offset } : null, ready: this.ready && this.online, failed: this.failed, attendees }
  }

  reportPresence(presence: PlaybackPresence) {
    const result = presenceSchema.safeParse({ ...presence, revision: this.localPresence.revision })
    if (!result.success || JSON.stringify(result.data) === JSON.stringify(this.localPresence)) return
    this.localPresence = { ...result.data, revision: this.localPresence.revision + 1 }
    this.broadcastPresence()
    this.notify()
  }

  private broadcastPresence() {
    if (!this.online) return
    this.lastPresence = this.options.now()
    this.send({ type: "presence", presence: this.localPresence })
  }

  private notify() { this.options.changed(this.view) }

  private send(packet: Packet, destination?: string) {
    void this.options.send(packet, destination).catch(() => { this.failed = true; this.notify() })
  }

  setMembers(members: PlaybackMember[], online: boolean) {
    const added = members.some((member) => !this.members.has(member.identity))
    this.memberDetails = members
    this.members = new Set(members.map((member) => member.identity))
    for (const identity of this.presence.keys()) if (!this.members.has(identity)) this.presence.delete(identity)
    const leader = [...members].sort((a, b) => a.joinedAt - b.joinedAt || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0))[0]?.identity
    const changed = leader !== this.leader
    const reconnected = online && !this.online
    if (changed || !online || reconnected) {
      // Freeze on loss of authority; a participant must explicitly resume after a handover.
      const session = this.view.session
      this.snapshot = { revision: changed ? 0 : this.snapshot.revision, session: session ? {
        ...session, playing: false, position: playbackPosition(session, this.options.now()), anchor: this.options.now(),
      } : null }
      this.offset = 0
      this.ready = false
      this.pending.clear()
      this.seen.clear()
      this.lastPing = -Infinity
    }
    this.online = online
    this.leader = leader
    if (!online) this.presence.clear()
    if (online && (added || reconnected)) this.broadcastPresence()
    if (online && leader === this.options.identity) {
      this.ready = true
      if (changed || reconnected) {
        this.snapshot.revision++
        this.send({ type: "state", snapshot: this.snapshot })
      }
    }
    this.notify()
    if (online) this.tick()
  }

  tick() {
    // Heartbeats also repair missed readiness updates and keep late joiners informed.
    if (this.online && this.options.now() - this.lastPresence >= 2000) {
      this.broadcastPresence()
      this.notify()
    }
    if (!this.online || !this.leader || this.leader === this.options.identity) return
    const now = this.options.now()
    if (this.ready && now - this.lastReply > 6500) { this.ready = false; this.notify() }
    if (now - this.lastPing < 2000) return
    this.lastPing = now
    for (const [id, sent] of this.pending) if (now - sent > 6500) this.pending.delete(id)
    const id = this.options.id()
    this.pending.set(id, now)
    this.send({ type: "ping", id }, this.leader)
  }

  start(media: PlaybackMedia) { this.request({ action: "start", media }) }

  end() {
    const session = this.snapshot.session
    if (session) this.request({ action: "stop", sessionId: session.id, fingerprint: session.media.fingerprint })
  }

  control(action: "play" | "pause" | "stop" | "seek", media: PlaybackMedia, position = 0) {
    const session = this.snapshot.session
    if (!session || !matchesMedia(media, session.media)) return
    const base = { sessionId: session.id, fingerprint: media.fingerprint }
    this.request(action === "seek" ? { ...base, action, position } : { ...base, action })
  }

  private request(command: Command) {
    if (!this.view.ready || !commandSchema.safeParse(command).success) return
    const packet: Packet = { type: "request", id: this.options.id(), command }
    if (this.leader === this.options.identity) this.receivePacket(packet, this.options.identity)
    else this.send(packet, this.leader)
  }

  receive(payload: Uint8Array, sender: string) {
    if (payload.byteLength > 4096) return
    try {
      const packet = packetSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)))
      if (packet.success) this.receivePacket(packet.data, sender)
    } catch { /* Unrelated or malformed room data cannot affect playback. */ }
  }

  private receivePacket(packet: Packet, sender: string) {
    if (!this.online || !this.members.has(sender)) return
    if (packet.type === "presence") {
      if (sender === this.options.identity) return
      const previous = this.presence.get(sender)
      if (!previous || packet.presence.revision >= previous.value.revision) {
        this.presence.set(sender, { value: packet.presence, receivedAt: this.options.now() })
        this.notify()
      }
      return
    }
    if (packet.type === "ping") {
      if (this.leader === this.options.identity) this.send({ type: "pong", id: packet.id, now: this.options.now(), snapshot: this.snapshot }, sender)
      return
    }
    if (packet.type === "request") {
      if (this.leader !== this.options.identity) return
      const key = `${sender}:${packet.id}`
      if (this.seen.has(key)) return
      this.seen.add(key)
      if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!)
      this.apply(packet.command)
      return
    }
    if (sender !== this.leader || this.leader === this.options.identity) return
    if (packet.type === "pong") {
      const sent = this.pending.get(packet.id)
      if (sent === undefined) return
      this.pending.delete(packet.id)
      const now = this.options.now()
      if (now - sent > 2000) return
      this.offset = packet.now - (sent + now) / 2
      this.lastReply = now
      this.ready = true
      this.failed = false
    }
    if (packet.snapshot.revision >= this.snapshot.revision) this.snapshot = packet.snapshot
    this.notify()
  }

  private apply(command: Command) {
    const now = this.options.now()
    const session = this.snapshot.session
    let next: PlaybackSession | null
    if (command.action === "start") {
      if (session) return
      next = { id: this.options.id(), media: command.media, playing: false, position: 0, anchor: now }
    } else {
      if (!session || command.sessionId !== session.id || command.fingerprint !== session.media.fingerprint) return
      if (command.action === "stop") next = null
      else {
        let position = command.action === "seek" ? Math.min(command.position, session.media.duration) : playbackPosition(session, now)
        if (command.action === "play" && position >= session.media.duration) position = 0
        next = { ...session, position, playing: command.action === "play" || (command.action === "seek" && session.playing), anchor: now + 200 }
      }
    }
    this.snapshot = { revision: this.snapshot.revision + 1, session: next }
    this.failed = false
    this.notify()
    this.send({ type: "state", snapshot: this.snapshot })
  }
}

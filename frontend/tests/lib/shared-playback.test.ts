import { describe, expect, it } from "vitest"

import { matchesMedia, playbackPosition, SharedPlayback, type PlaybackMedia, type PlaybackView } from "@/lib/shared-playback"

const media: PlaybackMedia = { fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 12345 }
const encode = (packet: unknown) => new TextEncoder().encode(JSON.stringify(packet))

function room() {
  let now = 1000
  let sequence = 0
  const controllers = new Map<string, SharedPlayback>()
  const views = new Map<string, PlaybackView>()
  const clockOffsets = new Map<string, number>()
  const queue: { sender: string; destination?: string; packet: unknown }[] = []
  const add = (identity: string, offset = 0) => {
    clockOffsets.set(identity, offset)
    const controller = new SharedPlayback({
      identity, now: () => now + offset, id: () => `${identity}-${++sequence}`,
      send: async (packet, destination) => { queue.push({ sender: identity, destination, packet }) },
      changed: (view) => views.set(identity, view),
    })
    controllers.set(identity, controller)
    return controller
  }
  const flush = () => {
    for (let count = 0; queue.length && count < 100; count++) {
      const message = queue.shift()!
      for (const [identity, controller] of controllers) {
        if (identity !== message.sender && (!message.destination || message.destination === identity)) controller.receive(encode(message.packet), message.sender)
      }
    }
    expect(queue).toHaveLength(0)
  }
  const members = (identities = [...controllers.keys()]) => {
    const list = identities.map((identity, index) => ({ identity, joinedAt: index + 1 }))
    for (const identity of identities) controllers.get(identity)!.setMembers(list, true)
    flush()
  }
  const advance = (milliseconds: number) => { now += milliseconds }
  return { add, flush, members, advance, controllers, views, queue, now: (identity: string) => now + (clockOffsets.get(identity) ?? 0) }
}

describe("shared playback timeline", () => {
  it("orders concurrent controls at one coordinator and keeps different clocks aligned", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b", 20000)
    network.members()
    b.start(media)
    network.flush()
    b.control("play", media)
    network.flush()
    network.advance(5200)
    const positions = [...network.views].map(([id, view]) => playbackPosition(view.session!, network.now(id)))
    expect(positions).toEqual([5, 5])
    b.control("seek", media, 42)
    b.control("pause", media)
    network.flush()
    expect(a.view.session?.playing).toBe(false)
    expect(b.view.session?.playing).toBe(false)
    expect(a.view.session?.position).toBe(42)
    expect(b.view.session?.position).toBe(42)
  })

  it("restores a late join and a missed pause from state snapshots", () => {
    const network = room()
    const a = network.add("a")
    network.members()
    a.start(media)
    a.control("play", media)
    network.flush()
    network.advance(10200)
    const b = network.add("b", 40000)
    network.members()
    expect(playbackPosition(b.view.session!, network.now("b"))).toBe(10)
    a.control("pause", media)
    network.queue.length = 0 // Simulate a dropped broadcast, even on the reliable channel.
    expect(b.view.session?.playing).toBe(true)
    network.advance(2000)
    b.tick()
    network.flush()
    expect(b.view.session?.playing).toBe(false)
    expect(b.view.session?.position).toBe(10)
  })

  it("rejects forged state, malformed packets, stale revisions and mismatched media controls", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    a.start(media)
    network.flush()
    const session = a.view.session!
    b.receive(encode({ type: "state", snapshot: { revision: 999, session: null } }), "outsider")
    b.receive(encode({ type: "state", snapshot: { revision: 999, session: null } }), "b")
    b.receive(encode({ type: "state", snapshot: { revision: 0, session: null } }), "a")
    b.receive(encode({ type: "state", snapshot: { revision: 999, session: { ...session, position: -3 } } }), "a")
    b.receive(new Uint8Array(5000), "a")
    b.receive(new TextEncoder().encode("not JSON"), "a")
    b.control("play", { ...media, fingerprint: "b".repeat(64) })
    network.flush()
    expect(b.view.session?.id).toBe(session.id)
    expect(a.view.session?.playing).toBe(false)
  })

  it("pauses on coordinator departure and allows an explicit resume", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b", 10000)
    network.members()
    a.start(media)
    a.control("play", media)
    network.flush()
    network.advance(3200)
    network.controllers.delete("a")
    network.members(["b"])
    expect(b.view.session?.playing).toBe(false)
    expect(b.view.session?.position).toBe(3)
    expect(b.view.ready).toBe(true)
    b.control("play", media)
    expect(b.view.session?.playing).toBe(true)
  })

  it("stops local playback during disconnection and resyncs on reconnect", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b", 60000)
    network.members()
    a.start(media)
    a.control("play", media)
    network.flush()
    b.setMembers([{ identity: "a", joinedAt: 1 }, { identity: "b", joinedAt: 2 }], false)
    expect(b.view.ready).toBe(false)
    b.control("seek", media, 90)
    network.advance(5200)
    network.members()
    expect(b.view.ready).toBe(true)
    expect(playbackPosition(b.view.session!, network.now("b"))).toBe(5)
  })

  it("requires a fresh snapshot after the coordinator stops answering", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    a.start(media)
    network.flush()
    network.advance(7000)
    b.tick()
    expect(b.view.ready).toBe(false)
    network.flush()
    expect(b.view.ready).toBe(true)
  })

  it("deduplicates commands and ignores commands for an old session", () => {
    const network = room()
    const a = network.add("a")
    network.add("b")
    network.members()
    a.start(media)
    network.flush()
    const oldId = a.view.session!.id
    const command = { type: "request", id: "pause-once", command: { action: "pause", sessionId: oldId, fingerprint: media.fingerprint } }
    a.receive(encode(command), "b")
    a.control("play", media)
    a.receive(encode(command), "b")
    expect(a.view.session?.playing).toBe(true)
    a.control("stop", media)
    a.start(media)
    a.control("play", media)
    a.receive(encode({ ...command, id: "old-session" }), "b")
    expect(a.view.session?.playing).toBe(true)
    expect(a.view.session?.id).not.toBe(oldId)
  })

  it("does not let a racing start replace the chosen film; clamps seek and replays at the end", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    a.start(media)
    b.start({ ...media, name: "other.mp4", fingerprint: "b".repeat(64) })
    network.flush()
    expect(b.view.session?.media.name).toBe("film.mp4")
    a.control("seek", media, 999)
    expect(a.view.session?.position).toBe(120)
    a.control("play", media)
    expect(a.view.session?.position).toBe(0)
    expect(matchesMedia(media, { ...media, name: "renamed.mp4" })).toBe(true)
    expect(matchesMedia(media, { ...media, duration: 121 })).toBe(false)
  })
})


describe("shared playback readiness", () => {
  it("distinguishes file selection, a matching copy, and explicit readiness for the current session", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    const status = (identity: string) => a.view.attendees.find((attendee) => attendee.identity === identity)?.status
    expect(status("b")).toBe("empty")
    b.reportPresence({ sessionId: null, media, status: "selected" })
    network.flush()
    expect(status("b")).toBe("selected")
    a.start(media)
    network.flush()
    expect(status("b")).toBe("matching")
    b.reportPresence({ sessionId: b.view.session!.id, media, status: "ready" })
    network.flush()
    expect(status("b")).toBe("ready")
    b.reportPresence({ sessionId: b.view.session!.id, media, status: "buffering" })
    network.flush()
    expect(status("b")).toBe("buffering")
    b.reportPresence({ sessionId: b.view.session!.id, media, status: "blocked" })
    network.flush()
    expect(status("b")).toBe("blocked")
    b.reportPresence({ sessionId: b.view.session!.id, media, status: "ready" })
    network.flush()
    a.end()
    a.start(media)
    network.flush()
    expect(status("b")).toBe("matching") // The new session needs another explicit join.
    b.reportPresence({ sessionId: b.view.session!.id, media: { ...media, fingerprint: "b".repeat(64) }, status: "ready" })
    network.flush()
    expect(status("b")).toBe("mismatch")
  })

  it("rejects stale or forged readiness and expires missing heartbeats", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    a.start(media)
    network.flush()
    const sessionId = a.view.session!.id
    b.reportPresence({ sessionId, media, status: "ready" })
    network.flush()
    const stale = { type: "presence", presence: { revision: 0, sessionId, media: null, status: "empty" } }
    a.receive(encode(stale), "b")
    a.receive(encode({ ...stale, presence: { ...stale.presence, revision: 100 } }), "outsider")
    expect(a.view.attendees.find((attendee) => attendee.identity === "b")?.status).toBe("ready")
    network.advance(7000)
    a.tick()
    expect(network.views.get("a")?.attendees.find((attendee) => attendee.identity === "b")?.status).toBe("away")
    b.tick()
    network.flush()
    expect(a.view.attendees.find((attendee) => attendee.identity === "b")?.status).toBe("ready")
    network.controllers.delete("b")
    network.members(["a"])
    expect(a.view.attendees.map((attendee) => attendee.identity)).toEqual(["a"])
  })

  it("shares readiness with late joiners and repairs a dropped file change", () => {
    const network = room()
    const a = network.add("a")
    const b = network.add("b")
    network.members()
    a.start(media)
    network.flush()
    a.reportPresence({ sessionId: a.view.session!.id, media, status: "ready" })
    network.flush()
    const c = network.add("c")
    network.members()
    expect(c.view.attendees.find((attendee) => attendee.identity === "a")?.status).toBe("ready")
    a.reportPresence({ sessionId: a.view.session!.id, media: null, status: "empty" })
    network.queue.length = 0
    expect(b.view.attendees.find((attendee) => attendee.identity === "a")?.status).toBe("ready")
    network.advance(2000)
    a.tick()
    network.flush()
    expect(b.view.attendees.find((attendee) => attendee.identity === "a")?.status).toBe("empty")
  })
})

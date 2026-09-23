// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RoomEvent, type Room } from "livekit-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSharedPlayback } from "@/hooks/use-shared-playback"
import { PLAYBACK_TOPIC } from "@/lib/shared-playback"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("LiveKit playback transport", () => {
  let root: Root
  let current: ReturnType<typeof useSharedPlayback>
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const publishData = vi.fn(async (_payload: Uint8Array, _options: { reliable: boolean; topic: string }) => undefined)
  const room = {
    state: "connected",
    localParticipant: { identity: "self", joinedAt: new Date(1000), publishData },
    remoteParticipants: new Map<string, { identity: string; joinedAt: Date }>(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
    off: vi.fn((event: string) => listeners.delete(event)),
  }
  function Harness() {
    current = useSharedPlayback(room as unknown as Room, "self")
    return null
  }
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    room.state = "connected"
    room.remoteParticipants.clear()
    root = createRoot(document.createElement("div"))
    await act(async () => root.render(<Harness />))
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it("uses reliable topic-scoped metadata only, accepts authenticated controls, and cleans up", async () => {
    expect(current.ready).toBe(true)
    const guest = { identity: "guest", joinedAt: new Date(2000) }
    room.remoteParticipants.set("guest", guest)
    await act(async () => listeners.get(RoomEvent.ParticipantConnected)?.(guest))
    await act(async () => current.start({ fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 100 }))
    expect(publishData).toHaveBeenLastCalledWith(expect.anything(), { reliable: true, topic: PLAYBACK_TOPIC, destinationIdentities: undefined })
    const payload = publishData.mock.lastCall![0]
    expect(payload.byteLength).toBeLessThan(4096)
    expect(JSON.parse(new TextDecoder().decode(payload)).snapshot.session.media).toEqual({ fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 100 })
    const packet = new TextEncoder().encode(JSON.stringify({ type: "request", id: "guest-play", command: { action: "play", sessionId: current.session!.id, fingerprint: "a".repeat(64) } }))
    await act(async () => listeners.get(RoomEvent.DataReceived)?.(packet, guest, undefined, "other-topic"))
    expect(current.session?.playing).toBe(false)
    await act(async () => listeners.get(RoomEvent.DataReceived)?.(packet, undefined, undefined, PLAYBACK_TOPIC))
    expect(current.session?.playing).toBe(false)
    await act(async () => listeners.get(RoomEvent.DataReceived)?.(packet, guest, undefined, PLAYBACK_TOPIC))
    expect(current.session?.playing).toBe(true)
    await act(async () => root.render(null))
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("freezes during reconnect and publishes a paused snapshot when the coordinator returns", async () => {
    await act(async () => current.start({ fingerprint: "a".repeat(64), name: "film.mp4", duration: 120, size: 100 }))
    await act(async () => current.control("play", current.session!.media))
    await act(async () => vi.advanceTimersByTime(1200))
    room.state = "reconnecting"
    await act(async () => listeners.get(RoomEvent.ConnectionStateChanged)?.("reconnecting"))
    expect(current.ready).toBe(false)
    expect(current.session?.playing).toBe(false)
    room.state = "connected"
    await act(async () => listeners.get(RoomEvent.ConnectionStateChanged)?.("connected"))
    expect(current.ready).toBe(true)
    expect(current.session?.playing).toBe(false)
    expect(current.session?.position).toBe(1)
  })
})

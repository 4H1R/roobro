import { ConnectionState, RoomEvent, type RemoteParticipant, type Room } from "livekit-client"
import { useCallback, useEffect, useRef, useState } from "react"

import { PLAYBACK_TOPIC, SharedPlayback, type PlaybackMedia, type PlaybackPresence, type PlaybackView } from "@/lib/shared-playback"

export function useSharedPlayback(room: Room | undefined, identity: string, displayName?: string) {
  const controller = useRef<SharedPlayback | null>(null)
  const [view, setView] = useState<PlaybackView>({ session: null, ready: false, failed: false, attendees: [] })

  useEffect(() => {
    let active = true
    const session = new SharedPlayback({
      identity, now: () => performance.now(), id: () => crypto.randomUUID(),
      changed: (next) => { if (active) setView(next) },
      send: async (packet, destination) => {
        if (room) await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(packet)), {
          reliable: true, topic: PLAYBACK_TOPIC, destinationIdentities: destination ? [destination] : undefined,
        })
      },
    })
    controller.current = session
    const membership = () => session.setMembers(room ? [room.localParticipant, ...room.remoteParticipants.values()].map((participant) => ({
      identity: participant.identity, name: participant.name, joinedAt: participant.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
    })) : [{ identity, name: displayName, joinedAt: 0 }], !room || room.state === ConnectionState.Connected)
    const receive = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (participant && topic === PLAYBACK_TOPIC) session.receive(payload, participant.identity)
    }
    room?.on(RoomEvent.DataReceived, receive)
    room?.on(RoomEvent.ParticipantConnected, membership)
    room?.on(RoomEvent.ParticipantDisconnected, membership)
    room?.on(RoomEvent.ConnectionStateChanged, membership)
    room?.on(RoomEvent.ParticipantNameChanged, membership)
    membership()
    const timer = setInterval(() => session.tick(), 500)
    return () => {
      active = false
      clearInterval(timer)
      room?.off(RoomEvent.DataReceived, receive)
      room?.off(RoomEvent.ParticipantConnected, membership)
      room?.off(RoomEvent.ParticipantDisconnected, membership)
      room?.off(RoomEvent.ConnectionStateChanged, membership)
      room?.off(RoomEvent.ParticipantNameChanged, membership)
      controller.current = null
    }
  }, [room, identity, displayName])

  const reportPresence = useCallback((presence: PlaybackPresence) => controller.current?.reportPresence(presence), [])

  return {
    ...view,
    reportPresence,
    start: (media: PlaybackMedia) => controller.current?.start(media),
    end: () => controller.current?.end(),
    control: (action: "play" | "pause" | "seek" | "stop", media: PlaybackMedia, position?: number) => controller.current?.control(action, media, position),
  }
}

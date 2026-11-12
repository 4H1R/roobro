import { useSpeakingParticipants, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { useEffect, useState } from "react"

import { pickSpotlightTrack } from "@/lib/spotlight-track"

export function useSpotlightTrack(tracks: readonly TrackReferenceOrPlaceholder[], localIdentity: string | undefined) {
  const speakingIdentities = useSpeakingParticipants().map((participant) => participant.identity)
  const remoteSpeaker = speakingIdentities.find((identity) => identity !== localIdentity) ?? null
  const [lastRemoteSpeaker, setLastRemoteSpeaker] = useState<string | null>(null)
  useEffect(() => { if (remoteSpeaker) setLastRemoteSpeaker(remoteSpeaker) }, [remoteSpeaker])
  return pickSpotlightTrack(tracks, speakingIdentities, lastRemoteSpeaker)
}

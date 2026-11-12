interface SpotlightCandidate {
  participant: { identity: string; isLocal: boolean }
  source: string
  publication?: { isMuted: boolean }
}

const hasLiveVideo = (track: SpotlightCandidate) => !!track.publication && !track.publication.isMuted

export function pickSpotlightTrack<T extends SpotlightCandidate>(tracks: readonly T[], speakingIdentities: readonly string[], lastSpeakerIdentity: string | null): T | null {
  const remote = tracks.filter((track) => !track.participant.isLocal)
  const remoteCameras = remote.filter((track) => track.source === "camera")
  const cameraOf = (identity: string | null) => remoteCameras.find((track) => track.participant.identity === identity)

  return remote.find((track) => track.source === "screen_share")
    ?? speakingIdentities.map(cameraOf).find((track) => track !== undefined)
    ?? cameraOf(lastSpeakerIdentity)
    ?? remoteCameras.find(hasLiveVideo)
    ?? remoteCameras[0]
    ?? tracks.find((track) => track.participant.isLocal && track.source === "camera")
    ?? null
}

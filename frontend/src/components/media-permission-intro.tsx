import { Mic, ShieldCheck, Video } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { MediaAccess } from "@/hooks/use-lobby-media"

export function MediaPermissionIntro({ access, onAllow }: { access: MediaAccess; onAllow: () => Promise<void> }) {
  const { t } = useTranslation()
  const buttonLabel = access.status === "checking" ? "checkingPermissions" : access.status === "requesting" ? "requestingPermissions" : "allowMedia"

  return <div className="permission-intro" aria-busy={access.status === "checking" || access.status === "requesting"}>
    <h1>{t("lobby.permissionTitle")}</h1>
    <p>{t("lobby.permissionBody")}</p>
    <div className="permission-devices"><span><Video />{t("room.camera")}</span><span><Mic />{t("room.microphone")}</span></div>
    <p>{t("lobby.permissionHint")}</p>
    {access.status === "needed" && access.error && <p className="permission-note" role="alert">{t(`lobby.${access.error}`)}</p>}
    <button className="join-now" disabled={access.status !== "needed"} onClick={() => void onAllow()}>{t(`lobby.${buttonLabel}`)}</button>
    <div className="safe-note"><ShieldCheck />{t("lobby.permissionPrivacy")}</div>
  </div>
}

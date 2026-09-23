import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"

export function ConversationArt() {
  const { t } = useTranslation()
  return <div className="conversation-art" aria-hidden="true">
    <div className="art-caption"><span>{t("home.artCaption")}</span><span dir="ltr">ROOBRO</span></div>
    <div className="art-symbol"><BrandMark /></div>
    <div className="art-bottom"><p>{t("home.artLineOne")}<br />{t("home.artLineTwo")}</p><span className="art-signature" dir="ltr">roo.</span></div>
  </div>
}

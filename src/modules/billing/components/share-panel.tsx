import { useTranslations } from "next-intl";
import { ChatIcon, MailIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { emailDocument } from "../actions";
import { CopyLink } from "./copy-link";

// Partage d'un document émis : lien court (copie), WhatsApp avec message prérempli,
// e-mail (Resend, ou depuis le téléphone si l'envoi n'est pas activé) et PDF.
export function SharePanel({
  kind,
  id,
  locale,
  url,
  pdfUrl,
  whatsappUrl,
  mailtoUrl,
  emailEnabled,
  showWhatsapp = true,
}: {
  kind: "quote" | "invoice";
  id: string;
  locale: string;
  url: string;
  pdfUrl: string;
  whatsappUrl: string;
  mailtoUrl: string;
  emailEnabled: boolean;
  // false : WhatsApp est déjà l'action principale de la page (devis envoyé).
  showWhatsapp?: boolean;
}) {
  const t = useTranslations("Billing.share");
  return (
    <Card aria-labelledby="share-title" className="flex flex-col gap-3">
      <h2 id="share-title" className="text-lg font-bold text-lagoon">
        {t("title")}
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="public-link" className="text-sm font-semibold text-ink">
          {t("link")}
        </label>
        <Input id="public-link" value={url} readOnly className="text-sm" data-testid="public-link" />
      </div>
      <CopyLink url={url} label={t("copy")} copiedLabel={t("copied")} />
      {showWhatsapp && (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", true)}>
          <ChatIcon className="size-5" />
          {t("whatsapp")}
        </a>
      )}
      {emailEnabled ? (
        <form action={emailDocument}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="secondary" block>
            <MailIcon className="size-5" />
            {t("email")}
          </SubmitButton>
        </form>
      ) : (
        <a href={mailtoUrl} className={buttonClasses("secondary", true)}>
          <MailIcon className="size-5" />
          {t("emailPhone")}
        </a>
      )}
      <div className="flex flex-wrap gap-x-4">
        <a href={pdfUrl} className={buttonClasses("ghost", false, "px-0")} download>
          {t("download")}
        </a>
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", false, "px-0")}>
          {t("open")}
        </a>
      </div>
    </Card>
  );
}

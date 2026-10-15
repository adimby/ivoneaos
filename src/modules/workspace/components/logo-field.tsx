"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { checkLogoFile, LOGO_ACCEPT } from "../logo";

// Logo facultatif : contrôle immédiat (taille, type) et aperçu avant l'envoi.
export function LogoField({ currentUrl, businessName, error }: { currentUrl: string | null; businessName: string; error?: string }) {
  const t = useTranslations("Profile.logo");
  const tErrors = useTranslations("FormErrors");
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const shown = preview ?? currentUrl;
  const message = localError ?? error;

  return (
    <Field id="logo" label={t("label")} hint={t("hint")} error={message ? tErrors(message) : undefined}>
      {(control) => (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sand bg-white">
            {shown ? (
              // Aperçu local (blob:) ou URL signée du bucket privé : pas d'optimisation next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt={t("alt", { name: businessName })} className="size-full object-contain" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-7 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <circle cx="9" cy="10" r="2" />
                <path d="m4 18 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {/* Champ natif masqué (son texte n'est pas traduisible) ; le bouton est son libellé. */}
          <input
            {...control}
            type="file"
            name="logo"
            accept={LOGO_ACCEPT}
            className="peer sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setPreview(null);
              setLocalError(null);
              setFileName(null);
              if (!file) return;
              const problem = checkLogoFile(file);
              if (problem) {
                setLocalError(problem);
                event.currentTarget.value = "";
                return;
              }
              setFileName(file.name);
              setPreview(URL.createObjectURL(file));
            }}
          />
          <label
            htmlFor={control.id}
            className={buttonClasses(
              "secondary",
              false,
              "cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lagoon",
            )}
          >
            {shown ? t("change") : t("choose")}
          </label>
          {fileName && <span className="min-w-0 basis-full truncate text-sm text-ink-muted">{fileName}</span>}
        </div>
      )}
    </Field>
  );
}

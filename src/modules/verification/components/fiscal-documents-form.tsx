"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileDrop, type UploadResult } from "@/components/ui/file-drop";
import { useHydrated } from "@/lib/use-hydrated";
import { downscaleImage } from "@/lib/downscale-image";
import { createClient } from "@/lib/supabase/client";
import {
  FISCAL_BUCKET,
  FISCAL_FILE_ACCEPT,
  FISCAL_FILE_MAX_BYTES,
  FISCAL_IMAGE_MAX_SIDE,
  FISCAL_JPEG_QUALITY,
  fiscalFilePath,
  isFiscalFileType,
} from "../documents";

// Grande photo réduite avant l'envoi (taille gardée par le serveur pour la lecture).
const shrink = (file: File) => downscaleImage(file, FISCAL_IMAGE_MAX_SIDE, FISCAL_JPEG_QUALITY);

const ERRORS = [
  "unavailable",
  "files_invalid",
  "workspace_tax_info_missing",
  "fiscal_already_verified",
  "fiscal_already_pending",
  "fiscal_documents_missing",
  "not_authenticated",
  "network",
] as const;
type FormError = (typeof ERRORS)[number] | "unknown";
// Photos supprimées ou introuvables côté serveur : les zones de dépôt repartent à vide.
const RESET_ON = new Set<FormError>(["files_invalid", "fiscal_documents_missing"]);
// État peut-être déjà changé (envoi traité malgré une coupure, autre onglet, photos
// supprimées après une décision) : la page se recharge et montre le vrai statut.
const REFRESH_ON = new Set<FormError>(["fiscal_already_pending", "fiscal_already_verified", "files_invalid", "fiscal_documents_missing", "network"]);

// Recto et verso de la carte fiscale : chaque photo part directement du navigateur vers le
// bucket privé (dossier du workspace, nom nouveau), puis le serveur les relit et les
// vérifie (route /api/fiscal/verification). La page se met à jour avec le résultat.
export function FiscalDocumentsForm({ workspaceId, primary = false }: { workspaceId: string; primary?: boolean }) {
  const t = useTranslations("Verification");
  const router = useRouter();
  const hydrated = useHydrated();
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Change à chaque remise à zéro : les deux zones de dépôt sont recréées, vides.
  const [round, setRound] = useState(0);

  function fail(next: FormError) {
    setError(next);
    setChecking(false);
    if (RESET_ON.has(next)) {
      setFront(null);
      setBack(null);
      setRound((r) => r + 1);
    }
    if (REFRESH_ON.has(next)) router.refresh();
  }

  async function upload(file: File): Promise<UploadResult<string>> {
    if (!isFiscalFileType(file.type)) return { ok: false, error: t("errors.files_invalid") };
    const path = fiscalFilePath(workspaceId, file.type, crypto.randomUUID());
    const { error: uploadError } = await createClient()
      .storage.from(FISCAL_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    return uploadError ? { ok: false, error: t("errors.upload") } : { ok: true, value: path };
  }

  async function submit() {
    setError(null);
    if (!front || !back) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setChecking(true);
    try {
      const response = await fetch("/api/fiscal/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back }),
      });
      const result = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
      if (result.status === "verified" || result.status === "pending") {
        router.refresh();
        return;
      }
      fail((ERRORS as readonly string[]).includes(result.error ?? "") ? (result.error as FormError) : "unknown");
    } catch {
      fail("network");
    }
  }

  const hint = t("fileHint");
  return (
    <div className="flex flex-col gap-4" data-testid="fiscal-documents-form">
      <div className="grid gap-4 md:grid-cols-2">
        <FileDrop
          key={`front-${round}`}
          id="fiscal-front"
          label={t("front")}
          hint={hint}
          accept={FISCAL_FILE_ACCEPT}
          maxBytes={FISCAL_FILE_MAX_BYTES}
          upload={upload}
          prepare={shrink}
          onChange={setFront}
          disabled={checking}
        />
        <FileDrop
          key={`back-${round}`}
          id="fiscal-back"
          label={t("back")}
          hint={hint}
          accept={FISCAL_FILE_ACCEPT}
          maxBytes={FISCAL_FILE_MAX_BYTES}
          upload={upload}
          prepare={shrink}
          onChange={setBack}
          disabled={checking}
        />
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {checking && (
          <Alert tone="info">
            <span className="block font-semibold" data-testid="fiscal-checking">
              {t("checking")}
            </span>
            <span className="block">{t("checkingHint")}</span>
          </Alert>
        )}
        {missing && !(front && back) && <Alert tone="error">{t("needBoth")}</Alert>}
        {error && <Alert tone="error">{t(`errors.${error}`)}</Alert>}
      </div>
      {/* Attend le JavaScript : l'envoi des photos se fait depuis le navigateur. */}
      <Button
        variant={primary ? "primary" : "secondary"}
        block
        onClick={submit}
        disabled={!hydrated || checking}
        aria-busy={checking || undefined}
        data-testid="fiscal-submit"
      >
        {checking ? t("checkingShort") : t("submit")}
      </Button>
    </div>
  );
}

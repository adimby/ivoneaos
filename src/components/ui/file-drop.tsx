"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "./cn";

// Dépôt d'un fichier : zone où l'on dépose (ordinateur) ou lien « Parcourir » (téléphone,
// clavier), aperçu miniature pour une image, remplacer, retirer, état d'envoi et erreurs
// claires. Deux usages :
// - envoi immédiat (upload fourni) : le fichier part dès qu'il est choisi (envoi direct vers
//   le stockage, par exemple) ; onChange reçoit la valeur renvoyée (chemin) ou null.
//   prepare (facultatif) transforme le fichier avant le contrôle de taille et l'envoi
//   (réduire une grande photo). Carte fiscale (Réglages, démarrage).
// - champ de formulaire (name, sans upload) : le fichier reste dans le champ natif et part
//   avec le formulaire (POST) ; onFile reçoit le fichier choisi ou null. Logo du démarrage.
//
// Accessibilité : le champ natif (masqué visuellement, focalisable) porte le libellé, l'aide
// et l'erreur ; le lien visible est son second libellé et montre le focus. L'état d'envoi
// est annoncé (aria-live), l'erreur aussi (role=alert).

export type UploadResult<T> = { ok: true; value: T } | { ok: false; error: string };

type Status = "empty" | "uploading" | "done" | "error";

// « image/jpeg, image/png » → « JPG, PNG » (formats montrés sous le titre).
function formatList(types: string[]): string {
  return types.map((type) => (type === "image/jpeg" ? "JPG" : (type.split("/")[1] ?? type).toUpperCase())).join(", ");
}

export function FileDrop<T>({
  id,
  name,
  label,
  hint,
  accept,
  maxBytes,
  upload,
  prepare,
  onChange,
  onFile,
  currentUrl = null,
  error: externalError,
  disabled = false,
}: {
  id: string;
  // Champ de formulaire (sans upload) : nom du champ envoyé avec le formulaire.
  name?: string;
  label: ReactNode;
  hint?: string;
  // Types MIME acceptés, séparés par des virgules (attribut accept).
  accept: string;
  maxBytes: number;
  upload?: (file: File) => Promise<UploadResult<T>>;
  // Fichier transformé avant le contrôle de taille et l'envoi (en cas d'échec : l'original).
  prepare?: (file: File) => Promise<File>;
  onChange?: (value: T | null) => void;
  onFile?: (file: File | null) => void;
  // Image déjà enregistrée (URL signée), montrée tant qu'aucun fichier n'est choisi.
  currentUrl?: string | null;
  // Erreur renvoyée par le serveur (déjà traduite).
  error?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("FileDrop");
  const inputRef = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);
  const [status, setStatus] = useState<Status>("empty");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const statusId = useId();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const types = accept.split(",").map((type) => type.trim());
  const sizeLabel = t("size", { size: Math.round(maxBytes / (1024 * 1024)) });
  const busy = status === "uploading";
  const formField = !upload;
  // Erreur locale d'abord ; celle du serveur, le parent l'efface à un nouveau choix (onFile).
  const error = localError ?? externalError ?? null;
  const shownImage = preview ?? (status === "empty" ? currentUrl : null);

  async function choose(next: File | undefined, dropped?: FileList) {
    if (!next || disabled || busy) return;
    if (!types.includes(next.type)) return fail(t("errors.type"));
    if (!prepare && next.size > maxBytes) return fail(t("errors.too_large", { size: sizeLabel }));
    const current = ++attempt.current;
    setFile(next);
    setPreview(null);
    setLocalError(null);

    if (formField) {
      // Fichier déposé : placé dans le champ natif, envoyé avec le formulaire.
      if (dropped && inputRef.current) inputRef.current.files = dropped;
      setPreview(next.type.startsWith("image/") ? URL.createObjectURL(next) : null);
      setStatus("done");
      onFile?.(next);
      return;
    }

    if (inputRef.current) inputRef.current.value = "";
    setStatus("uploading");
    onChange?.(null);
    const ready = prepare ? await prepare(next).catch(() => next) : next;
    if (current !== attempt.current) return;
    if (ready.size > maxBytes) return fail(t("errors.too_large", { size: sizeLabel }));
    if (!types.includes(ready.type)) return fail(t("errors.type"));
    setPreview(ready.type.startsWith("image/") ? URL.createObjectURL(ready) : null);
    onFile?.(ready);
    let result: UploadResult<T>;
    try {
      result = await upload!(ready);
    } catch {
      result = { ok: false, error: t("errors.upload") };
    }
    if (current !== attempt.current) return;
    if (result.ok) {
      setStatus("done");
      onChange?.(result.value);
    } else {
      fail(result.error);
    }
  }

  function clear() {
    attempt.current++;
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setPreview(null);
    onChange?.(null);
    onFile?.(null);
  }

  function fail(message: string) {
    clear();
    setStatus("error");
    setLocalError(message);
  }

  function remove() {
    clear();
    setLocalError(null);
    setStatus("empty");
    inputRef.current?.focus();
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files?.[0], event.dataTransfer.files);
  };

  const describedBy = [error && `${id}-error`, hint && `${id}-hint`, statusId].filter(Boolean).join(" ");
  const done = status === "done";

  return (
    <div data-field className="@container flex flex-col gap-1.5" data-testid={`file-drop-${id}`} data-status={status}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {/* Champ natif masqué (son texte n'est pas traduisible) ; le lien est son libellé. */}
      <input
        ref={inputRef}
        id={id}
        name={formField ? name : undefined}
        type="file"
        accept={accept}
        disabled={disabled || busy}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="peer sr-only"
        onChange={(event) => void choose(event.currentTarget.files?.[0])}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex items-center gap-3 rounded-xl border-2 border-dashed bg-surface p-3 transition-colors",
          dragging ? "border-lagoon bg-turquoise-soft" : error ? "border-danger" : "border-sand-strong",
          "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lagoon",
        )}
      >
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-turquoise-soft text-lagoon">
          {shownImage ? (
            // Aperçu local (blob:) ou URL signée : pas d'optimisation next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownImage} alt="" className="size-full bg-surface object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 20v-8m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <svg className="size-6 animate-spin text-lagoon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={cn("text-base font-semibold text-ink", file && "truncate")}>
            {file ? (
              file.name
            ) : shownImage ? (
              t("current")
            ) : (
              <>
                {/* « dépose » seulement sur ordinateur et quand la zone est assez large. */}
                <span className="lg:@md:hidden">{t("choose")}</span>
                <span className="hidden lg:@md:inline">{t("chooseOrDrop")}</span>
              </>
            )}
          </p>
          <p className="text-sm text-ink-muted">{t("limits", { formats: formatList(types), size: sizeLabel })}</p>
        </div>
        <label
          htmlFor={id}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center px-1 text-base font-semibold text-lagoon underline underline-offset-4",
            disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer",
          )}
        >
          {done || busy || shownImage ? t("replace") : t("browse")}
        </label>
      </div>
      <div className="flex min-h-0 items-center justify-between gap-3">
        <p id={statusId} aria-live="polite" className={cn("text-sm font-medium", done && !error ? "text-success" : "text-ink-muted")}>
          {busy ? t("uploading") : done ? (formField ? t("selected") : t("uploaded")) : ""}
        </p>
        {(done || busy) && (
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            className="inline-flex min-h-11 shrink-0 items-center px-1 text-base font-semibold text-danger underline-offset-4 hover:underline disabled:opacity-60"
          >
            {t("remove")}
            <span className="sr-only"> {typeof label === "string" ? label : ""}</span>
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <svg className="mt-0.5 size-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a1 1 0 0 1 1 1v3.5a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />
          </svg>
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

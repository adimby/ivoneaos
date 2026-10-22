"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "./button";
import { cn } from "./cn";

// Dépôt d'un fichier : zone où l'on dépose (ordinateur) ou bouton « Parcourir » (téléphone,
// clavier), aperçu miniature pour une image, remplacer, retirer, état d'envoi et erreurs
// claires. Le fichier part dès qu'il est choisi (upload, fourni par l'appelant : envoi
// direct vers le stockage, par exemple) ; onChange reçoit la valeur renvoyée (chemin) ou
// null. Utilisé pour la carte fiscale, et prévu pour l'étape « Administratif » du démarrage.
//
// Accessibilité : le champ natif (masqué visuellement, focalisable) porte le libellé, l'aide
// et l'erreur ; le bouton visible est son second libellé et montre le focus. L'état d'envoi
// est annoncé (aria-live), l'erreur aussi (role=alert).

export type UploadResult<T> = { ok: true; value: T } | { ok: false; error: string };

type Status = "empty" | "uploading" | "done" | "error";

export function FileDrop<T>({
  id,
  label,
  hint,
  accept,
  maxBytes,
  upload,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  // Types MIME acceptés, séparés par des virgules (attribut accept).
  accept: string;
  maxBytes: number;
  upload: (file: File) => Promise<UploadResult<T>>;
  onChange: (value: T | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("FileDrop");
  const inputRef = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);
  const [status, setStatus] = useState<Status>("empty");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const statusId = useId();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const types = accept.split(",").map((type) => type.trim());
  const sizeLabel = t("size", { size: Math.round(maxBytes / (1024 * 1024)) });
  const busy = status === "uploading";

  async function choose(next: File | undefined) {
    if (!next || disabled || busy) return;
    if (inputRef.current) inputRef.current.value = "";
    if (next.size > maxBytes) return fail(t("errors.too_large", { size: sizeLabel }));
    if (!types.includes(next.type)) return fail(t("errors.type"));
    const current = ++attempt.current;
    setFile(next);
    setPreview(next.type.startsWith("image/") ? URL.createObjectURL(next) : null);
    setError(null);
    setStatus("uploading");
    onChange(null);
    let result: UploadResult<T>;
    try {
      result = await upload(next);
    } catch {
      result = { ok: false, error: t("errors.upload") };
    }
    if (current !== attempt.current) return;
    if (result.ok) {
      setStatus("done");
      onChange(result.value);
    } else {
      fail(result.error);
    }
  }

  function fail(message: string) {
    attempt.current++;
    setFile(null);
    setPreview(null);
    setStatus("error");
    setError(message);
    onChange(null);
  }

  function remove() {
    attempt.current++;
    setFile(null);
    setPreview(null);
    setError(null);
    setStatus("empty");
    onChange(null);
    inputRef.current?.focus();
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files?.[0]);
  };

  const describedBy = [error && `${id}-error`, hint && `${id}-hint`, statusId].filter(Boolean).join(" ");

  return (
    <div data-field className="flex flex-col gap-1.5" data-testid={`file-drop-${id}`} data-status={status}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {/* Champ natif masqué (son texte n'est pas traduisible) ; le bouton est son libellé. */}
      <input
        ref={inputRef}
        id={id}
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
        <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sand bg-sand-light">
          {preview ? (
            // Aperçu local (blob:) : pas d'optimisation next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-7 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
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
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="min-w-0 truncate text-sm text-ink-muted">
            {file ? file.name : <span className="hidden lg:inline">{t("dropHere")}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label
              htmlFor={id}
              className={buttonClasses(
                "secondary",
                false,
                cn("min-h-11 px-4", disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer"),
              )}
            >
              {status === "done" || busy ? t("replace") : t("browse")}
            </label>
            {(status === "done" || busy) && (
              <button
                type="button"
                onClick={remove}
                disabled={disabled}
                className="inline-flex min-h-11 items-center px-1 text-base font-semibold text-danger underline-offset-4 hover:underline disabled:opacity-60"
              >
                {t("remove")}
                <span className="sr-only"> {label}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <p id={statusId} aria-live="polite" className={cn("text-sm font-medium", status === "done" ? "text-success" : "text-ink-muted")}>
        {busy ? t("uploading") : status === "done" ? t("uploaded") : ""}
      </p>
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

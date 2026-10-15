"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { ContactsIcon } from "@/components/icons";
import { importContacts, type ImportResult } from "../actions";
import type { PickedContact } from "../picked-contacts";

// Contact Picker API (Chrome sur Android) : absente des types TypeScript standard.
type ContactsManager = {
  select(properties: ("name" | "tel" | "email")[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
};

const noSubscribe = () => () => {};
const supported = () => "contacts" in navigator && "ContactsManager" in window;

// Import depuis le carnet d'adresses du téléphone : affiché seulement si le navigateur
// le permet (jamais au rendu serveur).
export function ContactImport() {
  const t = useTranslations("Contacts.import");
  const tAll = useTranslations();
  const locale = useLocale();
  const available = useSyncExternalStore(noSubscribe, supported, () => false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  if (!available) return null;

  async function pick() {
    setResult(null);
    let picked: PickedContact[];
    try {
      const contacts = (navigator as Navigator & { contacts: ContactsManager }).contacts;
      picked = await contacts.select(["name", "tel", "email"], { multiple: true });
    } catch {
      return; // Sélection annulée ou refusée.
    }
    if (picked.length === 0) return;
    startTransition(async () => {
      try {
        setResult(await importContacts(locale, picked));
      } catch {
        setResult({ imported: 0, skipped: 0, duplicates: 0, error: "unknown" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" block onClick={pick} disabled={pending} aria-busy={pending || undefined}>
        <ContactsIcon className="size-5" />
        {t("button")}
      </Button>
      <div aria-live="polite" className="flex flex-col gap-2">
        {result && !pending && (result.imported > 0 || !result.error) && (
          <Alert tone="success">
            {t("done", { count: result.imported })}
            {result.duplicates > 0 && ` ${t("duplicates", { count: result.duplicates })}`}
            {result.skipped > 0 && ` ${t("skipped", { count: result.skipped })}`}
          </Alert>
        )}
        {result?.error && !pending && <Alert tone="error">{formErrorMessage(tAll, result.error)}</Alert>}
      </div>
    </div>
  );
}

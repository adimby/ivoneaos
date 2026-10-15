"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/icons";
import { useHydrated } from "@/lib/use-hydrated";

// Copie du lien public. Sans presse-papiers (navigateur ancien, page non sécurisée) : le
// champ voisin reste sélectionnable à la main.
export function CopyLink({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      block
      disabled={!hydrated}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          (document.getElementById("public-link") as HTMLInputElement | null)?.select();
        }
      }}
    >
      {copied && <CheckIcon className="size-5" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}

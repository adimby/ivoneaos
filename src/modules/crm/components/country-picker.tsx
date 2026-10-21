"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { FieldControlProps } from "@/components/ui/field";
import { fieldControl } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { useHydrated } from "@/lib/use-hydrated";
import { resolveCountry, searchCountries, type Country } from "../countries";

type Entry = Country & { key: string };

// Choix du pays parmi tous les pays : champ de recherche (combobox WAI-ARIA, liste filtrée
// sans accents ni casse, par nom ou code), pays fréquents en tête. Avant le chargement du
// JavaScript (3G lente) : liste native complète, pays fréquents dans un premier groupe ; un
// pays choisi dans cette liste avant l'arrivée du JavaScript est gardé par la recherche.
// countries : tous les pays triés ; favourites : codes à proposer en tête (calculés par le serveur).
export function CountryPicker({
  control,
  name,
  defaultValue,
  countries,
  favourites,
}: {
  control: FieldControlProps;
  name: string;
  defaultValue: string;
  countries: Country[];
  favourites: string[];
}) {
  const t = useTranslations("Contacts.country");
  const hydrated = useHydrated();
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const favouriteList = useMemo(
    () => favourites.flatMap((code) => (byCode.has(code) ? [byCode.get(code)!] : [])),
    [favourites, byCode],
  );

  if (!hydrated) {
    return (
      <Select {...control} name={name} defaultValue={defaultValue}>
        {!byCode.has(defaultValue) && <option value={defaultValue}>{defaultValue}</option>}
        <optgroup label={t("favourites")}>
          {favouriteList.map(({ code, name: label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("all")}>
          {countries.map(({ code, name: label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </optgroup>
      </Select>
    );
  }

  return (
    <CountryCombobox
      control={control}
      name={name}
      defaultValue={defaultValue}
      countries={countries}
      favouriteList={favouriteList}
      byCode={byCode}
    />
  );
}

function CountryCombobox({
  control,
  name,
  defaultValue,
  countries,
  favouriteList,
  byCode,
}: {
  control: FieldControlProps;
  name: string;
  defaultValue: string;
  countries: Country[];
  favouriteList: Country[];
  byCode: Map<string, Country>;
}) {
  const t = useTranslations("Contacts.country");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Monté au moment où le JavaScript remplace la liste native, encore présente dans la page
  // pendant ce rendu : le pays qu'on y a choisi (3G lente) est repris, pas remis à zéro.
  const [selected, setSelected] = useState(() => {
    const native = document.getElementById(control.id);
    return native instanceof HTMLSelectElement && native.value ? native.value : defaultValue;
  });
  // null : pas de saisie en cours, le champ montre le pays choisi.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const searching = Boolean(query?.trim());
  const groups = useMemo(() => {
    if (searching) {
      return [{ label: null, entries: searchCountries(countries, query ?? "").map((c) => ({ ...c, key: c.code })) }];
    }
    return [
      { label: t("favourites"), entries: favouriteList.map((c) => ({ ...c, key: `fav-${c.code}` })) },
      { label: t("all"), entries: countries.map((c) => ({ ...c, key: c.code })) },
    ];
  }, [searching, query, countries, favouriteList, t]);
  const entries: Entry[] = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const optionId = (entry: Entry) => `${listId}-${entry.key}`;
  const activeEntry = open ? entries[active] : undefined;
  // Pays choisi annoncé une seule fois (il figure aussi dans les pays fréquents).
  const selectedKey = entries.find((e) => e.code === selected)?.key;
  // Saisie sans choix dans la liste (envoi direct, champ quitté) : le pays qu'elle désigne
  // sans ambiguïté est retenu ; sinon le pays reste vide, jamais l'ancien en silence.
  const typed = searching ? resolveCountry(countries, query ?? "") : null;
  const unresolved = searching && !typed;
  const value = searching ? (typed?.code ?? "") : selected;

  // Option active toujours visible dans la liste.
  useEffect(() => {
    if (!activeEntry) return;
    document.getElementById(`${listId}-${activeEntry.key}`)?.scrollIntoView({ block: "nearest" });
  }, [activeEntry, listId]);

  function openAt(code: string) {
    const index = entries.findIndex((e) => e.code === code);
    setActive(Math.max(index, 0));
    setOpen(true);
  }

  function choose(entry: Entry) {
    setSelected(entry.code);
    setQuery(null);
    setOpen(false);
  }

  function close() {
    setOpen(false);
    setQuery(null);
  }

  // Champ quitté : la saisie désigne un pays, il est choisi ; sinon elle reste affichée
  // avec un message (rien n'est remplacé sans le dire).
  function leave() {
    if (typed) choose({ ...typed, key: typed.code });
    else if (searching) setOpen(false);
    else close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = entries.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openAt(selected);
        else setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openAt(selected);
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
      case "End":
        if (!open) return;
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : Math.max(last, 0));
        break;
      case "Enter":
        // Liste ouverte : Entrée choisit, sans envoyer le formulaire.
        if (!open) return;
        event.preventDefault();
        if (activeEntry) choose(activeEntry);
        break;
      case "Escape":
        if (open || query !== null) {
          event.preventDefault();
          close();
        }
        break;
      case "Tab":
        leave();
        break;
    }
  }

  // Code hors liste (ancienne donnée) : affiché tel quel plutôt qu'un champ vide.
  const selectedName = byCode.get(selected)?.name ?? selected;
  const resultCount = searching ? entries.length : null;
  // Erreur du serveur déjà affichée sous le champ : pas de second message.
  const showPick = unresolved && !open && !control["aria-invalid"];
  const pickId = `${listId}-pick`;
  const describedBy = [control["aria-describedby"], showPick && pickId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          {...control}
          aria-describedby={describedBy}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeEntry ? optionId(activeEntry) : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          className={cn(fieldControl, "pr-12")}
          value={query ?? selectedName}
          onFocus={(event) => event.currentTarget.select()}
          onClick={() => !open && openAt(selected)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            // Clic dans la liste : le focus revient au champ (voir onMouseDown).
            if (!event.relatedTarget || !listRef.current?.contains(event.relatedTarget)) leave();
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("toggle")}
          aria-controls={listId}
          aria-expanded={open}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-muted"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) close();
            else {
              openAt(selected);
              inputRef.current?.focus();
            }
          }}
        >
          <svg className={cn("size-5 transition-transform", open && "rotate-180")} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={t("label")}
        hidden={!open || entries.length === 0}
        className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-sand-strong bg-white py-1"
        // Garde le focus dans le champ (clavier ouvert, saisie possible).
        onMouseDown={(event) => event.preventDefault()}
      >
        {groups.map((group, groupIndex) => (
          <div
            key={group.label ?? "results"}
            role="group"
            aria-labelledby={group.label ? `${listId}-g${groupIndex}` : undefined}
            aria-label={group.label ? undefined : t("label")}
          >
            {group.label && (
              <div
                id={`${listId}-g${groupIndex}`}
                role="presentation"
                className={cn(
                  "px-4 pt-2 pb-1 text-xs font-bold tracking-wide text-ink-muted uppercase",
                  groupIndex > 0 && "mt-1 border-t border-sand",
                )}
              >
                {group.label}
              </div>
            )}
            {group.entries.map((entry) => {
              const isActive = activeEntry?.key === entry.key;
              const isSelected = entry.code === selected;
              const isAnnounced = entry.key === selectedKey;
              return (
                <div
                  key={entry.key}
                  id={optionId(entry)}
                  role="option"
                  aria-selected={isAnnounced}
                  data-code={entry.code}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-base text-ink",
                    isActive && "bg-turquoise-soft",
                    isSelected && "font-semibold text-lagoon",
                  )}
                  onClick={() => choose(entry)}
                >
                  <span>{entry.name}</span>
                  {isSelected && (
                    <svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Nombre de résultats (ou saisie à préciser) annoncé aux lecteurs d'écran ; messages visibles dessous. */}
      <p className="sr-only" aria-live="polite">
        {open && resultCount !== null ? t("results", { count: resultCount }) : showPick ? t("pickFromList") : ""}
      </p>
      {open && resultCount === 0 && <p className="text-sm text-ink-muted">{t("noResult")}</p>}
      {showPick && (
        <p id={pickId} className="text-sm font-medium text-danger">
          {t("pickFromList")}
        </p>
      )}
    </div>
  );
}

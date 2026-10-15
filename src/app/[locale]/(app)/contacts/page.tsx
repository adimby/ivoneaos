import type { Metadata } from "next";
import Form from "next/form";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, ContactsIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fieldControl } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ContactImport } from "@/modules/crm/components/contact-import";
import { UndoBanner } from "@/modules/crm/components/undo-banner";
import { formatPhone } from "@/modules/crm/phone";
import { getContact, listContacts } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/contacts">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contacts" });
  return { title: t("metaTitle") };
}

// Contacts (menu « Plus ») : recherche, liste, import du téléphone, nouveau contact en bas.
export default async function ContactsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const archiveId = typeof query.archive === "string" ? query.archive : null;
  const [{ contacts, total }, archived, t] = await Promise.all([
    listContacts(workspace.id, q),
    archiveId ? getContact(workspace.id, archiveId) : null,
    getTranslations({ locale, namespace: "Contacts" }),
  ]);
  const isEmpty = total === 0 && !q;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {archived?.archived_at && (
        <UndoBanner
          kind="contact"
          id={archived.id}
          message={t("archived", { name: archived.name })}
          undoLabel={t("undo")}
          back="/contacts"
        />
      )}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
        {!q && !isEmpty && <span className="text-sm font-semibold text-ink-muted">{t("count", { count: total })}</span>}
      </div>

      {isEmpty ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <ContactsIcon className="size-10 text-turquoise" />
          <h2 className="text-lg font-bold text-lagoon">{t("empty.title")}</h2>
          <p className="text-base text-ink-muted">{t("empty.body")}</p>
        </Card>
      ) : (
        <>
          <Form action={`/${locale}/contacts`} role="search" className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              {t("searchLabel")}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              enterKeyHint="search"
              className={fieldControl}
            />
            <button type="submit" className={buttonClasses("secondary", false, "min-h-12 shrink-0 px-3")} aria-label={t("search")}>
              <SearchIcon className="size-5" />
            </button>
          </Form>

          {contacts.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-base text-ink-muted">{t("noResults", { query: q })}</p>
              <Link href="/contacts" className={buttonClasses("ghost", false, "px-0")}>
                {t("clearSearch")}
              </Link>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-2" aria-label={t("title")}>
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-white p-3 hover:border-lagoon"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-turquoise-soft text-base font-bold text-lagoon"
                      >
                        {contact.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-base font-semibold text-ink">{contact.name}</span>
                        <span className="truncate text-sm text-ink-muted">
                          {[contact.company_name, contact.phone ? formatPhone(contact.phone) : contact.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {contact.tags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {contact.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} tone="neutral">
                                {tag}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </span>
                      <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
              {total > contacts.length && (
                <p className="text-sm text-ink-muted" data-testid="contacts-truncated">
                  {t("truncated", { shown: contacts.length, total })}
                </p>
              )}
            </>
          )}
        </>
      )}

      <ContactImport />

      <BottomBar>
        <Link href="/contacts/nouveau" className={buttonClasses("primary", true)}>
          <PlusIcon className="size-5" />
          {t("new")}
        </Link>
      </BottomBar>
    </div>
  );
}

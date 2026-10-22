import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { dbErrorKey } from "@/lib/db-errors";
import { decideFiscalRequest } from "@/modules/verification/actions";
import { getAdminQueue, isPlatformAdmin } from "@/modules/verification/queries";
import { signedPhotoUrls } from "@/modules/verification/files";
import { formatAdminDate } from "@/modules/verification/view";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/admin/verifications/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("detailMetaTitle") };
}

// Demande en attente : numéros saisis, les deux photos (URL signées de 5 minutes, créées
// par le serveur après le contrôle admin fait par la base), puis « Valider » ou
// « Refuser » (motif obligatoire, montré au freelance). Une demande déjà traitée n'a plus
// de photos : 404.
export default async function AdminVerificationPage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  await requireWorkspace(locale);
  if (!(await isPlatformAdmin())) notFound();
  const request = (await getAdminQueue()).find((r) => r.id === id);
  if (!request) notFound();
  const query = await searchParams;
  const [[front, back], t] = await Promise.all([
    signedPhotoUrls([request.front_path, request.back_path]),
    getTranslations({ locale, namespace: "Admin" }),
  ]);
  const tAll = await getTranslations({ locale });
  const error = typeof query.erreur === "string" ? dbErrorKey({ message: query.erreur }) : null;
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={request.id} />
    </>
  );

  return (
    <div className="flex flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:content-start lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-2 lg:col-span-2">
        <Link href="/admin/verifications" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
          ← {t("backToList")}
        </Link>
        <h1 className="text-2xl font-bold break-words text-lagoon">{request.workspace_name}</h1>
        <p className="text-sm text-ink-muted">{t("submittedAt", { date: formatAdminDate(request.created_at, locale) })}</p>
        {error && <Alert tone="error">{tAll(`errors.db.${error}`)}</Alert>}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t("compare")}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-base">
            <dt className="font-semibold text-ink">{t("nif")}</dt>
            <dd className="font-mono break-all text-ink" data-testid="admin-nif">
              {request.nif}
            </dd>
            <dt className="font-semibold text-ink">{t("stat")}</dt>
            <dd className="font-mono break-all text-ink" data-testid="admin-stat">
              {request.stat}
            </dd>
          </dl>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { label: t("front"), url: front },
            { label: t("back"), url: back },
          ].map(({ label, url }) => (
            <figure key={label} className="flex flex-col gap-2">
              <figcaption className="text-sm font-semibold text-ink">{label}</figcaption>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-sand bg-surface">
                  {/* URL signée du bucket privé (5 min) : pas d'optimisation next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={t("photoAlt", { side: label, name: request.workspace_name })} className="h-auto w-full object-contain" />
                </a>
              ) : (
                <p className="rounded-xl bg-sand-light p-4 text-sm text-ink-muted">{t("photoMissing")}</p>
              )}
            </figure>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-10">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-lagoon">{t("decideTitle")}</h2>
          <form action={decideFiscalRequest}>
            {hidden}
            <input type="hidden" name="decision" value="verify" />
            <SubmitButton block data-testid="admin-verify">
              {t("approve")}
            </SubmitButton>
          </form>
        </Card>
        <Card className="flex flex-col gap-3">
          <form action={decideFiscalRequest} className="flex flex-col gap-3">
            {hidden}
            <input type="hidden" name="decision" value="reject" />
            <Field
              id="reason"
              label={t("reason")}
              hint={t("reasonHint")}
              error={error === "fiscal_reason_required" ? tAll("errors.db.fiscal_reason_required") : undefined}
            >
              {(control) => <Textarea {...control} name="reason" rows={3} required maxLength={500} />}
            </Field>
            <SubmitButton variant="secondary" block data-testid="admin-reject">
              {t("reject")}
            </SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}

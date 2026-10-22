import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { LanguageSwitch } from "@/components/language-switch";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { safeNextPath } from "@/modules/auth/next-path";
import { LoginForm } from "@/modules/auth/components/login-form";

type Props = PageProps<"/[locale]/connexion">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("metaTitle") };
}

// Le formulaire fait partie de la page statique (affiché tout de suite) ; seuls le retour
// après connexion (?next=) et le choix de langue (?langue=1) se lisent à la requête,
// dans de petits îlots.
export default async function ConnexionPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-chrome pt-safe text-on-chrome">
        <div className="px-safe mx-auto flex h-16 w-full max-w-md items-center justify-between md:max-w-6xl md:px-8">
          <Link href="/" className="rounded-lg">
            <Brand />
          </Link>
        </div>
      </header>
      {/* Tablette et ordinateur : carte centrée, pas une colonne de téléphone étirée. */}
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-6 pb-safe md:max-w-lg md:justify-center md:py-12">
        <div className="flex flex-1 flex-col gap-6 md:flex-none md:rounded-card md:border md:border-sand/70 md:bg-sand-light md:p-8 md:shadow-card">
          <div className="flex justify-end">
            <Suspense fallback={<LanguageSwitch current={locale} href={`/connexion?${CHOSEN}=1`} />}>
              <LanguageLinks locale={locale} searchParams={searchParams} />
            </Suspense>
          </div>
          <div className="flex flex-1 flex-col pb-6 md:pb-0">
            <LoginForm
              locale={locale}
              nextField={
                <Suspense>
                  <RequestFields searchParams={searchParams} />
                </Suspense>
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// Marque d'un choix de langue explicite sur cette page (lien de langue) : la langue
// choisie remplace alors celle du profil à la connexion.
const CHOSEN = "langue";

async function readNext(searchParams: Props["searchParams"]) {
  const raw = (await searchParams).next;
  return safeNextPath(typeof raw === "string" ? raw : null);
}

async function RequestFields({ searchParams }: { searchParams: Props["searchParams"] }) {
  const [next, chosen] = await Promise.all([readNext(searchParams), searchParams.then((p) => p[CHOSEN] === "1")]);
  return (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {chosen && <input type="hidden" name="locale_chosen" value="1" />}
    </>
  );
}

async function LanguageLinks({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const next = await readNext(searchParams);
  const query = new URLSearchParams({ ...(next && { next }), [CHOSEN]: "1" });
  return <LanguageSwitch current={locale} href={`/connexion?${query}`} />;
}

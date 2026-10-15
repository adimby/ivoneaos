import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/routing";

// Même cookie que next-intl (NEXT_LOCALE) : « / » ouvre ensuite la bonne langue.
export async function rememberLocale(locale: Locale) {
  (await cookies()).set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

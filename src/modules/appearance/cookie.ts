import "server-only";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, APPEARANCE_COOKIE_MAX_AGE, parseAppearance, serializeAppearance, type Appearance } from "./preference";

// Cookie lu par le script de tête (pas httpOnly : rien de sensible, seulement le thème).
export async function rememberAppearance(appearance: Appearance) {
  (await cookies()).set(APPEARANCE_COOKIE, serializeAppearance(appearance), {
    path: "/",
    maxAge: APPEARANCE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

export async function forgetAppearance() {
  (await cookies()).delete(APPEARANCE_COOKIE);
}

export async function readAppearanceCookie(): Promise<Appearance & { present: boolean }> {
  const value = (await cookies()).get(APPEARANCE_COOKIE)?.value;
  return { ...parseAppearance(value), present: value !== undefined };
}

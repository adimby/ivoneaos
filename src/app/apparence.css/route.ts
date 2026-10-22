import { readAppearanceCookie } from "@/modules/appearance/cookie";
import { rootThemeCss } from "@/modules/appearance/themes";

// Sans JavaScript seulement (<noscript> des pages connectées) : la palette du cookie
// ivn_apparence posée sur :root. Avec JavaScript, le script de tête s'en charge sans
// requête supplémentaire.
export async function GET() {
  const { mode, palette } = await readAppearanceCookie();
  return new Response(rootThemeCss(mode, palette), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "private, no-cache",
      Vary: "Cookie",
    },
  });
}

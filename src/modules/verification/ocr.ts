import "server-only";
import path from "node:path";
import { createWorker } from "tesseract.js";

// Lecture du texte des photos de la carte fiscale, côté serveur seulement (le résultat
// décide du statut : il doit être de confiance). tesseract.js (Apache 2.0), modèle
// anglais LSTM « best_int » (@tesseract.js-data/eng, Apache 2.0) livré avec l'application
// et lu sur le disque : aucun téléchargement à l'exécution, aucun cache écrit (disque en
// lecture seule sur Vercel). Fichiers inclus dans la fonction par outputFileTracingIncludes
// (next.config.ts).
const LANG_PATH = path.join(process.cwd(), "node_modules/@tesseract.js-data/eng/4.0.0_best_int");
const OEM_LSTM_ONLY = 1;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

// Texte de chaque image, ou null si la lecture échoue ou dépasse timeoutMs (le worker est
// alors arrêté). Le texte n'est jamais journalisé ni conservé.
export async function readCardTexts(images: Uint8Array[], timeoutMs: number): Promise<string[] | null> {
  let stopped = false;
  let worker: OcrWorker | null = null;
  const stop = async () => {
    stopped = true;
    const running: OcrWorker | null = worker;
    worker = null;
    await running?.terminate().catch(() => {});
  };

  const job = (async () => {
    const created = await createWorker("eng", OEM_LSTM_ONLY, {
      langPath: LANG_PATH,
      gzip: true,
      cacheMethod: "none",
      errorHandler: () => {},
    });
    if (stopped) {
      await created.terminate().catch(() => {});
      return null;
    }
    worker = created;
    const texts: string[] = [];
    for (const image of images) {
      const { data } = await created.recognize(Buffer.from(image), { rotateAuto: true });
      texts.push(data.text ?? "");
    }
    return texts;
  })().catch((error: unknown) => {
    if (!stopped) console.error("[verification] lecture automatique impossible", error instanceof Error ? error.message : "");
    return null;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[verification] lecture automatique arrêtée après ${timeoutMs} ms`);
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    clearTimeout(timer);
    await stop();
  }
}

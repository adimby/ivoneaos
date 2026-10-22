import "server-only";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

// Lecture du texte des photos de la carte fiscale, côté serveur seulement (le résultat
// décide du statut : il doit être de confiance). tesseract.js (Apache 2.0), modèle
// anglais LSTM « best_int » (@tesseract.js-data/eng, Apache 2.0) livré avec l'application
// et lu sur le disque : aucun téléchargement à l'exécution, aucun cache écrit (disque en
// lecture seule sur Vercel). Fichiers inclus dans la fonction par outputFileTracingIncludes
// (next.config.ts).
const LANG_PATH = path.join(process.cwd(), "node_modules/@tesseract.js-data/eng/4.0.0_best_int");
const OEM_LSTM_ONLY = 1;

// Photo de téléphone : redressée selon son EXIF (tous les boutismes, ce que tesseract ne
// fait pas), réduite (lecture plus rapide, assez nette pour des chiffres) et en gris.
const MAX_SIDE = 2000;
// Si rien ne concorde à l'endroit : photo prise de côté ou à l'envers.
const RETRY_ANGLES = [90, 180, 270] as const;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

export async function normalizeImage(image: Uint8Array): Promise<Buffer> {
  return sharp(image)
    .autoOrient()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .toColourspace("b-w")
    .png({ compressionLevel: 1 })
    .toBuffer();
}

async function rotated(image: Buffer, angle: number): Promise<Buffer> {
  return sharp(image).rotate(angle).png({ compressionLevel: 1 }).toBuffer();
}

// Texte lu sur les photos : chaque photo à l'endroit, puis, tant que `enough` ne
// l'accepte pas et que le délai le permet, tournée de 90°, 180° et 270°. Renvoie tous les
// textes lus avant l'arrêt (délai dépassé compris), ou null si rien n'a pu être lu. Le
// texte n'est jamais journalisé ni conservé.
export async function readCardTexts(
  images: Uint8Array[],
  timeoutMs: number,
  enough: (texts: string[]) => boolean,
): Promise<string[] | null> {
  let stopped = false;
  let worker: OcrWorker | null = null;
  const texts: string[] = [];
  const stop = async () => {
    stopped = true;
    const running: OcrWorker | null = worker;
    worker = null;
    await running?.terminate().catch(() => {});
  };

  const job = (async () => {
    const pages = await Promise.all(images.map(normalizeImage));
    const created = await createWorker("eng", OEM_LSTM_ONLY, {
      langPath: LANG_PATH,
      gzip: true,
      cacheMethod: "none",
      errorHandler: () => {},
    });
    if (stopped) {
      await created.terminate().catch(() => {});
      return;
    }
    worker = created;
    const read = async (page: Buffer) => {
      const { data } = await created.recognize(page, { rotateAuto: true });
      if (!stopped) texts.push(data.text ?? "");
    };
    for (const page of pages) await read(page);
    for (const angle of RETRY_ANGLES) {
      if (stopped || enough(texts)) return;
      for (const page of pages) {
        if (stopped) return;
        await read(await rotated(page, angle));
      }
    }
  })().catch((error: unknown) => {
    if (!stopped) console.error("[verification] lecture automatique impossible", error instanceof Error ? error.message : "");
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[verification] lecture automatique arrêtée après ${timeoutMs} ms`);
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([job, timeout]);
    return texts.length ? [...texts] : null;
  } finally {
    clearTimeout(timer);
    await stop();
  }
}

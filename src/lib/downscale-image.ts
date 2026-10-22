// Réduction d'une photo dans le navigateur avant l'envoi : une photo de téléphone récent
// (50 ou 108 Mpx, souvent plus de 10 Mo) devient un JPEG d'au plus `maxSide` pixels de
// côté, redressé selon son EXIF. Moins de données à envoyer sur une connexion lente, et
// sous la limite de taille. Image illisible par le navigateur, navigateur trop ancien ou
// mémoire insuffisante : le fichier d'origine est renvoyé tel quel (les contrôles de taille
// et de type s'appliquent ensuite comme avant).
export async function downscaleImage(file: File, maxSide: number, quality: number): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    // Fond blanc : une zone transparente (PNG) deviendrait noire en JPEG.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^./]*$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

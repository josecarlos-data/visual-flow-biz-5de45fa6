/**
 * Reducción de imágenes antes de mandarlas a la IA.
 * Una foto de móvil sin reducir son ~6,7 MB de base64 por petición: inviable con datos móviles.
 */

/** Escala la imagen hasta que su lado mayor sea `maxLado` y la exporta a JPEG. Si no es imagen, la devuelve tal cual. */
export async function reducirImagen(file: File, maxLado = 1600, calidad = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se ha podido leer la imagen"));
      el.src = url;
    });

    const lado = Math.max(img.naturalWidth, img.naturalHeight);
    const escala = lado > maxLado ? maxLado / lado : 1; // nunca se amplía
    const ancho = Math.round(img.naturalWidth * escala);
    const alto = Math.round(img.naturalHeight * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", calidad),
    );
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Data URL completo ("data:image/jpeg;base64,…"). */
export async function aBase64(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se ha podido codificar la imagen"));
    fr.readAsDataURL(blob);
  });
}

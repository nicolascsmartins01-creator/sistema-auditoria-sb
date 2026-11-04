"use client";

/**
 * Reduz a foto no próprio aparelho antes do envio (lado maior até 1600 px,
 * JPEG ~80%). Um comprovante de caixa continua legível e o envio fica rápido.
 * A foto é apenas comprovante: nada é lido automaticamente dela.
 */
export const LADO_MAXIMO = 1600;

export async function reduzirFoto(arquivo: File | Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala);
    const h = Math.round(bmp.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob ?? arquivo;
  } catch {
    return arquivo; // formato que o navegador não abre: envia como está
  }
}

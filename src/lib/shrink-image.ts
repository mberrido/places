"use client";

/**
 * Downscales a photo in the browser before upload (long edge 1568px, JPEG), so
 * a 4 MB iPhone screenshot goes up as ~300 KB. Falls back to the original file
 * if the browser can't decode it (e.g. HEIC on desktop Chrome); the server
 * normalises it either way.
 */
export async function shrinkImage(file: File, maxEdge = 1568): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

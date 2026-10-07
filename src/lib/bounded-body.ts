import "server-only";

/**
 * Reads a request body up to `maxBytes` and returns it as a Response, so the
 * usual .formData() / .json() / .text() work on it. Null if it's bigger. The
 * Content-Length header alone isn't enough: a chunked upload doesn't send one.
 */
export async function boundedBody(req: Request, maxBytes: number): Promise<Response | null> {
  if (Number(req.headers.get("content-length")) > maxBytes) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "content-type": req.headers.get("content-type") ?? "application/octet-stream" },
  });
}

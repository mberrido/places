import { ImageResponse } from "next/og";
import { PinMark } from "@/components/pin-mark";

export function generateImageMetadata() {
  return [192, 512].map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<PinMark size={size} />, { width: size, height: size });
}

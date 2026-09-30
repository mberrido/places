import { ImageResponse } from "next/og";
import { PinMark } from "@/components/pin-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<PinMark size={180} />, size);
}

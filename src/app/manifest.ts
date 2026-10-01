import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Places",
    short_name: "Places",
    description: "Places we want to go",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4f0",
    theme_color: "#2f4a36",
    // Android share sheet → /share (iOS doesn't support this; it uses the Shortcut).
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

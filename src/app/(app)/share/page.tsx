import { redirect } from "next/navigation";

// Entry point for the desktop bookmarklet and Android's share sheet (Web Share
// Target in the manifest). Prefills the link box; the user taps to start,
// so a crafted link can't spend API calls on its own.
export default async function SharePage(props: PageProps<"/share">) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const input = pick("url") || pick("text") || pick("title");
  redirect(`/add?tab=link${input ? `&url=${encodeURIComponent(input.slice(0, 5000))}` : ""}`);
}

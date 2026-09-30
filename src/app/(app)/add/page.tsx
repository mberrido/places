import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { allTags, getCategories } from "@/lib/places";
import { googleConfigured } from "@/lib/google";
import { AddPlace } from "./add-place";

export const metadata = { title: "Add a place" };

export default async function AddPage(props: PageProps<"/add">) {
  await connection(); // categories and tags come from the DB at request time
  const { accountId } = await requireSession();
  const sp = await props.searchParams;
  return (
    <AddPlace
      categories={getCategories(accountId)}
      tags={allTags(accountId)}
      googleEnabled={googleConfigured()}
      initialQuery={typeof sp.q === "string" ? sp.q : ""}
      initialTab={sp.tab === "instagram" || sp.tab === "nearby" ? sp.tab : "search"}
      initialLink={typeof sp.url === "string" ? sp.url : ""}
    />
  );
}

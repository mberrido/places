import { Suspense } from "react";
import { PlacesBrowser } from "@/components/browse/places-browser";
import { requireSession } from "@/lib/auth";
import { allTags, getCategories, listSummaries } from "@/lib/places";

export default async function PlacesPage(props: PageProps<"/">) {
  await props.searchParams; // filtering happens client-side; this just keeps the page dynamic
  const { accountId } = await requireSession();
  return (
    <Suspense>
      <PlacesBrowser
        places={listSummaries(accountId)}
        categories={getCategories(accountId)}
        tags={allTags(accountId)}
      />
    </Suspense>
  );
}

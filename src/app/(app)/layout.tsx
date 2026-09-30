import { connection } from "next/server";
import { BottomNav } from "@/components/bottom-nav";
import { requireSession } from "@/lib/auth";
import { inboxCount } from "@/lib/ingest";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection(); // reads the DB (inbox count), so never prerender
  const { accountId } = await requireSession();
  return (
    <>
      <div
        className="mx-auto max-w-2xl px-4"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)",
        }}
      >
        {children}
      </div>
      <BottomNav inboxCount={inboxCount(accountId)} />
    </>
  );
}

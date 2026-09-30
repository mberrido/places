import { db } from "@/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    db().$client.prepare("select 1").get();
    return Response.json({ ok: true, version: process.env.APP_VERSION ?? "dev" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

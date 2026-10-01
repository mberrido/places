"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "Places", match: (p) => p === "/" || p.startsWith("/places") },
  { href: "/inbox", label: "Inbox", match: (p) => p.startsWith("/inbox") },
  { href: "/settings", label: "Settings", match: (p) => p.startsWith("/settings") },
];

/** Floating ink pill: text links, plus the accent Add button. */
export function BottomNav({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  const adding = pathname.startsWith("/add");
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 px-4"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
    >
      <div className="mx-auto flex h-16 max-w-xl items-center justify-between rounded-full bg-ink pl-5 pr-2 shadow-lg ring-1 ring-border">
        {LINKS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`px-2 py-2.5 text-sm ${active ? "font-semibold text-on-ink" : "text-on-ink-muted"}`}
            >
              {item.label}
              {item.href === "/inbox" && inboxCount > 0 && <span className="tabular-nums"> · {inboxCount}</span>}
            </Link>
          );
        })}
        <Link
          href="/add"
          aria-current={adding ? "page" : undefined}
          className="flex h-12 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent"
        >
          <Icon name="plus" className="size-4" />
          Add
        </Link>
      </div>
    </nav>
  );
}

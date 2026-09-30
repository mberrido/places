"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Places", icon: "list", match: (p) => p === "/" || p.startsWith("/places") },
  { href: "/add", label: "Add", icon: "plus", match: (p) => p.startsWith("/add") },
  { href: "/inbox", label: "Inbox", icon: "camera", match: (p) => p.startsWith("/inbox") },
  { href: "/settings", label: "Settings", icon: "settings", match: (p) => p.startsWith("/settings") },
];

export function BottomNav({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-2xl">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {item.href === "/add" ? (
                  <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                    <Icon name="plus" className="size-5" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon name={item.icon} className="size-6" />
                    {item.href === "/inbox" && inboxCount > 0 && (
                      <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-on-accent">
                        {inboxCount}
                      </span>
                    )}
                  </span>
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

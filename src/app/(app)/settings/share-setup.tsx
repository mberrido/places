"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { newIngestToken, revealIngestToken } from "./account-actions";

export function ShareSetup({ origin }: { origin: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endpoint = `${origin}/api/ingest`;
  const bookmarklet = `javascript:(()=>{window.open(${JSON.stringify(`${origin}/share?url=`)}+encodeURIComponent(location.href),'_blank')})()`;
  // React refuses to render javascript: URLs, so set the bookmarklet's href directly.
  const bookmarkletLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmarkletLink.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet]);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
      <div>
        <p className="font-semibold">iPhone Shortcut</p>
        <p className="text-muted">
          Lets you share a post (or a screenshot) from Instagram straight to the inbox. Setup steps are in the README.
        </p>
      </div>
      <Row label="Endpoint" value={endpoint} onCopy={() => copy("endpoint", endpoint)} copied={copied === "endpoint"} />
      {token ? (
        <>
          <Row label="Token (this household's)" value={token} onCopy={() => copy("token", token)} copied={copied === "token"} secret />
          <button
            disabled={pending}
            onClick={() => {
              if (confirm("Make a new token? The Shortcut will stop working until you paste the new one into it."))
                start(async () => setToken(await newIngestToken()));
            }}
            className="self-start text-xs font-medium text-muted underline underline-offset-2"
          >
            Make a new token
          </button>
        </>
      ) : (
        <button
          disabled={pending}
          onClick={() => start(async () => setToken(await revealIngestToken()))}
          className="self-start rounded-lg border border-border px-3 py-1.5 font-medium"
        >
          Show token
        </button>
      )}

      <div className="border-t border-border pt-3">
        <p className="font-semibold">Desktop bookmarklet</p>
        <p className="text-muted">
          Drag this to your bookmarks bar. On an Instagram post or profile, click it to send the page here.
        </p>
        <a
          ref={bookmarkletLink}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-semibold text-on-accent"
        >
          📍 Save to Places
        </a>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  secret,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  secret?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 ${secret ? "select-all" : ""}`}>
          {value}
        </code>
        <button onClick={onCopy} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 font-medium">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

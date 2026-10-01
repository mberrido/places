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
          Adds <strong>Save to Places</strong> to the share sheet, so you can send an Instagram post or any web page
          straight to the Inbox. Set it up once in the <strong>Shortcuts</strong> app (about 2 minutes):
        </p>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-muted marker:font-semibold marker:text-text">
          <li>
            Tap <strong>+</strong> for a new shortcut and rename it <strong>Save to Places</strong> (tap the name at
            the top).
          </li>
          <li>
            Tap the <strong>ⓘ</strong> button and turn on <strong>Show in Share Sheet</strong>. Back in the editor,
            tap the blue <strong>Any</strong> on the first line and leave only <strong>URLs</strong> and{" "}
            <strong>Text</strong> ticked.
          </li>
          <li>
            Search for and add <strong>Get Contents of URL</strong>. Tap <strong>URL</strong> and paste the
            Address below.
          </li>
          <li>
            Tap the <strong>›</strong> arrow on that action:
            <ul className="mt-1 list-disc pl-4">
              <li>
                Method: <strong>POST</strong>
              </li>
              <li>
                Headers → <strong>Add new header</strong>: key <code>Authorization</code>, text{" "}
                <code>Bearer</code>, a space, then your Token below.
              </li>
              <li>
                Request Body: <strong>JSON</strong> → <strong>Add new field</strong> → <strong>Text</strong>: key{" "}
                <code>input</code>, and for the text tap <strong>Select Variable</strong> →{" "}
                <strong>Shortcut Input</strong>.
              </li>
            </ul>
          </li>
          <li>
            Add <strong>Get Dictionary Value</strong>: set the key to <code>message</code>.
          </li>
          <li>
            Add <strong>Show Notification</strong> and set its text to <strong>Dictionary Value</strong>. Tap{" "}
            <strong>Done</strong>.
          </li>
        </ol>
        <p className="mt-2 text-muted">
          To use it: in Instagram tap <strong>Share</strong> on a post (or <strong>···</strong> on a profile), or the
          share button in Safari, and pick <strong>Save to Places</strong>. You should see &ldquo;Sent to the Places
          inbox&rdquo;. If it isn&apos;t in the list, scroll the apps row to <strong>More</strong> and add it. For
          screenshots, use <strong>Upload a screenshot</strong> under Add → Link.
        </p>
      </div>
      <Row label="Address" value={endpoint} onCopy={() => copy("endpoint", endpoint)} copied={copied === "endpoint"} />
      {token ? (
        <>
          <Row label="Token (your group's; keep it private)" value={token} onCopy={() => copy("token", token)} copied={copied === "token"} secret />
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
          Drag this to your bookmarks bar. On an Instagram post or any web page, click it to send the page here.
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

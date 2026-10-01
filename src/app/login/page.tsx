import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { googleLoginConfigured } from "@/lib/google-auth";
import { Icon } from "@/components/icons";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was opened in another browser. Try again.",
  google: "Google couldn't sign you in. If you're new, ask for your Google address to be added as a test user.",
  not_allowed: "That Google account isn't allowed on this server. Ask to be added to ALLOWED_EMAILS.",
  config: "Google sign-in isn't set up on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
};

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? ERRORS.google) : null;
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-on-accent">
        <Icon name="pin" className="size-7" />
      </span>
      <h1 className="font-display text-[56px] leading-none">Places</h1>
      <p className="mt-2 text-muted">Somewhere we want to go.</p>

      {/* A plain link: the route sends the browser on to Google. */}
      <a
        href="/api/auth/google"
        className="mt-10 flex h-14 items-center justify-center gap-3 rounded-full bg-ink font-semibold text-on-ink"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        Sign in with Google
      </a>
      {!googleLoginConfigured() && <p className="mt-3 text-sm text-danger">{ERRORS.config}</p>}
      {message && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {message}
        </p>
      )}
    </main>
  );
}

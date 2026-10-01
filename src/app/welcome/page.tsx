import { redirect } from "next/navigation";
import { claimableGroups } from "@/lib/accounts";
import { getUser } from "@/lib/auth";
import { ClaimButton, CreateGroupForm, JoinGroupForm } from "./welcome-forms";
import { logout } from "../login/actions";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.accountId) redirect("/");
  const first = user.givenName ?? user.name;
  const claimable = claimableGroups(user.id);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 48px)" }}
    >
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Welcome</span>
        <h1 className="font-display text-[48px] leading-none">Hi {first}</h1>
        <p className="text-muted">
          Places are kept in groups: you and the people you plan trips with. Start one, or join one with its code.
        </p>
      </header>

      {claimable.map((g) => (
        <section key={g.id} className="flex flex-col gap-3 rounded-3xl bg-ink p-5 text-on-ink">
          <h2 className="font-display text-[26px] leading-tight">Carry on with your places</h2>
          <p className="text-sm text-on-ink-muted">
            &ldquo;{g.name}&rdquo; already has {g.places} {g.places === 1 ? "place" : "places"} from before Google
            sign-in. You&apos;re the first to sign in, so it&apos;s yours.
          </p>
          <ClaimButton accountId={g.id} />
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-[26px] leading-tight">Start a new group</h2>
        <CreateGroupForm placeholder={`e.g. ${first}'s places`} />
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-[26px] leading-tight">Join a group</h2>
        <p className="text-sm text-muted">Ask someone in the group for its code. It&apos;s in their Settings.</p>
        <JoinGroupForm />
      </section>

      <form action={logout} className="text-center text-sm text-muted">
        Signed in as {user.email}.{" "}
        <button className="underline underline-offset-2">Use a different account</button>
      </form>
    </main>
  );
}

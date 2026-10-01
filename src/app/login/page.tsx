import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getSession()) redirect("/");
  const { next } = await props.searchParams;
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-white">
        <Icon name="pin" className="size-7" />
      </span>
      <h1 className="font-display text-[44px] leading-none">Places</h1>
      <p className="mt-1 text-muted">Somewhere we want to go.</p>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}

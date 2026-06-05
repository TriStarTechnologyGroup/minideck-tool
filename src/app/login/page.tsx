import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in — Minideck Tool" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-1">
        <p className="text-sm font-medium text-neutral-500">TriStar Technology Group</p>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      </header>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

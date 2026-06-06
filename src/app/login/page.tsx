import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in — Minideck Tool" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tristar-logo.svg" alt="TriStar Technology Group" className="h-8 w-auto" />
          <h1 className="mt-6 text-2xl">Minideck Tool</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to continue</p>
        </div>
        <div className="card p-6">
          <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

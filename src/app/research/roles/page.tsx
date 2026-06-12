import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import RolesManager, { type TargetRole } from "./roles-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decision-maker roles — Minideck" };

export default async function RolesPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("target_roles")
    .select("id, function, title_keywords, seniority_floor, priority, active")
    .order("priority", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="mt-1 text-3xl">Decision-maker roles</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The buyer personas TriStar wants to reach inside a customer org. These drive who we pull &amp;
          enrich as contacts, how contact relevance is scored, and which people surface on opportunities.
          {profile.role === "admin" ? " Add, edit, and remove roles." : " View-only — ask an admin to make changes."}
        </p>
      </header>
      <RolesManager roles={(data ?? []) as TargetRole[]} isAdmin={profile.role === "admin"} />
    </main>
  );
}

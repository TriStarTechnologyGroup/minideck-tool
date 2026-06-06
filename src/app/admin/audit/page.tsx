import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log — Minideck Admin" };

type Entry = {
  created_at: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
};

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("created_at, actor_email, action, target_type, target, detail")
    .order("created_at", { ascending: false })
    .limit(200);
  const entries = (data ?? []) as Entry[];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">Audit log</h1>
        <p className="mt-1 text-sm text-ink-muted">Recent admin, user, deck, and link actions (latest 200).</p>
      </header>

      {entries.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-ink-muted">No audit entries yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e, i) => (
                <tr key={i} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{e.actor_email ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="chip bg-surface-muted text-ink">{e.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    {e.target_type ? `${e.target_type}: ` : ""}
                    <span className="text-ink">{e.target ?? "—"}</span>
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <code className="ml-2 text-xs text-ink-muted/70">{JSON.stringify(e.detail)}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

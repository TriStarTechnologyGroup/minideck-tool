import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/admin-users";
import UsersPanel from "./users-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — Minideck Admin" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">Users</h1>
        <p className="mt-1 text-sm text-ink-muted">Create, role, reset, and remove team members.</p>
      </header>
      <UsersPanel users={users} meId={me.id} />
    </main>
  );
}

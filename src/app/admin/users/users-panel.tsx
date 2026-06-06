"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import CopyButton from "@/components/copy-button";

type Role = "user" | "admin";
type AdminUser = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
};

export default function UsersPanel({ users, meId }: { users: AdminUser[]; meId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // One-time credential to surface after create/reset.
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setCred(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) {
      setError(json.error || "Could not create user");
      return;
    }
    setCred({ email: json.email, password: json.tempPassword });
    toast(`User ${json.email} created`);
    setEmail("");
    setRole("user");
    router.refresh();
  }

  async function changeRole(id: string, newRole: Role) {
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.error || "Role change failed");
      return;
    }
    toast("Role updated");
    router.refresh();
  }

  async function resetPw(id: string, userEmail: string) {
    setBusyId(id);
    setCred(null);
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      toast(json.error || "Reset failed");
      return;
    }
    setCred({ email: userEmail, password: json.tempPassword });
    toast(`Password reset for ${userEmail}`);
  }

  async function removeUser(id: string, userEmail: string) {
    if (!confirm(`Remove ${userEmail}? This deletes their account and access.`)) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.error || "Remove failed");
      return;
    }
    toast(`Removed ${userEmail}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Add user */}
      <form onSubmit={addUser} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <label className="field-label">New user email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@tristargroup.us"
            className="input"
          />
        </div>
        <div className="space-y-1.5">
          <label className="field-label">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button type="submit" disabled={adding} className="btn btn-primary">
          {adding ? "Creating…" : "Add user"}
        </button>
        {error && <p className="w-full rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      </form>

      {/* One-time credential */}
      {cred && (
        <div className="card flex flex-wrap items-center gap-3 border-l-4 border-l-primary bg-surface-blue p-4">
          <div className="text-sm">
            <p className="font-medium text-ink">Temporary password for {cred.email}</p>
            <p className="text-ink-muted">Share securely — shown once. They should change it after first login.</p>
          </div>
          <code className="rounded-sm bg-surface px-2 py-1 text-sm text-ink">{cred.password}</code>
          <CopyButton value={cred.password} label="Copy password" />
          <button type="button" onClick={() => setCred(null)} className="btn btn-ghost btn-xs ml-auto">
            Dismiss
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Last sign in</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => {
              const isSelf = u.id === meId;
              return (
                <tr key={u.id} className="align-middle">
                  <td className="px-4 py-2.5 text-ink">
                    {u.email}
                    {isSelf && <span className="ml-2 chip bg-surface-muted text-ink-muted">you</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      disabled={isSelf || busyId === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      className="input w-28 py-1 disabled:opacity-60"
                      title={isSelf ? "You can’t change your own role" : undefined}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "never"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => resetPw(u.id, u.email)}
                        disabled={busyId === u.id}
                        className="btn btn-ghost btn-xs"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUser(u.id, u.email)}
                        disabled={isSelf || busyId === u.id}
                        className="btn btn-danger btn-xs disabled:opacity-40"
                        title={isSelf ? "You can’t remove yourself" : undefined}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

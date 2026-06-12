"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TargetRole = {
  id: string; function: string; title_keywords: string | null; seniority_floor: string | null; priority: number; active: boolean;
};

const ic = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";

export default function RolesManager({ roles, isAdmin }: { roles: TargetRole[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {isAdmin && !adding && <button type="button" className="btn btn-secondary btn-xs self-start" onClick={() => setAdding(true)}>+ Add role</button>}
      {adding && <RoleForm role={null} onDone={() => setAdding(false)} />}
      {roles.map((r) => <RoleCard key={r.id} role={r} isAdmin={isAdmin} />)}
      {roles.length === 0 && !adding && <p className="card px-6 py-8 text-center text-sm text-ink-muted">No roles defined yet.</p>}
    </div>
  );
}

function RoleCard({ role, isAdmin }: { role: TargetRole; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <RoleForm role={role} onDone={() => setEditing(false)} />;
  return (
    <div className={`card p-3 text-sm ${role.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{role.function}</span>
        {role.seniority_floor && <span className="chip bg-surface-muted text-nav text-[0.6rem]">{role.seniority_floor}</span>}
        <span className="chip bg-surface-blue-soft text-link text-[0.6rem]">priority {role.priority}</span>
        {!role.active && <span className="chip bg-surface-muted text-ink-muted/70 text-[0.6rem]">inactive</span>}
        {isAdmin && <button type="button" className="ml-auto text-xs text-link hover:underline" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {role.title_keywords && <p className="mt-1 text-xs text-ink-muted">Matches: {role.title_keywords}</p>}
    </div>
  );
}

function RoleForm({ role, onDone }: { role: TargetRole | null; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    function: role?.function ?? "", title_keywords: role?.title_keywords ?? "", seniority_floor: role?.seniority_floor ?? "",
    priority: role?.priority != null ? String(role.priority) : "50", active: role?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof v, val: string | boolean) => setV((s) => ({ ...s, [k]: val }));

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch("/api/research/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { onDone(); router.refresh(); } else alert((await r.json().catch(() => ({}))).error || "Failed");
  }
  const data = () => ({ function: v.function, title_keywords: v.title_keywords || null, seniority_floor: v.seniority_floor || null, priority: Number(v.priority) || 0, active: v.active });

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 text-xs text-ink-muted">Function<input className={ic} value={v.function} onChange={(e) => upd("function", e.target.value)} placeholder="Translational Medicine" /></label>
        <label className="text-xs text-ink-muted">Seniority floor<input className={ic} value={v.seniority_floor} onChange={(e) => upd("seniority_floor", e.target.value)} placeholder="Director+" /></label>
        <label className="text-xs text-ink-muted">Priority<input className={ic} type="number" value={v.priority} onChange={(e) => upd("priority", e.target.value)} /></label>
      </div>
      <label className="text-xs text-ink-muted">Title keywords (comma-separated)<input className={ic} value={v.title_keywords} onChange={(e) => upd("title_keywords", e.target.value)} placeholder="translational, biomarker, …" /></label>
      <label className="flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={v.active} onChange={(e) => upd("active", e.target.checked)} className="accent-[var(--color-primary)]" /> Active</label>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-xs" disabled={busy || !v.function.trim()} onClick={() => post(role ? { action: "update", id: role.id, data: data() } : { action: "create", data: data() })}>{role ? "Save" : "Add"}</button>
        {role && <button type="button" className="btn btn-danger btn-xs" disabled={busy} onClick={() => confirm(`Delete ${role.function}?`) && post({ action: "delete", id: role.id })}>Delete</button>}
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

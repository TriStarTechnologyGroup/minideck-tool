import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api";
import { setRole, deleteUser, roleSchema } from "@/lib/admin-users";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/[id] — change role (admin only; can't change own role)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  if (id === guard.profile.id) {
    return NextResponse.json({ error: "You can’t change your own role" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = roleSchema.safeParse(body?.role);
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  try {
    await setRole(id, parsed.data);
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "user.role_change", targetType: "user", target: id, detail: { role: parsed.data } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

// DELETE /api/admin/users/[id] — remove user (admin only; can't delete self)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  if (id === guard.profile.id) {
    return NextResponse.json({ error: "You can’t delete your own account" }, { status: 400 });
  }

  try {
    await deleteUser(id);
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "user.delete", targetType: "user", target: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

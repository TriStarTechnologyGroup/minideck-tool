import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api";
import { resetPassword } from "@/lib/admin-users";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/reset-password — issue a new temp password (admin only)
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  try {
    const tempPassword = await resetPassword(id);
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "user.reset_password", targetType: "user", target: id });
    return NextResponse.json({ tempPassword });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

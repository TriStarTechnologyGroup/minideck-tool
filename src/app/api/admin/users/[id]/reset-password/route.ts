import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api";
import { resetPassword } from "@/lib/admin-users";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/reset-password — issue a new temp password (admin only)
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  try {
    const tempPassword = await resetPassword(id);
    return NextResponse.json({ tempPassword });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api";
import { listUsers, createUser, createUserSchema } from "@/lib/admin-users";
import { logAudit } from "@/lib/audit";

// GET /api/admin/users — list all users (admin only)
export async function GET() {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  return NextResponse.json({ users: await listUsers() });
}

// POST /api/admin/users — create a user with a temp password (admin only)
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { id, tempPassword } = await createUser(parsed.data.email, parsed.data.role);
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "user.create", targetType: "user", target: parsed.data.email, detail: { role: parsed.data.role } });
    return NextResponse.json({ id, email: parsed.data.email, role: parsed.data.role, tempPassword }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create user";
    const friendly = /already|registered|exists/i.test(msg) ? "A user with that email already exists" : msg;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  target?: string;
  detail?: Record<string, unknown>;
}

/** Record an audit event. Never throws — auditing must not block the underlying action. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target: entry.target ?? null,
      detail: entry.detail ?? {},
    });
  } catch {
    /* swallow */
  }
}

import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "user" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export const roleSchema = z.enum(["user", "admin"]);
export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email"),
  role: roleSchema.default("user"),
});

/** Strong, policy-safe temp password (shown once to the admin). */
export function tempPassword(): string {
  return randomBytes(12).toString("base64url") + "aA1!";
}

export async function listUsers(): Promise<AdminUser[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, role, full_name, created_at")
    .order("created_at", { ascending: true });

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const lastById = new Map((authList?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: p.email as string,
    role: p.role as Role,
    full_name: (p.full_name as string | null) ?? null,
    created_at: p.created_at as string,
    last_sign_in_at: lastById.get(p.id as string) ?? null,
  }));
}

/** Create a confirmed user + set role. Returns the one-time temp password. */
export async function createUser(email: string, role: Role): Promise<{ id: string; tempPassword: string }> {
  const admin = createAdminClient();
  const pw = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const id = data.user!.id;
  // The on_auth_user_created trigger inserts the profile (role 'user'); set the chosen role.
  await admin.from("profiles").update({ role }).eq("id", id);
  return { id, tempPassword: pw };
}

export async function setRole(id: string, role: Role): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function resetPassword(id: string): Promise<string> {
  const admin = createAdminClient();
  const pw = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
  if (error) throw new Error(error.message);
  return pw;
}

export async function deleteUser(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

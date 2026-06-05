import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "user" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}

/** The current profile (id, email, role) or null if not signed in. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();

  return (data as Profile | null) ?? null;
}

/** Require a signed-in user; redirect to /login otherwise. Returns the profile. */
export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Require an admin; redirect non-admins to /decks and signed-out users to /login. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/decks");
  return profile;
}

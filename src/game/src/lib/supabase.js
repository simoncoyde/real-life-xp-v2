import { createClient } from "@supabase/supabase-js";

/* =======================================================================
   Supabase connection.

   These two values are PUBLIC by design — the anon key is meant to be
   shipped in the browser. What actually protects a player's data is
   Row Level Security on the database (see supabase-setup.sql), which makes
   it impossible for one account to read another's save. Do not put the
   "service_role" key here; that one really is secret.
   ======================================================================= */
const URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/* The app must still run with no backend configured at all — that's what
   keeps the gym-with-no-signal case working, and lets the project build
   before the database exists. */
export const cloudConfigured = Boolean(URL && ANON);

export const supabase = cloudConfigured
  ? createClient(URL, ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function getSession() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
  } catch (e) {
    return null;
  }
}

export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe?.();
}

export async function signUp(email, password, displayName) {
  if (!supabase) throw new Error("Cloud saves aren't set up yet.");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: (displayName || "").trim() || null } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error("Cloud saves aren't set up yet.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (e) {
    /* best effort */
  }
}

export async function sendPasswordReset(email) {
  if (!supabase) throw new Error("Cloud saves aren't set up yet.");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

/* ---- the save row itself ---- */

export async function fetchCloudSave(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("saves")
    .select("payload, updated_at, revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function pushCloudSave(userId, payload, revision) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("saves")
    .upsert(
      {
        user_id: userId,
        payload,
        revision,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("revision, updated_at")
    .single();
  if (error) throw error;
  return data;
}

/* Public-facing profile, kept separate from the save blob so a leaderboard
   can read a name and level without exposing anyone's whole history. */
export async function upsertProfile(userId, fields) {
  if (!supabase || !userId) return null;
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
  return true;
}

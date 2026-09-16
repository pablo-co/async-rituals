import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "@/lib/env";

/** Supabase client for the browser (client components). Uses the publishable key; RLS applies. */
export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient(url, key);
}

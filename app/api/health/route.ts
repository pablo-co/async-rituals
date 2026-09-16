import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hasAnthropicKey, hasSlackConfig, missingEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Post-deploy check (9A). 200 when the required variables exist and the database answers;
 * 503 with the names of what is missing otherwise. Never returns values, only names and yes/no.
 * The database probe uses the publishable key and the public `health()` function, so it works
 * even before the secret key is configured.
 */
export async function GET() {
  const missing = missingEnv();
  let db: true | string = "no revisada";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const { error } = await createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).rpc("health");
      db = error ? error.message : true;
    } catch (e) {
      db = e instanceof Error ? e.message : String(e);
    }
  }

  const ok = missing.length === 0 && db === true;
  return NextResponse.json(
    {
      ok,
      missing,
      db,
      anthropic: hasAnthropicKey(),
      slack: hasSlackConfig(),
      cron: Boolean(process.env.CRON_SECRET),
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}

import { NextResponse } from "next/server";
import { hasAnthropicKey, hasSlackConfig, missingEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Post-deploy check (9A). 200 when the required variables exist and the database answers;
 * 503 with the names of what is missing otherwise. Never returns values, only names and yes/no.
 */
export async function GET() {
  const missing = missingEnv();
  let db: true | string = "no revisada";

  if (missing.length === 0) {
    try {
      const { error } = await createAdminClient()
        .from("teams")
        .select("id", { count: "exact", head: true });
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

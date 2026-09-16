/**
 * Environment variable names, in one place. /api/health reports missing ones by name.
 * NEXT_PUBLIC_* values are shipped to the browser on purpose; everything else is secret.
 */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

export const OPTIONAL_ENV = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "CRON_SECRET",
  "APP_URL",
] as const;

type EnvLike = Record<string, string | undefined>;

export function missingEnv(
  env: EnvLike = process.env,
  names: readonly string[] = REQUIRED_ENV,
): string[] {
  return names.filter((name) => !env[name] || env[name]!.trim() === "");
}

export function hasAnthropicKey(env: EnvLike = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export function hasSlackConfig(env: EnvLike = process.env): boolean {
  return (
    missingEnv(env, ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET"])
      .length === 0
  );
}

export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local",
    );
  }
  return { url, key };
}

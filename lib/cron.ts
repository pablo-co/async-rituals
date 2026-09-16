/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; manual calls use the same header. */
export function authorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

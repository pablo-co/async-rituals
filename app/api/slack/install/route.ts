import { NextResponse } from "next/server";
import { oauthRedirectUri, signState, slackAuthorizeUrl } from "@/lib/slack/oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Agregar a Slack": needs a session; sends the admin to Slack with a signed state (3A). */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const clientId = process.env.SLACK_CLIENT_ID;
  const secret = process.env.SLACK_SIGNING_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !secret || !appUrl) {
    return NextResponse.redirect(new URL("/conectar?error=not_configured", request.url));
  }
  const state = signState(user.id, secret);
  return NextResponse.redirect(
    slackAuthorizeUrl({ clientId, redirectUri: oauthRedirectUri(appUrl), state }),
  );
}

// Server-only: mints a short-lived Simli session token so the browser can
// open a live avatar stream WITHOUT ever seeing SIMLI_API_KEY.
//
// We call Simli's REST endpoint directly with fetch instead of importing the
// simli-client SDK, because that SDK is browser-only (WebRTC / AudioWorklet)
// and would crash if evaluated on the server.
//
// If SIMLI_API_KEY / SIMLI_FACE_ID aren't configured, we report that cleanly
// so the client can fall back to the static image avatar.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

interface SimliSessionConfig {
  faceId: string;
  handleSilence: boolean;
  maxSessionLength: number;
  maxIdleTime: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Minting a session token is lightweight; legitimate reconnects (toggling
  // live mode, switching call/chat, reloads) can need several per minute, so
  // keep this comfortably high while still bounding abuse.
  const blocked = await guard(req, "simli-session", { limit: 40, windowMs: 60_000 });
  if (blocked) return blocked;

  const apiKey = process.env.SIMLI_API_KEY;
  const faceId = process.env.SIMLI_FACE_ID;

  if (!apiKey || !faceId) {
    // Not an error — just means the live avatar isn't set up.
    return NextResponse.json(
      { configured: false, error: "Simli not configured" },
      { status: 200 },
    );
  }

  const config: SimliSessionConfig = {
    faceId,
    handleSilence: true,
    maxSessionLength: 3600,
    maxIdleTime: 300,
  };

  try {
    const res = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-simli-api-key": apiKey,
      },
      body: JSON.stringify(config),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { configured: true, error: `Simli token error ${res.status}: ${detail}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { session_token?: string };
    if (!data.session_token) {
      return NextResponse.json(
        { configured: true, error: "Simli returned no session_token" },
        { status: 502 },
      );
    }

    return NextResponse.json({ configured: true, session_token: data.session_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getFreshness } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Sonde de disponibilité : 200 si la base répond, avec l'heure du dernier relevé ranked. */
export async function GET() {
  try {
    const f = await getFreshness();
    return NextResponse.json({ ok: true, takenAt: f.takenAt, rejected24h: f.rejected24h });
  } catch (e) {
    // Seulement le type d'erreur (ex. CONNECT_TIMEOUT, 28P01 mot de passe refusé), jamais le message complet.
    const err = e as { code?: unknown; name?: unknown };
    const code = typeof err.code === "string" ? err.code : typeof err.name === "string" ? err.name : "unknown";
    return NextResponse.json({ ok: false, error: code }, { status: 503 });
  }
}

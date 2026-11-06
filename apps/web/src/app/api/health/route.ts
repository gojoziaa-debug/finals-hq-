import { NextResponse } from "next/server";
import { getFreshness } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Sonde de disponibilité : 200 si la base répond, avec l'heure du dernier relevé ranked. */
export async function GET() {
  try {
    const f = await getFreshness();
    return NextResponse.json({ ok: true, takenAt: f.takenAt, rejected24h: f.rejected24h });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getPlayer } from "@/lib/data";
import { DataUnavailableError, getDb, withTimeout } from "@/lib/db";
import { namesFromSlug } from "@/lib/players";
import { parsePrivacyRequest, playerRefFromInput } from "@/lib/privacy-request";
import { clientIp, createLimiter } from "@/lib/ratelimit";
import { bumpUsage, insertHideRequest } from "@/lib/writes";

export const dynamic = "force-dynamic";

/** 5 demandes par heure et par adresse : un humain n'en envoie qu'une. */
const limiter = createLimiter(5, 3_600_000);

/**
 * Demande de masquage (formulaire /privacy/request). Enregistre une demande « pending » ; GOJO la vérifie et
 * l'applique avec le worker sous 48 h. Réponses : 201 créée, 200 déjà connue, 400 champ invalide, 404 joueur
 * introuvable, 429, 503. L'adresse IP n'est jamais enregistrée.
 */
export async function POST(request: NextRequest) {
  const retry = limiter.check(clientIp(request.headers));
  if (retry !== null) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = parsePrivacyRequest(body);
  // Robot : on répond comme une réussite, sans rien écrire.
  if (!parsed.ok && parsed.error === "bot") return NextResponse.json({ result: "created" }, { status: 201 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { value } = parsed;
  try {
    const candidates = namesFromSlug(playerRefFromInput(value.player));
    const player = candidates.length > 0 ? await getPlayer(candidates) : null;
    if (!player) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (player.hidden) return NextResponse.json({ result: "already_hidden" }, { status: 200 });
    const result = await withTimeout(insertHideRequest(getDb(), { playerId: player.id, contact: value.contact, message: value.message, locale: value.locale }), 8_000);
    if (result === "created") void withTimeout(bumpUsage(getDb(), "hide_request"), 4_000).catch(() => undefined);
    return NextResponse.json({ result, name: player.name }, { status: result === "created" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DataUnavailableError) return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
    console.error("privacy-request", (error as Error).message);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

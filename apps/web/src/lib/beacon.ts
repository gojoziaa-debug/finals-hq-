"use client";
/** Envoie un compteur d'audience (voir /api/hit). Jamais bloquant, jamais d'erreur visible. */
export function beacon(e: "profile_view" | "follow" | "search_empty" | "share" | "support_click"): void {
  try {
    const body = JSON.stringify({ e });
    if (navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/hit", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  } catch {
    // navigateur sans sendBeacon ni fetch : on ne compte pas
  }
}

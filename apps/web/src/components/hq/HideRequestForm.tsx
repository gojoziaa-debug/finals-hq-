"use client";
import { useLocale } from "next-intl";
import { useEffect, useId, useState } from "react";
import { CONTACT_MAX, MESSAGE_MAX, parsePrivacyRequest } from "@/lib/privacy-request";
import { Button } from "./Button";

const T = {
  fr: {
    player: "Ton pseudo Embark ou l'adresse de ton profil",
    playerHint: "Par exemple GOJO#6255 ou https://…/fr/players/GOJO-6255",
    contact: "Comment te répondre",
    contactHint: "Ton e-mail ou ton pseudo Discord. Nous l'utilisons seulement pour vérifier que le compte est le tien.",
    message: "Message (facultatif)",
    owner: "Je suis ce joueur, ou son représentant légal.",
    send: "Envoyer la demande",
    sending: "Envoi…",
    created: (n: string) => `Demande reçue pour ${n}. Nous te contactons pour une vérification rapide, puis le profil est masqué sous 48 heures.`,
    already_pending: (n: string) => `Une demande est déjà en cours pour ${n}. Elle sera traitée sous 48 heures.`,
    already_hidden: () => "Ce profil est déjà masqué.",
    errors: {
      player: "Indique ton pseudo Embark (avec le #) ou l'adresse de ton profil.",
      contact: "Indique un e-mail valide ou un pseudo Discord.",
      message: `Message trop long (${MESSAGE_MAX} caractères au plus).`,
      owner: "Coche la case pour confirmer que c'est ton compte.",
      not_found: "Aucun joueur trouvé avec ce pseudo. Vérifie le # et les majuscules, ou colle l'adresse de ton profil.",
      rate_limited: "Trop de demandes depuis cette connexion. Réessaie dans une heure.",
      default: "La demande n'a pas pu être envoyée. Réessaie dans quelques minutes.",
    },
  },
  en: {
    player: "Your Embark name or your profile address",
    playerHint: "For example GOJO#6255 or https://…/en/players/GOJO-6255",
    contact: "How to reach you",
    contactHint: "Your email or Discord name. We only use it to check that the account is yours.",
    message: "Message (optional)",
    owner: "I am this player, or their legal representative.",
    send: "Send the request",
    sending: "Sending…",
    created: (n: string) => `Request received for ${n}. We will contact you for a quick check, then the profile is hidden within 48 hours.`,
    already_pending: (n: string) => `A request is already open for ${n}. It will be handled within 48 hours.`,
    already_hidden: () => "This profile is already hidden.",
    errors: {
      player: "Enter your Embark name (with the #) or your profile address.",
      contact: "Enter a valid email or a Discord name.",
      message: `Message too long (${MESSAGE_MAX} characters at most).`,
      owner: "Tick the box to confirm this is your account.",
      not_found: "No player found with this name. Check the # and the capitals, or paste your profile address.",
      rate_limited: "Too many requests from this connection. Try again in an hour.",
      default: "The request could not be sent. Try again in a few minutes.",
    },
  },
} as const;

type Errors = keyof (typeof T)["fr"]["errors"];

/** Formulaire de masquage : POST /api/privacy-request. Préremplit le joueur avec ?player=GOJO-6255 (lien du profil). */
export function HideRequestForm() {
  const locale = useLocale() === "en" ? "en" : "fr";
  const t = T[locale];
  const id = useId();
  const [player, setPlayer] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "done"; text: string } | { kind: "error"; key: Errors }>({ kind: "idle" });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("player");
    if (p) {
      const m = /^(.*)-(\d{4})$/.exec(p);
      setPlayer(m ? `${m[1]}#${m[2]}` : p);
    }
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { player: form.get("player"), contact: form.get("contact"), message: form.get("message") ?? "", owner: form.get("owner") === "on", website: form.get("website") ?? "", locale };
    // Mêmes règles que le serveur, vérifiées avant l'envoi (le serveur revérifie).
    const local = parsePrivacyRequest(payload);
    if (!local.ok && local.error !== "bot") {
      setState({ kind: "error", key: local.error });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/privacy-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { result?: "created" | "already_pending" | "already_hidden"; name?: string; error?: string };
      if (body.result) {
        setState({ kind: "done", text: t[body.result](body.name ?? String(form.get("player"))) });
        return;
      }
      const key = (body.error && body.error in t.errors ? body.error : "default") as Errors;
      setState({ kind: "error", key });
    } catch {
      setState({ kind: "error", key: "default" });
    }
  };

  if (state.kind === "done") {
    return (
      <p role="status" className="rounded-lg border border-accent-ink/40 bg-surface p-4 font-semibold">
        {state.text}
      </p>
    );
  }
  const field = "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base focus:border-accent-ink focus:outline-none";
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border bg-surface p-4" noValidate>
      <div className="grid gap-1">
        <label htmlFor={`${id}-player`} className="font-semibold">{t.player}</label>
        <input id={`${id}-player`} name="player" required maxLength={200} value={player} onChange={(e) => setPlayer(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby={`${id}-player-hint`} className={field} />
        <span id={`${id}-player-hint`} className="text-body-sm text-text-2">{t.playerHint}</span>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-contact`} className="font-semibold">{t.contact}</label>
        <input id={`${id}-contact`} name="contact" required maxLength={CONTACT_MAX} autoComplete="email" aria-describedby={`${id}-contact-hint`} className={field} />
        <span id={`${id}-contact-hint`} className="text-body-sm text-text-2">{t.contactHint}</span>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-message`} className="font-semibold">{t.message}</label>
        <textarea id={`${id}-message`} name="message" maxLength={MESSAGE_MAX} rows={3} className={`${field} h-auto py-2`} />
      </div>
      {/* Piège à robots : invisible et hors du parcours clavier. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="owner" required className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--accent-ink))]" />
        <span>{t.owner}</span>
      </label>
      {state.kind === "error" && (
        <p role="alert" className="font-semibold text-negative-ink">
          {t.errors[state.key]}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? t.sending : t.send}
        </Button>
      </div>
    </form>
  );
}

"use client";
import { ExternalLink, Heart } from "lucide-react";
import { beacon } from "@/lib/beacon";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./Button";

/** Bouton vers le palier Patreon (sprint 7) : lien sortant, aucun paiement sur le site ; compte les clics sans identifiant. */
export function PatreonButton({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => beacon("support_click")} className={cn(buttonClasses.base, buttonClasses.primary, "px-5", className)}>
      <Heart aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      {label}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
    </a>
  );
}

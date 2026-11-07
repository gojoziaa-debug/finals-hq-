"use client";
import { useEffect } from "react";
import { beacon } from "@/lib/beacon";

/** Compte un événement d'audience une fois par affichage (profil vu, recherche sans résultat). */
export function Beacon({ event }: { event: "profile_view" | "search_empty" }) {
  useEffect(() => {
    beacon(event);
  }, [event]);
  return null;
}

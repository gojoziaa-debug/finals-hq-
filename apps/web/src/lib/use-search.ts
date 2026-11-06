"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "./types";

/** Recherche de joueurs (/api/search) avec anti-rebond de 150 ms ; partagée par la palette ⌘K et le sélecteur de la comparaison. */
export type SearchState = { status: "idle" } | { status: "loading" } | { status: "done"; q: string; results: SearchResult[] } | { status: "error"; limited: boolean };

export function useSearch(q: string): SearchState {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const latest = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setState({ status: "idle" });
      return;
    }
    const id = ++latest.current;
    setState((s) => (s.status === "done" ? s : { status: "loading" }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (id !== latest.current) return;
        if (!res.ok) return setState({ status: "error", limited: res.status === 429 });
        const body = (await res.json()) as { results: SearchResult[] };
        if (id === latest.current) setState({ status: "done", q: query, results: body.results });
      } catch {
        if (id === latest.current) setState({ status: "error", limited: false });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q]);
  return state;
}


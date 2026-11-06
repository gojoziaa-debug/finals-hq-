/**
 * État partageable du tableau de classement, dans l'URL : ?league=d2&club=XYZ&q=gojo&sort=change24h&order=asc&page=15.
 * page = tranche de 100 lignes de la vue affichée (la page 15 commence à la ligne 1 401).
 * Pur : testé dans tests/unit/table-state.test.ts.
 */
import { leagueFromSlug } from "./league";
import type { BoardColumns } from "./types";

export type SortKey = "rank" | "score" | "change24h" | "change7d" | "name";
export type SortOrder = "asc" | "desc";

export interface TableState {
  league: number | null;
  club: string;
  q: string;
  sort: SortKey;
  order: SortOrder;
  page: number;
}

export const PAGE_SIZE = 100;
const SORTS: readonly SortKey[] = ["rank", "score", "change24h", "change7d", "name"];
export const DEFAULT_ORDER: Record<SortKey, SortOrder> = { rank: "asc", score: "desc", change24h: "desc", change7d: "desc", name: "asc" };

export const DEFAULT_STATE: TableState = { league: null, club: "", q: "", sort: "rank", order: "asc", page: 1 };

export function parseTableState(params: URLSearchParams, opts: { hasDeltas: boolean; hasLeagues: boolean }): TableState {
  const sortRaw = params.get("sort") as SortKey | null;
  let sort: SortKey = sortRaw && SORTS.includes(sortRaw) ? sortRaw : "rank";
  if (!opts.hasDeltas && (sort === "change24h" || sort === "change7d")) sort = "rank";
  const orderRaw = params.get("order");
  const order: SortOrder = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : DEFAULT_ORDER[sort];
  const leagueSlug = params.get("league");
  const l = opts.hasLeagues && leagueSlug ? leagueFromSlug(leagueSlug) : null;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  return {
    league: l?.number ?? null,
    club: (params.get("club") ?? "").trim().slice(0, 12),
    q: (params.get("q") ?? "").trim().slice(0, 40),
    sort,
    order,
    page,
  };
}

export function serializeTableState(state: TableState, leagueSlug: (n: number) => string): string {
  const p = new URLSearchParams();
  if (state.league !== null) p.set("league", leagueSlug(state.league));
  if (state.club) p.set("club", state.club);
  if (state.q) p.set("q", state.q);
  if (state.sort !== "rank") p.set("sort", state.sort);
  if (state.order !== DEFAULT_ORDER[state.sort]) p.set("order", state.order);
  if (state.page > 1) p.set("page", String(state.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeFilterCount(state: TableState): number {
  return (state.league !== null ? 1 : 0) + (state.club ? 1 : 0) + (state.q ? 1 : 0);
}

/**
 * Indices des lignes à afficher, filtrées puis triées. Les valeurs inconnues (variation n/d) vont toujours
 * en fin de liste, quel que soit le sens ; à égalité, l'ordre du classement départage.
 */
export function viewIndices(rows: BoardColumns, state: TableState): number[] {
  const n = rows.rank.length;
  const club = state.club.toLowerCase();
  const q = state.q.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (state.league !== null && rows.league[i] !== state.league) continue;
    if (club && (rows.club[i] ?? "").toLowerCase() !== club) continue;
    if (q && !(rows.name[i] ?? "").toLowerCase().includes(q)) continue;
    out.push(i);
  }
  const dir = state.order === "asc" ? 1 : -1;
  const byRank = (a: number, b: number) => rows.rank[a]! - rows.rank[b]!;
  let cmp: (a: number, b: number) => number;
  switch (state.sort) {
    case "rank":
      cmp = (a, b) => dir * byRank(a, b);
      break;
    case "score":
      cmp = (a, b) => dir * (rows.score[a]! - rows.score[b]!) || byRank(a, b);
      break;
    case "name": {
      const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
      cmp = (a, b) => {
        const na = rows.name[a] ?? null;
        const nb = rows.name[b] ?? null;
        if (na === null || nb === null) return na === nb ? byRank(a, b) : na === null ? 1 : -1;
        return dir * collator.compare(na, nb) || byRank(a, b);
      };
      break;
    }
    case "change24h":
    case "change7d": {
      const col = state.sort === "change24h" ? rows.d24 : rows.d7;
      cmp = (a, b) => {
        const va = col?.[a] ?? null;
        const vb = col?.[b] ?? null;
        if (va === null || vb === null) return va === vb ? byRank(a, b) : va === null ? 1 : -1;
        return dir * (va - vb) || byRank(a, b);
      };
      break;
    }
  }
  if (!(state.sort === "rank" && state.order === "asc")) out.sort(cmp);
  return out;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

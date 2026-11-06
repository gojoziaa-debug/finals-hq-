/** One-line description of an error and its causes, with the Postgres code when there is one.
 *  Drizzle repeats the whole query and its parameters in the message: only the head is kept. */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  const e = error as Error & { code?: unknown; detail?: unknown; hint?: unknown; cause?: unknown };
  let message = e.message;
  const paramsAt = message.indexOf("\nparams:");
  if (paramsAt !== -1) message = message.slice(0, paramsAt);
  if (message.length > 240) message = `${message.slice(0, 240)}…`;
  const parts = [`${e.name}: ${message}`];
  for (const key of ["code", "detail", "hint"] as const) {
    if (typeof e[key] === "string" && e[key]) parts.push(`${key}=${e[key]}`);
  }
  if (e.cause !== undefined && depth < 5) parts.push(`← ${describeError(e.cause, depth + 1)}`);
  return parts.join(" ");
}

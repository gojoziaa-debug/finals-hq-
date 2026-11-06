import { AlertTriangle, SearchX } from "lucide-react";
import { cn } from "@/lib/cn";

/** Squelette à la forme finale, jamais un spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-raised", className)} />;
}

/** État vide : pourquoi, et quoi faire. */
export function EmptyState({ title, body, action, icon: Icon = SearchX, className }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: typeof SearchX; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-10 text-center", className)}>
      <Icon aria-hidden="true" className="h-6 w-6 text-text-3" strokeWidth={1.75} />
      <p className="text-title">{title}</p>
      {body && <p className="max-w-prose text-body-sm text-text-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Erreur : message, et une action pour réessayer. */
export function ErrorState({ title, body, action, className }: { title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 rounded-lg border border-negative/40 bg-negative/5 px-6 py-10 text-center", className)}>
      <AlertTriangle aria-hidden="true" className="h-6 w-6 text-negative-ink" strokeWidth={1.75} />
      <p className="text-title">{title}</p>
      {body && <p className="max-w-prose text-body-sm text-text-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

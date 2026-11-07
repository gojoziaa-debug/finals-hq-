import { cn } from "@/lib/cn";

/** Mise en page des pages de texte (à propos, confidentialité, mentions légales) : colonne lisible, titres Barlow. */
export function Prose({ title, updated, children, className }: { title: string; updated?: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={cn("mx-auto grid max-w-[72ch] grid-cols-1 gap-4 pb-8", className)}>
      <header className="grid gap-1">
        <h1 className="font-display text-display-xl uppercase">{title}</h1>
        {updated && <p className="text-body-sm text-text-2">{updated}</p>}
      </header>
      <div className="prose-hq grid gap-4 leading-relaxed">{children}</div>
    </article>
  );
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-4 scroll-mt-20 font-display text-display-md uppercase">
      {children}
    </h2>
  );
}

export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="grid list-disc gap-1.5 pl-5 marker:text-text-3">{children}</ul>;
}

/** Valeur que GOJO doit encore renseigner (variables Vercel) : visible, jamais inventée. */
export function Missing({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm border border-dashed border-border-strong px-1 text-text-2">{children}</span>;
}

export const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="font-semibold text-accent-ink underline underline-offset-2" {...(href.startsWith("http") ? { rel: "noopener noreferrer", target: "_blank" } : {})}>
    {children}
  </a>
);

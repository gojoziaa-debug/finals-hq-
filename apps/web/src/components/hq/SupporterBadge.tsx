import { Crown, Heart } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { SupporterRole } from "@/lib/supporters";

/** Badge du profil (sprint 7) : « Supporter » pour les membres du palier Patreon, « Créateur » pour GOJO. Renvoie vers /support. */
export async function SupporterBadge({ role, className }: { role: SupporterRole; className?: string }) {
  const t = await getTranslations("support");
  const Icon = role === "creator" ? Crown : Heart;
  return (
    <Link
      href="/support"
      title={t(role === "creator" ? "badgeCreatorHint" : "badgeHint")}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-accent-ink/70 bg-accent/15 px-2.5 text-[12px] font-semibold uppercase tracking-wide text-text hover:bg-accent/25", className)}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-accent-ink" strokeWidth={2} />
      {t(role === "creator" ? "badgeCreator" : "badge")}
    </Link>
  );
}

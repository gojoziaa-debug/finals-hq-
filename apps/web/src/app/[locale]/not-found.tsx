import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/hq/Button";
import { EmptyState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="py-10">
      <EmptyState
        title={t("notFound")}
        body={t("notFoundBody")}
        action={
          <Link href="/" className={cn(buttonClasses.base, buttonClasses.primary)}>
            {t("home")}
          </Link>
        }
      />
    </div>
  );
}

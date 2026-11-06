"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";

function Switch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const other = locale === "fr" ? "en" : "fr";
  const query = params.toString();
  return (
    <Link
      href={query ? `${pathname}?${query}` : pathname}
      locale={other}
      hrefLang={other}
      lang={other}
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-caption uppercase text-text-2 hover:bg-surface-raised hover:text-text"
      aria-label={t("switchTo")}
      title={t("language")}
    >
      {other}
    </Link>
  );
}

export function LocaleSwitch() {
  return (
    <Suspense fallback={<span className="inline-flex h-11 min-w-11" />}>
      <Switch />
    </Suspense>
  );
}

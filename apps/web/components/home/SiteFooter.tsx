"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("footer");
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 relative z-10">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>{t("line1")}</p>
          <p>{t("line2")}</p>
          <p>{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}

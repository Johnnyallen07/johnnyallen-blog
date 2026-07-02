"use client";

import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";

/** 中/英切换按钮：保持当前路径，只切换 locale 前缀 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const otherLocale = locale === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: otherLocale })}
      className={
        className ??
        "flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      }
      aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      <Languages className="h-4 w-4" />
      <span>{locale === "zh" ? "EN" : "中文"}</span>
    </button>
  );
}

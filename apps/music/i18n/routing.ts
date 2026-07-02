import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
    locales: ["zh", "en"],
    defaultLocale: "zh",
    // 中文保持现有 URL（无前缀），英文加 /en 前缀
    localePrefix: "as-needed",
});

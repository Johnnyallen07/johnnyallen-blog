import type { Metadata } from "next";

/** 生成 hreflang alternates + canonical（zh 无前缀，en 加 /en 前缀） */
export function alternatesFor(
  locale: string,
  path: string,
): Metadata["alternates"] {
  const enPath = path === "/" ? "/en" : `/en${path}`;
  return {
    canonical: locale === "zh" ? path : enPath,
    languages: {
      "zh-CN": path,
      en: enPath,
      "x-default": path,
    },
  };
}

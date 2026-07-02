import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getApiBaseUrl } from "@/lib/api";
import zhMessages from "../messages/zh.json";
import enFallback from "../messages/en.json";

type Messages = Record<string, unknown>;

/** 深合并：override 的叶子值覆盖 base，未覆盖的 key 保留（英文缺翻译时回退中文） */
function deepMerge(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value &&
      typeof value === "object" &&
      existing &&
      typeof existing === "object"
    ) {
      result[key] = deepMerge(existing as Messages, value as Messages);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 消息加载策略：
 * - zh：永远用打包进代码的 messages/zh.json（源真相，无运行时依赖）
 * - 其他 locale：从 API（admin 管理的数据库译文）拉取，60s revalidate；
 *   API 不可用时回退打包的 en.json 快照；未翻译的 key 回退中文。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  let messages: Messages = zhMessages as Messages;

  if (locale !== "zh") {
    let remote: Messages | null = null;
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/i18n/messages?app=web&locale=${locale}`,
        { next: { revalidate: 60 } },
      );
      if (res.ok) {
        remote = (await res.json()) as Messages;
      }
    } catch {
      // API 不可用 → 用打包的快照兜底
    }
    messages = deepMerge(
      deepMerge(zhMessages as Messages, enFallback as Messages),
      remote ?? {},
    );
  }

  return { locale, messages };
});

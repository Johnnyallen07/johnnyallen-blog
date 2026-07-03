import { Badge } from "@/components/ui/badge";
import type { TranslationStatus } from "./types";

/** 翻译状态徽章：未翻译灰 / 机翻琥珀 / 已校对绿 / 已过期红边 / 已废弃删除线 */
export function StatusBadge({
    status,
    stale,
    orphaned,
}: {
    status: TranslationStatus | null;
    stale?: boolean;
    orphaned?: boolean;
}) {
    if (orphaned) {
        return (
            <Badge className="border-gray-300 bg-gray-100 text-gray-400 line-through">
                已废弃
            </Badge>
        );
    }
    if (stale) {
        return (
            <Badge className="border-red-300 bg-red-50 text-red-600">
                已过期
            </Badge>
        );
    }
    if (status === "REVIEWED") {
        return (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                已校对
            </Badge>
        );
    }
    if (status === "MACHINE") {
        return (
            <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                机翻
            </Badge>
        );
    }
    return (
        <Badge className="border-gray-200 bg-gray-50 text-gray-500">
            未翻译
        </Badge>
    );
}

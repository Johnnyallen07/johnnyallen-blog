import { setRequestLocale } from "next-intl/server";
import QuestPageClient from "./quest-client";

export default async function QuestPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <QuestPageClient />;
}

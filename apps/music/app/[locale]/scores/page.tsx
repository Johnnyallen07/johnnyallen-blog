import { setRequestLocale } from "next-intl/server";
import ScorePageClient from "./score-client";

export default async function ScoresPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ScorePageClient />;
}

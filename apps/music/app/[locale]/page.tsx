import { setRequestLocale } from "next-intl/server";
import MusicPageClient from "./music-client";

export default async function MusicPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <MusicPageClient />;
}

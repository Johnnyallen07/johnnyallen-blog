import { setRequestLocale } from "next-intl/server";
import TunerPageClient from "./tuner-client";

export default async function TunerPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TunerPageClient />;
}

export type PageReadingLayout = "single" | "double" | "continuous";

/**
 * Resolves the value typed into a page field without ever leaving the document
 * range. Double-page readers always start on the first page of a spread.
 */
export function resolvePageJump(
    value: string,
    currentPage: number,
    totalPages: number,
    layout: PageReadingLayout,
): number {
    if (totalPages < 1) return currentPage;

    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return currentPage;

    const requestedPage = Number(trimmed);
    if (!Number.isSafeInteger(requestedPage)) return currentPage;

    const page = Math.max(1, Math.min(totalPages, requestedPage));
    return layout === "double" && page % 2 === 0 ? page - 1 : page;
}

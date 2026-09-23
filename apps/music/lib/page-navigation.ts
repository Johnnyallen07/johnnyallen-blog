export type PageReadingLayout = "single" | "double" | "continuous";

/**
 * The order a continuous reader should rasterise pages in: the page you asked
 * for first, then its neighbours, so a jump paints immediately instead of
 * waiting behind the pages you scrolled past.
 */
export function pageRenderPriority(page: number, totalPages: number): number[] {
    const order = [page, page - 1, page + 1];
    return order.filter((candidate) => candidate >= 1 && candidate <= totalPages);
}


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

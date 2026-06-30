export interface FilterableArticle {
  title: string;
  excerpt: string;
  column: string;
  categorySlug?: string | null;
  tags: string[];
  date: string;
  updatedAt?: string;
  articleId?: string;
}

export interface ArticleFilterState {
  searchQuery: string;
  selectedCategorySlug: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function filterArticles<T extends FilterableArticle>(
  articles: T[],
  filters: ArticleFilterState,
): T[] {
  const query = normalize(filters.searchQuery);
  const selectedCategorySlug = normalize(filters.selectedCategorySlug);

  return articles.filter((article) => {
    const matchesCategory =
      !selectedCategorySlug ||
      normalize(article.categorySlug) === selectedCategorySlug ||
      normalize(article.column) === selectedCategorySlug;

    if (!matchesCategory) return false;
    if (!query) return true;

    const searchableText = [
      article.title,
      article.excerpt,
      article.column,
      article.date,
      article.articleId,
      ...article.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query);
  });
}

export function sortArticlesByUpdatedAt<T extends FilterableArticle>(
  articles: T[],
): T[] {
  return [...articles].sort(
    (a, b) =>
      new Date(b.updatedAt || 0).getTime() -
      new Date(a.updatedAt || 0).getTime(),
  );
}

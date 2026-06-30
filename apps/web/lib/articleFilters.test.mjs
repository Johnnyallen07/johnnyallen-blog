import assert from "node:assert/strict";
import test from "node:test";

import { filterArticles, sortArticlesByUpdatedAt } from "./articleFilters.ts";

const articles = [
  {
    title: "TypeScript 类型体操",
    excerpt: "聊聊泛型和条件类型",
    column: "技术探索",
    categorySlug: "tech",
    tags: ["typescript", "frontend"],
    date: "2026年6月1日",
    articleId: "typescript-types",
  },
  {
    title: "巴赫小提琴练习",
    excerpt: "右手控制与分句",
    column: "音乐殿堂",
    categorySlug: "music",
    tags: ["violin", "bach"],
    date: "2026年6月2日",
    articleId: "bach-violin",
  },
  {
    title: "独立游戏关卡笔记",
    excerpt: "从节奏设计讲起",
    column: "游戏世界",
    categorySlug: "games",
    tags: ["level-design"],
    date: "2026年6月3日",
    articleId: "level-notes",
  },
];

test("filters articles by search text across article fields", () => {
  const result = filterArticles(articles, {
    searchQuery: "泛型",
    selectedCategorySlug: null,
  });

  assert.deepEqual(
    result.map((article) => article.articleId),
    ["typescript-types"],
  );
});

test("filters articles by selected category slug", () => {
  const result = filterArticles(articles, {
    searchQuery: "",
    selectedCategorySlug: "music",
  });

  assert.deepEqual(
    result.map((article) => article.articleId),
    ["bach-violin"],
  );
});

test("combines search text and selected category slug", () => {
  const result = filterArticles(articles, {
    searchQuery: "设计",
    selectedCategorySlug: "games",
  });

  assert.deepEqual(
    result.map((article) => article.articleId),
    ["level-notes"],
  );
});

test("sorts articles by updated time descending", () => {
  const result = sortArticlesByUpdatedAt([
    { ...articles[0], updatedAt: "2026-06-01T10:00:00.000Z" },
    { ...articles[1], updatedAt: "2026-06-03T10:00:00.000Z" },
    { ...articles[2], updatedAt: "2026-06-02T10:00:00.000Z" },
  ]);

  assert.deepEqual(
    result.map((article) => article.articleId),
    ["bach-violin", "level-notes", "typescript-types"],
  );
});

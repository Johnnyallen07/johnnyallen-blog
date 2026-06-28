import assert from "node:assert/strict";
import { getMobileSeriesRecommendations } from "./series-sidebar";

const items = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    return {
        id: `item-${number}`,
        title: `文章 ${number}`,
        postId: `post-${number}`,
        post: {
            id: `post-${number}`,
            title: `文章 ${number}`,
            slug: `article-${number}`,
            published: true,
        },
        children: [],
    };
});

const recommendations = getMobileSeriesRecommendations(items, "/article/article-7");

assert.equal(recommendations.length, 5);
assert.equal(recommendations[0]?.slug, "article-7");
assert.deepEqual(
    recommendations.map((item) => item.slug),
    ["article-7", "article-1", "article-2", "article-3", "article-4"],
);

console.log("series-sidebar tests passed");

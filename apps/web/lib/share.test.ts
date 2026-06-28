import assert from "node:assert/strict";
import { buildArticleShareText, stripHtmlForShare } from "./share";

const excerpt = stripHtmlForShare("<p>第一段内容，很适合推荐给朋友。</p><p>第二段。</p>");
const text = buildArticleShareText({
    title: "高效盐水泉五调谐模块",
    url: "https://johnnyallen.blog/article/salt-water",
    excerpt,
});

assert.equal(excerpt, "第一段内容，很适合推荐给朋友。 第二段。");
assert.match(text, /高效盐水泉五调谐模块/);
assert.match(text, /第一段内容/);
assert.match(text, /https:\/\/johnnyallen\.blog\/article\/salt-water/);

console.log("share tests passed");

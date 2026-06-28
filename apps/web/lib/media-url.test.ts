import assert from "node:assert/strict";
import { normalizeArticleMediaHtml } from "./media-url";

const normalized = normalizeArticleMediaHtml(`
  <p>hello</p>
  <img src="assets/example.png" alt="relative">
  <img src="/media/assets/rooted.png" alt="rooted">
  <video controls><source src="./assets/movie.mp4"></video>
  <a href="assets/doc.pdf" data-attachment="true" data-key="assets/doc.pdf">doc</a>
  <img src="https://static.johnnyallen.blog/assets/ok.png" alt="absolute">
`, "/api");

assert.match(normalized, /src="\/api\/media\/assets\/example\.png"/);
assert.match(normalized, /src="\/api\/media\/assets\/rooted\.png"/);
assert.match(normalized, /src="\/api\/media\/assets\/movie\.mp4"/);
assert.match(normalized, /href="\/api\/media\/assets\/doc\.pdf"/);
assert.match(normalized, /src="https:\/\/static\.johnnyallen\.blog\/assets\/ok\.png"/);

console.log("media-url tests passed");

#!/usr/bin/env node
/**
 * i18n-pull：从 API 拉取英文译文，写入 apps/<app>/messages/en.json 作为
 * 构建期兜底快照（API 不可用时前端用它回退）。建议部署前运行并提交。
 *
 * 用法:
 *   node scripts/i18n-pull.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["web", "music"];
const LOCALE = "en";

function loadRootEnv() {
    const envPath = path.join(ROOT, ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, name, rawValue] = m;
        if (process.env[name] !== undefined) continue;
        process.env[name] = rawValue.replace(/^["']|["']$/g, "");
    }
}
loadRootEnv();

const API_URL =
    process.env.I18N_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";

async function main() {
    for (const app of APPS) {
        const res = await fetch(
            `${API_URL}/i18n/messages?app=${app}&locale=${LOCALE}`,
        );
        if (!res.ok) {
            console.error(`[${app}] 拉取失败 (${res.status})`);
            process.exitCode = 1;
            continue;
        }
        const messages = await res.json();
        const outPath = path.join(ROOT, "apps", app, "messages", `${LOCALE}.json`);
        fs.writeFileSync(outPath, `${JSON.stringify(messages, null, 2)}\n`);
        const count = JSON.stringify(messages).match(/":"/g)?.length ?? 0;
        console.log(`[${app}] 已写入 ${path.relative(ROOT, outPath)}（约 ${count} 条译文）`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

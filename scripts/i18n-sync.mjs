#!/usr/bin/env node
/**
 * i18n-sync：把前端 messages/zh.json 的 key + 中文源文案同步到 API 数据库，
 * 并扫描代码记录每个 key 的使用位置（file:line），供 admin 翻译管理展示来源。
 *
 * 用法:
 *   node scripts/i18n-sync.mjs
 *
 * 环境变量（可放根 .env）:
 *   I18N_API_URL        API 地址，默认 NEXT_PUBLIC_API_URL 或 http://localhost:3001
 *   I18N_SYNC_TOKEN     直接提供 JWT（优先）
 *   I18N_SYNC_USERNAME  或者用账号密码登录换取 token
 *   I18N_SYNC_PASSWORD
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["web", "music"];
/** 扫描使用位置的目录（相对各 app 根） */
const SCAN_DIRS = ["app", "components", "lib", "hooks"];

/* ── 读取根 .env（不覆盖已有环境变量） ── */
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

/* ── 摊平 zh.json: { ns: { a: { b: "文" } } } → [{namespace, key:"a.b", sourceText}] ── */
function flatten(tree, prefix = "") {
    const entries = [];
    for (const [k, v] of Object.entries(tree)) {
        const keyPath = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") {
            entries.push({ key: keyPath, sourceText: v });
        } else if (v && typeof v === "object") {
            entries.push(...flatten(v, keyPath));
        }
    }
    return entries;
}

/* ── 收集 app 内待扫描源码文件 ── */
function collectSourceFiles(appDir) {
    const files = [];
    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name.startsWith("."))
                    continue;
                walk(full);
            } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
                files.push(full);
            }
        }
    };
    for (const dir of SCAN_DIRS) walk(path.join(appDir, dir));
    return files;
}

/**
 * 在使用了对应 namespace 的文件里找 key 字面量出现的 file:line。
 * 已知局限：动态拼接的 key（如 t(item.labelKey)）找不到精确行，
 * 此时回退记录声明该 namespace 的文件。
 */
function findLocations(appDir, files, namespace, key) {
    const locations = [];
    const nsPattern = new RegExp(
        `(useTranslations|getTranslations)\\s*\\(\\s*(\\{[^}]*namespace:\\s*)?["'\`]${namespace}["'\`]`,
    );
    // key 可能整个作为字面量（含点路径），也可能只有叶子段
    const leaf = key.split(".").pop();
    const keyPattern = new RegExp(`["'\`](${escapeRegExp(key)}|${escapeRegExp(leaf)})["'\`]`);

    for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        if (!nsPattern.test(content)) continue;
        const relative = path.relative(appDir, file);
        const lines = content.split("\n");
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (keyPattern.test(lines[i])) {
                locations.push(`${relative}:${i + 1}`);
                found = true;
                if (locations.length >= 8) return locations;
            }
        }
        if (!found) {
            // namespace 在此文件使用但 key 是动态的 → 记录文件级位置
            locations.push(relative);
        }
    }
    return locations;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── 认证 ── */
async function getToken() {
    if (process.env.I18N_SYNC_TOKEN) return process.env.I18N_SYNC_TOKEN;
    const username = process.env.I18N_SYNC_USERNAME;
    const password = process.env.I18N_SYNC_PASSWORD;
    if (!username || !password) {
        console.error(
            "缺少认证信息：请设置 I18N_SYNC_TOKEN 或 I18N_SYNC_USERNAME/I18N_SYNC_PASSWORD（可放根 .env）",
        );
        process.exit(1);
    }
    const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
        console.error(`登录失败 (${res.status}): ${await res.text()}`);
        process.exit(1);
    }
    const { token } = await res.json();
    return token;
}

/* ── 主流程 ── */
async function main() {
    const token = await getToken();

    for (const app of APPS) {
        const appDir = path.join(ROOT, "apps", app);
        const zhPath = path.join(appDir, "messages", "zh.json");
        if (!fs.existsSync(zhPath)) {
            console.warn(`[${app}] 跳过：找不到 ${zhPath}`);
            continue;
        }

        const tree = JSON.parse(fs.readFileSync(zhPath, "utf8"));
        const sourceFiles = collectSourceFiles(appDir);
        const messages = [];

        for (const [namespace, subtree] of Object.entries(tree)) {
            if (typeof subtree !== "object" || subtree === null) continue;
            for (const { key, sourceText } of flatten(subtree)) {
                messages.push({
                    namespace,
                    key,
                    sourceText,
                    locations: findLocations(appDir, sourceFiles, namespace, key),
                });
            }
        }

        const res = await fetch(`${API_URL}/i18n/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ app, messages }),
        });
        if (!res.ok) {
            console.error(`[${app}] 同步失败 (${res.status}): ${await res.text()}`);
            process.exitCode = 1;
            continue;
        }
        const result = await res.json();
        console.log(
            `[${app}] 同步完成：新增 ${result.created}，更新 ${result.updated}，标记废弃 ${result.orphaned}（共 ${messages.length} 条）`,
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

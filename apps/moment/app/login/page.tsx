"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export default function MomentLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/moment/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "验证失败");
      window.location.href = "/";
    } catch (reason) {
      setError((reason as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center px-5 py-10">
      <div className="w-full max-w-[420px]">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-xs font-medium text-[#6e6e73] hover:text-black"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回精选回忆
        </Link>
        <section className="rounded-[28px] border border-black/[.07] bg-white/80 p-7 shadow-[0_24px_80px_rgba(0,0,0,.08)] backdrop-blur sm:p-9">
          <div className="mb-8 grid h-12 w-12 place-items-center rounded-2xl bg-[#1d1d1f] text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-.04em]">
            解锁私人资料库
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#777]">
            需要管理员密码和动态验证码。验证会话仅保存在当前设备，2
            小时后自动失效。
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#555]">
                管理员账号
              </span>
              <div className="relative">
                <Fingerprint className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
                <input
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 w-full rounded-xl border border-black/10 bg-[#f7f7f5] pl-10 pr-3 text-sm outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#555]">
                密码
              </span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-black/10 bg-[#f7f7f5] pl-10 pr-3 text-sm outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#555]">
                动态验证码或恢复码
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000 000"
                className="h-14 w-full rounded-xl border border-black/10 bg-[#f7f7f5] px-4 text-center text-xl font-semibold tracking-[.3em] outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1267df] text-sm font-semibold text-white transition hover:bg-[#0b5dcc] disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              {loading ? "正在验证…" : "安全解锁"}
            </button>
          </form>
        </section>
        <p className="mt-5 text-center text-[11px] leading-5 text-[#8a8a8f]">
          全程 HTTPS · HttpOnly 会话 · 失败锁定 · 下载审计
        </p>
      </div>
    </main>
  );
}

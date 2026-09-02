"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  FolderPlus,
  HardDrive,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { fetchClient, getApiBaseUrl, getAuthToken } from "@/lib/api";

type Category = {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  _count?: { assets: number };
};
type Asset = {
  id: string;
  title?: string | null;
  originalName: string;
  description?: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  tags: string[];
  categoryId?: string | null;
  mimeType: string;
  size: string;
};
type SyncToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
};
type TrustedDevice = {
  id: string;
  deviceLabel: string;
  lastIp?: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

async function momentFetch(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "请求失败");
  return body;
}

export default function MomentAdminPage() {
  const router = useRouter();
  const [setupEnabled, setSetupEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [momentToken, setMomentToken] = useState("");
  const [login, setLogin] = useState({ username: "", password: "", code: "" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [syncTokens, setSyncTokens] = useState<SyncToken[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [newCategory, setNewCategory] = useState({
    name: "",
    slug: "",
    color: "#7c8f78",
  });
  const [selected, setSelected] = useState<Asset | null>(null);
  const [search, setSearch] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("Johnny’s MacBook");
  const [revealedToken, setRevealedToken] = useState("");
  const [busy, setBusy] = useState(false);
  const activeTrustedDevices = trustedDevices.filter(
    (item) => !item.revokedAt && new Date(item.expiresAt) > new Date(),
  );

  useEffect(() => {
    const cached = window.sessionStorage.getItem("moment_admin_token");
    if (cached) setMomentToken(cached);
    void fetchClient("/moment/auth/setup/status")
      .then((value) => setSetupEnabled(value.enabled))
      .catch((error) => toast.error(error.message));
  }, []);

  const loadAdmin = useCallback(async () => {
    if (!momentToken) return;
    try {
      const query = new URLSearchParams({ limit: "100", visibility: "all" });
      if (search) query.set("q", search);
      const [categoryData, catalog, tokenData, trustedDeviceData] =
        await Promise.all([
          momentFetch("/moment/admin/categories", momentToken),
          momentFetch(`/moment/catalog?${query}`, momentToken),
          momentFetch("/moment/admin/sync-tokens", momentToken),
          momentFetch("/moment/admin/trusted-devices", momentToken),
        ]);
      setCategories(categoryData);
      setAssets(catalog.items);
      setSyncTokens(tokenData);
      setTrustedDevices(trustedDeviceData);
    } catch (error) {
      toast.error((error as Error).message);
      if ((error as Error).message.includes("Token")) {
        window.sessionStorage.removeItem("moment_admin_token");
        setMomentToken("");
      }
    }
  }, [momentToken, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdmin(), 250);
    return () => window.clearTimeout(timer);
  }, [loadAdmin]);

  async function startSetup() {
    setBusy(true);
    try {
      setSetup(
        await fetchClient("/moment/auth/setup/start", {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const value = await fetchClient("/moment/auth/setup/confirm", {
        method: "POST",
        body: JSON.stringify({ code: setupCode }),
      });
      setRecoveryCodes(value.recoveryCodes);
      setSetupEnabled(true);
      setSetup(null);
      toast.success("Moment 双重验证已启用");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/moment/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() || ""}`,
        },
        body: JSON.stringify({ ...login, rememberDevice: false }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "验证失败");
      window.sessionStorage.setItem("moment_admin_token", body.token);
      setMomentToken(body.token);
      setLogin((value) => ({ ...value, password: "", code: "" }));
      toast.success("Moment 管理权限已解锁，2 小时内有效");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    try {
      await momentFetch("/moment/admin/categories", momentToken, {
        method: "POST",
        body: JSON.stringify(newCategory),
      });
      setNewCategory({ name: "", slug: "", color: "#7c8f78" });
      toast.success("分类已添加");
      await loadAdmin();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await momentFetch(`/moment/admin/assets/${selected.id}`, momentToken, {
        method: "PATCH",
        body: JSON.stringify({
          title: selected.title || "",
          description: selected.description || "",
          categoryId: selected.categoryId || null,
          visibility: selected.visibility,
          tags: selected.tags,
        }),
      });
      toast.success("文件配置已保存");
      setSelected(null);
      await loadAdmin();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function createSyncToken(event: FormEvent) {
    event.preventDefault();
    try {
      const value = await momentFetch(
        "/moment/admin/sync-tokens",
        momentToken,
        { method: "POST", body: JSON.stringify({ label: newTokenLabel }) },
      );
      setRevealedToken(value.token);
      await loadAdmin();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (setupEnabled === null)
    return (
      <div className="grid min-h-screen place-items-center text-gray-500">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => router.push("/")}
          className="mb-7 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回仪表板
        </button>
        <div className="mb-8 flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Moment 私人资料库
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              分类、可见性、文件资料和 Mac 同步密钥
            </p>
          </div>
        </div>

        {!setupEnabled ? (
          <section className="max-w-2xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-600" />
              <h2 className="text-xl font-semibold">先启用双重验证</h2>
            </div>
            <p className="text-sm leading-6 text-gray-600">
              Moment 的私密访问与配置必须在管理员密码之外，再通过 TOTP
              动态验证码验证。
            </p>
            {!setup ? (
              <button
                disabled={busy}
                onClick={startSetup}
                className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                开始配置
              </button>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="mb-2 text-xs text-gray-500">
                    在 Apple Passwords、1Password 或 Authenticator
                    中打开下面的链接；也可手动输入密钥。
                  </p>
                  <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="w-fit rounded-2xl border bg-white p-3 shadow-sm">
                      <QRCodeSVG
                        value={setup.otpauthUri}
                        size={180}
                        level="M"
                        marginSize={0}
                        title="Moment 双重验证二维码"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        扫描二维码
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        使用手机相机、Apple Passwords、1Password 或 Google
                        Authenticator 扫描。Mac 上也可以直接打开验证器链接。
                      </p>
                      <a
                        href={setup.otpauthUri}
                        className="mt-3 inline-flex text-sm font-medium text-blue-600"
                      >
                        在验证器中打开
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg border bg-white p-3 font-mono text-sm">
                    <span>{setup.secret}</span>
                    <button
                      onClick={() =>
                        void navigator.clipboard.writeText(setup.secret)
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={setupCode}
                    onChange={(e) =>
                      setSetupCode(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="输入 6 位验证码"
                    className="h-11 flex-1 rounded-xl border px-3"
                  />
                  <button
                    disabled={busy}
                    onClick={confirmSetup}
                    className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
                  >
                    确认启用
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : recoveryCodes.length > 0 ? (
          <section className="max-w-2xl rounded-2xl border border-emerald-200 bg-white p-7 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Check className="h-5 w-5 text-emerald-600" />
              保存恢复码
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              每个恢复码只能使用一次。请保存到密码管理器，不要截图后留在照片库。
            </p>
            <div className="my-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-4 font-mono text-sm">
              {recoveryCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(recoveryCodes.join("\n"))
              }
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
            >
              复制全部
            </button>
            <button
              onClick={() => setRecoveryCodes([])}
              className="ml-2 rounded-xl border px-4 py-2 text-sm"
            >
              我已安全保存
            </button>
          </section>
        ) : !momentToken ? (
          <section className="max-w-md rounded-2xl border bg-white p-7 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <LockKeyhole className="h-5 w-5" />
              <h2 className="text-xl font-semibold">重新验证以管理 Moment</h2>
            </div>
            <form onSubmit={unlock} className="space-y-3">
              <input
                required
                autoComplete="username"
                placeholder="管理员账号"
                value={login.username}
                onChange={(e) =>
                  setLogin({ ...login, username: e.target.value })
                }
                className="h-11 w-full rounded-xl border px-3"
              />
              <input
                required
                type="password"
                autoComplete="current-password"
                placeholder="密码"
                value={login.password}
                onChange={(e) =>
                  setLogin({ ...login, password: e.target.value })
                }
                className="h-11 w-full rounded-xl border px-3"
              />
              <input
                required
                autoComplete="one-time-code"
                placeholder="动态验证码或恢复码"
                value={login.code}
                onChange={(e) => setLogin({ ...login, code: e.target.value })}
                className="h-11 w-full rounded-xl border px-3"
              />
              <button
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white"
              >
                <KeyRound className="h-4 w-4" />
                解锁管理
              </button>
            </form>
          </section>
        ) : (
          <div className="space-y-7">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
                <FolderPlus className="h-5 w-5" />
                分类
              </h2>
              <div className="mb-5 flex flex-wrap gap-2">
                {categories.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: item.color || "#999" }}
                    />
                    {item.name}
                    <span className="text-xs text-gray-400">
                      {item._count?.assets || 0}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm(`删除分类“${item.name}”？`)) return;
                        try {
                          await momentFetch(
                            `/moment/admin/categories/${item.id}`,
                            momentToken,
                            { method: "DELETE" },
                          );
                          await loadAdmin();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={createCategory}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_60px_auto]"
              >
                <input
                  required
                  placeholder="分类名称"
                  value={newCategory.name}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, name: e.target.value })
                  }
                  className="h-10 rounded-xl border px-3 text-sm"
                />
                <input
                  required
                  pattern="[a-z0-9-]+"
                  placeholder="slug，如 family"
                  value={newCategory.slug}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, slug: e.target.value })
                  }
                  className="h-10 rounded-xl border px-3 text-sm"
                />
                <input
                  type="color"
                  value={newCategory.color}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, color: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border p-1"
                />
                <button className="rounded-xl bg-slate-900 px-4 text-sm text-white">
                  添加分类
                </button>
              </form>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold">文件配置</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索文件…"
                    className="h-10 rounded-xl border pl-9 pr-3 text-sm"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs text-gray-500">
                    <tr>
                      <th className="pb-3 font-medium">文件</th>
                      <th className="pb-3 font-medium">分类</th>
                      <th className="pb-3 font-medium">可见性</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => (
                      <tr key={asset.id} className="border-b last:border-0">
                        <td className="max-w-xs truncate py-3 pr-4 font-medium">
                          {asset.title || asset.originalName}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {categories.find(
                            (item) => item.id === asset.categoryId,
                          )?.name || "未分类"}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${asset.visibility === "PUBLIC" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                          >
                            {asset.visibility === "PUBLIC"
                              ? "精选公开"
                              : "仅自己"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setSelected({ ...asset })}
                            className="rounded-lg border px-3 py-1.5 text-xs"
                          >
                            配置
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {assets.length === 0 && (
                  <p className="py-10 text-center text-sm text-gray-400">
                    尚无文件，请先从 Mac 同步
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <Smartphone className="h-5 w-5" />
                可信设备
              </h2>
              <p className="mb-5 text-sm leading-6 text-gray-500">
                完成密码和动态验证码后，Moment 可在同一浏览器中保持 7
                天免验证。设备凭证受 HttpOnly Cookie 保护；IP
                变化只记录风险事件，不会因 VPN 或网络切换阻止访问。
              </p>
              <div className="space-y-2">
                {activeTrustedDevices.length === 0 && (
                  <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
                    暂无可信设备
                  </p>
                )}
                {activeTrustedDevices.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium">{item.deviceLabel}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        最近使用{" "}
                        {new Date(item.lastUsedAt).toLocaleString("zh-CN")}
                        {` · 到期 ${new Date(item.expiresAt).toLocaleString("zh-CN")}`}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await momentFetch(
                            `/moment/admin/trusted-devices/${item.id}`,
                            momentToken,
                            { method: "DELETE" },
                          );
                          toast.success("可信设备已撤销");
                          await loadAdmin();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                      className="self-start text-xs font-medium text-red-600 sm:self-auto"
                    >
                      撤销访问
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Mac 同步密钥</h2>
              <p className="mb-5 text-sm text-gray-500">
                密钥只具备同步写入权限，不能读取或下载资料。创建后仅显示一次。
              </p>
              <form onSubmit={createSyncToken} className="flex max-w-lg gap-2">
                <input
                  required
                  value={newTokenLabel}
                  onChange={(e) => setNewTokenLabel(e.target.value)}
                  className="h-10 flex-1 rounded-xl border px-3 text-sm"
                />
                <button className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                  创建密钥
                </button>
              </form>
              {revealedToken && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-amber-800">
                    立即复制，此密钥不会再次显示
                  </p>
                  <div className="flex gap-2">
                    <code className="min-w-0 flex-1 break-all text-xs">
                      {revealedToken}
                    </code>
                    <button
                      onClick={() =>
                        void navigator.clipboard.writeText(revealedToken)
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-5 space-y-2">
                {syncTokens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-gray-400">
                        {item.revokedAt
                          ? "已撤销"
                          : item.lastUsedAt
                            ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString("zh-CN")}`
                            : "尚未使用"}
                      </p>
                    </div>
                    {!item.revokedAt && (
                      <button
                        onClick={async () => {
                          await momentFetch(
                            `/moment/admin/sync-tokens/${item.id}`,
                            momentToken,
                            { method: "DELETE" },
                          );
                          await loadAdmin();
                        }}
                        className="text-xs text-red-600"
                      >
                        撤销
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5"
          onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <form
            onSubmit={saveAsset}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-xl font-semibold">配置文件</h2>
            <input
              value={selected.title || ""}
              onChange={(e) =>
                setSelected({ ...selected, title: e.target.value })
              }
              placeholder={selected.originalName}
              className="h-10 w-full rounded-xl border px-3 text-sm"
            />
            <textarea
              value={selected.description || ""}
              onChange={(e) =>
                setSelected({ ...selected, description: e.target.value })
              }
              placeholder="描述"
              className="min-h-24 w-full rounded-xl border p-3 text-sm"
            />
            <select
              value={selected.categoryId || ""}
              onChange={(e) =>
                setSelected({ ...selected, categoryId: e.target.value || null })
              }
              className="h-10 w-full rounded-xl border px-3 text-sm"
            >
              <option value="">未分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={selected.visibility}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  visibility: e.target.value as "PUBLIC" | "PRIVATE",
                })
              }
              className="h-10 w-full rounded-xl border px-3 text-sm"
            >
              <option value="PRIVATE">仅自己可见</option>
              <option value="PUBLIC">精选公开</option>
            </select>
            <input
              value={selected.tags.join(", ")}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  tags: e.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder="标签，用逗号分隔"
              className="h-10 w-full rounded-xl border px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

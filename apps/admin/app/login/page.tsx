"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function AdminLoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rememberDevice, setRememberDevice] = useState(true);
    const [trustedDays, setTrustedDays] = useState(7);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, rememberDevice, trustedDays }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "登录失败");
            }

            await res.json();

            toast.success("登录成功");
            router.push("/");
            router.refresh();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "登录失败";
            toast.error(message);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-50 text-amber-600 mb-4">
                        <Lock className="w-6 h-6" />
                    </div>

                    <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                        <input
                            type="checkbox"
                            checked={rememberDevice}
                            onChange={(event) => setRememberDevice(event.target.checked)}
                            className="mt-0.5"
                        />
                        <span className="flex-1">
                            <span className="block font-medium text-gray-900">信任这台设备</span>
                            <span className="mt-1 block text-xs leading-5 text-gray-500">设备凭证使用 HttpOnly Cookie；网络或 VPN 变化仅作为风险记录。</span>
                        </span>
                    </label>
                    {rememberDevice && (
                        <div className="space-y-2">
                            <Label htmlFor="trusted-days">免登录期限</Label>
                            <select
                                id="trusted-days"
                                value={trustedDays}
                                onChange={(event) => setTrustedDays(Number(event.target.value))}
                                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                            >
                                <option value={1}>1 天</option>
                                <option value={7}>7 天</option>
                                <option value={30}>30 天</option>
                            </select>
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">管理员登录</h1>
                    <p className="text-sm text-gray-500 mt-2">请使用您的凭证访问后台</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="username">用户名</Label>
                        <Input
                            id="username"
                            type="text"
                            placeholder="请输入用户名"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="bg-gray-50 border-gray-200 focus:bg-white"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">密码</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="请输入密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="bg-gray-50 border-gray-200 focus:bg-white"
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                        disabled={isLoading}
                    >
                        {isLoading ? "登录中..." : "登录"}
                    </Button>
                </form>
            </div>
        </div>
    );
}

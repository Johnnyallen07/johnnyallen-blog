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
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Simulate API call for "simple" auth as requested
            // In a real app, this should be a server action or API route
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (username === "Johnny" && password === "20031107") {
                // Set cookie manually for this simple implementation
                document.cookie = "auth_token=valid; path=/; max-age=86400; SameSite=Strict";
                toast.success("登录成功");
                router.push("/admin");
                router.refresh();
            } else {
                toast.error("用户名或密码错误");
                setIsLoading(false);
            }
        } catch (error) {
            console.error(error);
            toast.error("登录失败");
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 mb-4">
                        <Lock className="w-6 h-6" />
                    </div>
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
                        className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 transition-opacity"
                        disabled={isLoading}
                    >
                        {isLoading ? "登录中..." : "登录"}
                    </Button>
                </form>
            </div>
        </div>
    );
}

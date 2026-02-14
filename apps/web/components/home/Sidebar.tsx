"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Search,
  Github,
  Twitter,
  Mail,
  Rss,
  Home,
  FolderOpen,
  Calendar,
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "首页", icon: Home, hoverColor: "hover:text-cyan-600" },
  { href: "/categories", label: "分类", icon: FolderOpen, hoverColor: "hover:text-cyan-600" },
  { href: "/archive", label: "归档", icon: Calendar, hoverColor: "hover:text-purple-600" },
  { href: "/about", label: "关于我", icon: User, hoverColor: "hover:text-pink-600" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="relative overflow-hidden bg-transparent rounded-2xl border border-white/30 shadow-lg">
      {/* 背景装饰 - 主题符号 */}
      <div className="absolute top-4 right-6 text-3xl opacity-10 rotate-12">
        🎵
      </div>
      <div className="absolute bottom-12 left-4 text-2xl opacity-10 -rotate-12">
        🎮
      </div>
      <div className="absolute top-1/3 right-3 text-xl opacity-10">💻</div>
      <div className="absolute bottom-1/3 left-6 text-2xl opacity-10 rotate-45">
        🎹
      </div>
      <div className="absolute top-1/2 right-8 text-xl opacity-10">📐</div>

      {/* 网格背景 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808005_1px,transparent_1px),linear-gradient(to_bottom,#80808005_1px,transparent_1px)] bg-[size:20px_20px]" />

      {/* 内容区域 */}
      <div className="relative p-6 space-y-6">
        {/* Logo 区域 */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-block hover:scale-105 transition-transform"
          >
            <div className="w-40 h-40 mx-auto flex items-center justify-center">
              <Image
                src="/images/logo.png"
                alt="JohnnyBlog Logo"
                width={160}
                height={160}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </Link>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        {/* 个人信息 */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md mb-3 bg-gradient-to-br from-cyan-100 to-purple-100 flex items-center justify-center">
            <span className="text-4xl">👨‍💻</span>
          </div>
          <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
            Johnny
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed text-center mt-2 mb-4">
            拉小提琴，弹钢琴，写代码。在虚拟世界建造，用音符表达，用代码创造 🌱
          </p>

          {/* 社交媒体 */}
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/20 border border-white/40 flex items-center justify-center transition-all group shadow-sm">
              <Github className="h-4 w-4 text-gray-600 group-hover:text-gray-900" />
            </button>
            <button className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/20 border border-white/40 flex items-center justify-center transition-all group shadow-sm">
              <Twitter className="h-4 w-4 text-gray-600 group-hover:text-blue-500" />
            </button>
            <button className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/20 border border-white/40 flex items-center justify-center transition-all group shadow-sm">
              <Mail className="h-4 w-4 text-gray-600 group-hover:text-red-500" />
            </button>
            <button className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/20 border border-white/40 flex items-center justify-center transition-all group shadow-sm">
              <Rss className="h-4 w-4 text-gray-600 group-hover:text-orange-500" />
            </button>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        {/* 站内搜索 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            站内搜索
          </h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文章..."
              className="w-full pl-10 pr-4 py-2.5 bg-transparent backdrop-blur-sm border border-white/40 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        {/* 导航 */}
        <nav className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-all shadow-sm hover:shadow-md border border-white/40 ${
                  isActive
                    ? "text-cyan-600 bg-white/20 backdrop-blur-sm"
                    : `text-gray-700 bg-transparent backdrop-blur-sm hover:bg-white/20 ${item.hoverColor}`
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        {/* 一言 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-4 shadow-sm">
          <div className="text-center">
            <div className="text-2xl mb-2">💭</div>
            <p className="text-sm text-gray-700 italic leading-relaxed">
              &ldquo;代码如诗，音乐如画&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

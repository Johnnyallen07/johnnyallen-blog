"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Search,
  X,
  Github,
  Home,
  Calendar,
  User,
  Linkedin,
} from "lucide-react";
import { BILIBILI_URL } from "@/lib/contact";
import { TagCloud } from "./TagCloud";
import { WechatContactDialog } from "./WechatContactDialog";

/** 微信 SVG 图标 */
function WechatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  );
}

/** Bilibili SVG 图标 */
function BilibiliIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "首页", icon: Home, hoverColor: "hover:text-slate-950" },
  { href: "/archive", label: "归档", icon: Calendar, hoverColor: "hover:text-slate-950" },
  { href: "/about", label: "关于我", icon: User, hoverColor: "hover:text-slate-950" },
];

interface SidebarTag {
  id: string;
  name: string;
  slug: string;
}

interface SidebarProps {
  searchQuery: string;
  selectedTag: SidebarTag | null;
  onSearchChange: (query: string) => void;
  onSelectTag: (tag: SidebarTag) => void;
  onClearFilters: () => void;
}

export function Sidebar({
  searchQuery,
  selectedTag,
  onSearchChange,
  onSelectTag,
  onClearFilters,
}: SidebarProps) {
  const pathname = usePathname();
  const [wechatOpen, setWechatOpen] = useState(false);
  const hasActiveFilters = searchQuery.trim().length > 0 || selectedTag !== null;

  return (
    <div className="relative overflow-hidden bg-white/[0.18] rounded-2xl border border-slate-200/60 shadow-lg shadow-slate-900/5">
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

      {/* 自定义动画 */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-8px) rotate(5deg); }
          66% { transform: translateY(5px) rotate(-5deg); }
        }
      `}</style>

      {/* 内容区域 */}
      <div className="relative p-6 space-y-6">
        {/* 个人信息 */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md mb-3 bg-slate-100 flex items-center justify-center">
            <Image
              src="/images/avatar.png"
              alt="Johnny 头像"
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-xl font-bold text-slate-950">
            Johnny
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed text-center mt-2 mb-4">
            写工业代码永远夹带f**k的抽象ENTJ，游戏完美主义者，数学ADHD患者，对计算机PTSD，向往音乐极致的业余小提琴手。
          </p>

          {/* 社交媒体 */}
          <div className="flex gap-2">
            {/* GitHub */}
            <a
              href="https://github.com/Johnnyallen07"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/30 border border-slate-200/70 flex items-center justify-center transition-all group shadow-sm hover:shadow-md"
              style={{ animation: 'float 6s ease-in-out infinite' }}
            >
              <Github className="h-4 w-4 text-gray-600 group-hover:text-gray-900 transition-colors" />
            </a>

            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/in/jieyu-zhao-88b264296/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/30 border border-slate-200/70 flex items-center justify-center transition-all group shadow-sm hover:shadow-md"
              style={{ animation: 'float 6s ease-in-out infinite 1.5s' }}
            >
              <Linkedin className="h-4 w-4 text-gray-600 group-hover:text-blue-600 transition-colors" />
            </a>

            {/* 微信 */}
            <button
              type="button"
              onClick={() => setWechatOpen(true)}
              aria-label="打开微信二维码"
              className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/30 border border-slate-200/70 flex items-center justify-center transition-all group shadow-sm hover:shadow-md"
              style={{ animation: 'float 6s ease-in-out infinite 3s' }}
            >
              <WechatIcon className="h-4 w-4 text-gray-600 group-hover:text-green-600 transition-colors" />
            </button>

            {/* Bilibili */}
            <a
              href={BILIBILI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-lg bg-transparent backdrop-blur-sm hover:bg-white/30 border border-slate-200/70 flex items-center justify-center transition-all group shadow-sm hover:shadow-md"
              style={{ animation: 'float 6s ease-in-out infinite 4.5s' }}
            >
              <BilibiliIcon className="h-4 w-4 text-gray-600 group-hover:text-pink-500 transition-colors" />
            </a>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        {/* 站内搜索 */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-700">
              站内搜索
            </h4>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                aria-label="清除筛选"
                className="h-7 w-7 rounded-lg border border-slate-200/70 bg-white/30 text-gray-500 transition-all hover:border-slate-500 hover:bg-white/55 hover:text-slate-950"
              >
                <X className="mx-auto h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索文章..."
              className="w-full pl-10 pr-4 py-2.5 bg-transparent backdrop-blur-sm border border-slate-200/70 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition-all shadow-sm"
            />
          </div>
          {selectedTag && (
            <p className="mt-2 text-xs text-gray-500">
              #{selectedTag.name}
            </p>
          )}
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

        <TagCloud
          selectedTagSlug={selectedTag?.slug}
          onSelectTag={onSelectTag}
        />

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
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-all shadow-sm hover:shadow-md border border-slate-200/70 ${isActive
                    ? "text-slate-950 bg-white/40 backdrop-blur-sm"
                    : `text-gray-700 bg-transparent backdrop-blur-sm hover:bg-white/20 ${item.hoverColor}`
                  }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

      </div>
      <WechatContactDialog open={wechatOpen} onOpenChange={setWechatOpen} />
    </div>
  );
}

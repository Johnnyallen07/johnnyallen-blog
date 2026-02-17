"use client";

import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 relative z-10">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>本博客网站由抠搜的 Antigravity 和被 Cursor 坑了 40 刀的 Agent 赞助开发，</p>
          <p>本博客素材均由 AI 生成，如有侵权请告 Gemini Banana Pro</p>
          <p>© 2026 JohnnyBlog，由无聊和抽象创作</p>
        </div>
      </div>
    </footer>
  );
}

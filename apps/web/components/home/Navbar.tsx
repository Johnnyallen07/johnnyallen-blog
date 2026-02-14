"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/categories", label: "分类" },
  { href: "/archive", label: "归档" },
  { href: "/about", label: "关于我" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 relative">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-cyan-600 transition-colors group"
          >
            <Home className="h-5 w-5 group-hover:scale-110 transition-transform" />
            <span className="font-medium">返回首页</span>
          </Link>

          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive
                      ? "text-cyan-600 font-medium"
                      : "text-gray-600 hover:text-gray-900 transition-colors"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

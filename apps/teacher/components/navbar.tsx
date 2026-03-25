"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, BookOpen, Map } from "lucide-react";

const navLinks = [
    { href: "/", label: "首页", icon: <GraduationCap className="w-4 h-4" /> },
    { href: "/resources", label: "题库资料", icon: <BookOpen className="w-4 h-4" /> },
    { href: "/roadmap", label: "学习路线", icon: <Map className="w-4 h-4" /> },
];

export function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[var(--color-border)]">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-highlight)] flex items-center justify-center group-hover:shadow-lg group-hover:shadow-[var(--color-accent)]/20 transition-all">
                        <GraduationCap className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="text-base font-bold tracking-tight text-[var(--color-text)]">
                        Johnny Tutoring
                    </span>
                </Link>
                <div className="flex items-center gap-1">
                    {navLinks.map((link) => {
                        const isActive =
                            pathname === link.href ||
                            (link.href !== "/" &&
                                pathname.startsWith(link.href));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive
                                        ? "text-[var(--color-accent)] bg-[var(--color-accent)]/5 font-medium"
                                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-card)]"
                                    }`}
                            >
                                {link.icon}
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}

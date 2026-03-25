import Link from "next/link";
import {
    BookOpen,
    ArrowRight,
    Calculator,
    Sigma,
    Atom,
    FileText,
} from "lucide-react";

const subjects = [
    {
        name: "AP 微积分",
        code: "ap-calculus",
        icon: <Calculator className="w-6 h-6" />,
        color: "var(--color-ap)",
        description: "AP Calculus AB/BC 全面覆盖",
    },
    {
        name: "A-Level 数学",
        code: "a-level-math",
        icon: <Sigma className="w-6 h-6" />,
        color: "var(--color-al)",
        description: "Pure Math, Statistics, Mechanics",
    },
    {
        name: "MAT",
        code: "mat",
        icon: <Atom className="w-6 h-6" />,
        color: "var(--color-mat)",
        description: "牛津数学入学考试真题与训练",
    },
    {
        name: "IB 数学",
        code: "ib-math",
        icon: <BookOpen className="w-6 h-6" />,
        color: "var(--color-ib)",
        description: "IB Math AA/AI HL & SL",
    },
];

export default function HomePage() {
    return (
        <main className="min-h-screen pt-16">
            {/* Hero */}
            <section className="relative py-24 px-6 overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-10 -left-20 w-72 h-72 rounded-full bg-[var(--color-accent)] opacity-[0.03] blur-[100px] animate-float" />
                    <div className="absolute bottom-10 -right-20 w-72 h-72 rounded-full bg-[var(--color-highlight)] opacity-[0.04] blur-[100px] animate-float" style={{ animationDelay: "3s" }} />
                </div>

                <div className="relative max-w-6xl mx-auto text-center">
                    <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.1] mb-6 animate-fade-in-up">
                        <span className="gradient-text">Johnny Tutoring</span>
                    </h1>

                    <p className="text-lg text-[var(--color-text-muted)] max-w-lg mx-auto mb-10 animate-fade-in-up leading-relaxed" style={{ animationDelay: "0.1s" }}>
                        免费资料库，包括AI生成的各类题库
                    </p>

                    <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                        <Link
                            href="/resources"
                            className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-dark)] text-white font-semibold text-sm hover:shadow-lg hover:shadow-[var(--color-accent)]/20 transition-all"
                        >
                            <BookOpen className="w-4 h-4" />
                            浏览题库
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Subject Cards */}
            <section className="py-16 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-2xl md:text-3xl font-bold mb-3">学科分类</h2>
                        <p className="text-sm text-[var(--color-text-muted)]">按学科浏览笔记与题库资料</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {subjects.map((subject, i) => (
                            <Link
                                key={subject.code}
                                href={`/resources?subject=${subject.code}`}
                                className="card p-6 card-hover animate-fade-in-up group"
                                style={{ animationDelay: `${0.1 * i}s` }}
                            >
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${subject.color} 10%, transparent)`,
                                        color: subject.color,
                                    }}
                                >
                                    {subject.icon}
                                </div>
                                <h3 className="text-base font-bold mb-1">{subject.name}</h3>
                                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-3">
                                    {subject.description}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-[var(--color-text-dim)]">
                                    <FileText className="w-3 h-3" />
                                    即将上线
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 px-6 border-t border-[var(--color-border)]">
                <div className="max-w-6xl mx-auto text-center text-xs text-[var(--color-text-dim)]">
                    © {new Date().getFullYear()} Johnny Tutoring
                </div>
            </footer>
        </main>
    );
}

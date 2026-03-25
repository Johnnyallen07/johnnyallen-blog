"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    BookOpen,
    FileText,
    Search,
    X,
    Eye,
    Calculator,
    Sigma,
    Atom,
    ChevronRight,
    Filter,
    Tag,
} from "lucide-react";

interface Resource {
    id: string;
    title: string;
    subject: string;
    subjectLabel: string;
    category: "notes" | "exam" | "exercise";
    categoryLabel: string;
    description: string;
    pdfUrl: string;
    tags: string[];
    date: string;
}

const SUBJECTS = [
    { code: "all", label: "全部", icon: <BookOpen className="w-4 h-4" />, color: "var(--color-accent)" },
    { code: "ap-calculus", label: "AP 微积分", icon: <Calculator className="w-4 h-4" />, color: "var(--color-ap)" },
    { code: "a-level-math", label: "A-Level 数学", icon: <Sigma className="w-4 h-4" />, color: "var(--color-al)" },
    { code: "mat", label: "MAT", icon: <Atom className="w-4 h-4" />, color: "var(--color-mat)" },
    { code: "ib-math", label: "IB 数学", icon: <BookOpen className="w-4 h-4" />, color: "var(--color-ib)" },
];

const CATEGORIES = [
    { code: "all", label: "全部类型" },
    { code: "notes", label: "笔记" },
    { code: "exam", label: "真题" },
    { code: "exercise", label: "练习" },
];

// Demo resources — 后续可以从 API 获取
const DEMO_RESOURCES: Resource[] = [
    {
        id: "1",
        title: "AP Calculus AB 微分核心公式总结",
        subject: "ap-calculus",
        subjectLabel: "AP 微积分",
        category: "notes",
        categoryLabel: "笔记",
        description: "涵盖极限、导数、微分方程等核心考点的公式速查表，适合考前复习。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["微分", "公式", "AB"],
        date: "2026-02",
    },
    {
        id: "2",
        title: "AP Calculus BC 2024 真题解析",
        subject: "ap-calculus",
        subjectLabel: "AP 微积分",
        category: "exam",
        categoryLabel: "真题",
        description: "2024 年 AP Calculus BC 考试全真题详细解析，含评分标准。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["真题", "2024", "BC"],
        date: "2026-01",
    },
    {
        id: "3",
        title: "A-Level Pure Math 积分技巧专练",
        subject: "a-level-math",
        subjectLabel: "A-Level 数学",
        category: "exercise",
        categoryLabel: "练习",
        description: "精选 30 道积分练习题，涵盖换元法、分部积分、部分分式等技巧。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["积分", "Pure Math", "专练"],
        date: "2026-02",
    },
    {
        id: "4",
        title: "A-Level Statistics 概率分布笔记",
        subject: "a-level-math",
        subjectLabel: "A-Level 数学",
        category: "notes",
        categoryLabel: "笔记",
        description: "二项分布、正态分布、泊松分布等核心内容详解。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["Statistics", "概率", "分布"],
        date: "2026-01",
    },
    {
        id: "5",
        title: "MAT 2023 真题 + 详细解题过程",
        subject: "mat",
        subjectLabel: "MAT",
        category: "exam",
        categoryLabel: "真题",
        description: "牛津数学入学考试 2023 年真题全解，包含思路分析和解题技巧。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["真题", "2023", "牛津"],
        date: "2025-12",
    },
    {
        id: "6",
        title: "MAT 组合与数论专题训练",
        subject: "mat",
        subjectLabel: "MAT",
        category: "exercise",
        categoryLabel: "练习",
        description: "覆盖排列组合、模运算、整除性质等 MAT 高频考点。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["组合", "数论", "专题"],
        date: "2025-11",
    },
    {
        id: "7",
        title: "IB Math AA HL 向量与空间几何",
        subject: "ib-math",
        subjectLabel: "IB 数学",
        category: "notes",
        categoryLabel: "笔记",
        description: "向量运算、直线与平面方程、空间距离与角度等内容。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["向量", "AA HL", "空间几何"],
        date: "2026-02",
    },
    {
        id: "8",
        title: "IB Math AI SL 统计与概率复习",
        subject: "ib-math",
        subjectLabel: "IB 数学",
        category: "notes",
        categoryLabel: "笔记",
        description: "AI SL 统计模块完整复习资料，包含 GDC 操作指南。",
        pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags: ["AI SL", "统计", "GDC"],
        date: "2026-01",
    },
];

function getSubjectColor(subjectCode: string): string {
    const s = SUBJECTS.find((sub) => sub.code === subjectCode);
    return s?.color || "var(--color-accent)";
}

function getCategoryBadge(category: string): string {
    switch (category) {
        case "notes":
            return "bg-blue-500/10 text-blue-400 border-blue-500/20";
        case "exam":
            return "bg-orange-500/10 text-orange-400 border-orange-500/20";
        case "exercise":
            return "bg-green-500/10 text-green-400 border-green-500/20";
        default:
            return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
}

function ResourcesContent() {
    const searchParams = useSearchParams();
    const initialSubject = searchParams.get("subject") || "all";

    const [activeSubject, setActiveSubject] = useState(initialSubject);
    const [activeCategory, setActiveCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [previewResource, setPreviewResource] = useState<Resource | null>(null);

    const filteredResources = DEMO_RESOURCES.filter((r) => {
        if (activeSubject !== "all" && r.subject !== activeSubject) return false;
        if (activeCategory !== "all" && r.category !== activeCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                r.title.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q) ||
                r.tags.some((t) => t.toLowerCase().includes(q))
            );
        }
        return true;
    });

    const handlePreview = useCallback((resource: Resource) => {
        setPreviewResource(resource);
    }, []);

    const closePreview = useCallback(() => {
        setPreviewResource(null);
    }, []);

    return (
        <main className="min-h-screen pt-16">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-8 animate-fade-in-up">
                    <h1 className="text-3xl font-bold mb-2">题库资料</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        按学科分类的笔记、真题和练习，点击预览 PDF
                    </p>
                </div>

                {/* Search + Filters */}
                <div className="space-y-4 mb-8 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索资料标题、标签..."
                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--color-surface-light)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors text-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Subject Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <Filter className="w-4 h-4 text-[var(--color-text-dim)] flex-shrink-0" />
                        {SUBJECTS.map((s) => (
                            <button
                                key={s.code}
                                onClick={() => setActiveSubject(s.code)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeSubject === s.code
                                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                                    : "bg-[var(--color-surface-light)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-[var(--color-border-light)]"
                                    }`}
                            >
                                {s.icon}
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Category Filter */}
                    <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-[var(--color-text-dim)] flex-shrink-0" />
                        {CATEGORIES.map((c) => (
                            <button
                                key={c.code}
                                onClick={() => setActiveCategory(c.code)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${activeCategory === c.code
                                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                                    : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                                    }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resource Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {filteredResources.map((resource, i) => {
                        const color = getSubjectColor(resource.subject);
                        return (
                            <div
                                key={resource.id}
                                className="card p-5 card-hover cursor-pointer animate-fade-in-up group"
                                style={{ animationDelay: `${0.05 * i}s` }}
                                onClick={() => handlePreview(resource)}
                            >
                                <div className="flex items-start gap-4">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                                        style={{
                                            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                                            color,
                                        }}
                                    >
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span
                                                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                                style={{
                                                    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                                                    color,
                                                }}
                                            >
                                                {resource.subjectLabel}
                                            </span>
                                            <span
                                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${getCategoryBadge(resource.category)}`}
                                            >
                                                {resource.categoryLabel}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-bold mb-1 truncate group-hover:text-[var(--color-text)] transition-colors">
                                            {resource.title}
                                        </h3>
                                        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2 mb-2">
                                            {resource.description}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex gap-1 flex-wrap">
                                                {resource.tags.slice(0, 3).map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-1 text-[var(--color-accent)] text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Eye className="w-3.5 h-3.5" />
                                                预览
                                                <ChevronRight className="w-3 h-3" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {filteredResources.length === 0 && (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-surface-light)] flex items-center justify-center">
                            <Search className="w-8 h-8 text-[var(--color-text-dim)]" />
                        </div>
                        <h3 className="text-base font-semibold mb-2">未找到相关资料</h3>
                        <p className="text-sm text-[var(--color-text-muted)]">
                            尝试切换学科或修改搜索关键词
                        </p>
                    </div>
                )}
            </div>

            {/* PDF Preview Modal */}
            {previewResource && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
                    onClick={closePreview}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

                    {/* Modal */}
                    <div
                        className="relative w-full max-w-4xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden animate-fade-in-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                            <div className="flex items-center gap-3 min-w-0">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${getSubjectColor(previewResource.subject)} 15%, transparent)`,
                                        color: getSubjectColor(previewResource.subject),
                                    }}
                                >
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold truncate">
                                        {previewResource.title}
                                    </h3>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        {previewResource.subjectLabel} · {previewResource.categoryLabel}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closePreview}
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* PDF Viewer */}
                        <div className="flex-1 pdf-viewer-container">
                            <iframe
                                src={previewResource.pdfUrl}
                                title={previewResource.title}
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default function ResourcesPage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen pt-16">
                <div className="max-w-6xl mx-auto px-6 py-8 text-center text-[var(--color-text-muted)]">
                    加载中...
                </div>
            </main>
        }>
            <ResourcesContent />
        </Suspense>
    );
}

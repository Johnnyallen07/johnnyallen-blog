import {
    Calculator,
    Sigma,
    Atom,
    BookOpen,
    CheckCircle,
    Clock,
    Target,
    TrendingUp,
    Star,
    ArrowRight,
    Lightbulb,
} from "lucide-react";
import Link from "next/link";

interface RoadmapStep {
    phase: string;
    title: string;
    duration: string;
    topics: string[];
    tips: string;
    status: "completed" | "current" | "upcoming";
}

interface SubjectRoadmap {
    code: string;
    name: string;
    fullName: string;
    icon: React.ReactNode;
    color: string;
    overview: string;
    totalDuration: string;
    difficulty: string;
    steps: RoadmapStep[];
}

const roadmaps: SubjectRoadmap[] = [
    {
        code: "ap-calculus",
        name: "AP 微积分",
        fullName: "AP Calculus AB / BC",
        icon: <Calculator className="w-6 h-6" />,
        color: "var(--color-ap)",
        overview: "从基础函数到高级积分，系统掌握 AP 微积分考试全部考点",
        totalDuration: "6-8 个月",
        difficulty: "中等偏难",
        steps: [
            {
                phase: "Phase 1",
                title: "预备知识",
                duration: "2-3 周",
                topics: ["函数与图像", "三角函数", "指数对数函数", "极坐标基础"],
                tips: "确保代数和预微积分基础扎实",
                status: "completed",
            },
            {
                phase: "Phase 2",
                title: "极限与连续",
                duration: "3-4 周",
                topics: ["极限定义与计算", "夹逼定理", "连续性", "中值定理"],
                tips: "理解 ε-δ 定义有助于深入理解",
                status: "completed",
            },
            {
                phase: "Phase 3",
                title: "微分",
                duration: "5-6 周",
                topics: ["导数定义", "求导法则", "链式法则", "隐函数求导", "相关变化率", "优化问题"],
                tips: "这是最重要的章节，务必大量练习",
                status: "current",
            },
            {
                phase: "Phase 4",
                title: "积分",
                duration: "5-6 周",
                topics: ["不定积分", "定积分", "面积与体积", "换元积分法", "分部积分 (BC)"],
                tips: "掌握基本积分公式后重点练习技巧题",
                status: "upcoming",
            },
            {
                phase: "Phase 5",
                title: "级数 (BC)",
                duration: "4-5 周",
                topics: ["数列与级数", "收敛判别", "Taylor 展开", "Maclaurin 展开", "误差估计"],
                tips: "仅 BC 考试需要，重点掌握收敛判别法",
                status: "upcoming",
            },
            {
                phase: "Phase 6",
                title: "考前冲刺",
                duration: "3-4 周",
                topics: ["真题模拟", "FRQ 专项训练", "易错点回顾", "计算器技巧"],
                tips: "每周至少做 2 套完整真题，严格计时",
                status: "upcoming",
            },
        ],
    },
    {
        code: "a-level-math",
        name: "A-Level 数学",
        fullName: "A-Level Mathematics (Edexcel / CIE)",
        icon: <Sigma className="w-6 h-6" />,
        color: "var(--color-al)",
        overview: "涵盖 Pure Math、Statistics 和 Mechanics 三大模块",
        totalDuration: "10-12 个月",
        difficulty: "中等",
        steps: [
            {
                phase: "Phase 1",
                title: "Pure Math 基础",
                duration: "6-8 周",
                topics: ["代数与函数", "坐标几何", "数列与级数", "三角学"],
                tips: "AS 阶段核心内容，打好基础",
                status: "completed",
            },
            {
                phase: "Phase 2",
                title: "Pure Math 进阶",
                duration: "6-8 周",
                topics: ["微分", "积分", "向量", "微分方程", "数值方法"],
                tips: "A2 阶段重点，与 AP 微积分内容交叉",
                status: "current",
            },
            {
                phase: "Phase 3",
                title: "Statistics",
                duration: "4-5 周",
                topics: ["数据表示", "概率", "二项分布", "正态分布", "假设检验"],
                tips: "统计计算器操作要熟练",
                status: "upcoming",
            },
            {
                phase: "Phase 4",
                title: "Mechanics",
                duration: "4-5 周",
                topics: ["运动学", "力与牛顿定律", "力矩", "动量"],
                tips: "画受力分析图是关键",
                status: "upcoming",
            },
            {
                phase: "Phase 5",
                title: "考前冲刺",
                duration: "4 周",
                topics: ["Past Paper 刷题", "易错题回顾", "时间管理", "考试技巧"],
                tips: "按考试板块分模块刷题",
                status: "upcoming",
            },
        ],
    },
    {
        code: "mat",
        name: "MAT",
        fullName: "Mathematics Admissions Test (Oxford)",
        icon: <Atom className="w-6 h-6" />,
        color: "var(--color-mat)",
        overview: "牛津大学数学专业入学考试，注重数学思维和问题解决能力",
        totalDuration: "4-6 个月",
        difficulty: "较难",
        steps: [
            {
                phase: "Phase 1",
                title: "基础数学",
                duration: "3-4 周",
                topics: ["多项式", "不等式", "函数分析", "几何推理"],
                tips: "重新审视基础概念，用更深层的视角",
                status: "completed",
            },
            {
                phase: "Phase 2",
                title: "组合与数论",
                duration: "3-4 周",
                topics: ["排列组合", "计数原理", "整除与素数", "模运算"],
                tips: "MAT 高频考点，需要大量练习",
                status: "current",
            },
            {
                phase: "Phase 3",
                title: "微积分与分析",
                duration: "3-4 周",
                topics: ["极限思维", "微分应用", "积分技巧", "不等式证明"],
                tips: "注重推理过程而非计算",
                status: "upcoming",
            },
            {
                phase: "Phase 4",
                title: "图论与逻辑",
                duration: "2-3 周",
                topics: ["图论基础", "逻辑推理", "博弈论初步", "归纳法"],
                tips: "培养数学直觉和抽象思维",
                status: "upcoming",
            },
            {
                phase: "Phase 5",
                title: "真题冲刺",
                duration: "4-6 周",
                topics: ["历年真题", "长题解题策略", "时间分配", "模拟考试"],
                tips: "重点练习 MAT 的长题 (Q2-Q7)，学会取舍",
                status: "upcoming",
            },
        ],
    },
    {
        code: "ib-math",
        name: "IB 数学",
        fullName: "IB Mathematics AA / AI (HL & SL)",
        icon: <BookOpen className="w-6 h-6" />,
        color: "var(--color-ib)",
        overview: "国际文凭课程数学，分为 Analysis & Approaches 和 Applications & Interpretation",
        totalDuration: "18-24 个月 (两年课程)",
        difficulty: "中等",
        steps: [
            {
                phase: "Year 1",
                title: "核心基础",
                duration: "第一学期",
                topics: ["代数基础", "函数", "几何与三角", "统计与概率入门"],
                tips: "SL 和 HL 共同基础",
                status: "completed",
            },
            {
                phase: "Year 1",
                title: "进阶内容",
                duration: "第二学期",
                topics: ["微积分入门", "向量", "概率分布", "数据分析"],
                tips: "开始区分 AA 和 AI 的侧重点",
                status: "current",
            },
            {
                phase: "Year 2",
                title: "HL 深入",
                duration: "第三学期",
                topics: ["复数 (AA HL)", "微分方程 (AA HL)", "高级统计 (AI HL)", "优化建模 (AI HL)"],
                tips: "HL 内容难度提升，需要额外时间",
                status: "upcoming",
            },
            {
                phase: "Year 2",
                title: "IA + 考前",
                duration: "第四学期",
                topics: ["Internal Assessment", "Paper 1/2/3 练习", "往年真题", "考试策略"],
                tips: "IA 占比重要，选题要有深度",
                status: "upcoming",
            },
        ],
    },
];

function getStatusIcon(status: string) {
    switch (status) {
        case "completed":
            return <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />;
        case "current":
            return <TrendingUp className="w-5 h-5 text-[var(--color-warning)]" />;
        default:
            return <Clock className="w-5 h-5 text-[var(--color-text-dim)]" />;
    }
}

function getStatusLabel(status: string): string {
    switch (status) {
        case "completed":
            return "已掌握";
        case "current":
            return "进行中";
        default:
            return "待学习";
    }
}

export default function RoadmapPage() {
    return (
        <main className="min-h-screen pt-16">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-10 animate-fade-in-up">
                    <h1 className="text-3xl font-bold mb-2">学习路线</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        为每个学科考试设计的详细学习路线图与备考建议
                    </p>
                </div>

                {/* Roadmap Cards */}
                <div className="space-y-10">
                    {roadmaps.map((roadmap, ri) => (
                        <div
                            key={roadmap.code}
                            className="animate-fade-in-up"
                            style={{ animationDelay: `${0.15 * ri}s` }}
                        >
                            {/* Subject Header */}
                            <div className="card rounded-2xl p-6 mb-4">
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{
                                            backgroundColor: `color-mix(in srgb, ${roadmap.color} 15%, transparent)`,
                                            color: roadmap.color,
                                        }}
                                    >
                                        {roadmap.icon}
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold mb-0.5">{roadmap.name}</h2>
                                        <p className="text-xs text-[var(--color-text-dim)] font-mono mb-1">
                                            {roadmap.fullName}
                                        </p>
                                        <p className="text-sm text-[var(--color-text-muted)]">
                                            {roadmap.overview}
                                        </p>
                                    </div>
                                    <div className="flex gap-4 md:gap-6">
                                        <div className="text-center">
                                            <div className="text-xs text-[var(--color-text-dim)] mb-0.5">总时长</div>
                                            <div className="text-sm font-bold">{roadmap.totalDuration}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-[var(--color-text-dim)] mb-0.5">难度</div>
                                            <div className="text-sm font-bold">{roadmap.difficulty}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="relative pl-6 md:pl-8">
                                {/* Vertical line */}
                                <div
                                    className="absolute left-[11px] md:left-[15px] top-0 bottom-0 w-px"
                                    style={{
                                        background: `linear-gradient(to bottom, ${roadmap.color}, var(--color-border))`,
                                    }}
                                />

                                <div className="space-y-3">
                                    {roadmap.steps.map((step, si) => (
                                        <div
                                            key={si}
                                            className={`relative card rounded-xl p-5 ml-4 md:ml-6 transition-all ${step.status === "current"
                                                ? "border-[var(--color-warning)]/30"
                                                : ""
                                                }`}
                                        >
                                            {/* Timeline dot */}
                                            <div
                                                className="absolute -left-[26px] md:-left-[30px] top-6 w-3 h-3 rounded-full border-2"
                                                style={{
                                                    borderColor:
                                                        step.status === "completed"
                                                            ? "var(--color-success)"
                                                            : step.status === "current"
                                                                ? "var(--color-warning)"
                                                                : "var(--color-border)",
                                                    backgroundColor:
                                                        step.status === "completed"
                                                            ? "var(--color-success)"
                                                            : step.status === "current"
                                                                ? "var(--color-warning)"
                                                                : "transparent",
                                                }}
                                            />

                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex items-center gap-2">
                                                    {getStatusIcon(step.status)}
                                                    <div>
                                                        <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
                                                            {step.phase}
                                                        </span>
                                                        <h3 className="text-sm font-bold">{step.title}</h3>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-[10px] text-[var(--color-text-dim)]">
                                                        {step.duration}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${step.status === "completed"
                                                            ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                                                            : step.status === "current"
                                                                ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
                                                                : "bg-[var(--color-surface)] text-[var(--color-text-dim)]"
                                                            }`}
                                                    >
                                                        {getStatusLabel(step.status)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {step.topics.map((topic) => (
                                                    <span
                                                        key={topic}
                                                        className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                                                    >
                                                        {topic}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="flex items-start gap-1.5 text-xs text-[var(--color-text-dim)]">
                                                <Lightbulb className="w-3.5 h-3.5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                                                {step.tips}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Link to resources */}
                            <div className="mt-4 ml-10 md:ml-14">
                                <Link
                                    href={`/resources?subject=${roadmap.code}`}
                                    className="group inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                                >
                                    <Target className="w-3.5 h-3.5" />
                                    查看「{roadmap.name}」相关资料
                                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Advice Section */}
                <div className="mt-16 card rounded-2xl p-8 text-center animate-fade-in-up">
                    <Star className="w-8 h-8 text-[var(--color-gold)] mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-3">备考建议</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left mt-6">
                        <div className="card rounded-xl p-4">
                            <h3 className="text-sm font-bold mb-2 text-[var(--color-success)]">📝 笔记整理</h3>
                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                每学完一个章节，用自己的语言重新整理笔记。理解比记忆更重要。
                            </p>
                        </div>
                        <div className="card rounded-xl p-4">
                            <h3 className="text-sm font-bold mb-2 text-[var(--color-warning)]">⏰ 定期复习</h3>
                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                使用间隔重复法，每周回顾之前的内容，避免遗忘。
                            </p>
                        </div>
                        <div className="card rounded-xl p-4">
                            <h3 className="text-sm font-bold mb-2 text-[var(--color-ap)]">🎯 真题练习</h3>
                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                考前至少完成 5 套完整真题，严格按照考试时间模拟。
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="py-8 px-6 mt-8 border-t border-[var(--color-border)]">
                <div className="max-w-6xl mx-auto text-center text-xs text-[var(--color-text-dim)]">
                    © {new Date().getFullYear()} Johnny Allen · 教学空间
                </div>
            </footer>
        </main>
    );
}

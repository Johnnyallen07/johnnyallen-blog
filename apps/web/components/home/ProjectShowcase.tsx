"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ExternalLink, Code2 } from "lucide-react";

interface Project {
    nameKey: string;
    descriptionKey: string;
    link: string;
    image?: string;
    icon?: string;
    gradient: string;
}

const PROJECTS: Project[] = [
    {
        nameKey: "fivestars.name",
        descriptionKey: "fivestars.description",
        link: "https://fivestarsedu.com",
        image: "/images/fivestar-logo.jpg",
        gradient: "from-slate-700 to-slate-400",
    },
    {
        nameKey: "stockGenerator.name",
        descriptionKey: "stockGenerator.description",
        link: "https://stanly-c2.itch.io/city-of-broken-dreamers",
        image: "",
        icon: "🎮",
        gradient: "from-slate-700 to-zinc-400",
    },
];

export function ProjectShowcase() {
    const t = useTranslations("projects");
    return (
        <div className="bg-white/[0.18] backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg shadow-slate-900/5 overflow-hidden group">
            {/* 标题栏 */}
            <div className="px-5 py-4 border-b border-white/30">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Code2 className="h-5 w-5 text-slate-600" />
                        {t("title")}
                    </h3>
                    <span className="text-xs text-gray-500 bg-white/50 px-2 py-1 rounded-full">
                        {t("count", { count: PROJECTS.length })}
                    </span>
                </div>
            </div>

            {/* 项目列表 */}
            <div className="p-4 space-y-3">
                {PROJECTS.map((project, index) => (
                    <a
                        key={index}
                        href={project.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group/card block"
                        style={{
                            animation: `slideInRight 0.6s ease-out ${index * 0.1}s backwards`,
                        }}
                    >
                        {/* 卡片容器 */}
                        <div className="relative hover:scale-[1.02] transition-all duration-500">
                            {/* 卡片主体 */}
                            <div className="relative bg-white/55 backdrop-blur-sm border border-slate-200/70 rounded-xl p-4 shadow-sm hover:shadow-xl hover:shadow-slate-900/10 transition-all duration-300 overflow-hidden group-hover/card:border-transparent">
                                {/* 悬停渐变边框 */}
                                <div
                                    className={`absolute inset-0 bg-gradient-to-br ${project.gradient} opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 rounded-xl`}
                                    style={{ padding: "1px" }}
                                >
                                    <div className="w-full h-full bg-white/80 backdrop-blur-sm rounded-xl" />
                                </div>

                                {/* 内容 */}
                                <div className="relative z-10">
                                    {/* Logo 和标题 */}
                                    <div className="flex items-start gap-3 mb-2">
                                        {project.image ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 bg-white group-hover/card:scale-110 transition-all duration-300">
                                                <Image
                                                    src={project.image}
                                                    alt={t(project.nameKey)}
                                                    width={48}
                                                    height={48}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-2xl group-hover/card:scale-110 group-hover/card:rotate-12 transition-all duration-300">
                                                {project.icon}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 text-sm mb-1 truncate group-hover/card:text-slate-950 transition-all">
                                                {t(project.nameKey)}
                                            </h4>
                                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                                                {t(project.descriptionKey)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 链接 */}
                                    <div className="flex items-center justify-end text-xs text-gray-500">
                                        <div className="flex items-center gap-1 group-hover/card:text-slate-950 transition-colors">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            <span>{t("visit")}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 背景装饰 - 渐变光晕 */}
                                <div
                                    className={`absolute -top-10 -right-10 w-24 h-24 bg-gradient-to-br ${project.gradient} opacity-0 group-hover/card:opacity-20 blur-2xl rounded-full transition-opacity duration-500`}
                                />
                                <div
                                    className={`absolute -bottom-10 -left-10 w-24 h-24 bg-gradient-to-tr ${project.gradient} opacity-0 group-hover/card:opacity-20 blur-2xl rounded-full transition-opacity duration-500`}
                                />
                            </div>
                        </div>

                        {/* 悬浮阴影效果 */}
                        <div
                            className={`absolute inset-0 bg-gradient-to-br ${project.gradient} opacity-0 group-hover/card:opacity-10 blur-xl rounded-xl transition-opacity duration-300 -z-10`}
                            style={{ transform: "translateY(8px)" }}
                        />
                    </a>
                ))}
            </div>

            {/* 自定义动画 */}
            <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
        </div>
    );
}

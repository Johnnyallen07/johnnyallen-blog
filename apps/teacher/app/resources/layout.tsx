import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "题库资料 | 教学空间",
    description: "按学科分类的题库与笔记资料，支持 PDF 在线预览",
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
    return children;
}

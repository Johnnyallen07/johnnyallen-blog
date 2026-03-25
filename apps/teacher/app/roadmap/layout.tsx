import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "学习路线 | 教学空间",
    description: "各学科考试的推荐学习路线与备考建议",
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
    return children;
}

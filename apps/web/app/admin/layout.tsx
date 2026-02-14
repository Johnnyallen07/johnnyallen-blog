import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理后台 - Johnny Blog",
  description: "专栏管理与文章编辑",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

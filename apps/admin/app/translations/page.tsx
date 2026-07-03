"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UiMessagesTab } from "@/components/admin/translations/UiMessagesTab";
import { ContentTab } from "@/components/admin/translations/ContentTab";

export default function TranslationsPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* 头部 */}
                <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-100 rounded-xl">
                            <Languages className="h-8 w-8 text-amber-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-semibold text-gray-900">
                                翻译管理
                            </h1>
                            <p className="text-gray-600 mt-1">
                                管理全站中英文翻译：界面文案与数据库内容，支持 AI
                                自动翻译与人工校对
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => router.push("/")}
                        variant="outline"
                        size="sm"
                        className="border-gray-300 hover:bg-white"
                    >
                        <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                        返回仪表板
                    </Button>
                </div>

                <Tabs defaultValue="ui">
                    <TabsList>
                        <TabsTrigger value="ui">界面文案</TabsTrigger>
                        <TabsTrigger value="content">内容翻译</TabsTrigger>
                    </TabsList>
                    <TabsContent value="ui">
                        <UiMessagesTab />
                    </TabsContent>
                    <TabsContent value="content">
                        <ContentTab />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

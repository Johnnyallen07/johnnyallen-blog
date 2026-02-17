"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Plus,
    Edit,
    Trash2,
    Music,
    User,
    ListMusic,
    ChevronUp,
    ChevronDown,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { fetchClient } from "@/lib/api";

/* ── Types ── */

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    order: number;
}

type EntityType = "categories" | "artists" | "series";

const ENTITY_CONFIG: Record<
    EntityType,
    { label: string; apiPath: string; icon: React.ReactNode; color: string }
> = {
    categories: {
        label: "分类",
        apiPath: "/music-categories",
        icon: <ListMusic className="h-5 w-5" />,
        color: "purple",
    },
    artists: {
        label: "音乐家",
        apiPath: "/music-artists",
        icon: <User className="h-5 w-5" />,
        color: "blue",
    },
    series: {
        label: "系列",
        apiPath: "/music-series",
        icon: <Music className="h-5 w-5" />,
        color: "pink",
    },
};

/* ── Reusable column component ── */

function EntityColumn({ type }: { type: EntityType }) {
    const config = ENTITY_CONFIG[type];
    const [items, setItems] = useState<SidebarEntity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<SidebarEntity | null>(null);

    // form state
    const [formName, setFormName] = useState("");
    const [formSlug, setFormSlug] = useState("");
    const [formDesc, setFormDesc] = useState("");

    const fetchItems = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await fetchClient(config.apiPath);
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [config.apiPath]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const openCreate = () => {
        setEditingItem(null);
        setFormName("");
        setFormSlug("");
        setFormDesc("");
        setIsDialogOpen(true);
    };

    const openEdit = (item: SidebarEntity) => {
        setEditingItem(item);
        setFormName(item.name);
        setFormSlug(item.slug);
        setFormDesc(item.description || "");
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        try {
            if (editingItem) {
                await fetchClient(`${config.apiPath}/${editingItem.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: formName,
                        slug: formSlug,
                        description: formDesc || undefined,
                    }),
                });
            } else {
                await fetchClient(config.apiPath, {
                    method: "POST",
                    body: JSON.stringify({
                        name: formName,
                        slug: formSlug,
                        description: formDesc || undefined,
                    }),
                });
            }
            setIsDialogOpen(false);
            fetchItems();
        } catch (error) {
            console.error("Save error:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("确定要删除吗？")) return;
        try {
            await fetchClient(`${config.apiPath}/${id}`, { method: "DELETE" });
            fetchItems();
        } catch (error) {
            console.error("Delete error:", error);
        }
    };

    const handleMove = async (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= items.length) return;
        const newItems = [...items];
        const a = newItems[index]!;
        const b = newItems[targetIndex]!;
        newItems[index] = b;
        newItems[targetIndex] = a;
        setItems(newItems);
        try {
            await fetchClient(`${config.apiPath}/reorder`, {
                method: "PATCH",
                body: JSON.stringify({ ids: newItems.map((i) => i.id) }),
            });
        } catch {
            fetchItems();
        }
    };

    // Auto-generate slug from name
    const handleNameChange = (name: string) => {
        setFormName(name);
        if (!editingItem) {
            setFormSlug(
                name
                    .toLowerCase()
                    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
                    .replace(/^-|-$/g, "")
            );
        }
    };

    const colorMap: Record<string, string> = {
        purple: "from-purple-500 to-purple-600",
        blue: "from-blue-500 to-blue-600",
        pink: "from-pink-500 to-pink-600",
    };
    const bgColorMap: Record<string, string> = {
        purple: "bg-purple-50 border-purple-200",
        blue: "bg-blue-50 border-blue-200",
        pink: "bg-pink-50 border-pink-200",
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div
                className={`flex items-center justify-between p-4 rounded-t-xl bg-gradient-to-r ${colorMap[config.color]}`}
            >
                <div className="flex items-center gap-2 text-white">
                    {config.icon}
                    <h3 className="font-semibold text-lg">{config.label}</h3>
                    <span className="text-white/70 text-sm">({items.length})</span>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={openCreate}
                    className="bg-white/20 hover:bg-white/30 text-white border-0"
                >
                    <Plus className="h-4 w-4 mr-1" />
                    添加
                </Button>
            </div>

            {/* List */}
            <div
                className={`flex-1 border-x border-b rounded-b-xl overflow-y-auto ${bgColorMap[config.color]}`}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                        暂无{config.label}，点击上方添加
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200/50">
                        {items.map((item, index) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors"
                            >
                                {/* Reorder */}
                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleMove(index, "up")}
                                        disabled={index === 0}
                                        className="p-0.5 hover:bg-white rounded disabled:opacity-30"
                                    >
                                        <ChevronUp className="w-3 h-3 text-gray-500" />
                                    </button>
                                    <button
                                        onClick={() => handleMove(index, "down")}
                                        disabled={index === items.length - 1}
                                        className="p-0.5 hover:bg-white rounded disabled:opacity-30"
                                    >
                                        <ChevronDown className="w-3 h-3 text-gray-500" />
                                    </button>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {item.name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        /{item.slug}
                                        {item.description && ` · ${item.description}`}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEdit(item)}
                                        className="p-1.5 hover:bg-white rounded transition-colors"
                                    >
                                        <Edit className="w-3.5 h-3.5 text-gray-500" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-1.5 hover:bg-red-50 rounded transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {editingItem ? `编辑${config.label}` : `添加${config.label}`}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>名称 *</Label>
                            <Input
                                placeholder={`例如 钢琴独奏`}
                                value={formName}
                                onChange={(e) => handleNameChange(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>Slug *</Label>
                            <Input
                                placeholder="url-friendly-name"
                                value={formSlug}
                                onChange={(e) => setFormSlug(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>描述</Label>
                            <Input
                                placeholder="可选描述"
                                value={formDesc}
                                onChange={(e) => setFormDesc(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!formName || !formSlug}
                        >
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ── Page ── */

export default function SidebarManagePage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-8 py-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push("/admin/music")}
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            返回
                        </Button>
                        <h1 className="text-2xl font-bold text-gray-900">
                            侧边栏管理
                        </h1>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 ml-11">
                        管理音乐前台左侧导航栏中的分类、音乐家和系列
                    </p>
                </div>
            </div>

            {/* Three-column grid */}
            <div className="max-w-7xl mx-auto p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <EntityColumn type="categories" />
                    <EntityColumn type="artists" />
                    <EntityColumn type="series" />
                </div>
            </div>
        </div>
    );
}

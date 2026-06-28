export interface SeriesSidebarItem {
    id: string;
    title: string | null;
    children: SeriesSidebarItem[];
    postId: string | null;
    post?: {
        id: string;
        title: string;
        slug: string;
        published?: boolean;
    };
}

export interface SeriesRecommendation {
    id: string;
    title: string;
    slug: string;
}

export function hasPublishedDescendant(node: SeriesSidebarItem): boolean {
    if (node.postId && node.post?.published !== false) return true;
    return node.children?.some(hasPublishedDescendant) || false;
}

export function filterPublished(nodes: SeriesSidebarItem[]): SeriesSidebarItem[] {
    return nodes
        .filter(hasPublishedDescendant)
        .map((node) => ({
            ...node,
            children: node.children ? filterPublished(node.children) : [],
        }));
}

function flattenPublishedPosts(nodes: SeriesSidebarItem[]): SeriesRecommendation[] {
    return nodes.flatMap((node) => {
        const children = node.children ? flattenPublishedPosts(node.children) : [];
        if (!node.postId || !node.post || node.post.published === false) {
            return children;
        }

        return [
            {
                id: node.id,
                title: node.title || node.post.title,
                slug: node.post.slug,
            },
            ...children,
        ];
    });
}

export function getMobileSeriesRecommendations(
    nodes: SeriesSidebarItem[],
    activePath: string,
    limit = 5,
): SeriesRecommendation[] {
    const posts = flattenPublishedPosts(filterPublished(nodes));
    const activeSlug = activePath.replace(/^\/article\//, "");
    const active = posts.find((post) => post.slug === activeSlug);
    const rest = posts.filter((post) => post.slug !== activeSlug);

    return (active ? [active, ...rest] : rest).slice(0, limit);
}

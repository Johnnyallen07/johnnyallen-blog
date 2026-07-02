/**
 * 内容翻译注册表：entityType → Prisma delegate + 可翻译字段。
 * 新增可翻译实体时只需在此登记。
 *
 * 注意：MusicTrack.category / MusicTrack.series 是充当筛选键的字符串
 * （与侧边栏 MusicCategory/MusicSeries.name 对应），不在此翻译；
 * 英文展示由侧边栏实体的翻译 + sourceName 匹配完成。
 */
export interface ContentEntityConfig {
  /** Prisma delegate 名（this.prisma[model]） */
  model:
    | 'post'
    | 'category'
    | 'series'
    | 'seriesItem'
    | 'musicTrack'
    | 'musicCategory'
    | 'musicArtist'
    | 'musicSeries'
    | 'musicScore';
  /** 可翻译字段 */
  fields: string[];
  /** admin 列表展示用的标签字段 */
  label: string;
  /** Markdown 长文本字段（用 markdown 翻译策略，不参与批量短文本翻译） */
  markdownFields?: string[];
  /** admin 中文分组名 */
  displayName: string;
}

export const CONTENT_REGISTRY: Record<string, ContentEntityConfig> = {
  post: {
    model: 'post',
    fields: ['title', 'excerpt', 'content'],
    label: 'title',
    markdownFields: ['content'],
    displayName: '文章',
  },
  category: {
    model: 'category',
    fields: ['name', 'description'],
    label: 'name',
    displayName: '分类',
  },
  series: {
    model: 'series',
    fields: ['title', 'description'],
    label: 'title',
    displayName: '专栏',
  },
  seriesItem: {
    model: 'seriesItem',
    fields: ['title'],
    label: 'title',
    displayName: '专栏节点',
  },
  musicTrack: {
    model: 'musicTrack',
    fields: ['title', 'musician', 'performer'],
    label: 'title',
    displayName: '音乐曲目',
  },
  musicCategory: {
    model: 'musicCategory',
    fields: ['name', 'description'],
    label: 'name',
    displayName: '音乐分类',
  },
  musicArtist: {
    model: 'musicArtist',
    fields: ['name', 'description'],
    label: 'name',
    displayName: '音乐人',
  },
  musicSeries: {
    model: 'musicSeries',
    fields: ['name', 'description'],
    label: 'name',
    displayName: '音乐系列',
  },
  musicScore: {
    model: 'musicScore',
    fields: ['title', 'composer'],
    label: 'title',
    displayName: '乐谱',
  },
};

export type ContentEntityType = keyof typeof CONTENT_REGISTRY;

export function getEntityConfig(entityType: string): ContentEntityConfig {
  const config = CONTENT_REGISTRY[entityType];
  if (!config) {
    throw new Error(`未知的内容实体类型: ${entityType}`);
  }
  return config;
}

/** 把 unknown 的实体字段值安全转为展示用字符串 */
export function asLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

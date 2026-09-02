export interface ComposerCatalogEntry {
  canonical: string;
  aliases: string[];
}

/**
 * 新音乐家尚未出现在数据库时使用的规范名词表。
 * 数据库中已有的写法永远优先，这份表只负责把常见别名收敛到稳定值。
 */
export const CLASSICAL_COMPOSERS: ComposerCatalogEntry[] = [
  {
    canonical: 'Bach',
    aliases: [
      'Johann Sebastian Bach',
      'J. S. Bach',
      'JS Bach',
      '巴赫',
      '约翰·塞巴斯蒂安·巴赫',
    ],
  },
  {
    canonical: 'Beethoven',
    aliases: [
      'Ludwig van Beethoven',
      'L. van Beethoven',
      '贝多芬',
      '路德维希·凡·贝多芬',
    ],
  },
  {
    canonical: 'Mozart',
    aliases: [
      'Wolfgang Amadeus Mozart',
      'W. A. Mozart',
      'WA Mozart',
      '莫扎特',
      '沃尔夫冈·阿马德乌斯·莫扎特',
    ],
  },
  {
    canonical: 'Chopin',
    aliases: [
      'Frédéric Chopin',
      'Frederic Chopin',
      'Fryderyk Chopin',
      '肖邦',
      '弗雷德里克·肖邦',
    ],
  },
  {
    canonical: 'Liszt',
    aliases: ['Franz Liszt', '李斯特', '弗朗茨·李斯特'],
  },
  {
    canonical: 'Schubert',
    aliases: ['Franz Schubert', '舒伯特', '弗朗茨·舒伯特'],
  },
  {
    canonical: 'Schumann',
    aliases: ['Robert Schumann', '舒曼', '罗伯特·舒曼'],
  },
  {
    canonical: 'Brahms',
    aliases: ['Johannes Brahms', '勃拉姆斯', '约翰内斯·勃拉姆斯'],
  },
  {
    canonical: 'Handel',
    aliases: [
      'George Frideric Handel',
      'Georg Friedrich Händel',
      '亨德尔',
      '韩德尔',
    ],
  },
  {
    canonical: 'Haydn',
    aliases: ['Joseph Haydn', 'Franz Joseph Haydn', '海顿', '约瑟夫·海顿'],
  },
  {
    canonical: 'Vivaldi',
    aliases: ['Antonio Vivaldi', '维瓦尔第', '安东尼奥·维瓦尔第'],
  },
  {
    canonical: 'Tchaikovsky',
    aliases: [
      'Pyotr Ilyich Tchaikovsky',
      'Peter Ilyich Tchaikovsky',
      '柴可夫斯基',
      '彼得·伊里奇·柴可夫斯基',
    ],
  },
  {
    canonical: 'Debussy',
    aliases: ['Claude Debussy', '德彪西', '克劳德·德彪西'],
  },
  {
    canonical: 'Ravel',
    aliases: ['Maurice Ravel', '拉威尔', '莫里斯·拉威尔'],
  },
  {
    canonical: 'Satie',
    aliases: ['Erik Satie', 'Eric Satie', '萨蒂', '埃里克·萨蒂'],
  },
  {
    canonical: 'Rachmaninoff',
    aliases: [
      'Sergei Rachmaninoff',
      'Sergey Rachmaninov',
      'Rachmaninov',
      '拉赫玛尼诺夫',
    ],
  },
  {
    canonical: 'Prokofiev',
    aliases: ['Sergei Prokofiev', 'Sergey Prokofiev', '普罗科菲耶夫'],
  },
  {
    canonical: 'Mendelssohn',
    aliases: ['Felix Mendelssohn', '门德尔松', '费利克斯·门德尔松'],
  },
  {
    canonical: 'Pachelbel',
    aliases: ['Johann Pachelbel', '帕赫贝尔', '约翰·帕赫贝尔'],
  },
  {
    canonical: 'Saint-Saëns',
    aliases: [
      'Camille Saint-Saëns',
      'Camille Saint Saens',
      'Saint-Saens',
      '圣桑',
      '卡米尔·圣桑',
    ],
  },
  {
    canonical: 'Dvořák',
    aliases: [
      'Antonín Dvořák',
      'Antonin Dvorak',
      'Dvorak',
      '德沃夏克',
      '安东宁·德沃夏克',
    ],
  },
  {
    canonical: 'Grieg',
    aliases: ['Edvard Grieg', '格里格', '爱德华·格里格'],
  },
  {
    canonical: 'Mahler',
    aliases: ['Gustav Mahler', '马勒', '古斯塔夫·马勒'],
  },
  {
    canonical: 'Strauss II',
    aliases: [
      'Johann Strauss II',
      'Johann Strauss Jr.',
      '小约翰·施特劳斯',
      '约翰·施特劳斯二世',
    ],
  },
  {
    canonical: 'Elgar',
    aliases: ['Edward Elgar', '埃尔加', '爱德华·埃尔加'],
  },
  {
    canonical: 'Puccini',
    aliases: ['Giacomo Puccini', '普契尼', '贾科莫·普契尼'],
  },
  {
    canonical: 'Verdi',
    aliases: ['Giuseppe Verdi', '威尔第', '朱塞佩·威尔第'],
  },
  {
    canonical: 'Wagner',
    aliases: ['Richard Wagner', '瓦格纳', '理查德·瓦格纳'],
  },
  {
    canonical: 'Bizet',
    aliases: ['Georges Bizet', '比才', '乔治·比才'],
  },
  {
    canonical: 'Boccherini',
    aliases: ['Luigi Boccherini', '博凯里尼', '路易吉·博凯里尼'],
  },
];

export function normalizeLookupValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[\s._·'’-]+/g, ' ')
    .trim();
}

export function findCatalogComposer(value: string) {
  const needle = normalizeLookupValue(value);
  if (!needle) return undefined;
  return CLASSICAL_COMPOSERS.find((entry) =>
    [entry.canonical, ...entry.aliases].some(
      (alias) => normalizeLookupValue(alias) === needle,
    ),
  );
}

export function retrieveCatalogComposers(sourceText: string, limit = 8) {
  const haystack = normalizeLookupValue(sourceText);
  if (!haystack) return [];

  return CLASSICAL_COMPOSERS.map((entry) => {
    const aliases = [entry.canonical, ...entry.aliases];
    const score = aliases.reduce((best, alias) => {
      const normalizedAlias = normalizeLookupValue(alias);
      if (!normalizedAlias || !haystack.includes(normalizedAlias)) return best;
      return Math.max(best, normalizedAlias.length);
    }, 0);
    return { ...entry, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

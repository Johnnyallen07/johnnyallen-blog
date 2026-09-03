export type MomentXmpMetadata = {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  rating?: string;
  label?: string;
  creator?: string;
  description?: string;
  keywords?: string[];
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
  capturedAt?: string;
};

const entityMap: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function decodeXml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (_, entity: string) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      return entityMap[entity.toLowerCase()] || '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function first(xml: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(':', '\\:');
    const attribute = xml.match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`, 'i'));
    if (attribute?.[1]) return decodeXml(attribute[1]);
    const element = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    if (element?.[1]) {
      const listItem = element[1].match(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/i);
      return decodeXml(listItem?.[1] || element[1]);
    }
  }
  return undefined;
}

function list(xml: string, name: string) {
  const escaped = name.replace(':', '\\:');
  const element = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  if (!element?.[1]) return undefined;
  const values = [...element[1].matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
  return values.length ? [...new Set(values)] : undefined;
}

export function parseMomentXmp(xml: string): MomentXmpMetadata {
  const metadata: MomentXmpMetadata = {
    make: first(xml, ['tiff:Make']),
    model: first(xml, ['tiff:Model']),
    lens: first(xml, ['aux:Lens', 'exifEX:LensModel', 'aux:LensInfo']),
    focalLength: first(xml, ['exif:FocalLength']),
    aperture: first(xml, ['exif:FNumber', 'exif:ApertureValue']),
    shutterSpeed: first(xml, ['exif:ExposureTime', 'exif:ShutterSpeedValue']),
    iso: first(xml, ['exif:PhotographicSensitivity', 'exif:ISOSpeedRatings']),
    rating: first(xml, ['xmp:Rating']),
    label: first(xml, ['xmp:Label']),
    creator: first(xml, ['dc:creator']),
    description: first(xml, ['dc:description']),
    keywords: list(xml, 'dc:subject'),
    city: first(xml, ['photoshop:City', 'Iptc4xmpCore:City']),
    state: first(xml, ['photoshop:State', 'Iptc4xmpCore:ProvinceState']),
    country: first(xml, ['photoshop:Country', 'Iptc4xmpCore:CountryName']),
    location: first(xml, ['Iptc4xmpCore:Location', 'photoshop:Location']),
    gpsLatitude: first(xml, ['exif:GPSLatitude']),
    gpsLongitude: first(xml, ['exif:GPSLongitude']),
    capturedAt: first(xml, ['exif:DateTimeOriginal', 'photoshop:DateCreated', 'xmp:CreateDate']),
  };
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== ''),
  ) as MomentXmpMetadata;
}

export function momentMetadataText(metadata: MomentXmpMetadata) {
  return [...new Set(Object.values(metadata).flat().filter(Boolean))].join(' ');
}

export function momentStem(name: string) {
  return name.replace(/\.[^.]+$/, '').toLocaleLowerCase();
}

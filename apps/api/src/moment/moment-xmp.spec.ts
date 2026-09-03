import { momentMetadataText, momentStem, parseMomentXmp } from './moment-xmp';

describe('Moment XMP metadata', () => {
  it('parses attributes, RDF lists and localized values', () => {
    const result = parseMomentXmp(`
      <x:xmpmeta xmlns:x="adobe:ns:meta/">
        <rdf:RDF><rdf:Description tiff:Make="FUJIFILM" tiff:Model="X-T5" aux:Lens="XF35mmF1.4 R" exif:FNumber="14/10" exif:ExposureTime="1/250" xmp:Rating="5">
          <exif:ISOSpeedRatings><rdf:Seq><rdf:li>400</rdf:li></rdf:Seq></exif:ISOSpeedRatings>
          <dc:creator><rdf:Seq><rdf:li>Johnny &amp; Co.</rdf:li></rdf:Seq></dc:creator>
          <dc:subject><rdf:Bag><rdf:li>上海</rdf:li><rdf:li>夜景</rdf:li></rdf:Bag></dc:subject>
          <photoshop:City>Shanghai</photoshop:City>
        </rdf:Description></rdf:RDF>
      </x:xmpmeta>`);
    expect(result).toMatchObject({
      make: 'FUJIFILM', model: 'X-T5', lens: 'XF35mmF1.4 R', aperture: '14/10',
      shutterSpeed: '1/250', iso: '400', rating: '5', creator: 'Johnny & Co.',
      keywords: ['上海', '夜景'], city: 'Shanghai',
    });
    expect(momentMetadataText(result)).toContain('FUJIFILM');
    expect(momentMetadataText(result)).toContain('夜景');
    expect(momentStem('IMG_1001.RAF')).toBe('img_1001');
  });
});

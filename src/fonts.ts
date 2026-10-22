// Sarabun for Thai only (Mew's choice for Thai text). The face is registered for the Thai code points alone, so
// English keeps the system font and no Latin glyphs are downloaded.
import w400 from '@fontsource/sarabun/files/sarabun-thai-400-normal.woff2?url';
import w600 from '@fontsource/sarabun/files/sarabun-thai-600-normal.woff2?url';
import w700 from '@fontsource/sarabun/files/sarabun-thai-700-normal.woff2?url';

const THAI = 'U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC';

export function loadThaiFont() {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  for (const [url, weight] of [[w400, '400'], [w600, '600'], [w700, '700']] as const) {
    const f = new FontFace('Sarabun Thai', `url(${url}) format('woff2')`, {weight, unicodeRange: THAI, display: 'swap'});
    document.fonts.add(f);
    f.load().catch(() => {});
  }
}

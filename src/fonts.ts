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

// The phones' playful look (Mew, 28 Oct 2026 — same theme as the saved boards): Fredoka for headings and buttons,
// Nunito for text. Latin only; Thai stays Sarabun.
import fr500 from '@fontsource/fredoka/files/fredoka-latin-500-normal.woff2?url';
import fr600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import fr700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';
import nu500 from '@fontsource/nunito/files/nunito-latin-500-normal.woff2?url';
import nu700 from '@fontsource/nunito/files/nunito-latin-700-normal.woff2?url';
import nu800 from '@fontsource/nunito/files/nunito-latin-800-normal.woff2?url';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215';

export function loadFunFonts() {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const faces: [string, string, string][] = [
    ['Fredoka', fr500, '500'],
    ['Fredoka', fr600, '600'],
    ['Fredoka', fr700, '700'],
    ['Nunito', nu500, '500'],
    ['Nunito', nu700, '700'],
    ['Nunito', nu800, '800'],
  ];
  for (const [family, url, weight] of faces) {
    const f = new FontFace(family, `url(${url}) format('woff2')`, {weight, unicodeRange: LATIN, display: 'swap'});
    document.fonts.add(f);
    f.load().catch(() => {});
  }
}

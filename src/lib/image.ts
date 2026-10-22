// Shrink a photo/screenshot on the phone before it goes into the database (Spark plan: no file storage).
// Full size ≈ 1600 px on the long edge (marks stay readable on the projector), thumbnail ≈ 640 px.
import {LIMITS} from './types.ts';

export class ImageError extends Error {}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('unreadable'));
    };
    img.src = url;
  });
}

function toJpeg(img: HTMLImageElement, longEdge: number, quality: number, maxChars: number): string {
  let edge = longEdge;
  let q = quality;
  for (let attempt = 0; attempt < 12; attempt++) {
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(1, edge / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageError('canvas');
    ctx.fillStyle = '#ffffff'; // transparent PNG screenshots → white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const url = canvas.toDataURL('image/jpeg', q);
    canvas.width = canvas.height = 0; // free the memory on older phones
    if (url.startsWith('data:image/jpeg') && url.length <= maxChars) return url;
    if (!url.startsWith('data:image/jpeg')) throw new ImageError('canvas');
    if (q > 0.55) q -= 0.1;
    else edge = Math.round(edge * 0.85);
  }
  throw new ImageError('too-big');
}

/** Returns JPEG data URLs for the full picture and its thumbnail. */
export async function prepareImage(file: Blob): Promise<{full: string; thumb: string}> {
  if (file.size > 40 * 1024 * 1024) throw new ImageError('too-big');
  const img = await loadImage(file); // iPhone Safari hands over HEIC photos as JPEG; others decode what they can
  if (!img.naturalWidth || !img.naturalHeight) throw new ImageError('unreadable');
  const full = toJpeg(img, 1600, 0.82, LIMITS.photoChars - 1000);
  const thumb = toJpeg(img, 640, 0.72, 130_000); // phones load every thumbnail after the reveal: keep them light
  return {full, thumb};
}

import sharp from 'sharp';

// Fraction of pixels (in the dominant bucket) above which the image is
// considered monochrome (e.g. a white-out or fully-grey capture).
const MONOCHROME_THRESHOLD = 0.85;

// Fraction of mid-band pixels that must be significantly brighter than the
// image mean for a banner_overlay flag to be raised.
const BANNER_AREA_THRESHOLD = 0.35;

// Mean luma must be below this value for the dark-background-with-bright-block
// check to run.  Light-background articles (meanLuma >= 128) are excluded so
// that white-page body pixels don't generate false banner_overlay flags.
const BANNER_LUMA_CEILING = 128;

/**
 * Analyse a PNG screenshot buffer and return quality metrics + a list of
 * string flags for detected failure modes.
 *
 * Detected flags:
 *   - 'monochrome'     — image is dominated by a single colour (> 85 % of
 *                        pixels map to the same 12-bit bucket).  Catches
 *                        white-out captures, solid-colour error pages, and
 *                        full-screen cookie consent banners that fill the
 *                        viewport.
 *   - 'banner_overlay' — a large bright rectangle sits in the middle band of
 *                        an otherwise dark page.  Catches modal dialogs,
 *                        GDPR banners, and paywall overlays that don't fully
 *                        saturate the viewport.
 *
 * @param {Buffer} buffer  Raw PNG/image buffer.
 * @returns {Promise<{width:number, height:number, dominantColorPct:number, brightAreaPct:number, flags:string[]}>}
 */
export async function analyzeScreenshot(buffer) {
  const flags = [];

  const img = sharp(buffer);
  const meta = await img.metadata();
  const { width, height } = meta;

  // Downscale to a small thumbnail for fast pixel-level analysis.
  const targetW = 120;
  const targetH = Math.round(height * (targetW / width));
  const { data } = await img
    .resize(targetW, targetH, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = data.length / (targetW * targetH);
  const totalPixels = targetW * targetH;

  // --- Monochrome detection ---
  // Bucket each pixel into a 12-bit colour (4 bits per channel after >> 4).
  const buckets = new Map();
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] >> 4;
    const g = data[i + 1] >> 4;
    const b = data[i + 2] >> 4;
    const key = (r << 8) | (g << 4) | b;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let dominantCount = 0;
  for (const v of buckets.values()) if (v > dominantCount) dominantCount = v;
  const dominantColorPct = dominantCount / totalPixels;

  if (dominantColorPct > MONOCHROME_THRESHOLD) flags.push('monochrome');

  // --- Banner / overlay detection ---
  // Compute mean luma of the whole thumbnail.
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += channels) {
    lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const meanLuma = lumaSum / totalPixels;

  // Count pixels in the centre band (15 %–85 % vertically) that are
  // significantly brighter than the image average.
  const yStart = Math.floor(targetH * 0.15);
  const yEnd = Math.floor(targetH * 0.85);
  let brightCount = 0;
  let bandPixels = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < targetW; x++) {
      const i = (y * targetW + x) * channels;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      bandPixels++;
      if (luma - meanLuma > 60) brightCount++;
    }
  }
  const brightAreaPct = bandPixels > 0 ? brightCount / bandPixels : 0;

  // Only raise the flag on dark-background pages (meanLuma < BANNER_LUMA_CEILING).
  // Light-background articles have a high meanLuma; their white body pixels
  // naturally exceed the delta threshold and would cause false positives.
  if (meanLuma < BANNER_LUMA_CEILING && brightAreaPct > BANNER_AREA_THRESHOLD) {
    flags.push('banner_overlay');
  }

  return { width, height, dominantColorPct, brightAreaPct, flags };
}

/**
 * Returns true if the analysis produced no quality flags, meaning the
 * screenshot is safe to use in the pipeline.
 *
 * @param {{ flags: string[] }} analysis
 * @returns {boolean}
 */
export function isAcceptable(analysis) {
  return analysis.flags.length === 0;
}

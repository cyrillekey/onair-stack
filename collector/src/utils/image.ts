import {
  createCanvas,
  type Canvas,
  type CanvasRenderingContext2D,
} from "canvas";
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from "cloudinary";

import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

/* --------------------------------- types --------------------------------- */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface GradientColors {
  from: string;
  /** Computed blend of `from`/`to` used as the gradient mid-stop. */
  mid?: string;
  to: string;
}

export interface BuildLogoOptions {
  /** Square dimensions in px. Default 512. */
  size?: number;
  /** Corner radius in px. Default 20% of size (modern "app icon" look). 0 = sharp square. */
  cornerRadius?: number;
  /** CSS font family. Default system-ui stack. */
  fontFamily?: string;
  /** Render the small channel-name caption under the monogram. Default true. */
  showChannelName?: boolean;
}

export interface BuiltLogo {
  stream: Readable;
  initials: string;
  /** Cleaned display name used for the caption. */
  displayName: string;
  /** The gradient stops used for the background. */
  backgroundColor: GradientColors;
  foregroundColor: string;
}

export interface UploadLogoOptions extends BuildLogoOptions {
  /** Extra/override options passed through to cloudinary.uploader.upload_stream. */
  cloudinaryOptions?: UploadApiOptions;
}

export interface UploadedLogoResult extends UploadApiResponse {
  initials: string;
  displayName: string;
  backgroundColor: GradientColors;
  foregroundColor: string;
}

/* ------------------------------- helpers -------------------------------- */

/**
 * FNV-1a 32-bit hash — better avalanche than djb2 over short strings, so
 * palette/angle picks spread evenly across channels instead of clustering.
 * Same channel name -> same hash -> same artwork, every time.
 */
function hashFNV1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Turn a channel name into 1-3 display initials.
 *   "CNN"            -> "CNN"   (short all-caps word treated as an acronym)
 *   "fox"             -> "FO"
 *   "CBC Golazo"      -> "CG"
 *   "citizen tv"      -> "CT"
 */
export function getInitials(name: string, maxLetters = 2): string {
  const words = String(name)
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";

  if (words.length === 1) {
    const word = words[0];
    if (word.length <= 4 && word === word.toUpperCase()) {
      return word; // e.g. CNN, BBC, CBC
    }
    return word.slice(0, maxLetters).toUpperCase();
  }

  return words
    .slice(0, maxLetters)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Collapse whitespace for a stable, presentation-ready display name. */
export function getDisplayName(name: string): string {
  return String(name).replace(/\s+/g, " ").trim().slice(0, 48);
}

/* ------------------------- palette & color utils ------------------------ */

/**
 * Curated duotone pairs (deep anchor -> vivid end). Hand-picked so
 * every channel gets a rich, broadcast-grade gradient — no muddy random
 * yellows or washed-out pastels — while staying dark enough that white
 * monogram type almost always wins the contrast check.
 */
const GRADIENT_PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["#1E1B4B", "#6D28D9"], // royal indigo -> violet
  ["#4C1D95", "#DB2777"], // grape -> magenta
  ["#7F1D1D", "#F97316"], // ember red -> orange
  ["#0C4A6E", "#0891B2"], // ocean -> cyan
  ["#064E3B", "#059669"], // forest -> emerald
  ["#701A45", "#E11D48"], // wine -> crimson
  ["#1E3A8A", "#06B6D4"], // sapphire -> sky
  ["#3B0764", "#A855F7"], // plum -> purple
  ["#450A0A", "#E11D48"], // maroon -> rose
  ["#082F49", "#2563EB"], // midnight -> blue
  ["#052E2B", "#0D9488"], // pine -> teal
  ["#431407", "#EA580C"], // espresso -> ember
  ["#111827", "#4F46E5"], // carbon -> indigo
  ["#0F172A", "#0EA5E9"], // slate -> azure
  ["#422006", "#CA8A04"], // noir -> gold
  ["#500F28", "#F43F5E"], // rosewood -> coral
];

/** Parse #RGB / #RRGGBB into {r,g,b}. Falls back to mid-grey. */
function hexToRgb(hex: string): Rgb {
  const m = hex.trim().replace(/^#/, "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 128, g: 128, b: 128 };
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (v: number): string =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear blend between two hex colors. t=0 -> a, t=1 -> b. */
function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** Append an alpha channel to a hex color -> `rgba(...)` string. */
function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const channel = (t: number): number => {
    const tc = ((t % 1) + 1) % 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return rgbToHex({
    r: channel(hn + 1 / 3) * 255,
    g: channel(hn) * 255,
    b: channel(hn - 1 / 3) * 255,
  });
}

/** Nudge a hex color by dh degrees of hue and dl points of lightness. */
function shiftHex(hex: string, dh: number, dl: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return hslToHex({ h: hsl.h + dh, s: hsl.s, l: hsl.l + dl });
}

/**
 * Deterministic three-stop gradient derived from the channel name: a curated
 * duotone pair selected by hash, with a blended mid-stop for a smoother
 * diagonal sweep than a hard two-stop blend.
 */
export function getGradientColors(name: string): GradientColors {
  const key = String(name).toLowerCase().trim() || "?";
  const hash = hashFNV1a(key);
  const [baseFrom, baseTo] = GRADIENT_PALETTES[hash % GRADIENT_PALETTES.length];
  // Subtle deterministic nudge (±14° hue, ±4 lightness) so channels sharing
  // a curated base still get visibly distinct gradients without ever
  // drifting into garish territory.
  const hueShift = ((hash >>> 8) % 29) - 14;
  const lightShift = ((hash >>> 13) % 9) - 4;
  const from = shiftHex(baseFrom, hueShift, lightShift);
  const to = shiftHex(baseTo, hueShift, lightShift);
  return { from, mid: mixHex(from, to, 0.5), to };
}

/** Deterministic gradient angle (deg) — mostly diagonal, slight per-channel variety. */
function getGradientAngle(name: string): number {
  return 115 + (hashFNV1a(`angle:${String(name).toLowerCase().trim()}`) % 45); // 115-159°
}

/** Resolve any CSS color string to {r,g,b} by sampling a 1x1 offscreen canvas. */
function colorToRgb(cssColor: string): Rgb {
  const tmp = createCanvas(1, 1);
  const tctx = tmp.getContext("2d");
  tctx.fillStyle = cssColor;
  tctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = tctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Pick whichever of white / near-black gives the higher WCAG contrast ratio
 * against the gradient's average color (a good proxy for the diagonal
 * midpoint, where the centered monogram sits), so text never clashes with
 * either end of the gradient.
 */
export function getContrastingForeground(colors: GradientColors): string {
  const stops = [colors.from, colors.mid ?? colors.from, colors.to].map(
    colorToRgb,
  );
  const avg: Rgb = {
    r: (stops[0].r + stops[1].r + stops[2].r) / 3,
    g: (stops[0].g + stops[1].g + stops[2].g) / 3,
    b: (stops[0].b + stops[1].b + stops[2].b) / 3,
  };
  const luminance = relativeLuminance(avg);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? "#FFFFFF" : "#161616";
}

/* ------------------------------ draw helpers ----------------------------- */

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(Math.max(0, r), w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Measured width of text incl. manual letter-spacing (tracking). */
function trackedWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  if (text.length === 0) return 0;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width;
  return total + tracking * (text.length - 1);
}

/** Draw text with manual letter-spacing (canvas has no native tracking control). */
function fillTextTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  tracking: number,
): void {
  if (text.length === 0) return;
  if (text.length === 1 || tracking === 0) {
    ctx.fillText(text, centerX, centerY);
    return;
  }
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + tracking * (text.length - 1);

  let x = centerX - totalWidth / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, centerY);
    x += widths[i] + tracking;
  });
  ctx.textAlign = prevAlign;
}

/**
 * Ellipsis-truncate `text` (uppercased) so it fits `maxWidth` at the current
 * font, accounting for tracking. Prefers cutting at a word boundary so the
 * caption reads cleanly ("AL JAZEERA…" rather than "AL JAZEER…").
 */
function truncateToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string {
  const upper = text.toUpperCase();
  if (trackedWidth(ctx, upper, tracking) <= maxWidth) return upper;
  const words = upper.split(" ").filter(Boolean);
  if (words.length > 1) {
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (trackedWidth(ctx, `${next}…`, tracking) > maxWidth) break;
      line = next;
    }
    if (
      trackedWidth(ctx, `${line}…`, tracking) <= maxWidth &&
      line.length >= 3
    ) {
      return `${line}…`;
    }
  }
  let trimmed = upper.replace(/\s+$/g, "");
  while (
    trimmed.length > 1 &&
    trackedWidth(ctx, `${trimmed}…`, tracking) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1).replace(/\s+$/g, "");
  }
  return `${trimmed}…`;
}

/* ------------------------------ core build ------------------------------ */

interface BuiltCanvas {
  canvas: Canvas;
  initials: string;
  displayName: string;
  backgroundColor: GradientColors;
  foregroundColor: string;
}

function buildCanvas(
  channelName: string,
  opts: BuildLogoOptions = {},
): BuiltCanvas {
  const size = opts.size ?? 512;
  const radius = opts.cornerRadius ?? size * 0.2;
  const fontFamily =
    opts.fontFamily ?? `'Helvetica Neue', Helvetica, Arial, sans-serif`;
  const showChannelName = opts.showChannelName ?? true;

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const initials = getInitials(channelName);
  const displayName = getDisplayName(channelName);
  const backgroundColor = getGradientColors(channelName);
  const foregroundColor = getContrastingForeground(backgroundColor);
  const showCaption = showChannelName && displayName.length > 0;

  const mid =
    backgroundColor.mid ??
    mixHex(backgroundColor.from, backgroundColor.to, 0.5);
  const angleDeg = getGradientAngle(channelName);
  const angleRad = (angleDeg * Math.PI) / 180;
  const hash = hashFNV1a(String(channelName).toLowerCase().trim() || "?");

  // --- Background: angled 3-stop gradient, clipped to a rounded square ----
  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, size, size, radius);
  ctx.clip();

  const dx = Math.cos(angleRad) * (size / 2);
  const dy = Math.sin(angleRad) * (size / 2);
  const gradient = ctx.createLinearGradient(
    size / 2 - dx,
    size / 2 - dy,
    size / 2 + dx,
    size / 2 + dy,
  );
  gradient.addColorStop(0, backgroundColor.from);
  gradient.addColorStop(0.52, mid);
  gradient.addColorStop(1, backgroundColor.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Abstract studio décor — two large soft orbs (light upper-right, shade
  // lower-left) with slight deterministic jitter so channels feel related
  // but not identical.
  const jitter = ((hash >> 4) % 10) / 100; // 0-0.09
  const orbA = ctx.createRadialGradient(
    size * (0.8 + jitter),
    size * (0.14 + jitter * 0.5),
    0,
    size * (0.8 + jitter),
    size * (0.14 + jitter * 0.5),
    size * 0.62,
  );
  orbA.addColorStop(0, "rgba(255,255,255,0.16)");
  orbA.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = orbA;
  ctx.fillRect(0, 0, size, size);

  const orbB = ctx.createRadialGradient(
    size * (0.12 + jitter * 0.5),
    size * (0.88 - jitter),
    0,
    size * (0.12 + jitter * 0.5),
    size * (0.88 - jitter),
    size * 0.66,
  );
  orbB.addColorStop(0, "rgba(0,0,0,0.22)");
  orbB.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = orbB;
  ctx.fillRect(0, 0, size, size);

  // Diagonal sheen band for a premium satin finish.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angleRad);
  const sheen = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.05);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.10)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-size, -size * 0.45, size * 2, size * 0.5);
  ctx.restore();

  // Top gloss (light bloom) + bottom scrim (grounds the caption).
  const gloss = ctx.createLinearGradient(0, 0, 0, size * 0.5);
  gloss.addColorStop(0, "rgba(255,255,255,0.18)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size * 0.5);

  const scrim = ctx.createLinearGradient(0, size * 0.42, 0, size);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, size * 0.42, size, size * 0.58);

  // Gentle vignette for edge depth.
  const vignette = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.32,
    size / 2,
    size / 2,
    size * 0.74,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.20)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // Crisp inner keyline so the icon holds its edge on light surfaces.
  ctx.lineWidth = Math.max(1, size * 0.004);
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  drawRoundedRectPath(
    ctx,
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    size - ctx.lineWidth,
    size - ctx.lineWidth,
    Math.max(0, radius - ctx.lineWidth / 2),
  );
  ctx.stroke();

  ctx.restore();

  // --- Typography lockup: monogram + divider + small channel caption -----
  // Generous vertical rhythm: monogram rides high, caption sits low, with
  // open air around the divider so the two never feel crowded.
  const initialsY = showCaption ? size * 0.39 : size * 0.52;
  const monoSize =
    initials.length >= 4
      ? size * 0.24
      : initials.length === 3
        ? size * 0.28
        : size * 0.35;
  const monoTracking = monoSize * (initials.length >= 3 ? 0.01 : 0.02);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dimensional fill: light-to-slightly-deep gradient in the foreground hue
  // gives the letters a subtle embossed feel vs. a flat fill.
  const monoFill = ctx.createLinearGradient(
    0,
    initialsY - monoSize * 0.5,
    0,
    initialsY + monoSize * 0.55,
  );
  if (foregroundColor === "#FFFFFF") {
    monoFill.addColorStop(0, "#FFFFFF");
    monoFill.addColorStop(1, "#D8DDE8");
  } else {
    monoFill.addColorStop(0, "#2E2E2E");
    monoFill.addColorStop(1, "#0B0B0B");
  }

  ctx.save();
  ctx.font = `800 ${monoSize}px ${fontFamily}`;
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = size * 0.028;
  ctx.shadowOffsetY = size * 0.014;
  ctx.fillStyle = monoFill;
  // small optical nudge — cap-height text reads low against exact center
  fillTextTracked(
    ctx,
    initials,
    size / 2,
    initialsY + monoSize * 0.04,
    monoTracking,
  );
  ctx.restore();

  if (showCaption) {
    // Hairline divider between monogram and caption.
    const dividerY = initialsY + monoSize * 0.55;
    const dividerW = Math.min(Math.max(size * 0.11, 30), 64);
    ctx.save();
    ctx.strokeStyle = withAlpha(foregroundColor, 0.55);
    ctx.lineWidth = Math.max(2, size * 0.006);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(size / 2 - dividerW / 2, dividerY);
    ctx.lineTo(size / 2 + dividerW / 2, dividerY);
    ctx.stroke();
    ctx.restore();

    // Small tracked uppercase channel name — auto-fit then ellipsis.
    const maxCaptionWidth = size * 0.76;
    let captionSize = size * 0.058;
    const minCaptionSize = size * 0.032;
    let caption = displayName.toUpperCase();
    while (captionSize > minCaptionSize) {
      ctx.font = `600 ${captionSize}px ${fontFamily}`;
      const tracking = captionSize * 0.22;
      caption = truncateToFit(ctx, displayName, maxCaptionWidth, tracking);
      if (trackedWidth(ctx, caption, tracking) <= maxCaptionWidth) break;
      captionSize *= 0.94;
    }
    ctx.font = `600 ${captionSize}px ${fontFamily}`;
    const captionTracking = captionSize * 0.22;
    caption = truncateToFit(ctx, displayName, maxCaptionWidth, captionTracking);
    const captionY = dividerY + size * 0.085;

    ctx.save();
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = foregroundColor;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = size * 0.012;
    ctx.shadowOffsetY = size * 0.004;
    fillTextTracked(ctx, caption, size / 2, captionY, captionTracking);
    ctx.restore();
  }

  return { canvas, initials, displayName, backgroundColor, foregroundColor };
}

/** Build a polished square channel logo and return it as a PNG readable stream. */
export function buildChannelLogo(
  channelName: string,
  opts: BuildLogoOptions = {},
): BuiltLogo {
  const { canvas, initials, displayName, backgroundColor, foregroundColor } =
    buildCanvas(channelName, opts);
  return {
    stream: canvas.createPNGStream(),
    initials,
    displayName,
    backgroundColor,
    foregroundColor,
  };
}

/** Build a polished square channel logo and return it as a PNG buffer. */
export function buildChannelLogoBuffer(
  channelName: string,
  opts: BuildLogoOptions = {},
): Buffer {
  return buildCanvas(channelName, opts).canvas.toBuffer("image/png");
}

/* ------------------------------ cloudinary ------------------------------- */

/**
 * Generate a channel logo and upload it directly to Cloudinary via stream
 * (no temp file on disk).
 */
export function uploadChannelLogo(
  channelName: string,
  options: UploadLogoOptions = {},
): Promise<UploadedLogoResult> {
  const {
    size = 512,
    cornerRadius,
    fontFamily,
    showChannelName,
    cloudinaryOptions = {},
  } = options;

  return new Promise((resolve, reject) => {
    const { stream, initials, displayName, backgroundColor, foregroundColor } =
      buildChannelLogo(channelName, {
        size,
        cornerRadius,
        fontFamily,
        showChannelName,
      });

    const publicId = String(channelName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "channel-logos",
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        format: "png",
        ...cloudinaryOptions,
      },
      (error, result) => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        if (error) return reject(error);
        resolve({
          ...(result as UploadApiResponse),
          initials,
          displayName,
          backgroundColor,
          foregroundColor,
        });
      },
    );

    stream.on("error", reject);
    stream.pipe(uploadStream);
  });
}
/**
 * Fetches an image from a URL and streams it directly to Cloudinary.
 * Nothing is written to disk and the image is never fully buffered in memory.
 */

export async function uploadImageFromUrl(
  url: string,
  options: UploadApiOptions = {},
): Promise<UploadApiResponse> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `URL did not return an image (content-type: ${contentType || "unknown"})`,
    );
  }

  // Convert the web ReadableStream from fetch into a Node.js Readable
  const source = Readable.fromWeb(
    response.body as unknown as NodeWebReadableStream,
  );

  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "image", ...options },
      (error, result) => {
        if (error || !result) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return reject(error ?? new Error("Cloudinary upload failed"));
        }
        resolve(result);
      },
    );

    source.on("error", (err) => {
      uploadStream.destroy(err);
      reject(err);
    });

    source.pipe(uploadStream);
  });
}

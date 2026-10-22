/**
 * Script accent colours.
 *
 * The script name shown on the table used to be painted with a single crimson
 * token, which only ever matched one script: 暗流涌动's wordmark really is red,
 * but 黯月初升's is gold, 梦殒春宵's is violet and 无上欢愉's is orange. So the
 * label fought its own artwork on every script but one.
 *
 * The colour therefore comes from the script's own logo:
 *
 *  1. Official scripts use `OFFICIAL_SCRIPT_ACCENTS` — colours read off the
 *     shipped wordmarks. A fixed table beats sampling here because the official
 *     logos are remote OSS photos: they are cross-origin (canvas reads throw)
 *     and the wordmark is a small part of a busy, mostly-dark picture, so
 *     dominant-colour sampling would return mud, not the lettering.
 *  2. Anything else with a usable, CORS-clean logo is sampled at runtime by
 *     `extractAccentFromImage`, which looks only at vivid pixels — lettering and
 *     emblems — and ignores the dark background.
 *  3. Failing both, the old crimson stays as the fallback, so nothing regresses.
 */

/** Fallback, matching the historical `--ts-accent-crimson`. */
export const DEFAULT_SCRIPT_ACCENT = "#8e2f36";

/**
 * Keyed by both edition id and display name: the id is authoritative for local
 * editions, while realtime rooms only carry the script title back from the API.
 */
const OFFICIAL_SCRIPT_ACCENTS: Record<string, string> = {
  // 暗流涌动 — deep crimson lettering.
  tb: "#a8323a",
  暗流涌动: "#a8323a",
  // 黯月初升 — warm gold, the brightest of the set.
  bmr: "#d2a044",
  黯月初升: "#d2a044",
  // 梦殒春宵 — violet.
  snv: "#9260bb",
  梦殒春宵: "#9260bb",
  // 无上欢愉 (No Greater Joy) — amber orange.
  ngj: "#cc7730",
  无上欢愉: "#cc7730",
  // 窃窃私语 (Laissez un Faire) — cold slate blue. `luf` is this script, not
  // 无上欢愉: the two used to share the id, which shifted every label after it.
  luf: "#5f7fa8",
  窃窃私语: "#5f7fa8",
  // 华灯初上 / 山雨欲来 — lantern red-gold and storm blue.
  hdcs: "#c8853a",
  华灯初上: "#c8853a",
  syyl: "#6b7f9c",
  山雨欲来: "#6b7f9c",
};

export interface ScriptAccentTheme {
  /** Daytime text colour. */
  base: string;
  /** Night text colour: the same hue, lifted for legibility on dark parchment. */
  night: string;
  /** Translucent halo for the daytime text-shadow. */
  glow: string;
  /** Translucent halo for the night text-shadow. */
  nightGlow: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) {
    body = body
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const value = Number.parseInt(body, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const hex = (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
  return `#${hex.toString(16).padStart(6, "0")}`;
}

/** Blend towards white by `amount` (0..1). */
function lighten(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)}, ${alpha})`;
}

/** Perceived brightness, 0..255. Used to keep night text readable. */
function luminance({ r, g, b }: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Build the day/night pair from one accent colour.
 *
 * Night keeps the script's hue rather than the old flat moonlit lilac —
 * otherwise picking a per-script colour would stop meaning anything after dusk.
 * Dark accents get lifted more, because the night table is much darker than the
 * day one and an unlifted crimson or violet reads as black on it.
 */
export function deriveAccentTheme(accent: string): ScriptAccentTheme {
  const rgb = hexToRgb(accent) ?? hexToRgb(DEFAULT_SCRIPT_ACCENT)!;
  const lift = luminance(rgb) < 120 ? 0.52 : 0.34;
  const nightRgb = lighten(rgb, lift);

  return {
    base: rgbToHex(rgb),
    night: rgbToHex(nightRgb),
    glow: rgba(lighten(rgb, 0.18), 0.45),
    nightGlow: rgba(nightRgb, 0.6),
  };
}

/**
 * Look up a script's accent by id and/or name. Returns null when the script is
 * unknown, so callers can decide between sampling a logo and falling back.
 */
export function lookupScriptAccent(
  input: { id?: string | null; name?: string | null } = {},
): string | null {
  const keys = [input.id, input.name]
    .filter((key): key is string => typeof key === "string" && key.length > 0)
    .map((key) => key.trim());

  for (const key of keys) {
    if (OFFICIAL_SCRIPT_ACCENTS[key]) return OFFICIAL_SCRIPT_ACCENTS[key];
  }
  return null;
}

const extractionCache = new Map<string, Promise<string | null>>();

/**
 * Sample a logo's most prominent vivid colour.
 *
 * Only reasonably saturated, reasonably bright pixels are counted, and they are
 * bucketed by hue: script logos are dark art with coloured lettering, so the
 * plain arithmetic mean would land on the background every time. Resolves to
 * null on load failure or a tainted canvas (a cross-origin image served without
 * CORS headers) — the caller falls back rather than throwing.
 */
export function extractAccentFromImage(url: string): Promise<string | null> {
  const cached = extractionCache.get(url);
  if (cached) return cached;

  const task = new Promise<string | null>((resolve) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        // Downscale hard: we want the dominant hue, not detail, and a 64px
        // sample keeps this well under a frame.
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);

        // 12 hue buckets, each accumulating its pixels so the winner can be
        // averaged rather than snapped to one arbitrary sample.
        const buckets = Array.from({ length: 12 }, () => ({
          count: 0,
          r: 0,
          g: 0,
          b: 0,
        }));

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 200) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          // Skip near-greys and both extremes: parchment, shadow, blown highlights.
          if (saturation < 0.35 || max < 70 || luminance({ r, g, b }) > 240) continue;

          let hue: number;
          const delta = max - min;
          if (max === r) hue = ((g - b) / delta) % 6;
          else if (max === g) hue = (b - r) / delta + 2;
          else hue = (r - g) / delta + 4;
          hue = ((hue * 60) % 360 + 360) % 360;

          const bucket = buckets[Math.floor(hue / 30) % 12];
          bucket.count += 1;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
        }

        const winner = buckets.reduce((best, bucket) =>
          bucket.count > best.count ? bucket : best,
        );
        // Too few vivid pixels to trust — treat as "no usable accent".
        if (winner.count < 24) {
          resolve(null);
          return;
        }

        resolve(
          rgbToHex({
            r: winner.r / winner.count,
            g: winner.g / winner.count,
            b: winner.b / winner.count,
          }),
        );
      } catch {
        // Tainted canvas: cross-origin logo without CORS headers.
        resolve(null);
      }
    };

    image.src = url;
  });

  extractionCache.set(url, task);
  return task;
}

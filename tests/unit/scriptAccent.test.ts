import { describe, expect, test } from "vitest";
import {
  DEFAULT_SCRIPT_ACCENT,
  deriveAccentTheme,
  extractAccentFromImage,
  lookupScriptAccent,
} from "@/utils/scriptAccent";

describe("lookupScriptAccent", () => {
  test("resolves official scripts by edition id and by display name", () => {
    // The centre emblem only ever has the title (realtime rooms), while local
    // editions have the id — both paths must land on the same colour.
    expect(lookupScriptAccent({ id: "bmr" })).toBe(
      lookupScriptAccent({ name: "黯月初升" }),
    );
    expect(lookupScriptAccent({ id: "tb" })).toBe(
      lookupScriptAccent({ name: "暗流涌动" }),
    );
  });

  test("gives each official script its own colour", () => {
    const names = [
      "暗流涌动",
      "黯月初升",
      "梦殒春宵",
      "无上欢愉",
      "窃窃私语",
    ];
    const colours = names.map((name) => lookupScriptAccent({ name }));

    expect(colours.every((colour) => typeof colour === "string")).toBe(true);
    // The whole point of the change: one crimson cannot serve them all.
    expect(new Set(colours).size).toBe(names.length);
  });

  test("returns null for unknown or empty input so callers can fall back", () => {
    expect(lookupScriptAccent({ name: "某个自定义剧本" })).toBeNull();
    expect(lookupScriptAccent({ id: null, name: null })).toBeNull();
    expect(lookupScriptAccent()).toBeNull();
  });

  test("tolerates surrounding whitespace in a script title", () => {
    expect(lookupScriptAccent({ name: "  黯月初升  " })).toBe(
      lookupScriptAccent({ name: "黯月初升" }),
    );
  });
});

describe("deriveAccentTheme", () => {
  test("keeps the day colour and lifts the night one without changing hue", () => {
    const theme = deriveAccentTheme("#9260bb");

    expect(theme.base).toBe("#9260bb");
    // Night must stay the same hue family — that is what makes the per-script
    // colour still mean something after dusk.
    expect(theme.night).not.toBe(theme.base);
    const [, r, g, b] = /^#(..)(..)(..)$/.exec(theme.night)!;
    const [nr, ng, nb] = [r, g, b].map((part) => Number.parseInt(part, 16));
    expect(nr).toBeGreaterThan(0x92);
    expect(nb).toBeGreaterThan(nr);
    expect(nr).toBeGreaterThan(ng);
  });

  test("lifts dark accents further than light ones for night legibility", () => {
    const dark = deriveAccentTheme("#8e2f36");
    const light = deriveAccentTheme("#d2a044");

    const lift = (hex: string, from: string) =>
      Number.parseInt(hex.slice(1, 3), 16) - Number.parseInt(from.slice(1, 3), 16);

    expect(lift(dark.night, dark.base)).toBeGreaterThan(
      lift(light.night, light.base),
    );
  });

  test("emits translucent haloes for both phases", () => {
    const theme = deriveAccentTheme("#cc7730");

    expect(theme.glow).toMatch(/^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/);
    expect(theme.nightGlow).toMatch(/^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/);
  });

  test("falls back to crimson on unparseable input instead of throwing", () => {
    expect(deriveAccentTheme("not-a-colour").base).toBe(DEFAULT_SCRIPT_ACCENT);
  });

  test("accepts shorthand hex", () => {
    expect(deriveAccentTheme("#fa0").base).toBe("#ffaa00");
  });
});

describe("extractAccentFromImage", () => {
  test("resolves null when the logo cannot be loaded", async () => {
    // jsdom never loads the image, so onerror is what fires here — the point is
    // that a broken or CORS-blocked logo degrades quietly rather than throwing.
    const originalImage = globalThis.Image;
    class FailingImage {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      crossOrigin = "";
      decoding = "";
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;

    try {
      await expect(
        extractAccentFromImage("https://example.test/broken-logo.png"),
      ).resolves.toBeNull();
    } finally {
      globalThis.Image = originalImage;
    }
  });
});

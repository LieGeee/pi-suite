import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AppearanceThemeRecord } from "../src/desktop-state";
// @ts-ignore Node's strip-types test runner requires an explicit TypeScript extension.
import { BUILTIN_APPEARANCE_THEMES } from "../src/appearance-themes.ts";

const MAX_HERO_BYTES = 8 * 1024 * 1024;
const THEME_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SAFE_VARIABLES = new Set([
  "--window",
  "--sidebar",
  "--main",
  "--surface",
  "--surface-muted",
  "--line",
  "--line-strong",
  "--text",
  "--text-strong",
  "--muted",
  "--muted-strong",
  "--muted-soft",
  "--muted-subtle",
  "--muted-icon",
  "--muted-path",
  "--muted-settings",
  "--accent",
  "--button-primary-bg",
  "--button-primary-border",
  "--button-primary-ink",
  "--button-primary-hover-bg",
  "--button-primary-hover-border",
  "--appearance-hero-ink",
  "--appearance-hero-subtle",
]);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([0-9.%\s,]+\)|hsla?\([0-9.%\s,]+\)|transparent)$/i;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

interface ThemeManifest {
  readonly version?: unknown;
  readonly themes?: unknown;
}

export async function loadAppearanceThemes(themeRoot: string): Promise<readonly AppearanceThemeRecord[]> {
  let manifest: ThemeManifest;
  try {
    manifest = JSON.parse(await readFile(join(themeRoot, "manifest.json"), "utf8")) as ThemeManifest;
  } catch {
    return BUILTIN_APPEARANCE_THEMES;
  }
  if (manifest.version !== 1 || !Array.isArray(manifest.themes)) {
    return BUILTIN_APPEARANCE_THEMES;
  }

  const external = (
    await Promise.all(manifest.themes.map((entry) => parseThemeRecord(themeRoot, entry)))
  ).filter((entry): entry is AppearanceThemeRecord => Boolean(entry));
  const byId = new Map(BUILTIN_APPEARANCE_THEMES.map((theme) => [theme.id, theme] as const));
  for (const theme of external) {
    byId.set(theme.id, theme);
  }
  return [...byId.values()];
}

async function parseThemeRecord(themeRoot: string, value: unknown): Promise<AppearanceThemeRecord | undefined> {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  if (!THEME_ID.test(id) || !name || name.length > 60 || description.length > 180) {
    return undefined;
  }

  const variables = sanitizeVariables(candidate.variables);
  const heroImageUrl = typeof candidate.heroImage === "string"
    ? await loadHeroImage(themeRoot, candidate.heroImage)
    : undefined;
  return {
    id,
    name,
    description,
    ...(Object.keys(variables).length > 0 ? { variables } : {}),
    ...(heroImageUrl ? { heroImageUrl } : {}),
  };
}

function sanitizeVariables(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!SAFE_VARIABLES.has(name) || typeof raw !== "string") {
      continue;
    }
    const color = raw.trim();
    if (color.length <= 80 && SAFE_COLOR.test(color)) {
      result[name] = color;
    }
  }
  return result;
}

async function loadHeroImage(themeRoot: string, relativePath: string): Promise<string | undefined> {
  if (!IMAGE_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
    return undefined;
  }
  try {
    const resolvedRoot = await realpath(themeRoot);
    const resolvedImage = await realpath(resolve(themeRoot, relativePath));
    const pathFromRoot = relative(resolvedRoot, resolvedImage);
    if (
      !pathFromRoot
      || isAbsolute(pathFromRoot)
      || pathFromRoot.startsWith("..")
      || resolve(resolvedRoot, pathFromRoot) !== resolvedImage
    ) {
      return undefined;
    }
    const imageStat = await stat(resolvedImage);
    if (!imageStat.isFile() || imageStat.size === 0 || imageStat.size > MAX_HERO_BYTES) {
      return undefined;
    }
    return pathToFileURL(resolvedImage).href;
  } catch {
    return undefined;
  }
}

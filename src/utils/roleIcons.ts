import { applyAlignmentPalette, sampleAlignmentPalette } from './roleIconPalette';

type IconImporter = () => Promise<unknown>;
type IconRole = {
  imageAlt?: string;
  id?: string;
  role?: string;
  characterId?: string;
  roleId?: string;
  team?: string;
  image?: string;
  [key: string]: unknown;
};

const lazyIconModules = import.meta.glob<IconImporter>("../assets/icons/*.png", {
  import: "default",
});

const fallbackIconByTeam: Record<string, string> = {
  townsfolk: "townsfolks",
  townsfolks: "townsfolks",
  outsider: "outsiders",
  outsiders: "outsiders",
  minion: "minions",
  minions: "minions",
  demon: "demons",
  demons: "demons",
  traveler: "travelers",
  traveller: "travelers",
  travelers: "travelers",
  travellers: "travelers",
  fabled: "fabled",
  fableds: "fabled",
  loric: "fabled",
};

const assetUrl = (asset: unknown): string => {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  if (typeof asset === "object" && asset !== null && "default" in asset) {
    const candidate = (asset as { default?: unknown }).default;
    return typeof candidate === "string" ? candidate : "";
  }
  return "";
};

function fileBaseName(path: string): string {
  return path.split("/").pop()?.replace(/\.png$/i, "") || "";
}

function stripIconSuffix(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\.png$/i, "")
    .replace(/\s+old\s+1$/i, "")
    .replace(/old1$/i, "");
}

function normalizeIconName(value: unknown): string {
  return stripIconSuffix(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildIconIndex(modules: Record<string, IconImporter>): Record<string, IconImporter> {
  return Object.entries(modules).reduce((index, [path, module]) => {
    const baseName = fileBaseName(path);
    index[baseName.toLowerCase()] = module;
    index[normalizeIconName(baseName)] = module;
    return index;
  }, {} as Record<string, IconImporter>);
}

const lazyIconIndex = buildIconIndex(lazyIconModules);

const alignmentIcons = new Map<string, Promise<string>>();
const alignmentPalettes = new Map<string, Promise<ReturnType<typeof sampleAlignmentPalette>>>();

async function loadImage(url: string, readPixels = false): Promise<HTMLImageElement> {
  const image = new Image();
  if (readPixels) image.crossOrigin = 'anonymous';
  image.src = url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('角色图标加载超时')), 2500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return image;
}

async function readIcon(url: string) {
  const image = await loadImage(url, true);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取角色图标颜色');
  context.drawImage(image, 0, 0);
  return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) };
}

async function colorIcon(url: string, alignment: unknown): Promise<string> {
  if (alignment !== 'good' && alignment !== 'evil') return url;
  const key = `${alignment}:${url}`;
  let result = alignmentIcons.get(key);
  if (!result) {
    result = (async () => {
      let palette = alignmentPalettes.get(alignment);
      if (!palette) {
        palette = (async () => {
          const reference = alignment === 'evil' ? 'imp' : 'clockmaker';
          const referenceUrl = assetUrl(await lazyIconIndex[reference]());
          return sampleAlignmentPalette((await readIcon(referenceUrl)).data.data, alignment);
        })();
        alignmentPalettes.set(alignment, palette);
      }
      const [icon, colors] = await Promise.all([readIcon(url), palette]);
      applyAlignmentPalette(icon.data.data, alignment, colors);
      icon.context.putImageData(icon.data, 0, 0);
      return icon.canvas.toDataURL('image/png');
    })().catch(() => {
      // Let the caller try the bundled artwork when an external image cannot
      // be read by canvas (for example, when its host does not allow CORS).
      alignmentIcons.delete(key);
      return '';
    });
    alignmentIcons.set(key, result);
  }
  return result;
}

export function getRoleIconCandidates(role: IconRole = {}, includeFallback = true): string[] {
  const targetRole = role || {};
  const iconNames = [
    targetRole.imageAlt,
    targetRole.id,
    targetRole.role,
    targetRole.characterId,
    targetRole.roleId,
  ]
    .map(stripIconSuffix)
    .filter(Boolean);
  const teamKey = String(targetRole.team || "").toLowerCase();
  const fallbackName = fallbackIconByTeam[teamKey] || "custom";
  return [...new Set([
    ...iconNames,
    ...iconNames.map((iconName) => iconName.toLowerCase()),
    ...iconNames.map(normalizeIconName),
    ...(includeFallback ? [fallbackName, 'custom'] : []),
  ].filter(Boolean))];
}

function resolveIcon(index: Record<string, IconImporter>, role: IconRole, includeFallback = true): IconImporter | undefined {
  const candidates = getRoleIconCandidates(role, includeFallback);
  for (const candidate of candidates) {
    const direct = index[String(candidate).toLowerCase()];
    if (direct) return direct;

    const normalized = index[normalizeIconName(candidate)];
    if (normalized) return normalized;
  }
  return includeFallback ? index.custom : undefined;
}

function externalIconName(url: string): string {
  try {
    const fileName = new URL(url, 'http://localhost').pathname.split('/').pop() || '';
    const name = decodeURIComponent(fileName)
      .replace(/^\d+px-/, '')
      .replace(/^\d+!/, '')
      .replace(/\.(png|svg|webp|jpe?g)$/i, '')
      .replace(/_[ge]$/i, '');
    if (name.toLowerCase() === 'custom') return '';
    return lazyIconIndex[normalizeIconName(name)] ? name : fallbackIconByTeam[name.toLowerCase()] || name;
  } catch {
    return '';
  }
}

export function getRoleIconFilter(role: IconRole, iconUrl: string, filterId: string): string | undefined {
  // SVG filters operate on the displayed image without reading cross-origin
  // pixels. Keep the custom design when canvas recoloring is unavailable.
  return iconUrl && iconUrl === role.image && ['good', 'evil'].includes(String(role.alignment))
    ? `url("#${filterId}")` : undefined;
}

export async function loadRoleIconUrl(
  role: IconRole,
  { allowExternalImage = false, isImageOptIn = false } = {},
) : Promise<string> {
  if (allowExternalImage && role && role.image && isImageOptIn) {
    let external = '';
    if (role.alignment === 'good' || role.alignment === 'evil') {
      external = await colorIcon(role.image, role.alignment);
    } else {
      // Normal alignment still needs to check availability. Do not request
      // CORS permission: an image can display even when canvas cannot read it.
      try {
        await loadImage(role.image);
        external = role.image;
      } catch {
        // Share the character-specific fallback used by recolored icons.
      }
    }
    if (external) return external;
    // Only use artwork for this character: a team placeholder would erase a
    // custom character's identity when its external image cannot be recolored.
    // Imported scripts can rename character IDs and set imageAlt to a generic
    // team icon. Their image filename still identifies the original artwork.
    const bundled = resolveIcon(lazyIconIndex, { ...role, imageAlt: externalIconName(role.image) }, false);
    if (!bundled) return role.image;
    const url = assetUrl(await bundled());
    return (url && await colorIcon(url, role.alignment)) || role.image;
  }

  const importer = resolveIcon(lazyIconIndex, role);
  if (!importer) return "";

  const icon = await importer();
  const url = assetUrl(icon);
  return url ? (await colorIcon(url, role.alignment)) || url : '';
}

export interface SubgroupRef {
  id: string;
  name: string;
  folder?: string | null;
  color?: string | null;
}

export interface MemberRef {
  name?: string | null;
  email: string;
}

export interface DirectoryMemberRef extends MemberRef {
  id: string;
  subgroups: readonly Pick<SubgroupRef, "id">[];
}

export interface DirectoryGroup<TSubgroup extends SubgroupRef, TMember extends DirectoryMemberRef> {
  subgroup: TSubgroup;
  members: TMember[];
}

export type DirectorySection<
  TSubgroup extends SubgroupRef,
  TMember extends DirectoryMemberRef,
> =
  | { kind: "folder"; label: string; groups: DirectoryGroup<TSubgroup, TMember>[] }
  | { kind: "ungrouped"; label: "Senza sottogruppo"; members: TMember[] };

const DARK_INK = "#172033";
const WHITE = "#FFFFFF";
const BLACK = "#000000";

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  const normalized = value.normalize("NFKC").toLocaleLowerCase("it-IT");
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - chroma / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(background: string, foreground: string, foregroundWeight: number): string {
  const bg = hexToRgb(background);
  const fg = hexToRgb(foreground);
  return `#${bg
    .map((channel, index) =>
      Math.round(channel * (1 - foregroundWeight) + fg[index] * foregroundWeight)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`;
}

export function subgroupColors(name: string, override?: string | null) {
  const hash = fnv1a(name);
  const background = override
    ? override.toUpperCase()
    : hslToHex(hash % 360, 58 + ((hash >>> 8) % 25), 38 + ((hash >>> 16) % 25));
  const whiteContrast = contrastRatio(background, WHITE);
  const darkContrast = contrastRatio(background, DARK_INK);
  let foreground = whiteContrast >= darkContrast ? WHITE : DARK_INK;
  let contrast = Math.max(whiteContrast, darkContrast);
  if (contrast < 4.5) {
    foreground = BLACK;
    contrast = contrastRatio(background, BLACK);
  }
  return {
    background,
    foreground,
    border: mixHex(background, foreground, 0.2),
    contrast,
  };
}

const italian = new Intl.Collator("it", { sensitivity: "base", numeric: true });

export function compareSubgroups(first: SubgroupRef, second: SubgroupRef): number {
  const folder = italian.compare(first.folder?.trim() || "Generale", second.folder?.trim() || "Generale");
  if (folder !== 0) return folder;
  const name = italian.compare(first.name, second.name);
  return name !== 0 ? name : italian.compare(first.id, second.id);
}

export function sortSubgroups<T extends SubgroupRef>(values: readonly T[]): T[] {
  return [...values].sort(compareSubgroups);
}

export function sortMembers<T extends MemberRef>(values: readonly T[]): T[] {
  return [...values].sort((first, second) => {
    const firstLabel = first.name?.trim() || first.email;
    const secondLabel = second.name?.trim() || second.email;
    const label = italian.compare(firstLabel, secondLabel);
    return label !== 0 ? label : italian.compare(first.email, second.email);
  });
}

export function buildDirectorySections<
  TMember extends DirectoryMemberRef,
  TSubgroup extends SubgroupRef,
>(members: readonly TMember[], subgroups: readonly TSubgroup[]): DirectorySection<TSubgroup, TMember>[] {
  const sections: DirectorySection<TSubgroup, TMember>[] = [];
  const matchedMemberIds = new Set<string>();

  for (const subgroup of sortSubgroups(subgroups)) {
    const subgroupMembers = sortMembers(
      members.filter((member) => member.subgroups.some((membership) => membership.id === subgroup.id))
    );
    if (subgroupMembers.length === 0) continue;

    subgroupMembers.forEach((member) => matchedMemberIds.add(member.id));
    const label = subgroup.folder?.trim() || "Generale";
    const existing = sections.find(
      (section) => section.kind === "folder" && italian.compare(section.label, label) === 0
    );
    const group = { subgroup, members: subgroupMembers };

    if (existing?.kind === "folder") existing.groups.push(group);
    else sections.push({ kind: "folder", label, groups: [group] });
  }

  const ungrouped = sortMembers(members.filter((member) => !matchedMemberIds.has(member.id)));
  if (ungrouped.length > 0) {
    sections.push({ kind: "ungrouped", label: "Senza sottogruppo", members: ungrouped });
  }

  return sections;
}

export function normalizeColorOverride(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

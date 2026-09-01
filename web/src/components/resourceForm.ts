import type { SharedResourceDraft } from "../types";

export const emptyResourceDraft: SharedResourceDraft = {
  url: "",
  title: "",
  description: null,
  previewEnabled: false,
  previewImageUrl: null,
  previewSiteName: null,
  isGlobal: true,
  subgroupIds: [],
};

export function normalizeResourceDraft(draft: SharedResourceDraft): SharedResourceDraft {
  const description = draft.description?.trim() || null;
  return {
    url: draft.url.trim(),
    title: draft.title.trim(),
    description,
    previewEnabled: draft.previewEnabled,
    previewImageUrl: draft.previewEnabled ? (draft.previewImageUrl?.trim() || null) : null,
    previewSiteName: draft.previewEnabled ? (draft.previewSiteName?.trim() || null) : null,
    isGlobal: draft.isGlobal,
    subgroupIds: draft.isGlobal
      ? []
      : [...new Set(draft.subgroupIds.map((id) => id.trim()).filter(Boolean))],
  };
}

export function moveResourceId(
  resourceIds: string[],
  resourceId: string,
  direction: "up" | "down" | -1 | 1,
): string[] {
  const index = resourceIds.indexOf(resourceId);
  const offset = direction === "up" || direction === -1 ? -1 : 1;
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= resourceIds.length) return resourceIds;
  const next = [...resourceIds];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function resourceCardFallback(resource: Pick<SharedResourceDraft, "url" | "previewSiteName">): string {
  if (resource.previewSiteName) return resource.previewSiteName;
  return new URL(resource.url).hostname.replace(/^www\./, "");
}

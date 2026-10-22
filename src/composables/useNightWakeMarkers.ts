import { useDemoStore } from '@/stores/demo';
import { computed, ref } from "vue";

import { useGameScriptStore } from "@/stores/gameScript";
import { useSessionStore } from "@/stores/session";

export type NightWakeSection = "first" | "other";

type WakeRole = {
  alias?: string;
  id?: string;
  name?: string;
};

type MarkerBucket = Partial<Record<NightWakeSection, string[]>>;
type MarkerStore = Record<string, MarkerBucket>;

const STORAGE_KEY = "townsquare-night-wake-markers-v1";

export function nightWakeRoleKey(role: WakeRole): string {
  return String(role.alias || role.id || role.name || "")
    .trim()
    .toLocaleLowerCase();
}

function readMarkerStore(): MarkerStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMarkerStore(store: MarkerStore): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

export function useNightWakeMarkers() {
  const demo = useDemoStore();
  const gameScriptStore = useGameScriptStore();
  const sessionStore = useSessionStore();
  const markerStore = ref<MarkerStore>(readMarkerStore());

  const scopeKey = computed(() => {
    const roomKey = sessionStore.sessionId || "local";
    const scriptKey =
      gameScriptStore.currentGameScriptId || gameScriptStore.title || "script";
    return `${roomKey}::${scriptKey}`;
  });

  const manualMarkerIds = (section: NightWakeSection) => computed(() => {
    const values = demo.active ? demo.wakeMarkers[section] : markerStore.value[scopeKey.value]?.[section] || [];
    return new Set(values);
  });

  function isManuallyMarked(
    section: NightWakeSection,
    role: WakeRole,
  ): boolean {
    return manualMarkerIds(section).value.has(nightWakeRoleKey(role));
  }

  function toggleWakeMarker(
    section: NightWakeSection,
    role: WakeRole,
  ): boolean {
    const key = nightWakeRoleKey(role);
    if (!key) return false;

    if (demo.active) {
      const ids = new Set(demo.wakeMarkers[section]);
      const value = !ids.has(key);
      if (value) ids.add(key); else ids.delete(key);
      demo.wakeMarkers[section] = [...ids]; demo.save(); return value;
    }
    const scope = markerStore.value[scopeKey.value] || {};
    const nextIds = new Set(scope[section] || []);
    const nextValue = !nextIds.has(key);
    if (nextValue) nextIds.add(key);
    else nextIds.delete(key);

    const nextStore: MarkerStore = {
      ...markerStore.value,
      [scopeKey.value]: {
        ...scope,
        [section]: [...nextIds],
      },
    };
    markerStore.value = nextStore;
    writeMarkerStore(nextStore);
    return nextValue;
  }

  return {
    scopeKey,
    isManuallyMarked,
    toggleWakeMarker,
  };
}

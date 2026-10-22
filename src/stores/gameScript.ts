import type { GameScriptCharacter, GameScriptType } from "@/types";
import { defineStore } from "pinia";

import editionList from "../data/editions.json";
import roleList from "../data/roles.json";
import fabledList from "../data/fabled.json";
import jinxList from "../data/hatred.json";

export const DefaultTeamsNames = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
  traveler: "旅行者",
};

export const EditionIdDataMap = (() => {
  const map: Record<string, string> = {};
  for (const edition of Object.values(editionList)) {
    map[edition.id] = edition.name;
  }
  return map;
})();

export const RoleIdDataMap = (() => {
  const map: Record<string, GameScriptCharacter> = {};
  for (const role of Object.values(roleList)) {
    map[role.id] = role;
  }
  return map;
})();

export const useGameScriptStore = defineStore("gameScript", {
  state: () => ({
    currentGameScriptId: null as string | null,
    title: null as string | null,
    description: null as string | null,
    author: null as string | null,
    logoUrl: null as string | null,
    additionalInfo: null as Record<string, unknown>[] | null,
    customLabels: null as Record<string, string> | null,
    teamPlayerNumTable: {} as Record<string, string | number[]>,
    characters: [] as GameScriptCharacter[],
  }),
  getters: {
    teamsNames(state): typeof DefaultTeamsNames {
      return {
        ...DefaultTeamsNames,
        ...state.customLabels,
      }
    },
    charactersFirstNightOrdered(state): GameScriptCharacter[] {
      return [...state.characters].sort((a, b) => {
        return (b.firstNight ?? 0) - (a.firstNight ?? 0);
      });
    },
    charactersOtherNightOrdered(state): GameScriptCharacter[] {
      return [...state.characters].sort((a, b) => {
        return (b.otherNight ?? 0) - (a.otherNight ?? 0);
      });
    },
  },
  actions: {
    applyGameScript(scriptId: string | null, script?: GameScriptType) {
      this.currentGameScriptId = scriptId;
      this.title = script?.name ?? null;
      this.description = script?.description ?? null;
      this.author = script?.author ?? null;
      this.logoUrl = script?.logo ?? null;
      this.additionalInfo = script?.additional ?? null;
      this.customLabels = script?.customLabels ?? null;
      this.teamPlayerNumTable = script?.teamPlayerNumTable ?? {};
      this.characters = script?.characters ? [...script.characters] : [];
    },
    resetRoomScript() {
      this.applyGameScript(null);
    },
    getRolesByEdition(editionId: string): GameScriptCharacter[] {
      return roleList.filter(
          (role) =>
            role.edition === editionId,
        )
        .sort((a, b) => String(b.team || "").localeCompare(String(a.team || "")));
    },
  }
});

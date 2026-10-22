import { defineStore } from "pinia";
import editionJSON from "../data/editions.json";
import rolesJSON from "../data/roles.json";
import fabledJSON from "../data/fabled.json";
import jinxesJSON from "../data/hatred.json";
import type { FabledRole, Role } from "../types/domain";
import type { AppState, ModalsState } from "../types/store";
import { usePlayersStore } from "./players";
import { useSessionStore } from "./session";
import { displayDefaults, DISPLAY_SETTINGS_KEY, readSettings } from "@/utils/settingsStorage";

const clean = (id: string): string => id.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

const customRole: Role = {
  id: "",
  name: "",
  image: "",
  ability: "",
  edition: "custom",
  firstNight: 0,
  firstNightReminder: "",
  otherNight: 0,
  otherNightReminder: "",
  reminders: [],
  remindersGlobal: [],
  jinxes: [],
  setup: false,
  team: "townsfolk",
  isCustom: true,
};

const editionJSONbyId = new Map<string, Record<string, unknown>>(
  (editionJSON as Record<string, unknown>[]).map((edition) => [edition.id as string, edition]),
);
const rolesJSONbyId = new Map<string, Role>((rolesJSON as Role[]).map((role) => [role.id, role]));

function getRolesByEdition(edition: Record<string, unknown> = (editionJSON as Record<string, unknown>[])[0]): Map<string, Role> {
  if (edition.id === "all") {
    return new Map(
      (rolesJSON as Role[])
        .sort((a, b) => String(b.team || "").localeCompare(String(a.team || "")))
        .map((role) => [role.id, role]),
    );
  }
  return new Map(
    (rolesJSON as Role[])
      .filter(
        (role) =>
          role.edition === edition.id ||
          ((edition.roles as string[] | undefined) || []).includes(role.id),
      )
      .sort((a, b) => String(b.team || "").localeCompare(String(a.team || "")))
      .map((role) => [role.id, role]),
  );
}

function getTravelersNotInEdition(
  edition: Record<string, unknown> = (editionJSON as Record<string, unknown>[])[0],
): Map<string, Role> {
  return new Map(
    (rolesJSON as Role[])
      .filter(
        (role) =>
          role.team === "traveler" &&
          role.edition !== edition.id &&
          !((edition.roles as string[] | undefined) || []).includes(role.id),
      )
      .map((role) => [role.id, role]),
  );
}

function createJinxes(): Map<string, Map<string, string>> {
  try {
    return new Map(
      (jinxesJSON as Array<{ id: string; hatred: Array<{ id: string; reason: string }> }>).map(
        ({ id, hatred }) => [clean(id), new Map(hatred.map((entry) => [clean(entry.id), entry.reason]))],
      ),
    );
  } catch (e) {
    console.error("couldn't load jinxes", e);
    return new Map();
  }
}

function createState(): AppState {
  return {
    version: "3.2.3",
    latestVersion: "",
    lastVersion: "",
    grimoire: {
      isNight: false,
      isNightOrder: true,
      isPublic: false,
      isMenuOpen: false,
      isForwardEvilInfo: false,
      zoom: 0,
      audioThreshold: 150,
      ...readSettings(DISPLAY_SETTINGS_KEY, displayDefaults),
    },
    modals: {
      version: false,
      edition: false,
      fabled: false,
      gameState: false,
      nightOrder: false,
      reminder: false,
      role: false,
      roles: false,
      voteHistory: false,
      settings: false,
      input: false,
      groupChat: false,
      voice: false,
      voiceRoom: false,
      roomInfo: false,
    },
    edition: editionJSONbyId.get("tb") || {},
    selectedEditions: {
      tb: true,
      bmr: true,
      snv: true,
      exp: true,
      hdcs: true,
      syyl: true,
    },
    roles: getRolesByEdition(),
    otherTravelers: getTravelersNotInEdition(),
    fabled: new Map((fabledJSON as FabledRole[]).map((role) => [role.id, role])),
    jinxes: createJinxes(),
    states: [],
    teamsNames: {
      townsfolk: "镇民",
      outsider: "外来者",
      minion: "爪牙",
      demon: "恶魔",
    },
    firstNight: [],
    otherNight: [],
  };
}

function getTypedModalName(name: string, modals: ModalsState): string | null {
  if (!Object.prototype.hasOwnProperty.call(modals, name)) {
    return null;
  }
  return name;
}

export const useAppStore = defineStore("app", {
  state: createState,
  getters: {
    customRolesStripped(state): Array<Record<string, unknown>> {
      const customRoles: Array<Record<string, unknown>> = [];
      const customKeys = Object.keys(customRole);
      const strippedProps = ["firstNightReminder", "otherNightReminder", "isCustom"];
      state.roles.forEach((role) => {
        if (!role.isCustom) {
          customRoles.push({ id: role.id });
          return;
        }
        const strippedRole: Record<string, unknown> = {};
        for (const prop in role) {
          if (strippedProps.includes(prop)) continue;
          const value = (role as Record<string, unknown>)[prop];
          if (customKeys.includes(prop) && value !== (customRole as Record<string, unknown>)[prop]) {
            strippedRole[customKeys.indexOf(prop)] = value;
          }
        }
        customRoles.push(strippedRole);
      });
      return customRoles;
    },
    rolesJSONbyId(): Map<string, Role> {
      return rolesJSONbyId;
    },
  },
  actions: {
    hydrateFromVuex(nextState: Partial<AppState>): void {
      if (nextState.grimoire) this.grimoire = { ...this.grimoire, ...nextState.grimoire };
      // Merge persisted modal state with the current defaults so a client
      // upgraded from an older build can still open newly added surfaces.
      if (nextState.modals) this.modals = { ...this.modals, ...nextState.modals };
      if (nextState.edition) this.edition = nextState.edition;
      if (nextState.selectedEditions) this.selectedEditions = nextState.selectedEditions;
      if (nextState.roles) this.roles = nextState.roles;
      if (nextState.otherTravelers) this.otherTravelers = nextState.otherTravelers;
      if (nextState.fabled) this.fabled = nextState.fabled;
      if (nextState.jinxes) this.jinxes = nextState.jinxes;
      if (nextState.states) this.states = nextState.states;
      if (nextState.teamsNames) this.teamsNames = nextState.teamsNames;
      if (nextState.firstNight) this.firstNight = nextState.firstNight;
      if (nextState.otherNight) this.otherNight = nextState.otherNight;
      if (typeof nextState.latestVersion === "string") this.latestVersion = nextState.latestVersion;
      if (typeof nextState.lastVersion === "string") this.lastVersion = nextState.lastVersion;
      if (typeof nextState.version === "string") this.version = nextState.version;
    },
    setZoom(val: number): void {
      this.grimoire.zoom = val;
    },
    setLatestVersion(val: string): void {
      this.latestVersion = val;
    },
    setLastVersion(val: string): void {
      this.lastVersion = val;
    },
    setBackground(val: string | null): void {
      this.grimoire.background = val;
    },
    setAudioThreshold(val: number): void {
      this.grimoire.audioThreshold = val;
    },
    toggleMuted(val?: boolean): void {
      this.grimoire.isMuted = typeof val === "boolean" ? val : !this.grimoire.isMuted;
    },
    toggleMenu(val?: boolean): void {
      this.grimoire.isMenuOpen = typeof val === "boolean" ? val : !this.grimoire.isMenuOpen;
    },
    toggleNightOrder(val?: boolean): void {
      this.grimoire.isNightOrder = typeof val === "boolean" ? val : !this.grimoire.isNightOrder;
    },
    toggleStatic(val?: boolean): void {
      this.grimoire.isStatic = typeof val === "boolean" ? val : !this.grimoire.isStatic;
    },
    toggleNight(val?: boolean): void {
      this.grimoire.isNight = typeof val === "boolean" ? val : !this.grimoire.isNight;
    },
    toggleGrimoire(val?: boolean): void {
      this.grimoire.isPublic = typeof val === "boolean" ? val : !this.grimoire.isPublic;
    },
    toggleImageOptIn(val?: boolean): void {
      this.grimoire.isImageOptIn = typeof val === "boolean" ? val : !this.grimoire.isImageOptIn;
    },
    toggleForwardEvilInfo(val?: boolean): void {
      this.grimoire.isForwardEvilInfo =
        typeof val === "boolean" ? val : !this.grimoire.isForwardEvilInfo;
    },
    toggleModal(name?: string): void {
      const sessionStore = useSessionStore();
      if (this.modals.input) {
        sessionStore.setTyping(false);
      }

      if (!name) return;
      const modalName = getTypedModalName(name, this.modals);
      if (!modalName) return;

      const newModals: ModalsState = { ...this.modals };
      newModals[modalName] = !this.modals[modalName];

      // 输入、确认与提示框属于当前操作的第二层反馈，不应把设置、
      // 剧本等来源弹窗一并关闭。关闭输入层后，用户可以继续原流程。
      if (modalName === "input") {
        this.modals = newModals;
        return;
      }

      Object.keys(newModals).forEach((modal) => {
        if (modal !== modalName) {
          newModals[modal] = false;
        }
      });
      this.modals = newModals;
    },
    closeAllModals(): void {
      this.modals = Object.fromEntries(
        Object.keys(this.modals).map((modal) => [modal, false]),
      ) as ModalsState;
    },
    setSelectedEditions(selectedEditions: Record<string, boolean>): void {
      this.selectedEditions = { ...selectedEditions };
      if (this.edition.id === "all") {
        this.setEdition(this.edition);
      }
    },
    setStates(states: unknown[]): void {
      this.states = states;
    },
    setTeamsNames(names: Record<string, string>): void {
      this.teamsNames = names;
    },
    setFirstNight(firstNight: unknown[]): void {
      this.firstNight = firstNight;
      const playersStore = usePlayersStore();
      playersStore.setFirstNight(firstNight as string[]);
    },
    setOtherNight(otherNight: unknown[]): void {
      this.otherNight = otherNight;
      const playersStore = usePlayersStore();
      playersStore.setOtherNight(otherNight as string[]);
    },
    setEdition(edition: Record<string, unknown>): void {
      if (editionJSONbyId.has(String(edition.id))) {
        this.edition = editionJSONbyId.get(String(edition.id)) || edition;
        this.roles = getRolesByEdition(this.edition);

        if (this.edition.id === "all") {
          this.roles = new Map(
            Array.from(this.roles.entries()).filter(([, role]) => {
              return this.selectedEditions[String(role.edition)] === true;
            }),
          );
        }

        this.otherTravelers = getTravelersNotInEdition(this.edition);
        const sessionStore = useSessionStore();
        const playersStore = usePlayersStore();
        const fabled = Array.from(this.fabled.values()).filter((role) => role.edition === edition.id);
        if (!sessionStore.isSpectator) {
          playersStore.setFabled({ fabled });
        }
      } else {
        this.edition = edition;
      }

      const sessionStore = useSessionStore();
      if (this.roles.get("professor")) {
        const role = this.roles.get("professor");
        if (role) {
          role.otherNight = sessionStore.isUseOldOrder.professor ? 79 : 96;
        }
      }
      if (this.roles.get("pithag")) {
        const role = this.roles.get("pithag");
        if (role) {
          role.otherNight = sessionStore.isUseOldOrder.pithag ? 37 : 16;
        }
      }

      this.modals.edition = false;
    },
    setCustomRoles(roles: Array<Record<string, unknown>>): void {
      const sessionStore = useSessionStore();
      const oldRoles = Object.keys(sessionStore.isUseOldRole).filter(
        (key) => sessionStore.isUseOldRole[key] === true,
      );
      const normalized = roles
        .map((role) => {
          const roleId = String(role.id || "");
          return oldRoles.includes(roleId) ? { ...role, id: `${roleId}old1` } : role;
        })
        .map((role) => {
          const copied = { ...role };
          if ((copied as Record<string, unknown>)[0]) {
            const customKeys = Object.keys(customRole);
            const mappedRole: Record<string, unknown> = {};
            Object.keys(copied).forEach((prop) => {
              const key = customKeys[Number(prop)];
              if (key) {
                mappedRole[key] = (copied as Record<string, unknown>)[prop];
              }
            });
            return mappedRole;
          }
          return copied;
        })
        .map((role) => ({ ...role, id: clean(String(role.id || "")) }))
        .map((role) => {
          const roleId = String(role.id || "");
          return rolesJSONbyId.get(roleId) || this.roles.get(roleId) || { ...customRole, ...role };
        })
        .map((role) => {
          if (rolesJSONbyId.get(role.id)) return role;
          const copied = { ...role };
          (copied as Record<string, unknown>).imageAlt =
            {
              townsfolk: "good",
              outsider: "outsider",
              minion: "minion",
              demon: "evil",
              fabled: /^bootlegger\d+$/.test(copied.id || "") ? "bootlegger" : "fabled",
              loric: /^bootlegger\d+$/.test(copied.id || "") ? "bootlegger" : "loric",
            }[(copied.team as string) || ""] || "custom";
          copied.firstNight = Math.abs(Number(copied.firstNight || 0));
          copied.otherNight = Math.abs(Number(copied.otherNight || 0));
          return copied;
        })
        .filter((role) => Boolean(role.name && role.ability && role.team))
        .sort((a, b) => String(b.team || "").localeCompare(String(a.team || "")));

      this.roles = new Map(
        normalized
          .filter((role) => role.team !== "fabled" && role.team !== "loric")
          .map((role) => {
            if (role.team === "traveller") {
              role.team = "traveler";
            }
            return role;
          })
          .map((role) => [role.id, role]),
      );

      const customFabledEntries: Array<[string, FabledRole]> = normalized
        .filter((role) => role.team === "fabled" || role.team === "loric")
        .map((role) => [role.id, role as FabledRole]);
      const builtinFabledEntries: Array<[string, FabledRole]> = (fabledJSON as FabledRole[]).map((role) => [
        role.id,
        role,
      ]);
      this.fabled = new Map<string, FabledRole>([
        ...customFabledEntries,
        ...builtinFabledEntries,
      ]);

      this.otherTravelers = new Map(
        (rolesJSON as Role[])
          .filter(
            (role) => role.team === "traveler" && !roles.some((item) => String(item.id) === role.id),
          )
          .map((role) => [role.id, role]),
      );
    },
  },
});

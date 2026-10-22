import { defineStore } from "pinia";
import type { Player, Role } from "../types/domain";
import type { PlayersState } from "../types/store";
import { useSessionStore } from "./session";
import { resolveProfileAvatar } from "../utils/profileAvatars";

const NEW_PLAYER: Player = {
  name: "",
  id: "",
  image: "",
  role: { id: "" },
  isAllowRole: true,
  isWraith: false,
  isUsingWraith: false,
  reminders: [],
  stReminders: [],
  isVoteless: false,
  isSecretVoteless: false,
  isDead: false,
  votes: 1,
  pronouns: "",
  newMessages: 0,
  chatGroup: "",
  isTalking: false,
};

function createState(): PlayersState {
  return {
    players: [],
    fabled: [],
    bluffs: [],
    firstNightOrder: [],
    otherNightOrder: [],
  };
}

export const usePlayersStore = defineStore("players", {
  state: createState,
  getters: {
    alive(state): number {
      return state.players.filter((player) => !player.isDead).length;
    },
    nonTravelers(state): number {
      const nonTravelers = state.players.filter(
        (player) => player.role?.team !== "traveler",
      );
      return Math.min(nonTravelers.length, 15);
    },
    nightOrder(state): Map<unknown, { first: number; other: number }> {
      const firstNight = [0];
      const otherNight = [0];
      const firstNightRoles = state.players
        .map((player) => player.role)
        .filter((role) => (role.firstNight || 0) > 0)
        .map((role) => role.id);
      const customFirstNight = firstNightRoles.every((role) =>
        state.firstNightOrder.includes(role),
      );
      const otherNightRoles = state.players
        .map((player) => player.role)
        .filter((role) => (role.otherNight || 0) > 0)
        .map((role) => role.id);
      const customOtherNight = otherNightRoles.every((role) =>
        state.otherNightOrder.includes(role),
      );

      state.players.forEach(({ role }) => {
        if (
          customFirstNight &&
          state.firstNightOrder.indexOf(role.id) > -1 &&
          role.firstNight
        ) {
          firstNight.push(state.firstNightOrder.indexOf(role.id));
        } else if (role.firstNight && !firstNight.includes(role.firstNight)) {
          firstNight.push(role.firstNight);
        }

        if (
          customOtherNight &&
          state.otherNightOrder.indexOf(role.id) > -1 &&
          role.otherNight
        ) {
          otherNight.push(state.otherNightOrder.indexOf(role.id));
        } else if (role.otherNight && !otherNight.includes(role.otherNight)) {
          otherNight.push(role.otherNight);
        }
      });

      state.fabled.forEach((role) => {
        if (
          customFirstNight &&
          state.firstNightOrder.indexOf(role.id) > -1 &&
          role.firstNight
        ) {
          firstNight.push(state.firstNightOrder.indexOf(role.id));
        } else if (role.firstNight && !firstNight.includes(role.firstNight)) {
          firstNight.push(role.firstNight);
        }

        if (
          customOtherNight &&
          state.otherNightOrder.indexOf(role.id) > -1 &&
          role.otherNight
        ) {
          otherNight.push(state.otherNightOrder.indexOf(role.id));
        } else if (role.otherNight && !otherNight.includes(role.otherNight)) {
          otherNight.push(role.otherNight);
        }
      });

      firstNight.sort((a, b) => a - b);
      otherNight.sort((a, b) => a - b);

      const nightOrder = new Map<unknown, { first: number; other: number }>();
      state.players.forEach((player) => {
        const first = Math.max(
          customFirstNight
            ? firstNight.indexOf(state.firstNightOrder.indexOf(player.role.id))
            : firstNight.indexOf(player.role.firstNight || 0),
          0,
        );
        const other = Math.max(
          customOtherNight
            ? otherNight.indexOf(state.otherNightOrder.indexOf(player.role.id))
            : otherNight.indexOf(player.role.otherNight || 0),
          0,
        );
        nightOrder.set(player, { first, other });
      });

      state.fabled.forEach((role) => {
        const first = Math.max(
          customFirstNight
            ? firstNight.indexOf(state.firstNightOrder.indexOf(role.id))
            : firstNight.indexOf(role.firstNight || 0),
          0,
        );
        const other = Math.max(
          customOtherNight
            ? otherNight.indexOf(state.otherNightOrder.indexOf(role.id))
            : otherNight.indexOf(role.otherNight || 0),
          0,
        );
        nightOrder.set(role, { first, other });
      });

      return nightOrder;
    },
  },
  actions: {
    hydrateFromVuex(nextState: Partial<PlayersState>): void {
      this.players = nextState.players || [];
      this.fabled = nextState.fabled || [];
      this.bluffs = nextState.bluffs || [];
      this.firstNightOrder = nextState.firstNightOrder || [];
      this.otherNightOrder = nextState.otherNightOrder || [];
    },
    set(players: Player[] = []): void {
      this.players = players;
    },
    add(payload: string | Partial<Player>): void {
      const name = typeof payload === "string" ? payload : payload.name || "";
      const partial = typeof payload === "string" ? {} : payload;
      this.players.push({ ...NEW_PLAYER, ...partial, name });
      if (this.fabled.length === 0) {
        this.setFabled({ fabled: [] });
      }
    },
    clear(emptyFabled = false): void {
      if (this.players.length <= 1) return;
      this.players = [];
      this.bluffs = [];
      this.setFabled({ fabled: [], emptyFabled });
    },
    update(payload: { player: Player; property: string; value: unknown }): void {
      const { player, property, value } = payload;
      const index = this.players.indexOf(player);
      if (index >= 0) {
        (this.players[index] as Record<string, unknown>)[property] = value;
      }
      const sessionStore = useSessionStore();
      if (player.id === sessionStore.playerId) {
        this.selfUpdate(payload);
      }
    },
    selfUpdate(payload: { player: Player; property: string; value: unknown }): void {
      const { player, property, value } = payload;
      const sessionStore = useSessionStore();
      if (property === "id") {
        sessionStore.setPlayerVotes(player.votes || 0);
      }
      if (property === "votes") {
        sessionStore.setPlayerVotes(Number(value || 0));
      }
    },
    remove(index: number): void {
      this.players.splice(index, 1);
    },
    empty(payload: { player: Player }): void {
      this.update({ player: payload.player, property: "id", value: "" });
      this.update({ player: payload.player, property: "name", value: "" });
      this.update({ player: payload.player, property: "image", value: "" });
      this.update({ player: payload.player, property: "isWraith", value: false });
      this.update({ player: payload.player, property: "isUsingWraith", value: false });
    },
    swap(payload: [number, number]): void {
      const [from, to] = payload;
      [this.players[from], this.players[to]] = [this.players[to], this.players[from]];
      this.players.splice(0, 0);
    },
    move(payload: [number, number]): void {
      const [from, to] = payload;
      this.players.splice(to, 0, this.players.splice(from, 1)[0]);
    },
    setBluff(payload: { index?: number; role?: Role } = {}): void {
      if (payload.index !== undefined && payload.role) {
        this.bluffs.splice(payload.index, 1, payload.role);
      } else {
        this.bluffs = [];
      }
    },
    updateBluff(bluffs: Role[]): void {
      this.bluffs = bluffs;
    },
    setFabled(payload: {
      index?: number;
      fabled?: Array<{ id: string; [key: string]: unknown }> | { id: string; [key: string]: unknown };
      emptyFabled?: boolean;
      stImage?: string;
      stName?: string;
    }): void {
      const { index, fabled, emptyFabled, stImage, stName } = payload;
      const sessionStore = useSessionStore();
      let storytellerImage = stImage;
      let storytellerName = stName;
      if (!storytellerImage) {
        storytellerImage =
          sessionStore.playerAvatar === "default.webp"
            ? "default_storyteller.webp"
            : sessionStore.playerAvatar;
      }
      if (!storytellerName) {
        storytellerName = sessionStore.playerName;
      }

      if (index !== undefined) {
        if (index === 0) return;
        if (this.fabled[index]?.id === "bootlegger") {
          (this.fabled[index] as Record<string, unknown>).ability =
            "这个剧本包含有自制角色或自制规则。";
        }
        this.fabled.splice(index, 1);
        return;
      }

      if (!fabled) return;

      const storyteller = {
        id: "storyteller",
        image: resolveProfileAvatar(storytellerImage),
        firstNightReminder: "",
        otherNightReminder: "",
        reminders: [],
        setup: false,
        name: storytellerName,
        team: "fabled",
        ability: "点击和说书人私聊。",
      };

      if (Array.isArray(fabled)) {
        const next = [...fabled];
        if (
          !emptyFabled &&
          ((next.length > 0 && next[0].id !== "storyteller") || next.length === 0)
        ) {
          next.unshift(storyteller);
        }
        this.fabled = next;
        return;
      }

      this.fabled.push(fabled);
    },
    setFirstNight(firstNight: string[]): void {
      this.firstNightOrder = firstNight;
    },
    setOtherNight(otherNight: string[]): void {
      this.otherNightOrder = otherNight;
    },
    setPlayerMessage(payload: { playerId: string; num: number }): void {
      const playerIndex = this.players.findIndex((player) => player.id === payload.playerId);
      if (playerIndex < 0) return;
      if (payload.num > 0) {
        this.players[playerIndex].newMessages += payload.num;
      } else {
        this.players[playerIndex].newMessages = payload.num;
      }
    },
    setIsTalking(payload: { seatNum: number; isTalking: boolean }): void {
      if (payload.seatNum >= this.players.length) return;
      const player = this.players[payload.seatNum];
      const sessionStore = useSessionStore();
      if (!player.id || player.id !== sessionStore.playerId) return;
      player.isTalking = payload.isTalking;
    },
    randomize(): void {
      this.players = this.players
        .map((player) => [Math.random(), player] as const)
        .sort((a, b) => a[0] - b[0])
        .map((entry) => entry[1]);
    },
    clearRoles(): void {
      const sessionStore = useSessionStore();
      if (sessionStore.isSpectator) {
        this.players = this.players.map((player) => {
          const nextPlayer = { ...player };
          if (nextPlayer.role?.team !== "traveler") {
            nextPlayer.role = { id: "" };
          }
          nextPlayer.reminders = [];
          return nextPlayer;
        });
      } else {
        this.players = this.players.map(({ name, id, pronouns, image, chatGroup }) => ({
          ...NEW_PLAYER,
          name,
          id,
          pronouns,
          image,
          chatGroup,
        }));
        this.setFabled({ fabled: [] });
      }
      this.setBluff();
    },
    realivePlayers(): void {
      this.players.forEach((player) => {
        this.update({ player, property: "isDead", value: false });
      });
    },
    reset(): void {
      this.$reset();
    },
  },
});

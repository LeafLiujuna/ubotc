<template>
  <Modal
    class="game-state"
    v-if="modals.gameState"
    @close="toggleModal('gameState')"
  >
    <h3>当前游戏状态</h3>
    <textarea
      :value="gamestate"
      @input.stop="input = $event.target.value"
      @click="$event.target.select()"
      @keyup.stop=""
    ></textarea>
    <div class="button-group">
      <div class="button townsfolk" @click="copy">
        <font-awesome-icon icon="copy" /> 复制JSON
      </div>
      <div class="button demon" @click="loadGrimoire">
        <font-awesome-icon icon="cog" /> 加载魔典
      </div>
      <div class="button" @click="loadState" v-if="!session.isSpectator">
        <font-awesome-icon icon="cog" /> 加载状态（不推荐）
      </div>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import Modal from "./Modal";
const appStore = useAppStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();

const { modals, edition } = storeToRefs(appStore);
const session = sessionStore.$state;
const input = ref("");

const gamestate = computed(() => {
  return JSON.stringify({
    bluffs: playersStore.bluffs.map(({ id }) => id),
    edition: edition.value.isOfficial ? { id: edition.value.id } : edition.value,
    roles: edition.value.isOfficial ? "" : appStore.customRolesStripped,
    fabled: playersStore.fabled.map((item) => (item.isCustom ? item : { id: item.id })),
    players: playersStore.players.map((player) => ({
      ...player,
      role: player.role.id || {},
    })),
  });
});

async function showInputModal({ inputType, inputModal, inputData }) {
  return new Promise((resolve, reject) => {
    sessionStore.setInputResolver(resolve);
    sessionStore.setInputRejecter(reject);
    sessionStore.setInputType(inputType);
    sessionStore.setInputModal(inputModal);
    sessionStore.setInputData(inputData);
    appStore.toggleModal("input");
  });
}

function copy() {
  navigator.clipboard.writeText(input.value || gamestate.value);
}

async function loadGrimoire() {
  try {
    const data = JSON.parse(input.value || gamestate.value);
    const { bluffs = [], edition: nextEdition, roles, fabled, players } = data;

    if (roles && !session.isSpectator) {
      appStore.setCustomRoles(roles);
    }
    if (nextEdition && !session.isSpectator) {
      appStore.setEdition(nextEdition);
      const names = {
        townsfolk: nextEdition.townsfolksName ? nextEdition.townsfolksName : "镇民",
        outsider: nextEdition.outsidersName ? nextEdition.outsidersName : "外来者",
        minion: nextEdition.minionsName ? nextEdition.minionsName : "爪牙",
        demon: nextEdition.demonsName ? nextEdition.demonsName : "恶魔",
      };
      appStore.setTeamsNames(names);
    }

    if (bluffs.length) {
      bluffs.forEach((roleId, index) => {
        playersStore.setBluff({
          index,
          role: appStore.roles.get(roleId) || {},
        });
      });
    }

    if (fabled && !session.isSpectator) {
      const fabledNoSt = fabled.filter((role) => role.id !== "storyteller");
      playersStore.setFabled({
        fabled: fabledNoSt.map(
          (item) => appStore.fabled.get(item) || appStore.fabled.get(item.id) || item,
        ),
      });
    }

    if (players && players.length > 0) {
      const mappedPlayers = playersStore.players;
      for (let i = 0; i < players.length; i += 1) {
        if (i >= mappedPlayers.length) {
          if (!session.isSpectator) {
            playersStore.add("");
          } else {
            break;
          }
        }
        const player = players[i];
        const role = appStore.roles.get(player.role) || {};
        const mappedPlayer = mappedPlayers[i];
        if ((role.team !== "traveler" && mappedPlayer.role.team !== "traveler") || !session.isSpectator) {
          playersStore.update({ player: mappedPlayer, property: "role", value: role });
          playersStore.update({
            player: mappedPlayer,
            property: "reminders",
            value: player.reminders,
          });
        }
      }
    }

    appStore.toggleModal("gameState");
  } catch (e) {
    await showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: ["无法加载JSON：" + e],
      },
    }).catch(() => null);
  }
}

async function loadState() {
  if (session.isSpectator) return;
  const prompt = await showInputModal({
    inputType: "confirm",
    inputModal: "confirm",
    inputData: {
      name: ["确定要加载所有状态吗？（包括玩家、头像等）"],
    },
  }).catch(() => null);
  if (prompt === null || !prompt) return;

  try {
    const data = JSON.parse(input.value || gamestate.value);
    const { bluffs = [], edition: nextEdition, roles, fabled, players } = data;

    if (roles) {
      appStore.setCustomRoles(roles);
    }
    if (nextEdition) {
      appStore.setEdition(nextEdition);
    }
    if (bluffs.length) {
      bluffs.forEach((roleId, index) => {
        playersStore.setBluff({
          index,
          role: appStore.roles.get(roleId) || {},
        });
      });
    }
    if (fabled) {
      const fabledNoSt = fabled.filter((role) => role.id !== "storyteller");
      playersStore.setFabled({
        fabled: fabledNoSt.map(
          (item) => appStore.fabled.get(item) || appStore.fabled.get(item.id) || item,
        ),
      });
    }
    if (players) {
      playersStore.set(
        players.map((player) => ({
          ...player,
          role: appStore.roles.get(player.role) || appStore.rolesJSONbyId.get(player.role) || {},
        })),
      );
    }
  } catch (e) {
    await showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: ["无法加载JSON：" + e],
      },
    }).catch(() => null);
  }
}

function toggleModal(name) {
  appStore.toggleModal(name);
}
</script>

<style lang="scss" scoped>
@use "../../vars.scss" as *;

h3 {
  margin: 0 40px;
}

textarea {
  background: transparent;
  color: white;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid rgba(255, 255, 255, 0.5);
  width: 60vw;
  height: 30vh;
  max-width: 100%;
  margin: 5px 0;
}
</style>

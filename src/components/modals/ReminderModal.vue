<template>
  <Modal
    v-if="!session.gameServerId && modals.reminder && availableReminders.length && players[playerIndex]"
    @close="toggleModal('reminder')"
  >
    <h3>选择一个提醒标记</h3>
    <ul class="reminders">
      <li
        v-for="reminder in availableReminders"
        class="reminder"
        :class="[reminder.role]"
        :key="reminder.role + ' ' + reminder.name"
        @click="addReminder(reminder)"
      >
        <RoleIcon :role="reminder" :is-image-opt-in="grimoire.isImageOptIn" />
        <span class="text">{{ reminder.name }}</span>
      </li>
    </ul>
  </Modal>
</template>

<script setup lang="js">
import Modal from "./Modal";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import { useGameStore } from "@/stores/game";
import { useGameController } from "@/controllers/GameController";
import RoleIcon from "@/components/RoleIcon.vue";

/**
 * Helper function that maps a reminder name with a role-based object that provides necessary visual data.
 * @param role The role for which the reminder should be generated
 * @return {function(*): {image: string|string[]|string|*, role: *, name: *, imageAlt: string|*}}
 */
const mapReminder =
  ({ id, image, imageAlt }) =>
  (name) => ({
    role: id,
    image,
    imageAlt,
    name,
  });

const props = defineProps({
  playerIndex: {
    type: Number,
    required: true,
  },
});

const appStore = useAppStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();
const gameStore = useGameStore();
const gameController = useGameController();

const { modals, grimoire } = storeToRefs(appStore);
const { players } = storeToRefs(playersStore);
const session = sessionStore.$state;

const availableReminders = computed(() => {
  let reminders = [];
  const playerList = playersStore.players;
  const bluffs = playersStore.bluffs;

  appStore.roles.forEach((role) => {
    if (playerList.some((p) => p.role.id === role.id)) {
      if (role.reminders && role.reminders.length) {
        reminders = [...reminders, ...role.reminders.map(mapReminder(role))];
      }
    } else if (bluffs.some((bluff) => bluff.id === role.id)) {
      if (role.reminders && role.reminders.length) {
        reminders = [...reminders, ...role.reminders.map(mapReminder(role))];
      }
    }

    if (role.remindersGlobal && role.remindersGlobal.length) {
      reminders = [...reminders, ...role.remindersGlobal.map(mapReminder(role))];
    }
  });

  playersStore.fabled.forEach((role) => {
    if (role.reminders && role.reminders.length) {
      reminders = [...reminders, ...role.reminders.map(mapReminder(role))];
    }
  });

  appStore.otherTravelers.forEach((role) => {
    if (playerList.some((p) => p.role.id === role.id)) {
      if (role.reminders && role.reminders.length) {
        reminders = [...reminders, ...role.reminders.map(mapReminder(role))];
      }
    }
  });

  reminders.push({ role: "good", name: "善良" });
  reminders.push({ role: "evil", name: "邪恶" });
  reminders.push({ role: "custom", name: "自定义" });
  return reminders;
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

async function addReminder(reminder) {
  const player = playersStore.players[props.playerIndex];
  if (!player) return;

  let value;
  let reminderName = reminder.name;
  if (reminder.role === "custom") {
    const input = await showInputModal({
      inputType: "reminder",
      inputModal: "input",
      inputData: {
        name: ["输入自定义提醒"],
        length: 1,
        placeholder: [""],
      },
    }).catch(() => null);
    if (input === null) return;

    const name = input[0];
    if (!name) return;
    reminderName = name;
    value = [...player.reminders, { role: "custom", name }];
  } else {
    value = [...player.reminders, reminder];
  }

  if (session.gameServerId && player.id) {
    if (!gameStore.currentIsDm) {
      window.$toast.warning("只有说书人可以添加提醒标记。");
      return;
    }

    const marks = player.reminders
      .map((mark) => typeof mark === "string" ? mark : mark?.name)
      .filter(Boolean);
    if (!marks.includes(reminderName)) marks.push(reminderName);

    try {
      await gameController.updatePlayer({ userId: player.id, marks });
      await gameController.refreshGameState();
      appStore.toggleModal("reminder");
    } catch (error) {
      window.$toast.error(error instanceof Error ? error.message : "添加提醒标记失败，请重试");
    }
    return;
  }

  if (reminder.role !== "custom") appStore.toggleModal("reminder");

  playersStore.update({
    player,
    property: "reminders",
    value,
  });

  const stReminders = value.filter((item) => item.role !== "custom");
  if (!session.isSpectator && reminder.role !== "custom") {
    playersStore.update({
      player,
      property: "stReminders",
      value: stReminders,
    });
  }
}

function toggleModal(name) {
  appStore.toggleModal(name);
}
</script>

<style scoped lang="scss">
ul.reminders .reminder {
  background: url("../../assets/reminder.png") center center;
  background-size: 100%;
  width: 14vh;
  height: 14vh;
  max-width: 100px;
  max-height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 1%;

  border-radius: 50%;
  border: 3px solid black;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  line-height: 100%;
  transition: transform 500ms ease;

  .icon {
    position: absolute;
    top: 0;
    width: 90%;
    height: 90%;
    background-size: 100%;
    background-position: center center;
    background-repeat: no-repeat;
  }

  .text {
    color: black;
    font-size: 65%;
    font-weight: bold;
    text-align: center;
    top: 28%;
    width: 80%;
    line-height: 1;
  }

  &:hover {
    transform: scale(1.2);
  }
}
</style>

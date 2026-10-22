<template>
  <div class="seat-selector" v-if="!session.isSpectator">
    <div class="seat-selector-header">
      <h3>座位选择</h3>
      <font-awesome-icon icon="times-circle" class="close" @click="close" />
    </div>
    <div class="seat-grid">
      <div
        v-for="(seat, index) in seats"
        :key="index"
        class="seat-item"
        :class="{
          occupied: seat.occupied,
          selected: seat.selected,
          current: seat.isCurrentPlayer,
        }"
        @click="selectSeat(index)"
      >
        <div class="seat-number">{{ index + 1 }}</div>
        <div class="seat-player" v-if="seat.occupied">
          {{ seat.playerName }}
        </div>
        <div class="seat-empty" v-else>
          <font-awesome-icon icon="chair" />
          空座位
        </div>
        <div class="seat-status" v-if="seat.occupied && seat.isTalking">
          <font-awesome-icon icon="microphone" />
        </div>
      </div>
    </div>
    <div class="seat-selector-actions">
      <button class="button townsfolk" @click="confirmSelection">
        确认选择
      </button>
      <button class="button" @click="close">取消</button>
    </div>
  </div>
</template>

<script setup lang="js">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";

const emit = defineEmits(["seat-selected", "close"]);
const selectedSeat = ref(-1);

const sessionStore = useSessionStore();
const playersStore = usePlayersStore();
const session = sessionStore.$state;
const { players } = storeToRefs(playersStore);

const seats = computed(() => {
  const nextSeats = [];
  const currentPlayerId = session.playerId;
  for (let i = 0; i < Math.max(players.value.length, 10); i += 1) {
    const player = players.value[i];
    nextSeats.push({
      index: i,
      occupied: !!player && !!player.id,
      playerName: player ? player.name : "",
      playerId: player ? player.id : null,
      isCurrentPlayer: !!player && player.id === currentPlayerId,
      selected: selectedSeat.value === i,
      isTalking: !!player && player.isTalking,
    });
  }
  return nextSeats;
});

function selectSeat(index) {
  const seat = seats.value[index];
  if (!seat.occupied || seat.isCurrentPlayer) {
    selectedSeat.value = index;
  }
}

function confirmSelection() {
  if (selectedSeat.value < 0) return;
  emit("seat-selected", selectedSeat.value);
  close();
}

function close() {
  emit("close");
}
</script>

<style lang="scss">
@use "../vars.scss" as *;

.seat-selector {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  border: 3px solid black;
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  z-index: 100;
  min-width: 400px;
  max-width: 800px;

  .seat-selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
      color: white;
      font-family: var(--ts-font-display);
      font-size: 1.5em;
    }

    .close {
      cursor: pointer;
      color: white;
      font-size: 1.2em;
      &:hover {
        color: red;
      }
    }
  }

  .seat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 10px;
    margin-bottom: 20px;

    .seat-item {
      position: relative;
      background:
        radial-gradient(
            at 0 -15%,
            rgba(255, 255, 255, 0.07) 70%,
            rgba(255, 255, 255, 0) 71%
          )
          0 0/80% 90% no-repeat content-box,
        linear-gradient(#4e4e4e, #040404) content-box,
        linear-gradient(#292929, #010101) border-box;
      border: solid 0.125em transparent;
      border-radius: 10px;
      box-shadow:
        inset 0 1px 1px #9c9c9c,
        0 0 10px #000;
      padding: 15px;
      text-align: center;
      cursor: pointer;
      transition: all 200ms;

      &:hover {
        transform: scale(1.05);
        box-shadow:
          inset 0 1px 1px #9c9c9c,
          0 0 15px rgba(255, 255, 255, 0.5);
      }

      &.occupied {
        background:
          radial-gradient(
              at 0 -15%,
              rgba(255, 255, 255, 0.07) 70%,
              rgba(255, 255, 255, 0) 71%
            )
            0 0/80% 90% no-repeat content-box,
          linear-gradient(#0031ad, rgba(5, 0, 0, 0.22)) content-box,
          linear-gradient(#292929, #001142) border-box;
        box-shadow:
          inset 0 1px 1px #002c9c,
          0 0 10px #000;
      }

      &.selected {
        background:
          radial-gradient(
              at 0 -15%,
              rgba(255, 255, 255, 0.07) 70%,
              rgba(255, 255, 255, 0) 71%
            )
            0 0/80% 90% no-repeat content-box,
          linear-gradient(#ad0000, rgba(5, 0, 0, 0.22)) content-box,
          linear-gradient(#292929, #420000) border-box;
        box-shadow:
          inset 0 1px 1px #9c0000,
          0 0 15px rgba(255, 0, 0, 0.5);
      }

      &.current {
        border-color: #ffe91f;
        box-shadow:
          inset 0 1px 1px #9c9c9c,
          0 0 20px rgba(255, 233, 31, 0.8);
      }

      .seat-number {
        font-size: 1.2em;
        font-weight: bold;
        color: white;
        margin-bottom: 5px;
        text-shadow: 1px 1px rgba(0, 0, 0, 0.5);
      }

      .seat-player {
        color: white;
        font-size: 0.8em;
        word-break: break-all;
      }

      .seat-empty {
        color: #888;
        font-size: 0.8em;

        svg {
          margin-bottom: 5px;
        }
      }

      .seat-status {
        position: absolute;
        top: 5px;
        right: 5px;
        color: #1f65ff;
        animation: pulse 1.5s infinite;
      }
    }
  }

  .seat-selector-actions {
    display: flex;
    justify-content: center;
    gap: 10px;

    .button {
      margin: 0;
    }
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}
</style>

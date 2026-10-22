<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { useVoiceController } from "@/controllers/VoiceController";
import Modal from "./Modal.vue";

defineOptions({ name: "VoiceModal" });

const appStore = useAppStore();
const { modals } = storeToRefs(appStore);
const voice = useVoiceController();

const visible = ref(false);

watch(
  () => modals.value.voice,
  (v) => {
    visible.value = !!v;
  },
);

watch(visible, (v) => {
  if (!v && modals.value.voice) {
    appStore.toggleModal("voice");
  }
});

const connectionLabel = computed(() => {
  const status = voice.connectionStatus.active || voice.connectionStatus.broadcast;
  const map: Record<string, string> = {
    idle: "未连接",
    connecting: "连接中…",
    connected: "已连接",
    reconnecting: "重连中…",
    failed: "连接失败",
  };
  return map[status] || status || "未知";
});

const isConnected = computed(
  () =>
    voice.connectionStatus.active === "connected" ||
    voice.connectionStatus.broadcast === "connected",
);

const micVolumeDisplay = computed(() => Math.round(voice.microphoneVolume));
const spkVolumeDisplay = computed(() => Math.round(voice.speakerVolume));

const speakingModeOptions = [
  { value: "push-to-talk" as const, label: "按键说话" },
  { value: "vad" as const, label: "语音激活" },
  { value: "open-mic" as const, label: "自由发言" },
];

function onMicrophoneMutedToggle() {
  voice.setMicrophoneMuted(!voice.microphoneMuted);
}

function onSpeakerMutedToggle() {
  voice.setSpeakerMuted(!voice.speakerMuted);
}

function onMicVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement;
  voice.setMicrophoneVolume(Number(target.value));
}

function onSpkVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement;
  voice.setSpeakerVolume(Number(target.value));
}

function onSpeakingModeChange(mode: "push-to-talk" | "vad" | "open-mic") {
  voice.setSpeakingMode(mode);
}

function onClose() {
  /* cleanup placeholder */
}
</script>

<template>
  <Modal v-model:visible="visible" @close="onClose">
    <div class="voice-settings">
      <h3>语音设置</h3>

      <!-- 连接状态 -->
      <div class="setting-row">
        <span class="setting-label">连接状态</span>
        <span class="setting-value" :class="{ connected: isConnected }">
          {{ connectionLabel }}
        </span>
      </div>

      <!-- 麦克风静音 -->
      <div class="setting-row">
        <span class="setting-label">麦克风</span>
        <button
          class="toggle-btn"
          :class="{ active: !voice.microphoneMuted }"
          @click="onMicrophoneMutedToggle"
        >
          {{ voice.microphoneMuted ? "已静音" : "开启" }}
        </button>
      </div>

      <!-- 扬声器静音 -->
      <div class="setting-row">
        <span class="setting-label">扬声器</span>
        <button
          class="toggle-btn"
          :class="{ active: !voice.speakerMuted }"
          @click="onSpeakerMutedToggle"
        >
          {{ voice.speakerMuted ? "已静音" : "开启" }}
        </button>
      </div>

      <!-- 麦克风音量 -->
      <div class="setting-row">
        <span class="setting-label">麦克风音量</span>
        <div class="volume-control">
          <input
            type="range"
            min="0"
            max="200"
            :value="voice.microphoneVolume"
            class="volume-slider"
            @input="onMicVolumeInput"
          />
          <span class="volume-value">{{ micVolumeDisplay }}</span>
        </div>
      </div>

      <!-- 扬声器音量 -->
      <div class="setting-row">
        <span class="setting-label">扬声器音量</span>
        <div class="volume-control">
          <input
            type="range"
            min="0"
            max="200"
            :value="voice.speakerVolume"
            class="volume-slider"
            @input="onSpkVolumeInput"
          />
          <span class="volume-value">{{ spkVolumeDisplay }}</span>
        </div>
      </div>

      <!-- 说话模式 -->
      <div class="setting-row">
        <span class="setting-label">说话模式</span>
        <div class="mode-selector">
          <button
            v-for="opt in speakingModeOptions"
            :key="opt.value"
            class="mode-btn"
            :class="{ active: voice.speakingMode === opt.value }"
            @click="onSpeakingModeChange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- PTT 控制 -->
      <div v-if="voice.speakingMode === 'push-to-talk'" class="setting-row">
        <span class="setting-label">按键说话</span>
        <div class="ptt-controls">
          <button
            class="ptt-btn"
            @mousedown="voice.pttPress()"
            @mouseup="voice.pttRelease()"
            @mouseleave="voice.pttRelease()"
            @touchstart.prevent="voice.pttPress()"
            @touchend.prevent="voice.pttRelease()"
          >
            按住说话
          </button>
        </div>
      </div>

      <!-- 权限 & 状态提示 -->
      <div class="setting-row">
        <span class="setting-label">麦克风权限</span>
        <span class="setting-value" :class="{ granted: voice.microphonePermissionGranted }">
          {{ voice.microphonePermissionGranted ? "已授权" : "未授权" }}
        </span>
      </div>

      <div v-if="!isConnected" class="status-hint">
        语音未连接，进入游戏房间后将自动连接
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
@use "../../vars.scss" as *;

.voice-settings {
  min-width: 360px;
  max-width: 440px;
  padding: 10px;

  h3 {
    margin-bottom: 16px;
    color: white;
    font-family: var(--ts-font-display);
    letter-spacing: 1px;
  }
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.setting-label {
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  flex-shrink: 0;
  margin-right: 14px;
}

.setting-value {
  color: rgba(255, 255, 255, 0.55);
  font-size: 14px;

  &.connected {
    color: #4caf50;
  }

  &.granted {
    color: #4caf50;
  }
}

.toggle-btn {
  padding: 6px 18px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.65);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.45);
  }

  &.active {
    border-color: $townsfolk;
    background: rgba($townsfolk, 0.2);
    color: $townsfolk;
  }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;

  .volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 120px;
    height: 5px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 3px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      background: $townsfolk;
      border-radius: 50%;
      cursor: pointer;
    }

    &::-moz-range-thumb {
      width: 14px;
      height: 14px;
      background: $townsfolk;
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }
  }

  .volume-value {
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
    min-width: 32px;
    text-align: right;
  }
}

.mode-selector {
  display: flex;
  gap: 6px;

  .mode-btn {
    padding: 5px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: rgba(255, 255, 255, 0.4);
    }

    &.active {
      border-color: $townsfolk;
      background: rgba($townsfolk, 0.18);
      color: $townsfolk;
    }
  }
}

.ptt-controls {
  .ptt-btn {
    padding: 10px 24px;
    border: 2px solid $townsfolk;
    border-radius: 8px;
    background: rgba($townsfolk, 0.15);
    color: $townsfolk;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s;

    &:active {
      background: rgba($townsfolk, 0.35);
      transform: scale(0.96);
    }
  }
}

.status-hint {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  text-align: center;
}
</style>

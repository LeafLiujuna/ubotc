<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useVoiceController } from "@/controllers/VoiceController";
import { checkVoicePreflight, type VoicePreflightResult } from "@/services/voice/preflight";

defineOptions({ name: "VoiceSettings" });

const voice = useVoiceController();
const pendingAction = ref("");
const message = ref("");
const microphoneVolume = ref(voice.microphoneVolume);
const speakerVolume = ref(voice.speakerVolume);
const preflight = ref<VoicePreflightResult | null>(null);

const isSupported = computed(
  () => "mediaDevices" in navigator && "RTCPeerConnection" in window,
);

onMounted(() => {
  void refreshPreflight();
});

async function refreshPreflight(): Promise<VoicePreflightResult> {
  const result = await checkVoicePreflight(voice.getLiveKitEndpoint());
  preflight.value = result;
  return result;
}

const activeConnectionLabel = computed(() => {
  const status = voice.connectionStatus.active || "idle";
  const labels: Record<string, string> = {
    idle: "尚未连接",
    connecting: "正在连接",
    connected: "已连接",
    reconnecting: "正在重连",
    disconnected: "已断开",
    failed: "连接失败",
  };
  return labels[status] || status;
});

async function runAction(name: string, action: () => void | Promise<void>) {
  pendingAction.value = name;
  message.value = "";

  try {
    await action();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "语音操作失败，请稍后重试。";
  } finally {
    pendingAction.value = "";
  }
}

function connectVoice() {
  void runAction("connect", async () => {
    await voice.connect();
    await refreshPreflight();
    message.value = "语音连接请求已发送。";
  });
}

function requestMicrophonePermission() {
  void runAction("permission", async () => {
    await voice.checkMicrophonePermission();
    message.value = voice.microphonePermissionGranted
      ? "麦克风权限已授予。"
      : "浏览器尚未授予麦克风权限，请在地址栏权限设置中开启。";
  });
}

function toggleMicrophone() {
  void runAction("microphone", () =>
    voice.setMicrophoneMuted(!voice.microphoneMuted),
  );
}

function toggleSpeaker() {
  voice.setSpeakerMuted(!voice.speakerMuted);
}

function updateMicrophoneVolume() {
  voice.setMicrophoneVolume(microphoneVolume.value);
}

function updateSpeakerVolume() {
  voice.setSpeakerVolume(speakerVolume.value);
}

function updateSpeakingMode(event: Event) {
  const target = event.target as HTMLSelectElement;
  const mode = target.value as "push-to-talk" | "vad" | "open-mic";
  voice.setSpeakingMode(mode);
}
</script>

<template>
  <section class="voice-settings" aria-labelledby="voice-settings-title">
    <header class="settings-heading">
      <div>
        <p class="settings-eyebrow">Voice Chamber</p>
        <h3 id="voice-settings-title">语音与音频</h3>
      </div>
      <span class="connection-chip" :class="voice.connectionStatus.active">
        {{ activeConnectionLabel }}
      </span>
    </header>

    <div v-if="!isSupported" class="support-warning" role="alert">
      当前浏览器不支持实时语音。请使用最新版 Chrome、Edge、Firefox 或 Safari。
    </div>

    <div v-else-if="preflight && !preflight.ok" class="support-warning" role="alert">
      {{ preflight.message }}
    </div>

    <div class="settings-grid">
      <section class="settings-card" aria-labelledby="voice-input-title">
        <div class="card-heading">
          <div>
            <h4 id="voice-input-title">麦克风</h4>
            <p>控制你的发言权限与输入音量。</p>
          </div>
          <button
            type="button"
            class="state-button"
            :class="{ active: !voice.microphoneMuted }"
            :disabled="pendingAction === 'microphone' || !isSupported"
            :aria-pressed="!voice.microphoneMuted"
            @click="toggleMicrophone"
          >
            {{ voice.microphoneMuted ? "已静音" : "正在收音" }}
          </button>
        </div>

        <label class="range-field" for="microphone-volume">
          <span>输入增益</span>
          <output for="microphone-volume">{{ microphoneVolume }}%</output>
        </label>
        <input
          id="microphone-volume"
          v-model.number="microphoneVolume"
          type="range"
          min="0"
          max="200"
          step="5"
          :disabled="!isSupported"
          @input="updateMicrophoneVolume"
        />
      </section>

      <section class="settings-card" aria-labelledby="voice-output-title">
        <div class="card-heading">
          <div>
            <h4 id="voice-output-title">扬声器</h4>
            <p>控制所有远端玩家的总播放音量。</p>
          </div>
          <button
            type="button"
            class="state-button"
            :class="{ active: !voice.speakerMuted }"
            :disabled="!isSupported"
            :aria-pressed="!voice.speakerMuted"
            @click="toggleSpeaker"
          >
            {{ voice.speakerMuted ? "已关闭" : "正在播放" }}
          </button>
        </div>

        <label class="range-field" for="speaker-volume">
          <span>播放音量</span>
          <output for="speaker-volume">{{ speakerVolume }}%</output>
        </label>
        <input
          id="speaker-volume"
          v-model.number="speakerVolume"
          type="range"
          min="0"
          max="200"
          step="5"
          :disabled="!isSupported"
          @input="updateSpeakerVolume"
        />
      </section>
    </div>

    <div class="mode-row">
      <label for="speaking-mode">
        <strong>发言方式</strong>
        <span>按住说话最安静；语音活动检测适合连续讨论。</span>
      </label>
      <select
        id="speaking-mode"
        :value="voice.speakingMode"
        :disabled="!isSupported"
        @change="updateSpeakingMode"
      >
        <option value="push-to-talk">按住说话</option>
        <option value="vad">语音活动检测</option>
        <option value="open-mic">持续开启</option>
      </select>
    </div>

    <div class="settings-actions">
      <button
        type="button"
        class="settings-button secondary"
        :disabled="pendingAction === 'permission' || !isSupported"
        @click="requestMicrophonePermission"
      >
        {{ pendingAction === "permission" ? "检查中" : "检查麦克风权限" }}
      </button>
      <button
        type="button"
        class="settings-button primary"
        :disabled="pendingAction === 'connect' || !isSupported"
        @click="connectVoice"
      >
        {{ pendingAction === "connect" ? "连接中" : "连接语音" }}
      </button>
    </div>

    <p class="settings-status" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>

<style scoped lang="scss">
.voice-settings {
  display: grid;
  gap: 22px;
  color: var(--ts-text-primary);
}

.settings-heading,
.card-heading,
.range-field,
.mode-row,
.settings-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-heading h3,
.settings-card h4 {
  margin: 0;
  text-align: left;
}

.settings-heading h3 {
  font-size: 1.35rem;
}

.settings-eyebrow {
  margin: 0 0 4px;
  color: var(--ts-accent-gold);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.connection-chip {
  padding: 6px 10px;
  color: var(--ts-text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--ts-border-subtle);
  border-radius: var(--ts-radius-pill);
  font-size: 0.75rem;
  white-space: nowrap;
}

.connection-chip.connected {
  color: var(--ts-success);
  border-color: rgba(143, 227, 176, 0.45);
}

.support-warning {
  padding: 12px 14px;
  color: var(--ts-danger);
  background: rgba(142, 47, 54, 0.16);
  border: 1px solid rgba(166, 60, 69, 0.42);
  border-radius: var(--ts-radius-sm);
  font-size: 0.875rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.settings-card,
.mode-row {
  padding: 16px;
  background: rgba(8, 6, 12, 0.34);
  border: 1px solid var(--ts-border-subtle);
  border-radius: var(--ts-radius-md);
}

.settings-card {
  display: grid;
  gap: 18px;
}

.settings-card h4 {
  font-size: 1rem;
}

.settings-card p,
.mode-row label span {
  display: block;
  margin: 4px 0 0;
  color: var(--ts-text-subtle);
  font-size: 0.78rem;
  line-height: 1.45;
}

.state-button,
.settings-button,
.mode-row select {
  min-height: 44px;
  padding: 8px 12px;
  color: var(--ts-text-primary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--ts-border-subtle);
  border-radius: var(--ts-radius-sm);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 750;
}

.state-button,
.settings-button {
  cursor: pointer;
}

.state-button.active {
  color: var(--ts-success);
  border-color: rgba(143, 227, 176, 0.45);
}

.range-field {
  color: var(--ts-text-muted);
  font-size: 0.82rem;
}

.range-field output {
  color: var(--ts-accent-gold);
  font-variant-numeric: tabular-nums;
}

input[type="range"] {
  width: 100%;
  min-height: 44px;
  accent-color: var(--ts-accent-gold);
  cursor: pointer;
}

.mode-row label {
  max-width: 48ch;
}

.mode-row select {
  min-width: 150px;
  color-scheme: dark;
}

.settings-actions {
  justify-content: flex-end;
}

.settings-button.primary {
  color: var(--ts-text-on-parchment);
  background: var(--ts-accent-gold);
  border-color: var(--ts-focus-ring);
}

.state-button:disabled,
.settings-button:disabled,
.mode-row select:disabled,
input[type="range"]:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.settings-status {
  min-height: 1.5em;
  margin: -8px 0 0;
  color: var(--ts-text-muted);
  font-size: 0.82rem;
  text-align: right;
}

@media (max-width: 720px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .mode-row,
  .settings-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .mode-row select {
    width: 100%;
  }

  .settings-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .settings-button {
    width: 100%;
  }
}

/* Voice controls use the same translucent treatment as the other panels. */
.voice-settings {
  gap: 16px;
}

.settings-heading {
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.18);
}

.settings-heading h3 {
  color: #f0d990;
  font-size: clamp(1.2rem, 2vw, 1.5rem);
  letter-spacing: 0.015em;
}

.settings-eyebrow {
  color: rgba(214, 184, 106, 0.74);
  font-size: 0.62rem;
  letter-spacing: 0.2em;
}

.connection-chip {
  padding: 5px 9px;
  color: rgba(244, 235, 221, 0.62);
  background: rgba(255, 255, 255, 0.045);
  border-color: rgba(255, 255, 255, 0.14);
  border-radius: 7px;
}

.support-warning {
  padding: 11px 13px;
  background: rgba(142, 47, 54, 0.2);
  border-color: rgba(198, 90, 99, 0.42);
  border-radius: 8px;
  font-size: 0.78rem;
}

.settings-grid {
  gap: 10px;
}

.settings-card,
.mode-row {
  padding: 15px;
  background:
    linear-gradient(135deg, rgba(214, 184, 106, 0.045), transparent 42%),
    rgba(6, 8, 15, 0.38);
  border-color: rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
}

.settings-card {
  gap: 14px;
}

.settings-card h4 {
  color: rgba(255, 250, 240, 0.92);
  font-size: 0.86rem;
}

.settings-card p,
.mode-row label span {
  color: rgba(244, 235, 221, 0.52);
  font-size: 0.72rem;
}

.state-button,
.settings-button,
.mode-row select {
  min-height: 36px;
  padding: 7px 10px;
  color: rgba(244, 235, 221, 0.84);
  background: rgba(255, 255, 255, 0.045);
  border-color: rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  font-size: 0.76rem;
}

.state-button.active {
  color: #f0d990;
  border-color: rgba(214, 184, 106, 0.42);
  background: rgba(142, 47, 54, 0.34);
}

.range-field {
  color: rgba(244, 235, 221, 0.66);
  font-size: 0.76rem;
}

.range-field output {
  color: #dfc77e;
}

input[type="range"] {
  min-height: 24px;
  accent-color: #c6565e;
}

.mode-row select {
  min-width: 170px;
  background: rgba(4, 5, 11, 0.52);
}

.settings-button.primary {
  color: #211719;
  background: linear-gradient(180deg, #e6cc80, #b18b40);
  border-color: #f0d990;
}

.settings-button.secondary {
  background: rgba(255, 255, 255, 0.055);
}

.settings-status {
  color: rgba(244, 235, 221, 0.62);
  font-size: 0.76rem;
}
</style>

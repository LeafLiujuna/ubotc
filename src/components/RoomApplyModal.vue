<script setup lang="ts">
import { computed } from "vue";
import { useGameStore } from "@/stores/game";
import type { ServerReceiveApplyMessage } from "@/types/socket";
import Modal from "@/components/modals/Modal.vue";

const props = withDefaults(defineProps<{
  apply: ServerReceiveApplyMessage;
  pending?: boolean;
  errorMessage?: string;
}>(), {
  pending: false,
  errorMessage: "",
});

const emit = defineEmits<{
  respond: [accept: boolean];
}>();

const gameStore = useGameStore();
const requesterName = computed(() => {
  if (!props.apply.fromUserId) return "房间成员";
  return gameStore.roomUsers[props.apply.fromUserId]?.displayName || "房间成员";
});

const copy = computed(() => {
  switch (props.apply.type) {
    case "dmInvitePlayer":
      return {
        title: "说书人邀请你加入游戏",
        description: "同意后会为你新增一个座位，并立即把你加入当前进行中的对局。",
        detail: `${requesterName.value} 发起了中途入座邀请。`,
        acceptLabel: "同意并加入",
      };
    case "voiceRoomInvite":
      return {
        title: "收到私聊邀请",
        description: "同意后将离开当前语音频道并进入邀请方的私密语音房间。",
        detail: `${requesterName.value} 邀请你进入私密语音房间。`,
        acceptLabel: "同意进入",
      };
    case "voiceRoomApplyJoin":
      return {
        title: "语音房间加入申请",
        description: "同意后申请人将进入你所在的私密语音房间。",
        detail: `${requesterName.value} 申请加入当前语音房间。`,
        acceptLabel: "同意加入",
      };
    default:
      return {
        title: "收到房间请求",
        description: "请确认是否同意本次房间操作。",
        detail: `${requesterName.value} 发起了 ${props.apply.type} 请求。`,
        acceptLabel: "同意",
      };
  }
});
</script>

<template>
  <Modal
    name="room-apply"
    :title="copy.title"
    :description="copy.description"
    :close-on-backdrop="!pending"
    @close="!pending && emit('respond', false)"
  >
    <article class="room-apply">
      <div class="room-apply__summary">
        <span aria-hidden="true">
          <font-awesome-icon :icon="['fas', apply.type === 'dmInvitePlayer' ? 'chair' : 'comments']" />
        </span>
        <p>{{ copy.detail }}</p>
      </div>

      <p class="room-apply__privacy">
        只有你确认后操作才会继续；拒绝不会将你移出当前房间。
      </p>

      <p v-if="errorMessage" class="room-apply__error" role="alert">
        {{ errorMessage }}
      </p>

      <footer class="room-apply__actions">
        <button
          type="button"
          class="ts-button ts-button--ghost"
          :disabled="pending"
          @click="emit('respond', false)"
        >
          拒绝
        </button>
        <button
          type="button"
          class="ts-button ts-button--primary"
          :disabled="pending"
          @click="emit('respond', true)"
        >
          {{ pending ? "正在提交…" : copy.acceptLabel }}
        </button>
      </footer>
    </article>
  </Modal>
</template>

<style scoped lang="scss">
.room-apply {
  display: grid;
  gap: 16px;
  width: min(460px, calc(100vw - 48px));
  max-width: 100%;
  color: var(--ts-text-primary, #f4ebdd);
}

.room-apply__summary {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 12px;
  align-items: center;

  > span {
    width: 52px;
    height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ts-accent-gold-hover, #e7cf86);
    background: rgba(214, 184, 106, 0.08);
    border: 1px solid rgba(214, 184, 106, 0.36);
    border-radius: 50%;
  }

  p {
    margin: 0;
    line-height: 1.55;
  }
}

.room-apply__privacy,
.room-apply__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--ts-radius-md, 10px);
  font-size: 0.8rem;
  line-height: 1.5;
}

.room-apply__privacy {
  color: var(--ts-text-muted, #c9bca7);
  background: rgba(214, 184, 106, 0.05);
}

.room-apply__error {
  color: var(--ts-danger, #ffb8b8);
  background: rgba(142, 47, 54, 0.16);
  border: 1px solid rgba(255, 184, 184, 0.28);
}

.room-apply__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  button {
    min-height: 48px;
  }
}

@media (max-width: 480px) {
  .room-apply {
    width: 100%;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '@/stores/game';
import { useRoomChatStore } from '@/stores/roomChat';
import { useSessionStore } from '@/stores/session';
import { useUserStore } from '@/stores/user';
import { nightWakeStatus } from '@/utils/nightMessages';

const props = defineProps<{ userId: string }>();
const game = useGameStore();
const chat = useRoomChatStore();
const session = useSessionStore();
const users = useUserStore();
const emit = defineEmits<{ open: [] }>();
const status = computed(() => nightWakeStatus(chat.getMessages('dm_skill', props.userId), game.levelDays, props.userId,
  chat.getNightReadIds(users.userId || game.currentPlayer?.userId || '', props.userId)));
const visible = computed(() => Boolean(session.sessionId && game.currentIsDm && game.level === 'night' && props.userId
  && status.value));
</script>

<template>
  <button v-if="visible" type="button" class="night-wake-marker" :class="{ 'is-unread': status?.unread }"
    :aria-label="status?.unread ? '玩家有新回复，查看夜间信息' : '查看本夜唤醒信息'" aria-haspopup="dialog"
    :title="status?.unread ? '玩家有新回复，点击查看' : '点击继续夜间交流'" @click.stop="emit('open')">
    <font-awesome-icon :icon="status?.icon" aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
.night-wake-marker {
  position: absolute;
  inset: 15% 12% 24%;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a362da;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 2px 1px #21182c);
  &.is-unread { color: #eebd43; }
  &:focus-visible { outline: 2px solid #f1cf75; outline-offset: 3px; border-radius: 50%; }
  svg { width: 100%; height: 100%; stroke: #eee5fa; stroke-width: 12px; paint-order: stroke; }
}
</style>

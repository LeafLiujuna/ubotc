<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameController } from '@/controllers/GameController';
import { useGameStore } from '@/stores/game';
import { SocketClientEvent } from '@/types/socket';

const game = useGameStore();
const controller = useGameController();
const pending = ref(false);
const canSend = computed(() => controller.isConnected && game.level !== 'end' && !pending.value);
async function send() {
  if (!game.currentIsDm || !canSend.value) return;
  pending.value = true;
  try {
    await controller.request(SocketClientEvent.DMSendRoles, {});
    window.$toast.success('角色已发送，玩家现在可以查看自己的身份');
  } catch (error) {
    window.$toast.error(error instanceof Error ? error.message : '发送失败，请重试');
  } finally { pending.value = false; }
}
</script>

<template>
  <button v-if="game.currentIsDm" type="button" class="send-roles" :disabled="!canSend" :aria-busy="pending"
    title="将已配置的角色发送给各自玩家" @click="send">
    <span>{{ pending ? '发送中…' : '发送角色' }}</span>
    <font-awesome-icon icon="paper-plane" aria-hidden="true" />
  </button>
</template>

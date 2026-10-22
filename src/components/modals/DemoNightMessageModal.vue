<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import NightMessageComposer from '../NightMessageComposer.vue';
import NightMessageContent from '../NightMessageContent.vue';
import { useAppStore } from '@/stores/app';
import { usePlayersStore } from '@/stores/players';
import { useDemoStore } from '@/stores/demo';
import type { MessageContent } from '@/types/message';
const props = defineProps<{ seatIndex: number }>();
defineEmits<{ close: [] }>();
const app = useAppStore(), players = usePlayersStore(), demo = useDemoStore();
const preview = ref<MessageContent[] | null>(null), picker = ref(false);
const target = computed(() => players.players[props.seatIndex]);
const roles = computed(() => [...app.roles.values()].filter(r => r.id && r.name).map(r => ({ ...r, name: r.name! })));
const candidates = computed(() => players.players.map((p, index) => ({ id: `demo-seat-${index}`, seat: index + 1, name: p.name })));
const guidance = computed(() => String((demo.levelDays <= 1 ? target.value?.role.firstNightReminder : target.value?.role.otherNightReminder) || ''));
</script>
<template>
  <Modal name="demo-night-message" :title="preview ? '说书人唤醒了你：' : `唤醒 ${seatIndex + 1} 号座位 · 演示预览`" :style="picker ? { display: 'none' } : undefined" @close="$emit('close')">
    <template v-if="preview"><p>玩家接收画面预览</p><NightMessageContent :content="preview" /><button type="button" class="preview-back" @click="preview = null">继续编辑</button></template>
    <NightMessageComposer v-else send-label="预览" :player-name="`${seatIndex + 1} 号座位`" :roles="roles" :candidates="candidates" @picker-open="picker = $event" @cancel="$emit('close')" @send="preview = $event">
      <template #guidance><p v-if="guidance" class="demo-night-guidance">{{ guidance }}</p><p>此处仅预览接收效果。</p></template>
    </NightMessageComposer>
  </Modal>
</template>
<style scoped>.demo-night-guidance { color: #eac35b; } .preview-back { display: block; margin: 20px auto 0; padding: 8px 20px; background: #62416f; color: white; border: 1px solid #b78cc4; border-radius: 4px; cursor: pointer; }</style>

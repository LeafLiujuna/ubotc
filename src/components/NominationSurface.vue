<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSessionStore } from '@/stores/session';
import { useRealtimeVoteStore } from '@/stores/realtimeVote';
import { useTableNominationStore } from '@/stores/tableNomination';
import { resolveNominationPresentation } from '@/utils/nominationPresentation';
import RoomNominationControls from './RoomNominationControls.vue';
import Vote from './Vote.vue';

const props = defineProps<{ draftActive: boolean }>();
const emit = defineEmits<{ startNomination: [] }>();
const session = useSessionStore();
const online = useRealtimeVoteStore();
const manual = useTableNominationStore();
const panel = ref<{ focus: () => void; voteForSeat: (seat: number) => void } | null>(null);
const presentation = computed(() => resolveNominationPresentation({
  isApiRoom: Boolean(session.sessionId && session.gameServerId),
  manualOpen: manual.open,
  legacyOpen: Boolean(session.nomination),
  onlineVisible: online.isVisible && online.phase !== 'idle',
  onlineActive: online.isActive,
  draftActive: props.draftActive,
}));
defineExpose({ focus: () => panel.value?.focus(), voteForSeat: (seat: number) => panel.value?.voteForSeat(seat) });
</script>

<template>
  <RoomNominationControls v-if="presentation === 'online'" ref="panel" @start-nomination="emit('startNomination')" />
  <Vote v-else-if="presentation === 'legacy'" />
</template>

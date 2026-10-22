<template><span v-if="false" /></template>

<script setup lang="ts">
import { useSeatEditorStore } from '@/stores/seatEditor'

const editor = useSeatEditorStore()
defineExpose({
  addPlayer: editor.addPlayer,
  randomizeSeatings: editor.randomizeSeatings,
  clearPlayers: editor.clearPlayers,
  clearRoles: editor.clearRoles,
})
</script>

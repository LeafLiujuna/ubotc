<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useGameStore } from "@/stores/game";
import { useUserStore } from "@/stores/user";
import { useGameController } from "@/controllers/GameController";
import { SocketClientEvent } from "@/types/socket";

const game = useGameStore();
const user = useUserStore();
const controller = useGameController();
const election = computed(() => game.dmElection);
const isApplicant = computed(() => election.value?.applicantUserId === user.userId);
const canVote = computed(() => !!user.userId && !isApplicant.value && !game.currentIsDm
  && !game.roomUsers[user.userId]?.isDM && !election.value?.hasVoted);
const canCancel = computed(() => isApplicant.value || game.roomUsers[user.userId ?? ""]?.isRoomOwner || game.roomUsers[user.userId ?? ""]?.isAdmin);
const name = computed(() => game.roomUsers[election.value?.applicantUserId ?? ""]?.displayName || "房间成员");
const pending = ref(false);
const error = ref("");
watch(() => election.value?.electionId ?? election.value?.applicantUserId, () => { error.value = ""; });

async function respond(cancel = false): Promise<void> {
  const current = election.value;
  if (!current || pending.value || (cancel ? !canCancel.value : !canVote.value)) return;
  pending.value = true;
  error.value = "";
  try {
    if (cancel) await controller.request(SocketClientEvent.CancelApplyDM);
    else await controller.request(SocketClientEvent.VoteDM, {
      accept: true, applicantUserId: current.applicantUserId, electionId: current.electionId,
    });
    await controller.refreshGameState();
  } catch (cause) {
    if (game.dmElection === current) error.value = cause instanceof Error ? cause.message : "提交失败，请重试";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <section v-if="election" class="storyteller-election" aria-label="说书人申请" :aria-busy="pending">
      <h2>申请成为说书人</h2>
      <p>{{ isApplicant ? '你已提交申请，等待其他成员同意。' : `${name} 申请成为说书人。` }}</p>
      <p class="storyteller-election__progress" role="status">
        已获 {{ election.voteCount }} / {{ election.requiredVoteCount }} 票同意
      </p>
      <p v-if="isApplicant">需要其他成员确认，你不能为自己投票。</p>
      <p v-else-if="election.hasVoted">你已同意，正在等待申请结果。</p>
      <p v-else-if="canVote">同意达到所需票数后通过；不操作不会计入同意票。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="storyteller-election__actions">
        <button v-if="canVote" class="ts-button ts-button--primary" :disabled="pending" @click="respond()">
          {{ pending ? '正在提交…' : '同意成为说书人' }}
        </button>
        <button v-if="canCancel" class="ts-button ts-button--ghost" :disabled="pending" @click="respond(true)">
          取消申请
        </button>
      </div>
    </section>
  </Teleport>
</template>

<style scoped lang="scss">
.storyteller-election {
  position: fixed;
  z-index: 200;
  top: 92px;
  right: 20px;
  width: min(330px, calc(100vw - 40px));
  box-sizing: border-box;
  padding: 18px;
  border: 1px solid var(--ts-accent-gold, #d6b86a);
  border-radius: 14px;
  background: var(--ts-surface, #211e2a);
  color: var(--ts-text-primary, #f4ebdd);
  box-shadow: 0 8px 30px #0006;
  h2 { margin: 0 0 12px; font-size: 1rem; }
  p { margin: 8px 0; font-size: 0.85rem; line-height: 1.6; }
  [role="alert"] { color: var(--ts-danger, #ffb8b8); }
  &__progress { color: var(--ts-accent-gold, #d6b86a); }
  &__actions { display: grid; gap: 8px; margin-top: 12px; }
  button { min-height: 44px; }
}
</style>

<template>
  <Modal
    name="vote-history"
    class="vote-history"
    title="投票记录"
    description="回顾每次提名、票数与参与玩家；选中记录后可批量清除。"
    v-if="modals.voteHistory && (session.voteHistory || !session.isSpectator)"
    @close="toggleModal('voteHistory')"
  >
    <div
      class="vote-history-toolbar"
      :class="{ 'vote-history-toolbar--spectator': session.isSpectator }"
    >
      <button
        v-if="!session.isSpectator"
        type="button"
        class="toolbar-button toolbar-button--visibility"
        :class="{ active: session.isVoteHistoryAllowed }"
        :aria-pressed="session.isVoteHistoryAllowed"
        @click="setRecordVoteHistory"
      >
        <font-awesome-icon
          :icon="[
            'fas',
            session.isVoteHistoryAllowed ? 'check-square' : 'square',
          ]"
          aria-hidden="true"
        />
        <span>
          <strong>玩家可查看</strong>
          <small>{{
            session.isVoteHistoryAllowed ? '已开启' : '已关闭'
          }}</small>
        </span>
      </button>

      <div class="vote-history-toolbar__summary" aria-live="polite">
        <span>{{ session.voteHistory.length }} 条记录</span>
        <span v-if="selectedVoteCount">已选择 {{ selectedVoteCount }} 条</span>
      </div>

      <button
        type="button"
        class="toolbar-button toolbar-button--danger"
        :disabled="!hasVoteHistory"
        @click="clearVoteHistory"
      >
        <font-awesome-icon icon="trash-alt" aria-hidden="true" />
        <span>{{ clearActionLabel }}</span>
      </button>
    </div>

    <template v-if="hasVoteHistory">
      <div class="vote-table-shell">
        <table>
          <caption class="sr-only">
            投票历史记录
          </caption>
          <thead>
            <tr>
              <th scope="col" class="selection-column">
                <button
                  type="button"
                  class="selection-button"
                  :class="{ selected: allVotesSelected }"
                  :aria-pressed="allVotesSelected"
                  aria-label="选择或取消选择全部投票记录"
                  :disabled="!hasVoteHistory"
                  @click="setVoteSelected(-1)"
                >
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      allVotesSelected ? 'check-square' : 'square',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </th>
              <th scope="col">时间</th>
              <th scope="col">提名者</th>
              <th scope="col">被提名者</th>
              <th scope="col">类型</th>
              <th scope="col">模式</th>
              <th scope="col">票数</th>
              <th scope="col">通过票数</th>
              <th scope="col">
                <font-awesome-icon icon="user-friends" aria-hidden="true" />
                投票人
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(vote, index) in session.voteHistory"
              :key="index"
              :class="{ selected: session.voteSelected[index] }"
            >
              <td class="selection-column">
                <button
                  type="button"
                  class="selection-button"
                  :class="{ selected: session.voteSelected[index] }"
                  :aria-pressed="Boolean(session.voteSelected[index])"
                  :aria-label="`${session.voteSelected[index] ? '取消选择' : '选择'}第 ${index + 1} 条投票记录`"
                  @click="setVoteSelected(index)"
                >
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      session.voteSelected[index] ? 'check-square' : 'square',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </td>
              <td class="vote-time">{{ formatVoteTime(vote.timestamp) }}</td>
              <td class="nominator">{{ vote.nominator }}</td>
              <td class="nominee">{{ vote.nominee }}</td>
              <td>{{ vote.type }}</td>
              <td>{{ vote.mode }}</td>
              <td class="numeric-cell">
                {{ vote.votes }}
                <font-awesome-icon icon="hand-paper" aria-hidden="true" />
              </td>
              <td class="numeric-cell">
                {{ vote.majority }}
                <span
                  class="outcome-mark"
                  :class="vote.votes >= vote.majority ? 'passed' : 'failed'"
                  :aria-label="
                    vote.votes >= vote.majority ? '投票通过' : '投票未通过'
                  "
                >
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      vote.votes >= vote.majority ? 'check' : 'xmark',
                    ]"
                    aria-hidden="true"
                  />
                </span>
              </td>
              <td class="voter-cell">
                {{ vote.votedPlayers.join('、') || '无人投票' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ol class="vote-card-list" aria-label="投票历史记录">
        <li
          v-for="(vote, index) in session.voteHistory"
          :key="index"
          class="vote-record-card"
          :class="{ selected: session.voteSelected[index] }"
        >
          <header class="vote-record-card__header">
            <button
              type="button"
              class="selection-button"
              :class="{ selected: session.voteSelected[index] }"
              :aria-pressed="Boolean(session.voteSelected[index])"
              :aria-label="`${session.voteSelected[index] ? '取消选择' : '选择'}第 ${index + 1} 条投票记录`"
              @click="setVoteSelected(index)"
            >
              <font-awesome-icon
                :icon="[
                  'fas',
                  session.voteSelected[index] ? 'check-square' : 'square',
                ]"
                aria-hidden="true"
              />
            </button>
            <div>
              <span class="vote-record-card__eyebrow"
                >第 {{ index + 1 }} 次记录</span
              >
              <strong>{{ formatVoteTime(vote.timestamp) }}</strong>
            </div>
            <span
              class="outcome-badge"
              :class="vote.votes >= vote.majority ? 'passed' : 'failed'"
            >
              {{ vote.votes >= vote.majority ? '通过' : '未通过' }}
            </span>
          </header>

          <dl class="vote-record-card__details">
            <div>
              <dt>提名者</dt>
              <dd class="nominator">{{ vote.nominator }}</dd>
            </div>
            <div>
              <dt>被提名者</dt>
              <dd class="nominee">{{ vote.nominee }}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{{ vote.type }}</dd>
            </div>
            <div>
              <dt>模式</dt>
              <dd>{{ vote.mode }}</dd>
            </div>
            <div>
              <dt>票数</dt>
              <dd>{{ vote.votes }}</dd>
            </div>
            <div>
              <dt>通过票数</dt>
              <dd>{{ vote.majority }}</dd>
            </div>
            <div class="vote-record-card__voters">
              <dt>投票人</dt>
              <dd>{{ vote.votedPlayers.join('、') || '无人投票' }}</dd>
            </div>
          </dl>
        </li>
      </ol>
    </template>

    <div v-else class="vote-history-empty" role="status">
      <span class="vote-history-empty__seal" aria-hidden="true">
        <font-awesome-icon icon="book-dead" />
      </span>
      <strong>尚无投票记录</strong>
      <p>完成一次提名与投票后，结果会保存在这里。</p>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useSessionStore } from '@/stores/session'
import Modal from './Modal'

const appStore = useAppStore()
const sessionStore = useSessionStore()
const { modals } = storeToRefs(appStore)
const session = sessionStore.$state

const hasVoteHistory = computed(() => session.voteHistory.length > 0)
const selectedVoteCount = computed(
  () => session.voteSelected.filter(Boolean).length
)
const allVotesSelected = computed(
  () =>
    hasVoteHistory.value &&
    session.voteSelected.length > 0 &&
    session.voteSelected.every((selected) => selected === true)
)
const clearActionLabel = computed(() =>
  selectedVoteCount.value > 0 ? '清除选中记录' : '清除全部记录'
)

function formatVoteTime(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function setVoteSelected(index) {
  if (index >= 0) {
    sessionStore.setVoteSelected({
      index,
      value: !session.voteSelected[index],
    })
    return
  }

  const selectedAll = session.voteSelected.every(
    (selected) => selected === true
  )
  for (let i = 0; i < session.voteSelected.length; i += 1) {
    sessionStore.setVoteSelected({
      index: i,
      value: !selectedAll,
    })
  }
}

function clearVoteHistory() {
  const someSelected = !session.voteSelected.every(
    (selected) => selected === false
  )
  if (someSelected) {
    const selected = []
    for (let i = 0; i < session.voteSelected.length; i += 1) {
      if (session.voteSelected[i]) selected.push(i)
    }
    sessionStore.clearVoteHistory(selected)
    return
  }
  sessionStore.clearVoteHistory([])
}

function setRecordVoteHistory() {
  sessionStore.setVoteHistoryAllowed(!session.isVoteHistoryAllowed)
}

function toggleModal(name) {
  appStore.toggleModal(name)
}
</script>

<style lang="scss" scoped>
:global(.modal-backdrop--vote-history .modal) {
  width: min(1140px, 100%);
}

:global(.modal-backdrop--vote-history .modal > .slot) {
  padding-top: var(--ts-space-4, 16px);
}

.vote-history-toolbar {
  min-width: 0;
  margin-bottom: var(--ts-space-4, 16px);
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr) minmax(180px, auto);
  align-items: center;
  gap: var(--ts-space-3, 12px);
  background:
    linear-gradient(90deg, rgba(142, 47, 54, 0.08), transparent 56%),
    var(--ts-noise-parchment), var(--ts-surface-parchment-aged, #d7c29c);
  border: 1px solid var(--ts-border-strong, #8f7443);
  border-radius: var(--ts-radius-md, 10px);
  box-shadow: inset 4px 0 var(--ts-accent-crimson, #8e2f36);

  &--spectator {
    grid-template-columns: minmax(0, 1fr) minmax(180px, auto);
  }
}

.vote-history-toolbar__summary {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--ts-text-on-parchment, #2a1b18);
  font-size: 0.86rem;
  font-weight: 800;

  span + span {
    color: #6f252c;
  }
}

.toolbar-button {
  min-height: 44px;
  padding: 7px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ts-space-2, 8px);
  color: var(--ts-text-on-parchment, #2a1b18);
  background: rgba(255, 255, 255, 0.26);
  border: 1px solid rgba(42, 27, 24, 0.34);
  border-radius: var(--ts-radius-md, 10px);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition:
    background-color var(--ts-motion-fast, 160ms) ease,
    border-color var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);

  > span {
    min-width: 0;
  }

  strong,
  small {
    display: block;
    line-height: 1.2;
  }

  small {
    margin-top: 2px;
    color: #725c50;
    font-size: 0.72rem;
  }

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.44);
    border-color: var(--ts-border-strong, #8f7443);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring-on-parchment, #65242c);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--visibility {
    justify-content: flex-start;
    text-align: left;

    &.active {
      background: rgba(79, 128, 82, 0.18);
      border-color: rgba(45, 101, 50, 0.62);
    }
  }

  &--danger {
    color: #fff4e8;
    background: linear-gradient(
      180deg,
      var(--ts-accent-crimson-hover, #a63c45),
      var(--ts-focus-ring-on-parchment, #65242c)
    );
    border-color: #5a1b22;

    &:hover:not(:disabled) {
      background: linear-gradient(180deg, #b84751, #762a31);
      border-color: var(--ts-accent-gold, #d6b86a);
    }

    &:focus-visible {
      outline-color: var(--ts-focus-ring, #f0d990);
    }
  }
}

.vote-table-shell {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  scrollbar-color: var(--ts-border-strong, #8f7443) transparent;
  scrollbar-width: thin;
}

table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  color: var(--ts-text-primary, #f4ebdd);
  background:
    linear-gradient(145deg, rgba(33, 24, 43, 0.96), rgba(11, 9, 16, 0.96)),
    var(--ts-noise-stone);
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.14);
  line-height: 1.4;
  text-align: left;
  vertical-align: middle;
}

th {
  color: var(--ts-text-on-parchment, #2a1b18);
  background:
    var(--ts-noise-parchment), var(--ts-surface-parchment-aged, #d7c29c);
  border-bottom-color: rgba(42, 27, 24, 0.42);
  font-family: var(--ts-font-heading, serif);
  font-size: 0.86rem;
  white-space: nowrap;
}

tbody tr {
  transition:
    background-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease;

  &:hover {
    background: rgba(214, 184, 106, 0.07);
  }

  &.selected {
    background: rgba(142, 47, 54, 0.16);
    box-shadow: inset 4px 0 var(--ts-accent-crimson, #8e2f36);
  }

  &:last-child td {
    border-bottom: 0;
  }
}

.selection-column {
  width: 56px;
  padding: 5px 6px;
  text-align: center;
}

.selection-button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ts-text-muted, #c9bca7);
  background: rgba(5, 4, 8, 0.32);
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-md, 10px);
  cursor: pointer;
  font: inherit;
  font-size: 1.05rem;

  &.selected {
    color: var(--ts-accent-gold-hover, #e7cf86);
    background: rgba(142, 47, 54, 0.36);
    border-color: var(--ts-accent-gold, #d6b86a);
  }

  &:hover:not(:disabled) {
    color: var(--ts-accent-gold-hover, #e7cf86);
    border-color: var(--ts-accent-gold, #d6b86a);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

th .selection-button {
  color: var(--ts-text-on-parchment, #2a1b18);
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(42, 27, 24, 0.32);

  &.selected {
    color: #fff4e8;
    background: var(--ts-accent-crimson, #8e2f36);
    border-color: #5a1b22;
  }

  &:focus-visible {
    outline-color: var(--ts-focus-ring-on-parchment, #65242c);
  }
}

.vote-time,
.numeric-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.nominator {
  color: var(--ts-role-townsfolk, #6ea0ff);
  font-weight: 800;
}

.nominee {
  color: var(--ts-role-demon, #ff6b6b);
  font-weight: 800;
}

.numeric-cell {
  text-align: center;
}

.voter-cell {
  min-width: 170px;
  overflow-wrap: anywhere;
}

.outcome-mark {
  width: 24px;
  height: 24px;
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;

  &.passed {
    color: #12351f;
    background: var(--ts-success, #8fe3b0);
  }

  &.failed {
    color: #5a1b22;
    background: var(--ts-danger, #ffb8b8);
  }
}

.vote-card-list {
  display: none;
}

.vote-history-empty {
  min-height: 260px;
  padding: var(--ts-space-6, 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--ts-text-muted, #c9bca7);
  background:
    radial-gradient(
      circle at 50% 18%,
      rgba(142, 47, 54, 0.12),
      transparent 48%
    ),
    rgba(5, 4, 8, 0.28);
  border: 1px dashed var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  text-align: center;

  strong {
    margin-top: var(--ts-space-3, 12px);
    color: var(--ts-text-primary, #f4ebdd);
    font-family: var(--ts-font-heading, serif);
    font-size: 1.15rem;
  }

  p {
    max-width: 34ch;
    margin: var(--ts-space-2, 8px) 0 0;
    line-height: 1.55;
  }
}

.vote-history-empty__seal {
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ts-accent-gold-hover, #e7cf86);
  background: linear-gradient(
    180deg,
    rgba(142, 47, 54, 0.54),
    rgba(61, 24, 29, 0.78)
  );
  border: 1px solid var(--ts-border-strong, #8f7443);
  border-radius: 50%;
  box-shadow: 0 0 24px rgba(142, 47, 54, 0.24);
  font-size: 1.45rem;
}

@media (max-width: 820px) {
  .vote-table-shell {
    display: none;
  }

  .vote-card-list {
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--ts-space-3, 12px);
    list-style: none;
  }

  .vote-record-card {
    min-width: 0;
    overflow: hidden;
    color: var(--ts-text-on-parchment, #2a1b18);
    background:
      linear-gradient(90deg, rgba(142, 47, 54, 0.06), transparent 56%),
      var(--ts-noise-parchment), var(--ts-surface-parchment, #f1e3c7);
    border: 1px solid var(--ts-border-strong, #8f7443);
    border-radius: var(--ts-radius-md, 10px);
    box-shadow: var(--ts-shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.28));

    &.selected {
      border-color: var(--ts-accent-crimson, #8e2f36);
      box-shadow:
        inset 4px 0 var(--ts-accent-crimson, #8e2f36),
        var(--ts-shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.28));
    }
  }

  .vote-record-card__header {
    min-height: 62px;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ts-space-3, 12px);
    background: rgba(42, 27, 24, 0.08);
    border-bottom: 1px solid rgba(42, 27, 24, 0.2);

    .selection-button {
      color: var(--ts-text-on-parchment, #2a1b18);
      background: rgba(255, 255, 255, 0.32);
      border-color: rgba(42, 27, 24, 0.3);

      &.selected {
        color: #fff4e8;
        background: var(--ts-accent-crimson, #8e2f36);
        border-color: #5a1b22;
      }

      &:focus-visible {
        outline-color: var(--ts-focus-ring-on-parchment, #65242c);
      }
    }

    > div {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    strong {
      font-size: 1.1rem;
      font-variant-numeric: tabular-nums;
    }
  }

  .vote-record-card__eyebrow {
    color: #725c50;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .outcome-badge {
    min-height: 30px;
    padding: 5px 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid currentColor;
    border-radius: var(--ts-radius-pill, 999px);
    font-size: 0.78rem;
    font-weight: 900;

    &.passed {
      color: #255c35;
      background: rgba(79, 128, 82, 0.16);
    }

    &.failed {
      color: #7b252d;
      background: rgba(142, 47, 54, 0.12);
    }
  }

  .vote-record-card__details {
    margin: 0;
    padding: var(--ts-space-3, 12px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ts-space-2, 8px);

    > div {
      min-width: 0;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.24);
      border: 1px solid rgba(42, 27, 24, 0.14);
      border-radius: var(--ts-radius-sm, 6px);
    }

    dt {
      margin-bottom: 3px;
      color: #725c50;
      font-size: 0.74rem;
      font-weight: 800;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-weight: 800;
      line-height: 1.35;
    }
  }

  .vote-record-card__voters {
    grid-column: 1 / -1;
  }

  .vote-record-card .nominator {
    color: #244f86;
  }

  .vote-record-card .nominee {
    color: #842d35;
  }
}

@media (max-width: 680px) {
  .vote-history-toolbar,
  .vote-history-toolbar--spectator {
    grid-template-columns: minmax(0, 1fr);
  }

  .vote-history-toolbar__summary {
    min-height: 32px;
    order: -1;
  }

  .toolbar-button {
    width: 100%;
  }
}

@media (max-width: 420px) {
  .vote-record-card__details {
    grid-template-columns: minmax(0, 1fr);
  }

  .vote-record-card__voters {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-button,
  tbody tr {
    transition-duration: 0.01ms !important;
  }
}
</style>

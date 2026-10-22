<template>
  <div
    id="townsquare"
    class="square"
    :class="{
      public: grimoire.isPublic,
      'voice-conversation-active': isVoiceConversation,
      'voice-selecting-player': voice.selectingInvitee,
      spectator: session.isSpectator,
      vote: votePresentation !== 'idle',
      night: grimoire.isNight || privateVotingActive,
      'private-voting': privateVotingActive,
      'revealing-grimoire': Boolean(stagedReveal),
      'night-selecting-player': nightPlayerSelection.active,
      'no-decorations': !grimoire.showDecorations,
      'no-night-clouds': !grimoire.showNightClouds,
      'hide-teams': !grimoire.showTeams,
      'hide-table-avatars': !grimoire.showTableAvatars,
      'colorblind-red-green': grimoire.colorblindMode === 1,
      'colorblind-contrast': grimoire.colorblindMode === 2,
      'reminders-spread': grimoire.reminderStacking === 'spread',
      'reminders-stacked': grimoire.reminderStacking === 'stack',
      'nomination-focus': grimoire.nominationMode === 'nominee' && realtimeVoteStore.isActive,
    }"
    :style="grimoireStyleVars"
  >
    <audio
      src="../assets/sounds/countdown.mp3"
      preload="auto"
      ref="countdownAudio"
    ></audio>
    <VoiceConversation v-if="isApiRoom" :players="voiceCardPlayers" @role-action="handleVoiceRoleAction" />
    <div class="botc-reference-room" :style="grimoire.background ? { backgroundImage: `url(${JSON.stringify(grimoire.background)})` } : null">
      <div class="reference-night-veil" aria-hidden="true"></div>
      <div class="reference-vote-veil" aria-hidden="true"></div>
      <div v-if="isStoryteller || isApiRoom" class="room-storyteller-profiles" aria-label="房间说书人">
        <StorytellerProfile v-if="isStoryteller" :name="profileName" :avatar="profileAvatarUrl || defaultSeatAvatar"
          :data-storyteller-user-id="session.playerId"
          :role="profileRole" :reminders="profileReminderRoles" :pending="storytellerPending"
          :is-speaking="voice.remoteVoiceStates[gameStore.currentPlayer?.userId]?.isSpeaking"
          :hand-signal="gameStore.handSignals[gameStore.currentPlayer?.userId]"
          :is-image-opt-in="grimoire.isImageOptIn" @action="profileAction" @remove-reminder="removeStorytellerReminder" />
        <StorytellerProfile v-for="storyteller in otherStorytellers" :key="storyteller.userId"
          :data-storyteller-user-id="storyteller.userId"
          :class="{ 'voice-invite-target': voice.selectingInvitee }"
          @click.capture="selectVoiceInvitee(storyteller.userId, $event)"
          :can-text-chat="!gameStore.currentIsDm && Boolean(gameStore.currentPlayer)"
          :text-unread="storytellerTextUnread"
          @text-chat="openStorytellerChat"
          :name="storyteller.name" :avatar="storyteller.avatar" :reminders="[]" :can-manage="false"
          :is-speaking="voice.remoteVoiceStates[storyteller.userId]?.isSpeaking"
          :hand-signal="gameStore.handSignals[storyteller.userId]" :is-image-opt-in="grimoire.isImageOptIn" />
      </div>
      <TransitionGroup name="storyteller-signal" tag="aside" class="storyteller-hand-signals" aria-label="说书人举手">
        <div v-for="signal in raisedStorytellers" :key="signal.userId" class="storyteller-hand-signals__portrait">
          <img :src="signal.avatar" :alt="signal.name" />
          <HandSignal :icon="signal.icon" :name="signal.name" :is-image-opt-in="grimoire.isImageOptIn" />
        </div>
      </TransitionGroup>
      <section v-if="!isStoryteller && !isApiRoom" class="reference-profile-card" aria-label="当前玩家" @click="toggleProfileActions">
        <strong class="reference-profile-card__title">{{ profileSeatLabel }}</strong>
        <div
          class="reference-avatar"
          :class="{ empty: !profileAvatarUrl }"
          :style="profileAvatarUrl ? { backgroundImage: `url(${profileAvatarUrl})` } : null"
        >
          <font-awesome-icon v-if="!profileAvatarUrl" :icon="['fas', 'user']" />
        </div>
        <div class="reference-nameplate">
          <span>{{ profileName }}</span>
          <span
            v-if="profileLifeState"
            class="reference-nameplate__life"
            role="status"
          >{{ profileLifeState }}</span>
        </div>
        <div v-if="profileRole || profileReminderRoles.length" class="reference-profile-role-stack" aria-label="当前角色与标记">
          <div v-if="profileRole" class="reference-profile-role reference-profile-role--main" :title="profileRole.name">
            <Token :role="profileRole" />
          </div>
          <div v-for="reminder in profileReminderRoles" :key="reminder.name" class="reference-profile-role reference-profile-role--reminder" :title="reminder.name">
            <Token :role="reminder" />
          </div>
        </div>
        <div v-if="profileActionsOpen" class="reference-profile-actions" @click.stop>
          <button type="button" @click="profileAction('role')"><font-awesome-icon icon="theater-masks" />改变角色</button>
          <button type="button" @click="profileAction('reminder')"><font-awesome-icon icon="plus-circle" />添加提示标记</button>
          <button type="button" @click="profileAction('chat')"><font-awesome-icon icon="envelope" />发送文本信息</button>
          <button v-if="session.isSpectator && isApiRoom" type="button" @click="profileAction('grimoire')"><font-awesome-icon icon="book-dead" />请求魔典访问权限</button>
        </div>
      </section>

      <header v-if="!isApiRoom && !demoStore.active" class="reference-room-meta">
        <strong>房间号：{{ roomCode }}</strong>
        <button type="button" class="reference-settings" title="设置" @click="openModal('settings')">
          <font-awesome-icon :icon="['fas', 'cog']" />
          <span>设置</span>
        </button>
      </header>

      <div v-if="seatOperationPrompt" class="reference-operation-prompt" role="status" aria-live="polite">
        <font-awesome-icon
          :icon="['fas', apiNominationTargeting ? 'gavel' : 'exchange-alt']"
          aria-hidden="true"
        />
        <span>{{ seatOperationPrompt }}</span>
        <button type="button" @click="cancelSeatOperation">取消</button>
      </div>
      <div v-if="!showStorytellerStage && grimoire.showTutorial && !seatOperationPrompt && (gameStore.level === 'prepare' || !isApiRoom)" class="reference-tutorial" role="status">
        <span>点击空座位入座；说书人可点击中央剧本名称选剧本，点击角色圆片配置身份。</span>
        <button type="button" @click="grimoire.showTutorial = false">知道了</button>
      </div>

      <main class="reference-table" :class="{ 'is-seat-editing': seatEditor.open, 'is-revealing-grimoire': stagedReveal, 'is-nominating': apiNominationTargeting || (manualNominationOpen && Boolean(tableNomination.selecting)), 'is-manual-voting': manualNominationOpen }" :style="{ '--seat-scale': Math.min(1, 13 / Math.max(players.length, 1)), '--seat-drag-x': `${seatEditor.dragX}px`, '--seat-drag-y': `${seatEditor.dragY}px` }" aria-label="房间游戏桌"
        @pointermove="handleReminderPointerMove" @pointerleave="hoveredReminderSeat = -1" @pointercancel="hoveredReminderSeat = -1">
        <div class="reference-compass">
          <span></span>
        </div>

        <!-- Preview the nomination hands while seats are being selected. -->
        <div v-if="votePresentation === 'draft'" class="reference-dial-mount" aria-hidden="true">
          <ClockDial
            mode="sweep"
            :seat-count="dialSeatCount"
            :minute-seat="isApiRoom ? dialMinuteSeat : null"
            :hour-seat="isApiRoom ? dialNomineeSeat : null"
            :paused="realtimeVoteStore.paused"
            :idle="dialIdle"
          />
        </div>

        <TableNominationControls v-if="manualNominationOpen" />
        <NominationSurface ref="roomNomination" :draft-active="Boolean(nominationStage)" @start-nomination="startNominationFromSelf" />

        <!-- The in-table nomination confirmation. Lives inside the table so it
             floats over the dial centre the hands are pointing at; nothing is
             sent to the server until this card's confirm button is pressed. -->
        <NominationConfirmCard
          v-model:private-vote="privateVoteDraft"
          :open="votePresentation === 'draft' && nominationStage === 'confirm'"
          :nominator-seat="nominationNominatorIndex + 1"
          :nominator-name="nominationDraftNominatorName"
          :nominee-seat="nominationNomineeIndex + 1"
          :nominee-name="nominationDraftNomineeName"
          :required-votes="Math.ceil(aliveCount / 2)"
          :pending="seatActionPending === 'start-vote'"
          :status-text="seatActionPending === 'start-vote' ? seatActionStatus : ''"
          @confirm="confirmNominationDraft"
          @cancel="cancelNominationDraft"
        />

        <div
          v-for="seat in tableSeats"
          :key="seat.key"
          class="reference-seat-group"
          :data-seat-index="seat.index"
          :class="[
            seat.anchor,
            {
              'outside-voice-room': isVoiceConversation && !voiceMemberIds.has(seat.player.id),
              'is-nominee-focus': seatNumberForUserId(realtimeVoteStore.nomineeUserId) === seat.index + 1,
              'reminder-open': reminderPickerSeat === seat.index,
              'reminder-hovered': hoveredReminderSeat === seat.index,
              'seat-edit-source': seatEditor.open && seatEditor.movingSeat === seat.index,
              'seat-edit-target': seatEditor.open && seatEditor.dropSeat === seat.index && seatEditor.movingSeat !== seat.index,
              'action-source': swap === seat.index,
              'action-target':
                (swap >= 0 && swap !== seat.index && seat.hasPlayer) ||
                apiNominationTargeting,
              'action-unavailable':
                (swap >= 0 && !seat.hasPlayer),
              'empty-seat-claimable': isApiRoom && !stagedReveal && !seat.hasPlayer && !canManageActionSeat,
            },
          ]"
          :style="seat.style"
        >
          <button
            type="button"
            class="reference-seat"
            :class="{
              occupied: seat.player.id,
              dead: seat.player.isDead,
              claimed: session.claimedSeat === seat.index,
              'no-avatar': !seat.avatarUrl,
              'is-vote-turn':
                realtimeVoteStore.isActive &&
                realtimeVoteStore.currentVoterSeat === seat.index + 1,
            }"
            :style="seat.hasPlayer ? { backgroundImage: seat.avatarBackground } : {}"
            :data-speaking="voice.remoteVoiceStates[seat.player.id]?.isSpeaking || undefined"
            :aria-label="nightPlayerSelection.active ? `选择 ${seat.index + 1} 号座位${seat.player.name ? ` · ${seat.player.name}` : ''}` : seatButtonLabel(seat)"
            :disabled="!nightPlayerSelection.active && !realtimeVoteStore.isActive && seat.emptySeatLocked"
            @click="handleTableSeatClick(seat.index, $event)"
          >
            <VoiceSpeakingRing :active="seat.hasPlayer && voice.remoteVoiceStates[seat.player.id]?.isSpeaking" />
            <span v-if="voice.selectingInvitee && seat.hasPlayer && seat.player.id !== session.playerId" class="voice-invite-target-icon" aria-hidden="true"><font-awesome-icon icon="comments" /></span>
            <img
              v-if="!seat.hasPlayer"
              :src="seat.chairImage"
              class="seat-chair-overlay"
              :class="{ flipped: seat.chairFlip }"
            />
            <font-awesome-icon v-if="seat.hasPlayer && !seat.avatarUrl" :icon="['fas', 'user']" />
            <span v-if="!seatEditor.open" class="seat-label" :class="seat.nameAnchor">
              <span v-if="seat.hasPlayer" class="seat-player-name" :title="seat.displayName">{{ seat.nameLine }}</span>
              <span v-else class="seat-number" aria-hidden="true">{{ seat.index + 1 }} 号座位</span>
              <span v-if="seat.actionLabel" class="seat-claim">{{ seat.hasPlayer || seat.emptySeatLocked ? seat.actionLabel : '坐在这里' }}</span>
            </span>
          </button>

          <SeatEditLabel v-if="seatEditor.open" :index="seat.index" :name="seat.hasPlayer ? seat.displayName : `${seat.index + 1} 号座位`" :anchor="seat.nameAnchor" :occupied="seat.hasPlayer" />

          <div class="reference-token-stack" :style="seat.tokenStyle">
            <Transition name="hand-signal">
              <HandSignal v-if="!onlineNominationOpen && gameStore.handSignals[seat.player.id]" :icon="gameStore.handSignals[seat.player.id]"
                :name="seat.displayName" :seat-angle="seat.angle" :is-image-opt-in="grimoire.isImageOptIn" />
            </Transition>
            <button
              type="button"
              class="reference-token"
              v-role-tooltip="!nightPlayerSelection.active && !manualNominationOpen && !realtimeVoteStore.isActive && !apiNominationTargeting && !canNominateTokenSeat(seat.index) ? revealTokenRole(seat) : null"
              :class="[
                { empty: !seat.role.id },
                seat.role.team ? `team-${seat.role.team}` : null,
              ]"
              :title="nightPlayerSelection.active ? `选择 ${seat.index + 1} 号座位` : manualNominationOpen ? `第 ${seat.index + 1} 席${tableNomination.selecting ? '选择提名席位' : tableNomination.isLocked(seat.index) ? '已锁票' : '点击举票或放下'}` : canNominateTokenSeat(seat.index) ? `第 ${actionSeatIndex + 1} 席提名第 ${seat.index + 1} 席` : seatTokenTitle(seat)"
              :disabled="!nightPlayerSelection.active && !isPersonalGrimoire && !realtimeVoteStore.isActive && seat.emptySeatLocked"
              :aria-label="isApiRoom && realtimeVoteStore.isActive ? `第 ${seat.index + 1} 席投票` : stagedReveal ? `揭晓第 ${seat.index + 1} 席角色` : nightPlayerSelection.active ? `选择 ${seat.index + 1} 号座位的玩家标记` : manualNominationOpen ? `第 ${seat.index + 1} 席${tableNomination.selecting ? '选择提名席位' : '投票'}` : apiNominationTargeting ? seatButtonLabel(seat) : canNominateTokenSeat(seat.index) ? `第 ${actionSeatIndex + 1} 席提名第 ${seat.index + 1} 席` : `第 ${seat.index + 1} 席角色操作`"
              :data-nomination-target="canNominateTokenSeat(seat.index) ? seat.index : undefined"
              :aria-haspopup="nightPlayerSelection.active || realtimeVoteStore.isActive || apiNominationTargeting || manualNominationOpen || canNominateTokenSeat(seat.index) ? undefined : isPersonalGrimoire ? 'dialog' : 'menu'"
              :aria-pressed="manualNominationOpen && !tableNomination.selecting ? tableNomination.votes[seat.index] : undefined"
              :aria-expanded="nightPlayerSelection.active || manualNominationOpen || apiNominationTargeting || isPersonalGrimoire ? undefined : actionSeatMode === 'token' && actionSeatIndex === seat.index"
              @pointerenter="previewRevealSeat = stagedReveal && isStoryteller ? seat.index : -1"
              @pointerleave="endRevealPreview" @pointerdown="startRevealPreview(seat.index, $event)" @pointerup="finishRevealPress" @pointercancel="endRevealPreview"
              @contextmenu="stagedReveal && $event.preventDefault()"
              @click.stop="handleTableTokenClick(seat.index, $event)"
            >
              <font-awesome-icon v-if="nightPlayerSelection.active" class="night-player-token" icon="user" aria-hidden="true" />
              <GrimoireRevealToken v-else-if="stagedReveal" :key="`${stagedReveal.id}:${seat.key}`" :role="seat.role"
                :revealed="stagedReveal.revealedUserIds.includes(storyteller.revealId(seat.index))" :preview="isStoryteller && previewRevealSeat === seat.index"
                :animate-initial-reveal="storyteller.ui.revealAnimationUserIds.includes(storyteller.revealId(seat.index))"
                @turn-complete="storyteller.finishReveal(storyteller.revealId(seat.index))"
                :seat-index="seat.index" :started-at="stagedReveal.startedAt"
                :turn-delay="bulkRevealTurnDelay(seat.index)" />
              <Token v-else :role="realtimeVoteStore.sweepVote && onlineNominationOpen ? { id: '' } : revealTokenRole(seat)"></Token>
              <span v-if="stagedReveal && isStoryteller && previewRevealSeat === seat.index" class="reveal-identity-preview">{{ seat.role.name || seat.role.id }}</span>
              <font-awesome-icon
                v-if="apiNominationTargeting || (manualNominationOpen && tableNomination.selecting) || canNominateTokenSeat(seat.index)"
                class="nomination-seat-hand" icon="hand-point-right" aria-hidden="true" :style="{ transform: `translate(-50%, -50%) rotate(${seat.angle}deg)` }" />
              <font-awesome-icon v-else-if="manualNominationOpen && (tableNomination.votes[seat.index] || tableNomination.isLocked(seat.index))"
                class="nomination-seat-vote" :class="{ 'is-yes': tableNomination.votes[seat.index] }" :icon="tableNomination.votes[seat.index] ? 'hand' : 'xmark'" aria-hidden="true" />
              <span v-else-if="seatVoteResult(seat.player, seat.index)" class="nomination-seat-vote"
                :class="{ 'is-yes': seatVoteResult(seat.player, seat.index)?.vote === 'yes' }" role="img"
                :aria-label="`第 ${seat.index + 1} 席${seatVoteResult(seat.player, seat.index)?.vote === 'yes' ? '已举手' : '未举手'}`">
                <span v-if="realtimeVoteStore.sweepVote && (!realtimeVoteStore.privateVote || gameStore.currentIsDm) && seatVoteResult(seat.player, seat.index)?.vote === 'yes' && seatVoteResult(seat.player, seat.index)?.locked !== false"
                  class="nomination-seat-count">{{ seatVoteNumber(seat.index) }}</span>
                <font-awesome-icon v-else :icon="seatVoteResult(seat.player, seat.index)?.vote === 'yes' ? 'hand' : 'xmark'" />
              </span>
              <span v-if="!isApiRoom && tableNomination.markedSeat === seat.index" class="nomination-execution-marker" :title="`最高 ${tableNomination.highestVotes} 票，待处决`"><font-awesome-icon icon="skull" /><small>{{ tableNomination.highestVotes }}</small></span>
              <span
                v-if="grimoire.showWakeOrder && !session.isSpectator && grimoire.isNight && seat.nightOrderNumber > 0"
                class="seat-night-order"
                aria-hidden="true"
                :title="`夜晚行动顺序：第 ${seat.nightOrderNumber} 位`"
              >{{ seat.nightOrderNumber }}</span>
            </button>

            <button v-if="canTextChatWithSeat(seat.index)" type="button" class="table-chat-action"
              :class="{ 'has-unread': textUnreadForSeat(seat.index) > 0 }"
              :aria-label="`向 ${seat.displayName} 发送文本信息`" :title="`向 ${seat.displayName} 发送文本信息`"
              @click.stop="openPrivateChat(seat.index)">
              <font-awesome-icon icon="envelope" />
              <small v-if="textUnreadForSeat(seat.index)">{{ textUnreadForSeat(seat.index) }}</small>
            </button>

            <DeathShroud v-if="seat.player.isDead || (canManageSeatLife && (!isApiRoom || seat.hasPlayer))"
              :dead="Boolean(seat.player.isDead)" :voteless="Boolean(seat.player.isVoteless)"
              :can-edit="canManageSeatLife && (!isApiRoom || seat.hasPlayer)" :pending="Boolean(seatActionPending)"
              :seat="seat.index + 1" @cycle="cycleSeatLifeState(seat.index)" />

            <NightWakeMarker v-if="isApiRoom && !nightPlayerSelection.active && !seatEditor.open && !manualNominationOpen && !apiNominationTargeting"
              :user-id="seat.player.id || ''" @open="openNightConversation(seat.index)" />

            <div
              v-if="!onlineNominationOpen && (seat.reminders.length || canAnnotateGrimoire)"
              class="reference-seat-reminders"
              :style="{ '--reminder-count': seat.reminders.length }"
              :aria-label="`第 ${seat.index + 1} 席提醒标记`"
            >
              <ReminderToken
                v-for="(reminder, reminderIndex) in seat.reminders"
                :key="`${seat.key}-${reminder}`"
                :style="reminderStyle(seat, reminderIndex)"
                :name="reminder" :role="reminderVisual(reminder)"
                :can-edit="canAnnotateGrimoire" :rotated="isReminderRotated(seat.index, reminder)"
                :pending="Boolean(reminderActionPending)" :is-image-opt-in="grimoire.isImageOptIn"
                @rotate="rotateApiReminder(seat.index, reminder)"
                @remove="removeApiReminder(seat.index, reminder)"
              />
            <button
              v-if="canAnnotateGrimoire"
              type="button"
              class="reference-seat-reminder reference-seat-reminder--add"
              :style="reminderStyle(seat, seat.reminders.length)"
              :aria-label="`为第 ${seat.index + 1} 席添加提醒标记`"
              title="添加提醒标记"
              @click.stop="openReminderModal(seat.index)"
            >
              <span class="sr-only">添加提醒标记</span>
            </button>
            </div>

          </div>
        </div>

        <SeatEditor />
        <StorytellerStage v-if="showStorytellerStage" :hidden="manualNominationOpen || onlineNominationOpen || apiNominationTargeting" />
        <div v-if="!showStageCenter && !seatEditor.open && !manualNominationOpen && !onlineNominationOpen && !apiNominationTargeting" class="reference-center" :style="scriptAccentVars">
          <button
            v-if="!session.isSpectator"
            type="button"
            class="reference-center__script-name reference-center__script-name--action"
            title="点击选择剧本"
            @click="openModal('edition')"
          ><img v-if="scriptLogoUrl" :src="scriptLogoUrl" :alt="scriptName" /><span v-else>{{ scriptName }}</span></button>
          <strong v-else class="reference-center__script-name"><img v-if="scriptLogoUrl" :src="scriptLogoUrl" :alt="scriptName" /><span v-else>{{ scriptName }}</span></strong>
          <span class="reference-center__phase">{{ phaseLabel }}</span>
          <span class="reference-center__status">{{ nominationLabel }}</span>
        </div>
      </main>

    </div>

    <RightReferencePanel id="right-roles-panel" label="角色" :title="scriptReferenceTitle" :index="0">
      <div class="reference-script-roles">
        <section v-for="team in scriptRoleGroups" :key="team.key" class="reference-script-role-group">
          <h3><span>{{ team.label }}</span></h3>
          <div class="reference-script-role-list">
            <article v-for="role in team.roles" :key="role.id" class="reference-script-role-entry" :class="`reference-script-role-entry--${team.key}`">
              <div class="reference-script-role-entry__icon"><RoleIcon :role="role" :is-image-opt-in="grimoire.isImageOptIn" /></div>
              <div class="reference-script-role-entry__copy">
                <h4>{{ role.name }} <small v-if="grimoire.showEnglishNames && roleEnglishName(role)">({{ roleEnglishName(role) }})</small></h4>
              </div>
              <p class="reference-script-role-entry__ability">{{ role.ability || '暂无能力说明。' }}</p>
            </article>
          </div>
        </section>
        <p v-if="!scriptRoleGroups.length" class="reference-night-empty">当前剧本暂无角色资料。</p>
      </div>
    </RightReferencePanel>
    <RightReferencePanel id="right-night-panel" v-slot="{ compact }" label="夜间顺序" title="夜间顺序" :index="1">
      <NightReferenceContent :sections="nightOrderSections" :can-edit="canEditWakeMarkers" :compact="compact"
        :is-image-opt-in="grimoire.isImageOptIn" @toggle-marker="handleWakeMarkerToggle" />
    </RightReferencePanel>

    <RoleTokenMenu v-if="actionSeatIndex >= 0 && actionSeatMode === 'token'" :key="actionSeatIndex"
      :anchor="roleMenuAnchor" :seat-index="actionSeatIndex" :seat-angle="tableSeats[actionSeatIndex]?.angle"
      :can-edit="isPersonalGrimoire || (canManageActionSeat && (!isApiRoom || gameController.isConnected))"
      :can-change-alignment="canChangeTokenAlignment"
      :can-nominate="canSelfNominateActionSeat" :show-nominate="!isPersonalGrimoire && !grimoire.isNight && votePresentation !== 'legacy' && !realtimeVoteStore.isActive"
      :show-wake="canWakeTokenSeat"
      :show-life="canManageSeatLife && Boolean(actionPlayer) && (!isApiRoom || Boolean(actionPlayer.id))" :is-dead="Boolean(actionPlayer?.isDead)"
      :is-interaction-target="isTokenNominationTarget"
      :pending="Boolean(seatActionPending)" @close="closeSeatActions" @action="handleRoleTokenAction" />

    <DemoNightMessageModal v-if="demoStore.active && nightMessageTarget && canWakeTokenSeat" :seat-index="nightMessageTarget.seatIndex" @close="nightMessageTarget = null" />
    <NightMessageModal v-if="nightMessageTarget && canWakeTokenSeat && !demoStore.active" :key="`${nightMessageTarget.playerUserId}:${nightMessageTarget.levelDays}`" :seat-index="nightMessageTarget.seatIndex"
      :player-user-id="nightMessageTarget.playerUserId" :level-days="nightMessageTarget.levelDays" @close="nightMessageTarget = null" />



    <EdgePanel id="left-bluffs-panel" label="伪装" :index="3" :open="isBluffsOpen" :width="330" :height="116" tokens-only-at-rest @toggle="toggleLeftPanel('bluffs')">
    <div
      class="bluffs"
      v-show="isBluffsOpen"
      ref="bluffs"
      :class="{ closed: !isBluffsOpen }"
    >
      <ul id="bluffs-role-list">
        <li
          v-for="index in bluffSize"
          :key="index"
          @click="openRoleModal(index * -1)"
        >
          <Token :role="bluffs[index - 1]"></Token>
        </li>
      </ul>
    </div>
    </EdgePanel>

    <EdgePanel id="left-npc-panel" label="NPC" :index="2" :open="isFabledOpen" :width="330" :height="116" tokens-only-at-rest @toggle="toggleLeftPanel('npc')">
    <div v-show="isFabledOpen" ref="fabledPanel" class="fabled" :class="{ closed: !isFabledOpen }">
      <button
        v-if="canManageFabled && fabled.length"
        type="button"
        class="fabled-panel-manage"
        aria-label="管理传奇角色"
        title="添加、替换或移除传奇角色"
        @click.stop="openFabledManagement"
      >
        <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
      </button>
      <div v-show="isFabledOpen" id="fabled-role-content" class="fabled-role-content">
        <ul v-if="fabled.length" id="fabled-role-list">
          <li
            v-for="(role, index) in fabled"
            :key="role.id || index"
            @click="handleFabledTokenClick(index)"
          >
            <div v-if="index === 0 && role.id === 'storyteller'">
              <div
                class="newMessage"
                v-for="(item, position) in session.newStMessage"
                :key="position"
                v-show="item > 0"
              >
                {{ item }}
              </div>
            </div>

            <Token :role="role"></Token>
          </li>
        </ul>
        <button
          v-else-if="canManageFabled"
          type="button"
          class="fabled-empty-action"
          @click="openFabledManagement"
        >
          <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
          <span>添加传奇角色</span>
        </button>
        <p v-else class="fabled-empty-copy">暂无传奇角色</p>
      </div>
    </div>
    </EdgePanel>

    <div v-if="session.isSpectator && isRole.length > 0" class="is-role">
      <font-awesome-icon
        :icon="['custom', isRole]"
        size="4x"
        :class="{ 'is-using-wraith': session.isRole.wraith.using }"
        @click="setUsingWraith()"
      />
    </div>

    <EdgePanel id="left-voice-panel" label="语音" :index="0" :open="isVoiceOpen" :width="280" :height="250" @toggle="toggleLeftPanel('voice')">
    <section class="reference-voice-drawer" aria-label="语音频道">
      <header><strong>语音</strong><button type="button" aria-label="收起语音" @click="isVoiceOpen = false">×</button></header>
      <VoiceSidebar v-if="isApiRoom" /><VoiceRoomModal v-else embedded />
    </section>
    </EdgePanel>

    <ReminderPickerModal
      v-if="isStoryteller && profileReminderPickerOpen"
      :seat="-1"
      target-label="说书人"
      :options="availableApiReminders(-1)"
      :is-image-opt-in="grimoire.isImageOptIn"
      v-model:search="reminderSearch"
      v-model:tab="reminderPickerTab"
      @select="addStorytellerReminder"
      @close="profileReminderPickerOpen = false"
    />
    <ReminderPickerModal
      v-if="canAnnotateGrimoire && reminderPickerSeat >= 0 && players[reminderPickerSeat]"
      :seat="reminderPickerSeat"
      :options="availableApiReminders(reminderPickerSeat)"
      :is-image-opt-in="grimoire.isImageOptIn"
      v-model:search="reminderSearch"
      v-model:tab="reminderPickerTab"
      @select="addApiReminder(reminderPickerSeat, $event)"
      @close="reminderPickerSeat = -1"
    />
    <RoleModal
      :player-index="selectedPlayer"
      :profile-role="profileRolePickerOpen"
      :profile-role-value="profileRole"
      @profile-role-selected="setStorytellerRole"
      @role-selected="handleRoleSelected"
      @close="profileRolePickerOpen = false"
    ></RoleModal>
    <PlayerNotesModal
      :open="Boolean(notesTarget)"
      :player-id="notesTarget?.id || ''"
      :player-name="notesTarget?.name || '玩家'"
      :role-name="notesTarget?.roleName || '尚未分配身份'"
      @close="notesTarget = null"
      @saved="handleNotesSaved"
    />

    <EdgePanel id="left-text-panel" label="文本" :unread-count="textUnreadCount" :index="1" :open="Boolean(session.isChatOpen && !isChatMin)" :width="400" :height="300" @toggle="toggleLeftPanel('text')">
    <section
      v-show="session.isChatOpen && !isChatMin"
      ref="chatWindow"
      :class="{ chat: !isChatMin, chatMin: isChatMin }"
      role="region"
      :aria-label="isApiRoom ? apiChatAriaLabel : (chattingPlayer === 'public' ? '房间公聊' : '房间私聊')"
    >
      <header ref="chatDragSurface" class="title" @click="isChatMin && maximiseChat()">
        <div
          v-if="!isChatMin && isInGroup && isShowGroup"
          class="group"
        >
          <div v-for="player in inGroupPlayers" :key="player.id">
            <span>（{{ player.index + 1 }}号）{{ player.name }}</span>
            <br />
          </div>
        </div>
        <div class="chat-title-copy">
          <span class="chat-kicker">房间通讯</span>
          <font-awesome-icon v-if="isApiRoom" :icon="apiChatChannel === 'public' ? 'users' : apiChatChannel === 'system' ? 'bell' : 'envelope'" aria-hidden="true" />
          <strong ref="chatWith">{{ isApiRoom ? apiChatTitle : (chattingPlayer === "public" ? "公聊" : "私聊") }}</strong>
          <span
            class="newMessage"
            v-for="(item, position) in session.newStMessage"
            :key="position"
            v-show="session.isSpectator && item > 0"
            >{{ item }}</span
          >
        </div>
        <div class="chat-title-actions">
          <button v-if="isApiRoom" type="button" class="chat-icon-button chat-conversation-toggle"
            aria-label="选择文字会话" :aria-expanded="chatConversationsOpen" aria-controls="text-conversations"
            @click.stop="toggleTextConversations()">
            <font-awesome-icon icon="envelope" />
            <small v-if="textUnreadCount" class="chat-unread-badge">{{ textUnreadCount }}</small>
          </button>
          <button
            v-if="!isChatMin && (isApiRoom ? apiChatChannel !== 'public' : chattingPlayer !== 'public')"
            type="button"
            class="chat-icon-button"
            @click.stop="openPublicChat"
            title="公聊"
            aria-label="切换到公聊"
          >
            <font-awesome-icon icon="users" />
          </button>
          <button
            v-if="isInGroup && !isChatMin && !isShowGroup"
            type="button"
            class="chat-icon-button"
            aria-label="显示私聊成员"
            @click.stop="toggleGroups()"
          >
            <font-awesome-icon icon="arrow-circle-up" />
          </button>
          <button
            v-if="isInGroup && !isChatMin && isShowGroup"
            type="button"
            class="chat-icon-button"
            aria-label="收起私聊成员"
            @click.stop="toggleGroups()"
          >
            <font-awesome-icon icon="arrow-circle-down" />
          </button>
          <button
            type="button"
            class="chat-icon-button"
            :aria-label="isChatMin ? '展开聊天' : '收起聊天'"
            @click.stop="toggleChat()"
          >
            <font-awesome-icon :icon="isChatMin ? 'plus' : 'minus'" />
          </button>
        </div>
        <nav v-if="!isChatMin && isApiRoom" class="chat-channel-tabs" aria-label="聊天频道">
          <button type="button" :class="{ active: apiChatChannel === 'public' }" @click.stop="openPublicChat"><font-awesome-icon icon="users" /><span>公聊</span></button>
          <button type="button" :class="{ active: apiChatChannel === 'dm_chat' }" @click.stop="openStorytellerChat"><font-awesome-icon icon="crown" /><span>{{ gameStore.currentIsDm ? '玩家私聊' : '说书人' }}</span></button>
          <button v-if="!gameStore.currentIsDm" type="button" :class="{ active: apiChatChannel === 'whisper' }" @click.stop="openWhisperChat"><font-awesome-icon icon="envelope" /><span>邻座</span></button>
          <button type="button" :class="{ active: apiChatChannel === 'system' }" @click.stop="openSystemChat"><font-awesome-icon icon="bell" /><span>系统</span></button>
        </nav>
      </header>
      <div v-if="isApiRoom && chatConversationsOpen" id="text-conversations" class="chat-conversation-list" aria-label="文字会话">
        <p v-if="!visibleTextConversations.length">{{ chatConversationFilter === 'whisper' ? '暂无可私聊的邻座玩家' : '暂无可联系的玩家' }}</p>
        <button v-for="conversation in visibleTextConversations" :key="conversation.key" type="button"
          :data-channel="conversation.channel" :data-target-user-id="conversation.targetUserId"
          :class="{ active: apiChatConversationKey === conversation.key }"
          @click="selectTextConversation(conversation)">
          <font-awesome-icon icon="envelope" />
          <span><strong>{{ conversation.name }}</strong><small>{{ conversation.hint }}</small></span>
          <small v-if="conversation.unread" class="chat-unread-badge">{{ conversation.unread }}</small>
        </button>
      </div>
      <div ref="chatContent" class="content" @scroll="checkToBottom">
        <ul v-if="isApiRoom" class="public-chat-list" aria-live="polite">
          <li v-if="apiChatLoading" class="public-chat-empty" role="status">
            <font-awesome-icon :icon="['fas', 'spinner']" spin aria-hidden="true" />
            <strong>正在加载会话…</strong>
          </li>
          <li v-else-if="apiChatMessages.length === 0" class="public-chat-empty">
            <font-awesome-icon :icon="['fas', 'feather-pointed']" aria-hidden="true" />
            <strong>{{ apiChatEmptyTitle }}</strong>
            <span>{{ apiChatEmptyHint }}</span>
          </li>
          <li
            v-for="chatMessage in apiChatMessages"
            :key="chatMessage.messageId"
            class="public-chat-message"
            :class="{
              'public-chat-message--self': chatMessage.senderUserId === session.playerId,
              'public-chat-message--dm': chatMessage.isDM,
            }"
          >
            <div class="public-chat-message__meta">
              <strong>{{ publicMessageSender(chatMessage) }}</strong>
              <time :datetime="new Date(chatMessage.timestamp).toISOString()">
                {{ formatPublicMessageTime(chatMessage.timestamp) }}
              </time>
            </div>
            <p>{{ publicMessageText(chatMessage) }}</p>
          </li>
        </ul>
        <template v-else>
          <div
            v-for="(player, index) in session.chatHistory"
            :key="index"
            v-show="
              (session.isSpectator && player.id === session.stId) ||
              (!session.isSpectator &&
                (player.id === chattingPlayer ||
                  (chattingPlayer === 'public' && player.id === session.playerId)))
            "
          >
            <ul v-for="(content, chatIndex) in player.chat" :key="chatIndex">
              {{ content }}
            </ul>
          </div>
        </template>
      </div>
      <form class="chatbox" :class="{ 'chatbox--addressed': isApiRoom }" @submit.prevent="sendChat">
        <label class="sr-only" for="message">输入房间消息</label>
        <font-awesome-icon v-if="isApiRoom" class="chat-recipient-icon" :icon="apiChatChannel === 'public' ? 'users' : 'envelope'" aria-hidden="true" />
        <input
          id="message"
          ref="message"
          v-model="message"
          type="text"
          maxlength="500"
          autocomplete="off"
          class="edit"
          :placeholder="isApiRoom ? apiChatPlaceholder : '输入消息…'"
          :disabled="chatSending || !canSendChat"
          :aria-describedby="chatError ? 'room-chat-error' : undefined"
          @focus="typing"
          @blur="notTyping"
        />
        <button
          type="submit"
          class="send"
          aria-label="发送"
          :disabled="chatSending || !canSendChat || !message.trim()"
        >
          <font-awesome-icon
            :icon="['fas', chatSending ? 'spinner' : 'paper-plane']"
            :spin="chatSending"
            aria-hidden="true"
          />
          <span>{{ chatSending ? "发送中" : "发送" }}</span>
        </button>
        <p v-if="chatError" id="room-chat-error" class="chat-error" role="alert">
          {{ chatError }}
        </p>
      </form>
    </section>
    </EdgePanel>
  </div>
</template>

<script>
import StorytellerStage from './StorytellerStage.vue';
import GrimoireRevealToken from './GrimoireRevealToken.vue';
import DemoNightMessageModal from './modals/DemoNightMessageModal.vue';
import { BULK_REVEAL_INTERVAL_MS, useStoryteller } from '@/composables/useStoryteller';
import { useDemoStore } from '@/stores/demo';
import { useAppStore } from "@/stores/app";
import { useSeatEditorStore } from "@/stores/seatEditor";
import SeatEditor from "./SeatEditor.vue";
import SeatEditLabel from "./SeatEditLabel.vue";
import ReminderToken from "./ReminderToken.vue";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import { useGameStore } from "@/stores/game";
import { useGameScriptStore, RoleIdDataMap } from "@/stores/gameScript";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useTableNominationStore } from "@/stores/tableNomination";
import { resolveNominationPresentation } from "@/utils/nominationPresentation";
import { emptyVoteSeat, voteParticipantId } from "@/utils/voteParticipant";
import { useNightPlayerSelectionStore } from "@/stores/nightPlayerSelection";
import { useNightOrderRoles } from "@/composables/useNightOrderRoles";
import { useRoomChatStore } from "@/stores/roomChat";
import { useGameController } from "@/controllers/GameController";
import { requestInputModal } from "@/services/inputModalService";
import {
  DEFAULT_SCRIPT_ACCENT,
  deriveAccentTheme,
  extractAccentFromImage,
  lookupScriptAccent,
} from "@/utils/scriptAccent";
import { SocketClientEvent } from "@/types/socket";
import RoleTokenMenu from "./RoleTokenMenu.vue";
import DeathShroud from "./DeathShroud.vue";
import NightMessageModal from "./modals/NightMessageModal.vue";
import NightWakeMarker from "./NightWakeMarker.vue";
import { renderMessageContent } from "@/utils/nightMessages";
import StorytellerProfile from "./StorytellerProfile.vue";
import VoiceSpeakingRing from "./VoiceSpeakingRing.vue";
import HandSignal from "./HandSignal.vue";
import { useUserStore } from "@/stores/user";
import NominationConfirmCard from "./NominationConfirmCard.vue";
import TableNominationControls from "./TableNominationControls.vue";
import NominationSurface from "./NominationSurface.vue";
import ClockDial from "./ClockDial.vue";
import PlayerNotesModal from "./PlayerNotesModal.vue";
import Token from "./Token";
import { roleTooltip } from '@/directives/roleTooltip';
import RoleIcon from "./RoleIcon";
import ReminderPickerModal from "./modals/ReminderPickerModal.vue";
import RoleModal from "./modals/RoleModal";
import { usePlayerViewStore } from "@/stores/playerView";
import { useVoiceController } from "@/controllers/VoiceController";
import VoiceSidebar from "./VoiceSidebar.vue";
import VoiceConversation from "./VoiceConversation.vue";
import VoiceRoomModal from "./modals/VoiceRoomModal.vue";
import EdgePanel from "./EdgePanel.vue";
import RightReferencePanel from "./RightReferencePanel.vue";
import NightReferenceContent from "./NightReferenceContent.vue";
import defaultSeatAvatar from "../assets/storyteller-Ch-i0CP4.png";
import { preferredProfileAvatar, resolveProfileAvatar } from "@/utils/profileAvatars";
import chairTop from "../assets/unclaimed_t-CahYlXC9.png";
import chairBottom from "../assets/unclaimed_b-CC0R9WaI.png";
import chairLeft from "../assets/unclaimed_l-hWKvo_dJ.png";
import chairTopLeft from "../assets/unclaimed_tl-BSLM4A-g.png";
import chairBottomLeft from "../assets/unclaimed_bl-mgAGO0Qs.png";
import scriptLogoTb from "../assets/editions/tb.png";
import scriptLogoBmr from "../assets/editions/bmr.jpg";
import scriptLogoSnv from "../assets/editions/snv.png";
import scriptLogoHdcs from "../assets/editions/hdcs.png";
import scriptLogoSyyl from "../assets/editions/syyl.png";

const referenceRoleIdsByName = new Map(Object.values(RoleIdDataMap).map((role) => [role.name, role.id]));

export default {
  directives: { roleTooltip },
  components: { StorytellerStage, GrimoireRevealToken, DemoNightMessageModal,
    SeatEditor,
    SeatEditLabel,
    ReminderToken,
    RoleTokenMenu,
    DeathShroud,
    NightMessageModal,
    NightWakeMarker,
    StorytellerProfile,
    VoiceSpeakingRing,
    HandSignal,
    NominationConfirmCard,
    TableNominationControls,
    NominationSurface,
    ClockDial,
    PlayerNotesModal,
    Token,
    RoleIcon,
    RoleModal,
    ReminderPickerModal,
    VoiceRoomModal,
    VoiceSidebar,
    VoiceConversation,
    EdgePanel,
    RightReferencePanel,
    NightReferenceContent,
  },
  setup() {
    // The sidebar and the 阶段与夜间顺序 modal read the wake order from the same
    // composable, so the two can never number a role differently.
    const {
      nightOrderSections,
      canEditWakeMarkers,
      handleWakeMarkerToggle,
    } = useNightOrderRoles();
    return {
      storyteller: useStoryteller(),
      nightOrderSections,
      canEditWakeMarkers,
      handleWakeMarkerToggle,
    };
  },
  computed: {
    demoStore() { return useDemoStore(); },
    roundLevel() { return this.demoStore?.active ? this.demoStore.level : this.gameStore.level; },
    stagedReveal() { return this.demoStore?.active ? this.demoStore.grimoireReveal : this.gameStore.grimoireReveal; },
    showStorytellerStage() { return this.isApiRoom || this.demoStore?.active; },
    showStageCenter() {
      const timer = this.demoStore?.active ? this.demoStore.roomTimer : this.gameStore.roomTimer;
      return this.showStorytellerStage && (this.stagedReveal || (timer && timer.status !== 'stopped') || (this.isStoryteller && (this.grimoire.showTutorial || (this.gameStore.level === 'prepare' && !this.players.length))));
    },
    seatEditor() {
      return useSeatEditorStore();
    },
    grimoire() {
      return useAppStore().grimoire;
    },
    roles() {
      return useAppStore().roles;
    },
    session() {
      return useSessionStore().$state;
    },
    gameController() {
      return useGameController();
    },
    gameStore() {
      return useGameStore();
    },
    gameScriptStore() {
      return useGameScriptStore();
    },
    realtimeVoteStore() {
      return useRealtimeVoteStore();
    },
    tableNomination() {
      return useTableNominationStore();
    },
    privateVotingActive() {
      return Boolean((this.realtimeVoteStore.privateVote && this.realtimeVoteStore.isActive && this.realtimeVoteStore.stage !== 'ready')
        || (this.manualNominationOpen && this.tableNomination.privateVote
          && ['countdown', 'voting', 'paused'].includes(this.tableNomination.phase)));
    },
    nightPlayerSelection() {
      return useNightPlayerSelectionStore();
    },
    canManualNominate() {
      return Boolean((!this.demoStore?.active || this.demoStore.level === "day") && !this.isApiRoom && this.canManageActionSeat && !this.seatEditor.open
        && !this.realtimeVoteStore.isActive
        && !this.grimoire.isNight && !this.session.nomination && this.players.length > 1);
    },
    votePresentation() {
      return resolveNominationPresentation({
        isApiRoom: this.isApiRoom,
        manualOpen: this.tableNomination.open,
        legacyOpen: Boolean(this.session.nomination),
        onlineVisible: this.realtimeVoteStore.isVisible && this.realtimeVoteStore.phase !== 'idle',
        onlineActive: this.realtimeVoteStore.isActive,
        draftActive: Boolean(this.nominationStage),
      });
    },
    onlineNominationOpen() {
      return this.votePresentation === 'online';
    },
    manualNominationOpen() {
      return this.votePresentation === 'manual';
    },
    roomChatStore() {
      return useRoomChatStore();
    },
    isApiRoom() {
      return Boolean(this.session.sessionId && this.session.gameServerId);
    },
    isApiPublicChat() {
      return this.isApiRoom && this.apiChatChannel === "public";
    },
    apiChatScope() {
      return JSON.stringify([this.session.sessionId, this.session.gameServerId, this.session.playerId, this.gameStore.currentIsDm]);
    },
    apiChatConversationKey() {
      return `${this.apiChatChannel}:${this.apiChatTargetUserId}`;
    },
    textConversations() {
      if (!this.isApiRoom) return [];
      const conversations = new Map();
      const add = (channel, targetUserId) => {
        if (!targetUserId) return;
        const playerIndex = this.players.findIndex(player => player.id === targetUserId);
        const player = this.players[playerIndex];
        const name = channel === 'dm_chat' && !this.gameStore.currentIsDm ? '说书人'
          : player?.name || this.gameStore.roomUsers[targetUserId]?.displayName || '已离开的玩家';
        const key = `${channel}:${targetUserId}`;
        const messages = this.roomChatStore.getMessages(channel, targetUserId);
        conversations.set(key, {
          key, channel, targetUserId, name,
          hint: channel === 'dm_chat' ? '相关玩家与全部说书人可见'
            : this.canTextChatWithSeat(playerIndex) ? '仅你与该邻座玩家可见' : '已不相邻 · 仅可查看记录',
          unread: this.roomChatStore.getTextUnreadCount(this.session.playerId, channel, targetUserId),
          lastTimestamp: messages.at(-1)?.timestamp || 0,
        });
      };
      if (this.gameStore.currentIsDm) {
        this.players.forEach((player, index) => { if (this.canTextChatWithSeat(index)) add('dm_chat', player.id); });
      } else {
        if (this.gameStore.currentPlayer) add('dm_chat', this.session.playerId);
        this.players.forEach((player, index) => { if (this.canTextChatWithSeat(index)) add('whisper', player.id); });
      }
      for (const key of Object.keys(this.roomChatStore.messagesByConversation)) {
        const separator = key.indexOf(':');
        const channel = key.slice(0, separator);
        const targetUserId = key.slice(separator + 1);
        if (channel === 'whisper' && !this.gameStore.currentIsDm) add(channel, targetUserId);
        if (channel === 'dm_chat' && (this.gameStore.currentIsDm || targetUserId === this.session.playerId)) add(channel, targetUserId);
      }
      return [...conversations.values()].sort((a, b) => b.unread - a.unread || b.lastTimestamp - a.lastTimestamp);
    },
    visibleTextConversations() {
      return this.textConversations.filter(item => !this.chatConversationFilter || item.channel === this.chatConversationFilter);
    },
    textUnreadCount() {
      return this.textConversations.reduce((count, item) => count + item.unread, 0);
    },
    storytellerTextUnread() {
      return this.roomChatStore.getTextUnreadCount(this.session.playerId, 'dm_chat', this.session.playerId);
    },
    apiChatMessages() {
      if (!this.isApiRoom) return [];
      if (this.apiChatChannel === "public") return this.session.publicMessages;
      if (this.apiChatChannel === "system") {
        return this.session.publicMessages.filter((message) => message.content?.some((item) => item.type === "gameState"));
      }
      if (!this.apiChatTargetUserId) return [];
      return this.roomChatStore.getMessages(
        this.apiChatChannel,
        this.apiChatTargetUserId,
      );
    },
    apiChatTitle() {
      if (this.apiChatChannel === "public") return "公聊";
      if (this.apiChatChannel === "system") return "系统消息";
      return this.textConversations.find(item => item.key === this.apiChatConversationKey)?.name || this.apiChatTargetName || "玩家";
    },
    apiChatAriaLabel() {
      return this.apiChatChannel === "public"
        ? "房间公聊"
        : `房间通讯：${this.apiChatTitle}`;
    },
    apiChatPlaceholder() {
      if (this.apiChatChannel === "public") return "向所有人发送…";
      if (this.apiChatChannel === "system") return "系统消息仅供查看";
      if (this.apiChatChannel === "whisper" && !this.canSendChat) return "当前已不相邻，无法发送悄悄话";
      return `向 ${this.apiChatTitle}…`;
    },
    apiChatEmptyTitle() {
      if (this.apiChatChannel === "public") return "公聊尚无消息";
      if (this.apiChatChannel === "system") return "暂无系统消息";
      if (this.apiChatChannel === "whisper") return "悄悄话尚无消息";
      return "说书人私聊尚无消息";
    },
    apiChatEmptyHint() {
      if (this.apiChatChannel === "public") {
        return "第一句发言会同步给当前房间里的玩家。";
      }
      if (this.apiChatChannel === "whisper") {
        return "该会话仅你与当前相邻玩家可见。";
      }
      if (this.apiChatChannel === "system") return "玩家入座和阶段变化会显示在这里。";
      return "该会话仅相关玩家与全部说书人可见。";
    },
    canSendChat() {
      if (this.isApiRoom) {
        if (!this.gameController.isConnected || !this.gameStore.currentPlayer) return false;
        if (this.apiChatChannel === "system") return false;
        if (this.apiChatChannel === "public") return true;
        if (this.apiChatChannel === "whisper") return this.canTextChatWithSeat(this.players.findIndex(player => player.id === this.apiChatTargetUserId));
        return Boolean(this.apiChatTargetUserId && (this.gameStore.currentIsDm || this.apiChatTargetUserId === this.session.playerId));
      }
      if (this.session.isSpectator && this.session.claimedSeat < 0) return false;
      return true;
    },
    canEditApiRoom() {
      return !this.isApiRoom || this.gameStore.currentIsDm;
    },
    canManageFabled() {
      return !this.isApiRoom
        ? !this.session.isSpectator
        : this.gameStore.currentIsDm
          && this.gameController.isConnected;
    },
    players() {
      const players = usePlayersStore().players;
      return this.isApiRoom && !this.gameStore.currentIsDm && !this.stagedReveal ? usePlayerViewStore().project(players) : players;
    },
    isVoiceConversation() {
      const voice = useVoiceController();
      return this.isApiRoom && Boolean(voice.currentActiveRoomId && voice.currentActiveRoomId !== voice.publicRoomId && voice.roomDirectory[voice.currentActiveRoomId]);
    },
    voiceCardPlayers() {
      return this.players.map((player, index) => ({ ...player, role: this.revealTokenRole({ index, player, role: player.role }) }));
    },
    voice() { return useVoiceController(); },
    reservedSeatRoles() {
      if (!this.isApiRoom || !this.gameStore.currentIsDm) return {};
      return Object.fromEntries(Object.entries(this.gameStore.seatRoles).map(([seat, role]) => [Number(seat) - 1,
        { ...(useAppStore().roles.get(role.characterId) || useAppStore().rolesJSONbyId.get(role.characterId) || { id: role.characterId }), ...(role.alignment ? { alignment: role.alignment } : {}) },
      ]));
    },
    voiceMemberIds() {
      const voice = useVoiceController();
      return new Set(voice.roomDirectory[voice.currentActiveRoomId]?.users.map(member => member.userId) || []);
    },
    bluffs() {
      if (this.isApiRoom && !this.gameStore.currentIsDm && usePlayerViewStore().rolesCleared) return [];
      return usePlayersStore().bluffs;
    },
    fabled() {
      if (this.isApiRoom && !this.gameStore.currentIsDm && usePlayerViewStore().rolesCleared) return [];
      return usePlayersStore().fabled;
    },
    apiReminderOptions() {

      const options = [];
      const seen = new Set();
      const addRoleReminders = (role, names) => {
        if (!role || !Array.isArray(names)) return;
        names.forEach((name) => {
          if (!name) return;
          const key = `${role.id || role.role || "role"}:${name}`;
          if (seen.has(key)) return;
          seen.add(key);
          options.push({
            ...role,
            role: role.id || role.role,
            name,
          });
        });
      };

      const playerList = this.players;
      this.roles.forEach((role) => {
        addRoleReminders(role, role.reminders);
        addRoleReminders(role, role.remindersGlobal);
      });

      this.fabled.forEach((role) => addRoleReminders(role, role.reminders));
      useAppStore().otherTravelers.forEach((role) => {
        if (playerList.some((player) => player.role?.id === role.id)) {
          addRoleReminders(role, role.reminders);
        }
      });

      options.push({ id: "good", role: "good", name: "善良" });
      options.push({ id: "evil", role: "evil", name: "邪恶" });
      options.push({ id: "custom", role: "custom", name: "自定义" });
      return options;
    },
    apiReminderRelatedOptions() {
      const activeIds = new Set(this.players.map((player) => player.role?.id).filter(Boolean));
      if (this.profileRole?.id) activeIds.add(this.profileRole.id);
      const options = [];
      const seen = new Set();
      const roles = [...Array.from(this.roles?.values?.() || this.roles || []), ...Array.from(useAppStore().otherTravelers.values())];
      roles.forEach((role) => {
        if (!activeIds.has(role.id) || !Array.isArray(role.reminders)) return;
        role.reminders.forEach((name) => {
          const key = `${role.id}:${name}`;
          if (seen.has(key)) return;
          seen.add(key);
          options.push({ ...role, role: role.id, name });
        });
      });
      options.push({ id: "good", role: "good", name: "善良" });
      options.push({ id: "evil", role: "evil", name: "邪恶" });
      options.push({ id: "custom", role: "custom", name: "自定义" });
      return options;
    },
    nightOrder() {
      return usePlayersStore().nightOrder;
    },
    edition() {
      return useAppStore().edition;
    },
    orientation: function () {
      const ratio = this.windowWidth / this.windowHeight;
      const unit =
        this.windowWidth > this.windowHeight
          ? "height: 100%;"
          : "height: " + ratio * 100 + "%;";
      return unit;
    },
    floatingZoom: function () {
      const ratio = this.windowWidth / this.windowHeight;
      const size = ratio > 1 ? 14 : 8;
      return "height: " + size + "vh; width: " + size + "vh;";
    },
    chatStyle: function () {
      if (this.isChatMin) return;
      const ratio = this.windowWidth / this.windowHeight;
      const width = ratio < 1 ? "300px" : "25%";
      const height =
        ratio < 1
          ? this.isInGroup && this.isShowGroup
            ? "450px"
            : "400px"
          : this.isInGroup && this.isShowGroup
          ? "calc(40% + 10vh)"
          : "40%";
      return `width: ${width}; height: ${height};`;
    },
    groupStyle: function () {
      const ratio = this.windowWidth / this.windowHeight;
      const height = ratio < 1 ? "50px" : "10vh";
      return `height: ${height};`;
    },
    isInGroup: function () {
      if (this.session.isSpectator)
        return this.session.groupChats.length > 0 ? true : false;
      return this.chattingGroup != "";
    },
    inGroupPlayers: function () {
      const group = this.session.isSpectator
        ? this.session.groupChats
        : this.session.groupChats.filter(
            (group) => group.id === this.chattingGroup,
          );
      if (group.length === 0) return [];

      const players = [];
      group[0].players.forEach((player) => {
        const index = this.players.findIndex(
          (player2) => player2.id === player.id,
        );
        if (index === -1) return;
        players.push({
          id: player.id,
          name: player.name,
          index,
        });
      });
      return players;
    },
    isRole: function () {
      const activeRoles = [];
      for (const roleId in this.session.isRole) {
        const roleObject = this.session.isRole[roleId];
        if (roleObject.active === true) {
          activeRoles.push(roleId);
        }
      }
      if (activeRoles.length > 1) {
        return activeRoles.slice(0, 1);
      }
      return activeRoles;
    },
    currentPlayer() {
      if (this.session.claimedSeat < 0) return null;
      return this.players[this.session.claimedSeat] || null;
    },
    isStoryteller() {
      return this.isApiRoom ? this.gameStore.currentIsDm : !this.session.isSpectator;
    },
    isPersonalGrimoire() {
      return this.isApiRoom && !this.gameStore.currentIsDm && !this.stagedReveal;
    },
    canAnnotateGrimoire() {
      return this.canManageActionSeat || this.isPersonalGrimoire;
    },
    publicStorytellers() {
      const users = useUserStore();
      return Object.keys(this.gameStore.dms).map(userId => ({
        userId,
        name: this.gameStore.roomUsers[userId]?.displayName || users.getUserById(userId)?.displayName || '说书人',
        avatar: users.getUserById(userId)?.avatarUrl || defaultSeatAvatar,
      }));
    },
    otherStorytellers() {
      return this.publicStorytellers.filter(storyteller => !this.isStoryteller
        || storyteller.userId !== this.gameStore.currentPlayer?.userId);
    },
    profileAvatarUrl() {
      const image = preferredProfileAvatar(useUserStore().userId,
        (this.currentPlayer && this.currentPlayer.image) ||
        this.session.playerAvatar);
      if (!image || image === "default.webp") return "";
      return resolveProfileAvatar(image);
    },
    raisedStorytellers() {
      if (this.isApiRoom) return [];
      return Object.entries(this.gameStore.handSignals).filter(([userId]) => !this.isPersonalGrimoire && this.gameStore.dms[userId]
        && (!this.isStoryteller || userId !== this.gameStore.currentPlayer?.userId)
        && !this.players.some(player => player.id === userId)).map(([userId, icon]) => ({
        userId, icon, name: this.gameStore.roomUsers[userId]?.displayName || '说书人',
        avatar: useUserStore().getUserById(userId)?.avatarUrl || defaultSeatAvatar,
      }));
    },
    profileName() {
      if (!this.session.isSpectator) return this.session.playerName || "说书人";
      if (this.currentPlayer && this.currentPlayer.name) {
        return this.currentPlayer.name;
      }
      return this.session.playerName || "未入座玩家";
    },
    profileSeatLabel() {
      if (!this.session.isSpectator) return "说书人视角";
      if (this.session.claimedSeat >= 0) {
        return `玩家席位 ${this.session.claimedSeat + 1}`;
      }
      return "旁观者";
    },
    // Death was previously only visible as the seat's shroud out on the table —
    // easy to miss about *yourself*. The nameplate states it, plus the one fact
    // a dead player must track: whether the ghost vote is still in hand.
    profileLifeState() {
      const player = this.currentPlayer;
      if (!player || !player.isDead) return "";
      return player.isVoteless ? "已死亡 · 鬼票已用" : "已死亡 · 保留一张鬼票";
    },
    profileRole() {
      if (this.isApiRoom && this.isStoryteller) return this.gameStore.currentPlayer?.privateExtras?.storytellerRole || null;
      if (!this.session.isSpectator) return this.storytellerRole;
      return this.currentPlayer?.role?.id ? this.currentPlayer.role : null;
    },
    profileReminderRoles() {
      if (this.isStoryteller) {
        return this.isApiRoom
          ? (this.gameStore.currentPlayer?.marks || []).map((name) => this.reminderVisual(name))
          : this.storytellerReminders;
      }
      return (this.currentPlayer?.reminders || [])
        .map((item) => typeof item === "string" ? { id: item, role: item, name: item } : item)
        .filter((item) => item?.name)
        .slice(0, 3);
    },
    sessionCode() {
      return this.session.sessionId
        ? `房间 ${this.session.sessionId}`
        : "本地房间";
    },
    roomCode() {
      return this.session.sessionId || "本地";
    },
    aliveCount() {
      return this.players.filter((player) => !player.isDead).length;
    },
    occupiedCount() {
      return this.players.filter((player) => !!player.id).length;
    },
    roleConfiguredCount() {
      return this.players.filter((player) => player.role && player.role.id)
        .length;
    },
    phaseLabel() {
      if (this.demoStore?.active) return this.demoStore.level === "prepare" ? "准备首夜" : this.demoStore.level === "end" ? "终局揭晓" : `第 ${this.demoStore.levelDays} ${this.demoStore.level === "night" ? "夜" : "天"}`;
      if (this.isApiRoom && this.gameStore.level === "end") return "终局盘点";
      if (this.isApiRoom && this.gameStore.level === "prepare") return "等待开局";
      if (this.isApiRoom && this.gameStore.level === "night") {
        return `第 ${Math.max(1, this.gameStore.levelDays)} 夜`;
      }
      if (this.grimoire.isNight) return "夜晚阶段";
      if (this.isApiRoom && this.nominationStage) return "建立提名";
      if (this.isApiRoom && this.realtimeVoteStore.isComplete) return "裁定完成";
      if (this.isApiRoom && this.realtimeVoteStore.isActive) return "实时投票";
      if (this.session.nomination) return "提名投票";
      if (this.isApiRoom && this.gameStore.level === "day") {
        return `第 ${Math.max(1, this.gameStore.levelDays)} 天`;
      }
      return "白天讨论";
    },
    nominationLabel() {
      if (this.isApiRoom) {
        if (this.nominationStage) return "点击席位选择提名者与被提名者后确认公开投票";
        if (this.realtimeVoteStore.phase !== "idle") {
          const nomineeIndex = (this.seatNumberForUserId(this.realtimeVoteStore.nomineeUserId) || 0) - 1;
          const nominee = this.players[nomineeIndex];
          return `${this.playerDisplayName(nominee, nomineeIndex)} · ${
            this.realtimeVoteStore.isComplete ? "结果已生成" : "裁定进行中"
          }`;
        }
        return this.grimoire.isNight ? "等待夜晚行动" : "自由讨论中";
      }
      if (!this.session.nomination) {
        return this.grimoire.isNight ? "等待夜晚行动" : "自由讨论中";
      }
      const [from, to] = this.session.nomination;
      const nominator = this.players[from];
      const nominee = this.players[to];
      return `${this.playerDisplayName(nominator, from)} 提名 ${this.playerDisplayName(
        nominee,
        to,
      )}`;
    },
    roleSummary() {
      const teams = [
        ["townsfolk", "镇民"],
        ["outsider", "外来者"],
        ["minion", "爪牙"],
        ["demon", "恶魔"],
        ["traveler", "旅行者"],
      ];
      return teams.map(([team, label]) => ({
        team,
        label,
        count: this.players.filter(
          (player) => player.role && player.role.team === team,
        ).length,
      }));
    },
    visibleRoleList() {
      return this.players
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => player.role && player.role.id)
        .map(({ player, index }) => ({
          key: `${player.role.id}-${index}`,
          name: player.role.name || player.role.id,
          team: player.role.team || "unknown",
          teamLabel: `${index + 1}. ${this.playerDisplayName(player, index)}`,
        }));
    },
    nightPreview() {
      const phaseKey = this.grimoire.isNight ? "other" : "first";
      return this.players
        .map((player, index) => {
          const order = this.nightOrder.get(player);
          const role = player.role || {};
          return {
            key: `${role.id || "seat"}-${index}`,
            order: order ? order[phaseKey] : 0,
            name: role.name || "未分配",
            player: this.playerDisplayName(player, index),
          };
        })
        .filter((item) => item.order > 0)
        .sort((a, b) => a.order - b.order)
        .slice(0, 8);
    },
    recentVoteHistory() {
      return this.session.voteHistory
        .slice(-6)
        .reverse()
        .map((vote, index) => ({
          key: `${vote.nominator}-${vote.nominee}-${index}`,
          title: `${vote.nominator || "提名者"} → ${vote.nominee || "被提名者"}`,
          subtitle: `${this.formatVoteTime(vote.timestamp)} · ${
            vote.votes || 0
          }/${vote.majority || 0} 票`,
        }));
    },
    formattedTimer() {
      const total = Math.max(0, Math.ceil(Number(this.session.timer) || 0));
      const minutes = Math.floor(total / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (total % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
    },
    canNominate() {
      if (this.demoStore?.active && this.demoStore.level !== "day") return false;
      if (this.isApiRoom) {
        return Boolean(
          this.gameStore.currentIsDm &&
          ["prepare", "day"].includes(this.gameStore.level) &&
          this.gameController.isConnected &&
          !this.realtimeVoteStore.isActive &&
          !this.realtimeVoteStore.dayNominationState?.finalized &&
          this.hasEligibleNominator &&
          this.hasEligibleNominee,
        );
      }
      return (
        !this.session.isSpectator &&
        !this.session.nomination &&
        this.players.length > 1
      );
    },
    actionPlayer() {
      if (this.actionSeatIndex < 0) return null;
      return this.players[this.actionSeatIndex] || null;
    },
    actionTokenRole() {
      return (this.isApiRoom && !this.isPersonalGrimoire && !this.actionPlayer?.id
        ? this.reservedSeatRoles?.[this.actionSeatIndex] || this.emptySeatRoles[this.actionSeatIndex]
        : this.actionPlayer?.role) || {};
    },
    canChangeTokenAlignment() {
      return Boolean((this.canManageActionSeat || this.isPersonalGrimoire) && this.actionTokenRole.id &&
        (this.isPersonalGrimoire || !this.isApiRoom || this.gameController.isConnected));
    },
    canWakeTokenSeat() {
      return this.canManageActionSeat && (this.isApiRoom ? this.gameStore.level === 'night' : this.grimoire.isNight);
    },
    canManageSeatLife() {
      return this.canManageActionSeat && !this.seatEditor.open && !this.nightPlayerSelection.active
        && !this.manualNominationOpen && !this.realtimeVoteStore.isActive && this.votePresentation !== 'legacy'
        && !this.nominationStage && this.swap < 0
        && (this.isApiRoom ? this.gameStore.level === 'day' && this.gameController.isConnected : !this.grimoire.isNight);
    },
    canSelfNominateActionSeat() {
      if (this.canManualNominate) return Boolean(this.actionPlayer && !this.tableNomination.open);
      if (!this.isApiRoom) return this.canNominate && Boolean(this.actionPlayer);
      return this.canStartVoteForActionSeat;
    },
    canNominateFromToken() {
      if (this.actionSeatMode !== 'token' || this.actionSeatIndex < 0 || this.swap >= 0
        || this.seatEditor.open || this.seatActionPending || this.nominationStage
        || this.manualNominationOpen || !this.canManageActionSeat
        || !this.actionPlayer) return false;
      if (this.canManualNominate) return true;
      if (!this.isApiRoom) return this.canNominate;
      return Boolean(this.actionPlayer && ['prepare', 'day'].includes(this.gameStore.level)
        && this.gameController.isConnected && !this.realtimeVoteStore.isActive
        && !this.realtimeVoteStore.dayNominationState?.finalized
        && this.hasEligibleNominee);
    },
    actionRoleName() {
      return (
        (this.actionPlayer && this.actionPlayer.role && (
          this.actionPlayer.role.name || this.actionPlayer.role.id
        )) || ""
      );
    },
    actionRoleAbility() {
      // Only roles this client is entitled to know ever reach the store, so
      // passing it through is permission-safe by construction.
      return (this.actionPlayer && this.actionPlayer.role && this.actionPlayer.role.ability) || "";
    },
    canManageActionSeat() {
      if (this.stagedReveal) return false;
      return this.isApiRoom
        ? Boolean(this.gameStore.currentIsDm)
        : !this.session.isSpectator;
    },
    canStartVoteForActionSeat() {
      return Boolean(
        this.isApiRoom &&
        this.canManageActionSeat &&
        ["prepare", "day"].includes(this.gameStore.level) &&
        this.gameController.isConnected &&
        this.actionPlayer &&
        !this.realtimeVoteStore.dayNominationState?.finalized &&
        this.hasEligibleNominator &&
        !this.realtimeVoteStore.isActive,
      );
    },
    hasVoteSurface() {
      return this.isApiRoom
        ? this.realtimeVoteStore.phase !== "idle"
        : Boolean(this.session.nomination);
    },
    hasEligibleNominator() {
      return this.players.length > 0;
    },
    hasEligibleNominee() {
      return this.players.length > 0;
    },
    isActionSeatCurrentPlayer() {
      return Boolean(
        this.actionPlayer &&
        this.actionPlayer.id &&
        this.actionPlayer.id === this.session.playerId,
      );
    },
    canSwapActionSeat() {
      return Boolean(
        this.canManageActionSeat &&
        this.actionPlayer &&
        this.actionPlayer.id &&
        this.occupiedCount > 1 &&
        !this.session.lockedVote &&
        !this.realtimeVoteStore.isActive,
      );
    },
    canPrivateChatForActionSeat() {
      if (
        !this.isApiRoom ||
        !this.gameController.isConnected ||
        !this.actionPlayer?.id
      ) return false;
      if (this.gameStore.currentIsDm) return true;
      if (!this.gameStore.currentPlayer || this.session.claimedSeat < 0) return false;
      if (this.actionPlayer.id === this.session.playerId) return true;

      const seatCount = this.players.length;
      const previousSeat = (this.session.claimedSeat - 1 + seatCount) % seatCount;
      const nextSeat = (this.session.claimedSeat + 1) % seatCount;
      return this.actionSeatIndex === previousSeat || this.actionSeatIndex === nextSeat;
    },
    privateChatActionLabel() {
      if (this.gameStore.currentIsDm) return "与该玩家私聊";
      if (this.isActionSeatCurrentPlayer) return "联系说书人";
      return "发送悄悄话";
    },
    privateChatActionHint() {
      if (!this.gameController.isConnected) return "恢复连接后可使用";
      if (this.canPrivateChatForActionSeat) {
        return this.gameStore.currentIsDm || this.isActionSeatCurrentPlayer
          ? "仅相关玩家与说书人可见"
          : "仅你与相邻玩家可见";
      }
      return "玩家只能向相邻座位发送悄悄话";
    },
    seatOperationPrompt() {
      if (this.nominationStage === "nominee") {
        return "建立提名：请点击席位选择被提名者。";
      }
      if (this.nominationStage === "nominator") {
        return "已选定被提名者，请点击席位选择提名者（点击本人即自提名）。";
      }
      if (this.nominationStage === "confirm") {
        return "核对信息后确认，房间内所有人将同步看到本轮提名。";
      }
      if (this.swap < 0) return "";
      const player = this.players[this.swap];
      return `已选择第 ${this.swap + 1} 席${
        player && player.name ? `（${player.name}）` : ""
      }，请选择另一位已入座玩家交换座位。`;
    },
    scriptName() {
      if (this.isApiRoom) {
        return this.gameScriptStore.title || "尚未选择剧本";
      }
      return (this.edition && this.edition.name) || "剧本";
    },
    scriptReferenceTitle() {
      const author = this.isApiRoom ? this.gameScriptStore.author : this.edition?.author;
      return author ? `${this.scriptName} BY ${author}` : this.scriptName;
    },
    scriptLogoUrl() {
      if (this.gameScriptStore.logoUrl) return this.gameScriptStore.logoUrl;
      const id = this.isApiRoom ? this.gameScriptStore.currentGameScriptId : this.edition?.id;
      return ({ tb: scriptLogoTb, bmr: scriptLogoBmr, snv: scriptLogoSnv, hdcs: scriptLogoHdcs, syyl: scriptLogoSyyl }[id] || "");
    },
    grimoireStyleVars() {
      return {
        "--ts-avatar-scale": String((this.grimoire.avatarScale || 100) / 100),
        "--ts-token-scale": String((this.grimoire.tokenScale || 100) / 100),
        "--ts-reminder-scale": String((this.grimoire.reminderScale || 100) / 100),
        "--ts-grimoire-offset": `${this.grimoire.grimoireOffset || 0}%`,
      };
    },
    scriptRoleGroups() {
      const roles = this.isApiRoom
        ? this.gameScriptStore.characters
        : Array.from(this.roles?.values?.() || this.roles || []);
      const labels = { townsfolk: "镇民", outsider: "外来者", minion: "爪牙", demon: "恶魔", traveler: "旅行者" };
      return ["townsfolk", "outsider", "minion", "demon", "traveler"]
        .map((key) => ({ key, label: labels[key], roles: roles.filter((role) => role.team === key) }))
        .filter((group) => group.roles.length);
    },
    /* The script's own logo decides how its name is painted. Official wordmarks
       are looked up by id/name (their images are cross-origin OSS photos, so a
       canvas read would throw and the busy artwork would sample to mud anyway);
       custom scripts with a CORS-clean logo get sampled at runtime into
       `sampledLogoAccent`. Crimson remains the fallback. */
    scriptAccent() {
      const editionId = this.edition && this.edition.id;
      return (
        lookupScriptAccent({
          id: this.isApiRoom ? null : editionId,
          name: this.scriptName,
        }) ||
        this.sampledLogoAccent ||
        DEFAULT_SCRIPT_ACCENT
      );
    },
    /* Exposed as custom properties so the SCSS keeps owning the typography and
       only the hue travels from JS. Both the centre emblem and the side card
       read these, which is what keeps the two in the visual parity earlier
       rounds established. */
    scriptAccentVars() {
      const theme = deriveAccentTheme(this.scriptAccent);
      return {
        "--ts-script-accent": theme.base,
        "--ts-script-accent-night": theme.night,
        "--ts-script-accent-glow": theme.glow,
        "--ts-script-accent-night-glow": theme.nightGlow,
      };
    },
    /* ------------------------------------------------------------------------
     * The clock hands at the centre of the table.
     *
     * Everything below is derived from the realtimeVote store — nothing here
     * writes to it. The store is the authority on whose turn it is; the dial is
     * only a reading of that authority.
     * ---------------------------------------------------------------------- */

    /** Total seats on the ring, which is what the hand angles divide by. */
    dialSeatCount() {
      return Math.max(this.players.length || 0, 1);
    },

    dialMinuteSeat() {
      return !this.nominationStage && this.realtimeVoteStore.isActive
        && this.realtimeVoteStore.currentVoterSeat != null
        ? this.realtimeVoteStore.currentVoterSeat : this.dialNominatorSeat;
    },

    /** Long hand — whoever opened the nomination. While a local draft is in
     *  progress the hand previews the storyteller's picks before anything is
     *  broadcast; otherwise the store stays the single authority. */
    dialNominatorSeat() {
      if (this.nominationStage) {
        return this.nominationNominatorIndex >= 0 ? this.nominationNominatorIndex + 1 : null;
      }
      return this.seatNumberForUserId(this.realtimeVoteStore.initiatorUserId);
    },

    /** Short hand — whoever is on the block (or locally drafted to be). */
    dialNomineeSeat() {
      if (this.nominationStage) {
        return this.nominationNomineeIndex >= 0 ? this.nominationNomineeIndex + 1 : null;
      }
      return this.seatNumberForUserId(this.realtimeVoteStore.nomineeUserId);
    },

    /** Nothing to point at: the dial fades back into table furniture. */
    dialIdle() {
      return this.realtimeVoteStore.phase === "idle" && !this.nominationStage;
    },

    /* ----------------------------------------------------------------------
     * The in-table nomination draft (storyteller-local until confirmed).
     * ---------------------------------------------------------------------- */

    /** Seat-targeting visuals and click routing follow the whole draft. */
    apiNominationTargeting() {
      return this.isApiRoom && Boolean(this.nominationStage);
    },

    nominationDraftNominatorName() {
      if (this.nominationNominatorIndex < 0) return "";
      return this.playerDisplayName(
        this.players[this.nominationNominatorIndex],
        this.nominationNominatorIndex,
      );
    },

    nominationDraftNomineeName() {
      if (this.nominationNomineeIndex < 0) return "";
      return this.playerDisplayName(
        this.players[this.nominationNomineeIndex],
        this.nominationNomineeIndex,
      );
    },

    tableSeats() {
      const total = Math.max(this.players.length || 0, 1);
      return this.players.map((player, index) => {
        const angle = -90 + (360 / total) * index;
        const radian = (angle * Math.PI) / 180;
        const seatSize = total > 12 ? 13.2 : 16.4;
        const horizontal = Math.cos(radian);
        const vertical = Math.sin(radian);
        const anchor =
          Math.abs(horizontal) > Math.abs(vertical)
            ? horizontal > 0
              ? "seat-east"
              : "seat-west"
            : vertical > 0
            ? "seat-south"
            : "seat-north";
        const hasPlayer = !!player.id;
        const emptySeatLocked = false;
        const avatarUrl = this.playerAvatarUrl(player);
        const seatAvatarUrl = hasPlayer ? avatarUrl || defaultSeatAvatar : "";
        const chair = this.getChairForAngle(angle);
        return {
          key: player.id || this.seatEditor?.seatKeys[index] || `seat-${index}`,
          index,
          player,
          angle,
          anchor,
          hasPlayer,
          chairImage: chair.img,
          chairFlip: chair.flip,
          nameAnchor: vertical > 0.25 ? "name-outside-south" : "name-outside-north",
          displayName: this.playerDisplayName(player, index),
          avatarUrl: seatAvatarUrl,
          avatarBackground: seatAvatarUrl
            ? `url(${seatAvatarUrl})`
            : "linear-gradient(135deg, #1a1820 0%, #3f3550 45%, #c3a767 46%, #1b1721 100%)",
          nameLine: hasPlayer ? this.playerDisplayName(player, index) : "",
          actionLabel: hasPlayer
            ? player.pronouns || ""
            : emptySeatLocked
            ? "游戏已开始"
            : "点击坐下",
          emptySeatLocked,
          role: this.demoStore?.active || this.isPersonalGrimoire || player.id
            ? this.displayRoleForPlayer(player, index)
            : (this.reservedSeatRoles?.[index] || this.emptySeatRoles?.[index] || this.displayRoleForPlayer(player, index)),
          reminders: (this.isApiRoom && !this.isPersonalGrimoire && !player.id ? this.emptySeatReminders?.[index] || [] : player.reminders || [])
              .map((reminder) => typeof reminder === "string" ? reminder : reminder?.name)
              .filter(Boolean),
          nightOrderNumber: (() => {
            const role = this.displayRoleForPlayer(player, index);
            const sections = (this.nightOrderSections || []).filter(section => section.key === (this.gameStore?.levelDays <= 1 ? 'first' : 'other'));
            const order = sections[0]?.roles?.findIndex(entry => entry.id === role.id) ?? -1;
            return order >= 0 ? order + 1 : 0;
          })(),
          style: {
            ...this.tablePositionStyle(angle, 39.5, seatSize),
            width: 'var(--table-seat-size)',
            // Outside labels overlap the next seat toward the top/bottom of
            // the ring. Paint seats near the middle above those neighbours.
            '--seat-layer': Math.round((1 - Math.abs(vertical)) * 9),
          },
          tokenStyle: {
            "--token-x": `${-horizontal * 78}%`,
            "--token-y": `${-vertical * 78}%`,
            "--reminder-x": `${-horizontal * 78}%`,
            "--reminder-y": `${-vertical * 78}%`,
            "--reminder-dx": -horizontal,
            "--reminder-dy": -vertical,
          },
          reminderDx: -horizontal,
          reminderDy: -vertical,
        };
      });
    },
  },
  data() {
    return {
      selectedPlayer: 0,
      previewRevealSeat: -1, revealPressTimer: null, revealLongPress: false,
      reminderPickerSeat: -1,
      hoveredReminderSeat: -1,
      reminderActionPending: "",
      reminderPickerTab: "related",
      reminderSearch: "",
      emptySeatReminders: {},
      emptySeatRoles: {},
      actionSeatIndex: -1,
      actionSeatMode: "player",
      roleMenuAnchor: null,
      nightMessageTarget: null,
      actionSeatUserId: null,
      actionSeatAnchorX: 24,
      actionSeatAnchorY: 96,
      seatActionPending: "",
      seatActionStatus: "",
      bluffSize: 3,
      swap: -1,
      move: -1,
      nominate: -1,
      // The in-table nomination draft. Entirely local until the storyteller
      // presses 确认并开始投票 on the confirmation card — the other players see
      // nothing while the stage walks "" → nominee → nominator → confirm.
      nominationStage: "",
      privateVoteDraft: false,
      nominationNomineeIndex: -1,
      nominationNominatorIndex: -1,
      isBluffsOpen: false,
      isFabledOpen: false,
      isVoiceOpen: false,
      isChatMin: true,
      minimising: false,
      chattingPlayer: "",
      chattingGroup: "",
      isShowGroup: false,
      message: "",
      chatSending: false,
      chatError: "",
      apiChatChannel: "public",
      apiChatTargetUserId: "",
      apiChatTargetName: "",
      apiChatLoading: false,
      apiChatLoadGeneration: 0,
      chatConversationsOpen: false,
      chatConversationFilter: '',
      chatDrafts: {},
      chatLastTargets: {},
      notesTarget: null,
      profileActionsOpen: false,
      defaultSeatAvatar,
      profileRolePickerOpen: false,
      storytellerRole: null,
      storytellerReminders: [],
      storytellerPending: false,
      profileReminderPickerOpen: false,
      // Filled in asynchronously for custom scripts whose logo can be read from
      // a canvas; stays null for official scripts (table lookup wins) and for
      // cross-origin logos (extraction resolves null and crimson applies).
      sampledLogoAccent: null,
      logoSampleGeneration: 0,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  },
  watch: {
    roundLevel(next, previous) {
      if (next !== 'prepare' || previous !== 'end') return;
      this.closeSeatActions();
      this.cancelNominationDraft();
      this.endRevealPreview();
      this.previewRevealSeat = -1;
      this.revealLongPress = false;
      this.emptySeatRoles = {};
      this.emptySeatReminders = {};
      this.reminderPickerSeat = -1;
      this.swap = -1;
      this.profileRolePickerOpen = false;
      useAppStore().modals.role = false;
      useAppStore().modals.roles = false;
    },
    apiChatScope() {
      this.apiChatLoadGeneration += 1;
      this.apiChatLoading = false;
      this.apiChatChannel = 'public';
      this.apiChatTargetUserId = '';
      this.apiChatTargetName = '';
      this.chatConversationsOpen = false;
      this.chatDrafts = {};
      this.chatLastTargets = {};
      this.message = '';
      this.chatError = '';
    },
    "voice.incomingInvites.length"(count) { if (count) this.isVoiceOpen = true; },
    "voice.waitingForInvite"(waiting) { if (waiting) this.isVoiceOpen = true; },
    "voice.selectingInvitee"(selecting) {
      if (selecting) { this.isVoiceOpen = true; this.closeSeatActions(); this.reminderPickerSeat = -1; this.cancelNominationDraft(); this.swap = -1; }
    },
    nominationStage(stage) {
      if (stage === 'confirm' && this.isApiRoom && this.canManageActionSeat && !this.seatActionPending) {
        void this.confirmNominationDraft();
      }
    },
    isStoryteller(active) {
      if (!active) {
        this.profileActionsOpen = false;
        if (this.profileRolePickerOpen && useAppStore().modals.role) this.openModal('role');
        this.profileRolePickerOpen = false;
        this.profileReminderPickerOpen = false;
      }
    },
    "seatEditor.layoutChange"({ order }) {
      const roles = this.emptySeatRoles;
      const reminders = this.emptySeatReminders;
      this.emptySeatRoles = Object.fromEntries(order.map((oldIndex, index) => [index, oldIndex === null ? undefined : roles[oldIndex]]));
      this.emptySeatReminders = Object.fromEntries(order.map((oldIndex, index) => [index, oldIndex === null ? undefined : reminders[oldIndex]]));
    },
    "seatEditor.open"(open) {
      if (open) {
        this.hoveredReminderSeat = -1;
        this.tableNomination.$reset();
        this.closeSeatActions();
        this.reminderPickerSeat = -1;
        this.swap = -1;
        this.cancelNominationDraft();
      }
    },
    /* Custom scripts carry their own logo, so their accent has to be read off the
       image. `immediate` covers the script that is already applied on mount;
       the generation guard drops a slow sample whose script has since changed. */
    "gameScriptStore.logoUrl": {
      immediate: true,
      handler(logoUrl) {
        this.sampledLogoAccent = null;
        if (!logoUrl) return;
        const generation = (this.logoSampleGeneration += 1);
        void extractAccentFromImage(logoUrl).then((accent) => {
          if (generation !== this.logoSampleGeneration) return;
          this.sampledLogoAccent = accent;
        });
      },
    },
    "realtimeVoteStore.isActive"(isActive) {
      if (isActive) this.tableNomination.close();
      if (isActive && this.nominationStage) this.cancelNominationDraft();
    },
    isApiRoom() {
      this.tableNomination.$reset();
      this.cancelNominationDraft();
      this.closeSeatActions();
    },
    "gameStore.currentIsDm"(isDm) {
      if (!isDm) this.nightMessageTarget = null;
      if (!isDm) this.tableNomination.$reset();
      if (!isDm && this.nominationStage) this.cancelNominationDraft();
    },
    "gameController.isConnected"(isConnected) {
      if (!isConnected && this.nominationStage) this.cancelNominationDraft();
      if (isConnected && this.isApiRoom && this.apiChatChannel !== "public") {
        void this.loadApiChatHistory();
      }
    },
    players(nextPlayers) {
      if ((this.tableNomination.open || this.tableNomination.markedSeat >= 0) && (nextPlayers.length !== this.tableNomination.votes.length
        || (this.isApiRoom && nextPlayers.some(player => player.id)))) this.tableNomination.$reset();
      if (this.actionSeatIndex < 0) return;
      const player = nextPlayers[this.actionSeatIndex];
      const currentUserId = player && player.id ? player.id : "";
      if (
        this.actionSeatIndex >= nextPlayers.length ||
        currentUserId !== this.actionSeatUserId
      ) {
        this.closeSeatActions();
      }
    },
    "session.chatHistory": {
      handler() {
        this.$nextTick(() => {
          if (
            this.$refs.chatContent.scrollTop >= -20 &&
            this.session.isChatOpen &&
            !this.isChatMin
          ) {
            this.scrollToBottom();
          }
        });
      },
    },
    "session.publicMessages": {
      handler() {
        if (!this.session.isChatOpen || this.isChatMin) return;
        const chatContent = this.$refs.chatContent;
        const shouldStickToBottom =
          !chatContent ||
          chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight <= 48;
        if (shouldStickToBottom) {
          this.$nextTick(() => this.scrollToBottom());
        }
      },
      deep: true,
    },
    "roomChatStore.lastDelivery"(delivery) {
      this.animateWhisperDelivery(delivery);
    },
    "gameStore.level"(level) {
      this.nightMessageTarget = null;
      if (level !== 'day') this.tableNomination.$reset();
      if (level !== "day" && this.nominationStage) this.cancelNominationDraft();
    },
    "grimoire.isNight"(isNight) {
      if (isNight) this.tableNomination.$reset();
    },
    apiChatMessages: {
      handler() {
        if (!this.isApiRoom || !this.session.isChatOpen || this.isChatMin) return;
        this.markTextConversationRead();
        this.$nextTick(() => this.scrollToBottom());
      },
      deep: true,
    },
    "session.isVoteInProgress": {
      handler() {
        this.$nextTick(() => {
          if (this.session.isVoteInProgress && !this.session.lockedVote) {
            if (!this.grimoire.isMuted) {
              this.$refs.countdownAudio.currentTime = 0;
              this.$refs.countdownAudio.volume = Math.max(0, Math.min(1, this.grimoire.soundVolume / 100));
              this.$refs.countdownAudio.play();
            }
          } else {
            this.$refs.countdownAudio.pause();
            this.$refs.countdownAudio.currentTime = 0;
          }
        });
      },
    },
    "session.groupChats": {
      handler() {
        this.$nextTick(() => {
          if (this.session.isChatOpen != "" && this.session.isSpectator) {
            this.openChat(0, false);
          } else if (
            this.session.isChatOpen != "" &&
            !this.session.isSpectator
          ) {
            const index = this.players.findIndex(
              (player) => player.id === this.chattingPlayer,
            );
            if (index === -1) return;
            this.openChat(index, false);
          }
        });
      },
      deep: true,
    },
  },
  mounted() {
    window.addEventListener("ts-request-voice-chat", this.openVoiceSidebar);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keyup", this.handleSeatOperationKeyup);
  },
  beforeUnmount() {
    this.tableNomination.$reset();
    window.removeEventListener("ts-request-voice-chat", this.openVoiceSidebar);
    this.seatEditor.close();
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keyup", this.handleSeatOperationKeyup);
  },
  methods: {
    bulkRevealTurnDelay(playerIndex) {
      const revealIndex = this.storyteller.ui.bulkRevealUserIds.indexOf(this.storyteller.revealId(playerIndex));
      return revealIndex < 0 ? 0 : revealIndex * BULK_REVEAL_INTERVAL_MS;
    },
    selectVoiceInvitee(userId, event) {
      if (!this.voice.selectingInvitee) return;
      event?.preventDefault();
      event?.stopPropagation();
      void this.voice.selectInvitee(userId);
    },
    openVoiceSidebar() { this.isVoiceOpen = true; },
    toggleProfileActions() {
      this.profileActionsOpen = !this.profileActionsOpen;
    },
    profileAction(action) {
      this.profileActionsOpen = false;
      if (this.storytellerPending) return;
      const playerIndex = this.session.claimedSeat;
      if (action === "role") {
        if (this.isStoryteller) {
          this.profileRolePickerOpen = true;
          this.selectedPlayer = 0;
          this.openModal("role");
          return;
        }
        if (playerIndex >= 0) this.openRoleModal(playerIndex);
        else this.openModal("roles");
        return;
      }
      if (action === "reminder") {
        if (this.isStoryteller) {
          this.reminderSearch = "";
          this.reminderPickerTab = "related";
          this.reminderPickerSeat = -1;
          this.profileReminderPickerOpen = true;
          return;
        }
        if (playerIndex >= 0) this.openReminderModal(playerIndex);
        return;
      }
      if (action === "chat") {
        if (playerIndex >= 0) this.openPrivateChat(playerIndex);
        else this.openPublicChat();
        return;
      }
      if (action === "grimoire") this.requestGrimoireAccess();
      if (action === "remove") return this.removeStoryteller();
    },
    async removeStoryteller() {
      if (!this.isStoryteller || this.storytellerPending) return;
      this.storytellerPending = true;
      try {
        if (this.isApiRoom) {
          await this.gameController.request(SocketClientEvent.DMLeave);
          await this.gameController.refreshGameState();
        } else {
          useSessionStore().setSpectator(true);
          this.storytellerRole = null;
          this.storytellerReminders = [];
        }
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "移除说书人失败，请重试");
      } finally {
        this.storytellerPending = false;
      }
    },
    async saveStorytellerProfile(update) {
      if (!this.isStoryteller || this.storytellerPending) return false;
      this.storytellerPending = true;
      try {
        await this.gameController.updatePlayer({ userId: this.gameStore.currentPlayer.userId, ...update });
        await this.gameController.refreshGameState();
        return true;
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "更新说书人标记失败，请重试");
        return false;
      } finally {
        this.storytellerPending = false;
      }
    },
    async addStorytellerReminder(reminder) {
      if (!this.isStoryteller || this.storytellerPending) return;
      const name = await this.resolveReminderName(reminder);
      if (!name || !this.isStoryteller) return;
      if (this.profileReminderRoles.some((item) => item.name === name)) return;
      if (this.isApiRoom) {
        const saved = await this.saveStorytellerProfile({ marks: [...(this.gameStore.currentPlayer.marks || []), name] });
        if (!saved) return;
      } else this.storytellerReminders.push({ ...reminder, name });
      this.profileReminderPickerOpen = false;
    },
    async removeStorytellerReminder(name) {
      if (!this.isStoryteller || this.storytellerPending) return;
      if (this.isApiRoom) {
        await this.saveStorytellerProfile({ marks: (this.gameStore.currentPlayer.marks || []).filter((mark) => mark !== name) });
      } else this.storytellerReminders = this.storytellerReminders.filter((item) => item.name !== name);
    },
    async requestGrimoireAccess() {
      if (!this.isApiRoom || !this.session.isSpectator || !this.gameController.isConnected) return;
      try {
        await this.gameController.request(SocketClientEvent.ApplyDM);
        window.$toast.success("已向说书人发送魔典访问请求。");
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "请求魔典权限失败，请稍后重试。");
      }
    },
    /**
     * Wire the four table HUD panels to the drag core. The vote panel wires
     * itself (script setup); these are Options API, so attachment is
     * imperative — keyed by panel id, re-attached whenever v-if swaps the
     * underlying element.
     */
    /**
     * The whisper envelope: a folded parchment flying between the two chat
     * endpoints when a neighbor whisper is delivered. Storyteller chat and
     * night information stay quiet so their timing has no table animation.
     * Visual feedback only —
     * spectators never receive the socket event, so nothing leaks; on the two
     * endpoints it recreates the "lean over and whisper" moment of the
     * physical game without exposing content.
     */
    animateWhisperDelivery(delivery) {
      if (!delivery || !this.isApiRoom || delivery.channel !== 'whisper') return;
      const recipientUserId = delivery.senderUserId === this.session.playerId
        ? delivery.targetUserId
        : this.session.playerId;
      this.flyEnvelope(
        this.elementForUserId(delivery.senderUserId),
        this.elementForUserId(recipientUserId),
      );
    },
    elementForUserId(userId) {
      if (!userId || !this.$el?.querySelectorAll) return null;
      const index = this.players.findIndex((player) => player.id === userId);
      if (index >= 0) {
        return this.$el.querySelectorAll(".reference-seat-group")[index] || null;
      }
      const storyteller = [...this.$el.querySelectorAll('[data-storyteller-user-id]')]
        .find(element => element.dataset.storytellerUserId === userId);
      if (storyteller) return storyteller;
      // No seat: myself (as storyteller) sits at the nameplate, anyone else
      // seatless (the DM from a player's view) speaks from the table centre.
      if (userId === this.session.playerId) {
        return this.$el.querySelector(".reference-profile-card");
      }
      return this.$el.querySelector(".reference-dial-mount");
    },
    flyEnvelope(fromEl, toEl) {
      if (!fromEl || !toEl || fromEl === toEl) return;
      if (this.grimoire.isStatic) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      if (typeof Element.prototype.animate !== "function") return;

      const from = fromEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      const x1 = from.left + from.width / 2;
      const y1 = from.top + from.height / 2;
      const x2 = to.left + to.width / 2;
      const y2 = to.top + to.height / 2;
      // Arc over the table: control point lifted above the midpoint, higher
      // for longer throws, so the envelope clears the tokens instead of
      // sliding through them.
      const lift = Math.min(150, Math.hypot(x2 - x1, y2 - y1) * 0.35 + 30);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 - lift;

      const envelope = document.createElement("div");
      envelope.className = "ts-whisper-envelope";
      envelope.setAttribute("aria-hidden", "true");
      document.body.appendChild(envelope);

      const steps = 24;
      const frames = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const inv = 1 - t;
        const x = inv * inv * x1 + 2 * inv * t * cx + t * t * x2;
        const y = inv * inv * y1 + 2 * inv * t * cy + t * t * y2;
        frames.push({
          transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${-16 + 24 * t}deg)`,
          opacity: i === 0 || i === steps ? 0 : 1,
        });
      }
      const animation = envelope.animate(frames, {
        duration: 900,
        easing: "cubic-bezier(0.3, 0.08, 0.28, 1)",
      });
      const cleanup = () => envelope.remove();
      animation.onfinish = cleanup;
      animation.oncancel = cleanup;
      window.setTimeout(cleanup, 2200);
    },
    playerDisplayName(player, index) {
      if (!player) return "未知玩家";
      if (player.name) return player.name;
      return player.id ? `玩家 ${index + 1}` : `空座位 ${index + 1}`;
    },
    formatVoteTime(timestamp) {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "刚刚";
      return `${date.getHours().toString().padStart(2, "0")}:${date
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    },
    publicMessageSender(chatMessage) {
      if (chatMessage.isDM) return "说书人";
      if (chatMessage.senderUserId === this.session.playerId) {
        return this.session.playerName || "你";
      }
      return (
        this.players.find((player) => player.id === chatMessage.senderUserId)?.name ||
        `玩家 ${String(chatMessage.senderUserId || "").slice(0, 6)}`
      );
    },
    publicMessageText(chatMessage) {
      return renderMessageContent(chatMessage.content || [],
        id => this.players.find(player => player.id === id)?.name || '玩家',
        id => this.gameScriptStore.characters.find(role => role.id === id)?.name || this.roles.get(id)?.name || '角色');
    },
    formatPublicMessageTime(timestamp) {
      return this.formatVoteTime(timestamp);
    },
    openModal(name) {
      useAppStore().toggleModal(name);
    },
    toggleRoomMenu(value) {
      useAppStore().toggleMenu(value);
    },
    setChatOpen(value) {
      useSessionStore().setChatOpen(value);
    },
    recordSentChat(payload) {
      useSessionStore().updateChatSent(payload);
    },
    setTyping(value) {
      useSessionStore().setTyping(value);
    },
    setRoleState(payload) {
      useSessionStore().setIsRole(payload);
    },
    setStorytellerMessageCount(value) {
      useSessionStore().setStMessage(value);
    },
    setPlayerMessageCount(payload) {
      usePlayersStore().setPlayerMessage(payload);
    },
    setLocalPlayerId(value) {
      useSessionStore().setPlayerId(value);
    },
    setLocalPlayerName(value) {
      useSessionStore().setPlayerName(value);
    },
    setClaimedSeat(value) {
      useSessionStore().claimSeat(value);
    },
    createLocalChatHistory(playerId) {
      useSessionStore().createChatHistory(playerId);
    },
    updateLocalNomination(payload = {}) {
      if (this.isApiRoom) return;
      useSessionStore().nominationUpdate(payload);
    },
    setLocalNomination(value) {
      if (this.isApiRoom) return;
      useSessionStore().setNomination(value);
    },
    updatePlayerState(payload) {
      usePlayersStore().update(payload);
    },
    emptyPlayerState(payload) {
      usePlayersStore().empty(payload);
    },
    setFabledState(payload) {
      usePlayersStore().setFabled(payload);
    },
    removePlayerState(playerIndex) {
      usePlayersStore().remove(playerIndex);
    },
    swapPlayerState(playerIndexes) {
      usePlayersStore().swap(playerIndexes);
    },
    movePlayerState(playerIndexes) {
      usePlayersStore().move(playerIndexes);
    },
    openPublicChat() {
      if (!this.players.length && !this.isApiRoom) return;
      // 工具栏是显式打开入口，不应被上一次收起操作的防冒泡标记吞掉。
      this.minimising = false;
      if (this.isApiRoom) {
        this.selectTextConversation({ channel: 'public', targetUserId: '', name: '公聊' });
        return;
      }
      this.openChat(0, true, true);
    },
    handleReminderPointerMove(event) {
      if (event.pointerType === "touch") return;
      if (this.seatEditor.open || this.nightPlayerSelection.active || this.manualNominationOpen || this.apiNominationTargeting) {
        this.hoveredReminderSeat = -1;
        return;
      }
      const table = event.currentTarget;
      // Keep an expanded stack open while crossing the small gaps between its
      // buttons. Mouse focus must not keep it latched open after a click.
      const active = table.querySelector(".reminder-hovered .reference-seat-reminders");
      if (active && [...active.children].some(button => {
        const rect = button.getBoundingClientRect();
        return event.clientX >= rect.left - 8 && event.clientX <= rect.right + 8
          && event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8;
      })) return;

      // The reference reveals a blank disc before the pointer touches it.
      // Choose the nearest anchor instead of overlapping invisible hit areas,
      // so sweeping a crowded ring activates one seat at a time.
      let nearestSeat = -1;
      let nearestDistance = 58 * (this.grimoire.reminderScale || 100) / 100;
      for (const stack of table.querySelectorAll(".reference-seat-reminders")) {
        const rect = stack.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const distance = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSeat = Number(stack.closest("[data-seat-index]").dataset.seatIndex);
        }
      }
      this.hoveredReminderSeat = nearestSeat;
    },
    reminderStyle(seat, index) {
      const dx = Number(seat.reminderDx || 0);
      const dy = Number(seat.reminderDy || 0);
      const scale = (this.grimoire.reminderScale || 100) / 100;
      return {
        "--reminder-index": index,
        "--reminder-left": `${dx * 14 * scale * index}px`,
        "--reminder-top": `${dy * 14 * scale * index}px`,
        "--reminder-open-left": `${dx * 52 * scale * index}px`,
        "--reminder-open-top": `${dy * 52 * scale * index}px`,
      };
    },
    openStorytellerChat() {
      if (!this.isApiRoom) return;
      if (!this.gameStore.currentIsDm) {
        if (this.gameStore.currentPlayer) this.selectTextConversation({ channel: 'dm_chat', targetUserId: this.session.playerId, name: '说书人' });
        return;
      }
      const previous = this.textConversations.find(item => item.channel === 'dm_chat' && item.targetUserId === this.chatLastTargets.dm_chat);
      if (previous) this.selectTextConversation(previous);
      else this.toggleTextConversations('dm_chat');
    },
    openWhisperChat() {
      const previous = this.textConversations.find(item => item.channel === 'whisper' && item.targetUserId === this.chatLastTargets.whisper);
      if (previous) this.selectTextConversation(previous);
      else this.toggleTextConversations('whisper');
    },
    openSystemChat() {
      this.selectTextConversation({ channel: 'system', targetUserId: '', name: '系统消息' });
    },
    toggleTextConversations(filter = '') {
      this.chatConversationsOpen = this.chatConversationFilter !== filter || !this.chatConversationsOpen;
      this.chatConversationFilter = filter;
      this.minimising = false;
      this.maximiseChat();
    },
    canTextChatWithSeat(index) {
      const player = this.players[index];
      if (!this.isApiRoom || !this.gameController.isConnected || !this.gameStore.currentPlayer || !player?.id || player.id === this.session.playerId) return false;
      if (this.gameStore.currentIsDm) return true;
      if (this.gameStore.gameConfig.allowTextWhispers === false || this.session.claimedSeat < 0) return false;
      const seatCount = this.players.length;
      return index === (this.session.claimedSeat + 1) % seatCount || index === (this.session.claimedSeat - 1 + seatCount) % seatCount;
    },
    textUnreadForSeat(index) {
      const player = this.players[index];
      if (!player?.id) return 0;
      return this.roomChatStore.getTextUnreadCount(this.session.playerId, this.gameStore.currentIsDm ? 'dm_chat' : 'whisper', player.id);
    },
    markTextConversationRead() {
      if (!this.session.isChatOpen || this.isChatMin || !['whisper', 'dm_chat'].includes(this.apiChatChannel)) return;
      this.roomChatStore.markTextConversationRead(this.session.playerId, this.apiChatChannel, this.apiChatTargetUserId);
    },
    selectTextConversation({ channel, targetUserId, name }) {
      this.chatDrafts[this.apiChatConversationKey] = this.message;
      this.apiChatLoadGeneration += 1;
      this.apiChatLoading = false;
      this.apiChatChannel = channel;
      this.apiChatTargetUserId = targetUserId;
      this.apiChatTargetName = name;
      if (targetUserId) this.chatLastTargets[channel] = targetUserId;
      this.message = this.chatDrafts[this.apiChatConversationKey] || '';
      this.chatError = '';
      this.chatConversationsOpen = false;
      this.minimising = false;
      this.maximiseChat();
      this.markTextConversationRead();
      this.$nextTick(() => { this.scrollToBottom(); this.$refs.message?.focus(); });
      void this.loadApiChatHistory();
    },
    openRoleReference() {
      this.openModal("roles");
    },
    roleEnglishName(role) {
      const id = RoleIdDataMap[role?.id] ? role.id : referenceRoleIdsByName.get(role?.name);
      return String(id || "")
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    },
    async openPrivateChat(playerIndex) {
      const player = this.players[playerIndex];
      if (!this.canTextChatWithSeat(playerIndex)) return;
      this.closeSeatActions();
      this.selectTextConversation({ channel: this.gameStore.currentIsDm ? 'dm_chat' : 'whisper', targetUserId: player.id, name: this.playerDisplayName(player, playerIndex) });
    },
    async loadApiChatHistory() {
      if (
        !this.isApiRoom ||
        !['whisper', 'dm_chat'].includes(this.apiChatChannel) ||
        !this.apiChatTargetUserId ||
        !this.gameController.isConnected
      ) return;

      const generation = ++this.apiChatLoadGeneration;
      const scope = this.apiChatScope;
      const channel = this.apiChatChannel;
      const targetUserId = this.apiChatTargetUserId;
      const isCurrent = () => generation === this.apiChatLoadGeneration && scope === this.apiChatScope
        && channel === this.apiChatChannel && targetUserId === this.apiChatTargetUserId;
      this.apiChatLoading = true;
      this.chatError = "";
      try {
        const response = await this.gameController.request(
          SocketClientEvent.GetMessageHistory,
          {
            channel,
            toUserId: targetUserId,
          },
        );
        if (!isCurrent()) return;
        this.roomChatStore.mergeConversation(
          channel,
          targetUserId,
          response.data?.messages || [],
        );
        this.markTextConversationRead();
      } catch (error) {
        if (!isCurrent()) return;
        this.chatError = error instanceof Error
          ? error.message
          : "私聊记录加载失败，请重试。";
      } finally {
        if (isCurrent()) {
          this.apiChatLoading = false;
          this.$nextTick(() => this.scrollToBottom());
        }
      }
    },
    openPlayerNotes(playerIndex) {
      const player = this.players[playerIndex];
      if (!player?.id || !this.isApiRoom || !this.gameController.isConnected) return;
      this.notesTarget = {
        id: player.id,
        name: this.playerDisplayName(player, playerIndex),
        roleName: player.role?.name || player.role?.id || "尚未分配身份",
      };
      this.closeSeatActions();
    },
    handleNotesSaved(message) {
      window.$toast.success(message);
    },
    openTimer() {
      this.toggleRoomMenu();
    },
    startNominationFromSelf() {
      if (this.canManualNominate) {
        this.closeSeatActions();
        this.tableNomination.begin(0, this.players, this.grimoire.voteDuration);
        this.tableNomination.selecting = 'nominee';
        return;
      }
      if (!this.canNominate) {
        window.$toast.warning(this.isApiRoom
          ? "只有白天且由说书人发起裁定。"
          : "当前阶段无法发起裁定。");
        return;
      }
      if (this.isApiRoom) {
        this.closeSeatActions();
        // Seat selection precedes the central voting controls.
        this.realtimeVoteStore.hide();
        this.seatActionStatus = "";
        this.nominationNomineeIndex = -1;
        this.nominationNominatorIndex = -1;
        this.nominationStage = "nominee";
        return;
      }
      const from = this.session.claimedSeat >= 0 ? this.session.claimedSeat : 0;
      this.closeSeatActions();
      this.tableNomination.begin(from, this.players, this.grimoire.voteDuration);
      this.tableNomination.selecting = 'nominee';
    },
    openVoteHistory() {
      if (this.isApiRoom) {
        this.realtimeVoteStore.show();
        this.$nextTick(() => {
          document.getElementById("table-nomination-panel")?.focus({ preventScroll: true });
        });
        return;
      }
      this.openModal("voteHistory");
    },
    handleVoteTool() {
      if (this.canManualNominate) {
        if (this.tableNomination.open) this.tableNomination.close();
        else this.startNominationFromSelf();
        return;
      }
      if (!this.isApiRoom) {
        this.openVoteHistory();
        return;
      }
      if (this.hasVoteSurface) {
        if (this.realtimeVoteStore.isVisible) {
          if (!this.realtimeVoteStore.hide()) {
            window.$toast.info("等待投票提交确认后即可关闭。");
          }
          return;
        }
        this.openVoteHistory();
        return;
      }
      this.startNominationFromSelf();
    },
    /**
     * Look up which seat a user is sitting in, 1-based to match the server's
     * `seat` field and the "第 N 席" labels. Returns null for spectators, the
     * storyteller, or a player who has since left the table.
     */
    seatNumberForUserId(userId) {
      if (!userId) return null;
      if (emptyVoteSeat(userId)) return emptyVoteSeat(userId);
      const index = this.players.findIndex((player) => player.id === userId);
      return index >= 0 ? index + 1 : null;
    },
    tablePositionStyle(angle, radius, size) {
      const radian = (angle * Math.PI) / 180;
      const x = 50 + Math.cos(radian) * radius;
      const y = 50 + Math.sin(radian) * radius;
      return {
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        transform: "translate(-50%, -50%)",
      };
    },
    getChairForAngle(angle) {
      // Normalize angle to 0-360 (0=top, 90=right, 180=bottom, 270=left)
      let norm = ((angle + 90) % 360 + 360) % 360;
      // Divide into 8 sectors of 45 degrees each
      const sector = Math.round(norm / 45) % 8;
      // sector: 0=top, 1=top-right, 2=right, 3=bottom-right, 4=bottom, 5=bottom-left, 6=left, 7=top-left
      const map = [
        { img: chairTop, flip: false },       // 0: top
        { img: chairTopLeft, flip: true },     // 1: top-right (mirror of tl)
        { img: chairLeft, flip: true },        // 2: right (mirror of l)
        { img: chairBottomLeft, flip: true },  // 3: bottom-right (mirror of bl)
        { img: chairBottom, flip: false },     // 4: bottom
        { img: chairBottomLeft, flip: false }, // 5: bottom-left
        { img: chairLeft, flip: false },       // 6: left
        { img: chairTopLeft, flip: false },    // 7: top-left
      ];
      return map[sector];
    },
    playerAvatarUrl(player) {
      if (!player) return "";
      const userId = useUserStore().userId;
      const image = player.id && player.id === (userId || this.session.playerId)
        ? preferredProfileAvatar(userId, player.image) : player.image;
      if (!image || image === "default.webp") return "";
      return resolveProfileAvatar(image);
    },
    isApiRoomConnected() {
      return this.isApiRoom && this.gameController.isConnected;
    },
    ensureLocalPlayerProfile() {
      if (!this.session.playerId) {
        this.setLocalPlayerId(`local-${Math.random().toString(36).substr(2, 9)}`);
      }
      if (!this.session.playerName) {
        this.setLocalPlayerName("本地玩家");
      }
    },
    updatePlayerSeat(player, profile) {
      Object.entries(profile).forEach(([property, value]) => {
        this.updatePlayerState({
          player,
          property,
          value,
        });
      });
    },
    claimSeatLocally(playerIndex) {
      const player = this.players[playerIndex];
      if (!player) return false;
      this.ensureLocalPlayerProfile();

      this.players.forEach((seatPlayer, index) => {
        if (
          index !== playerIndex &&
          seatPlayer.id === this.session.playerId
        ) {
          this.emptyPlayerState({ player: seatPlayer });
          this.updatePlayerState({
            player: seatPlayer,
            property: "role",
            value: {},
          });
        }
      });

      this.updatePlayerSeat(player, {
        id: this.session.playerId,
        name: this.session.playerName || `玩家 ${playerIndex + 1}`,
        image: this.session.playerAvatar || "",
        isDead: false,
        isVoteless: false,
      });
      return true;
    },
    displayRoleForPlayer(player) {
      if (player && player.role && player.role.id) return player.role;
      return {};
    },
    seatButtonLabel(seat) {
      if (this.nominationStage === "nominee") {
        return `选第 ${seat.index + 1} 席 ${seat.displayName} 为被提名者`;
      }
      if (this.nominationStage === "nominator" || this.nominationStage === "confirm") {
        return `选第 ${seat.index + 1} 席 ${seat.displayName} 为提名者`;
      }
      if (this.swap >= 0) {
        if (seat.index === this.swap) {
          return `第 ${seat.index + 1} 席，已选为换座起点，点击取消`;
        }
        return seat.hasPlayer
          ? `与第 ${seat.index + 1} 席 ${seat.displayName} 交换座位`
          : `第 ${seat.index + 1} 席为空，不能作为换座目标`;
      }
      if (!seat.hasPlayer) {
        if (seat.emptySeatLocked) {
          return `游戏已开始，第 ${seat.index + 1} 席不可入座`;
        }
        return this.canManageActionSeat
          ? `第 ${seat.index + 1} 席为空`
          : `第 ${seat.index + 1} 席为空，点击坐下`;
      }
      return `第 ${seat.index + 1} 席，${seat.displayName}，${
        seat.player.isDead ? "已死亡" : "存活"
      }`;
    },
    seatTokenTitle(seat) {
      if (this.stagedReveal && !this.isStoryteller && !this.stagedReveal.revealedUserIds.includes(this.storyteller.revealId(seat.index))) return "等待说书人揭晓";
      const role = seat.role || {};
      if (!role.id) {
        return this.canManageActionSeat
          ? `为第 ${seat.index + 1} 席选择角色`
          : "未选择身份";
      }
      // Visible roles use the parchment tooltip instead of a native title.
      return undefined;
    },
    openSeatActions(playerIndex, event) {
      const player = this.players[playerIndex];
      if (!player) return;

      this.actionSeatMode = "player";
      this.roleMenuAnchor = null;
      this.actionSeatIndex = playerIndex;
      this.actionSeatUserId = player.id || "";
      this.actionSeatAnchorX = Number(event && event.clientX) || window.innerWidth / 2;
      this.actionSeatAnchorY = Number(event && event.clientY) || window.innerHeight / 2;
      this.seatActionStatus = "";
    },
    closeSeatActions() {
      this.actionSeatIndex = -1;
      this.roleMenuAnchor = null;
      this.actionSeatUserId = null;
      this.seatActionStatus = "";
    },
    async runSeatAction(action, task, successMessage, options = {}) {
      if (this.seatActionPending) return false;
      if (this.isApiRoom && !this.gameController.isConnected) {
        this.seatActionStatus = "房间正在重连，暂时无法执行操作。";
        window.$toast.warning(this.seatActionStatus);
        return false;
      }

      const { refresh = this.isApiRoom, close = false } = options;
      this.seatActionPending = action;
      this.seatActionStatus = "正在同步房间状态…";

      try {
        await task();
        if (refresh) await this.gameController.refreshGameState();
        this.seatActionStatus = successMessage;
        if (typeof window.$toast.success === "function") {
          window.$toast.success(successMessage);
        } else {
          window.$toast.info(successMessage);
        }
        if (close) this.closeSeatActions();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "操作失败，请重试";
        console.warn(`玩家座位操作失败（${action}）:`, error);
        this.seatActionStatus = message;
        window.$toast.error(message);
        return false;
      } finally {
        this.seatActionPending = "";
      }
    },
    async handleTableSeatClick(playerIndex) {
      if (this.voice?.selectingInvitee) { await this.voice.selectInvitee(this.players[playerIndex]?.id); return; }
      if (this.stagedReveal) { if (this.isStoryteller) await this.storyteller.revealPlayers(playerIndex); return; }
      if (this.nightPlayerSelection?.active) {
        this.nightPlayerSelection.choose(playerIndex);
        return;
      }
      if (this.isApiRoom && this.realtimeVoteStore.isActive && !this.seatEditor?.open) {
        await this.$refs.roomNomination?.voteForSeat(playerIndex + 1);
        return;
      }
      if (this.manualNominationOpen) {
        if (this.tableNomination.selecting) this.tableNomination.selectSeat(playerIndex);
        else this.tableNomination.toggleVote(playerIndex);
        return;
      }
      if (this.seatEditor?.open) {
        if (this.seatEditor.movingSeat >= 0) await this.seatEditor.moveSeat(this.seatEditor.movingSeat, playerIndex);
        return;
      }
      const player = this.players[playerIndex];
      if (!player) return;

      this.reminderPickerSeat = -1;

      if (this.nominationStage) {
        this.handleNominationSeatClick(playerIndex);
        return;
      }

      if (this.swap >= 0) {
        await this.completeSeatSwap(playerIndex);
        return;
      }

      if (!player.id && this.isApiRoom) {
        if (this.canManageActionSeat) return;
        if (!this.isApiRoomConnected()) {
          window.$toast.warning("房间正在重连，暂时无法入座。");
          return;
        }

        try {
          await this.gameController.enterSeat(playerIndex + 1);
          await this.gameController.refreshGameState();
        } catch (error) {
          console.warn("同步入座失败，未修改本地座位状态:", error);
          window.$toast.error(
            error instanceof Error ? error.message : "入座失败，请重试",
          );
        }
        return;
      } else if (!player.id && this.session.isSpectator) {
        this.ensureLocalPlayerProfile();
        this.claimSeat(playerIndex);
        this.claimSeatLocally(playerIndex);
      }
    },
    seatVoteResult(player, index) {
      if (!this.isApiRoom || this.realtimeVoteStore.phase === 'idle' || !this.realtimeVoteStore.isVisible) return null;
      if (this.realtimeVoteStore.privateVote && !this.gameStore.currentIsDm
        && player.id !== useUserStore().userId) return null;
      const id = voteParticipantId(player, index);
      return this.realtimeVoteStore.results[id]
        || (this.realtimeVoteStore.choices[id]?.vote === 'yes' ? this.realtimeVoteStore.choices[id] : null);
    },
    seatVoteNumber(index) {
      const start = this.seatNumberForUserId(this.realtimeVoteStore.nomineeUserId);
      let tally = 0;
      for (let step = 0; step < this.players.length; step++) {
        const current = (start + step) % this.players.length;
        if (this.realtimeVoteStore.results[voteParticipantId(this.players[current], current)]?.vote === 'yes') tally++;
        if (current === index) return tally;
      }
      return tally;
    },
    canNominateTokenSeat(playerIndex) {
      const player = this.players[playerIndex];
      return Boolean(this.canNominateFromToken && playerIndex !== this.actionSeatIndex
        && player);
    },
    isTokenNominationTarget(target) {
      const token = target instanceof Element ? target.closest('[data-nomination-target]') : null;
      // Preserve the source through document's capture-phase pointerdown;
      // the target's click will complete the nomination using that source.
      return Boolean(token && this.roleMenuAnchor?.closest('.reference-table')?.contains(token)
        && this.canNominateTokenSeat(Number(token.dataset.nominationTarget)));
    },
    handleVoiceRoleAction(userId, event) {
      const index = this.players.findIndex(player => player.id === userId);
      if (index >= 0) return this.handleTableTokenClick(index, event);
    },
    async handleTableTokenClick(playerIndex, event) {
      if (this.voice?.selectingInvitee) { await this.voice.selectInvitee(this.players[playerIndex]?.id); return; }
      if (this.stagedReveal) {
        if (this.revealLongPress) { this.revealLongPress = false; this.previewRevealSeat = -1; return; }
        if (this.isStoryteller) await this.storyteller.revealPlayers(playerIndex);
        return;
      }
      if (this.nightPlayerSelection?.active) {
        this.nightPlayerSelection.choose(playerIndex);
        return;
      }
      if (this.seatEditor?.open) return;
      if (this.isApiRoom && this.realtimeVoteStore.isActive) {
        await this.$refs.roomNomination?.voteForSeat(playerIndex + 1);
        return;
      }
      if (this.manualNominationOpen) {
        if (this.tableNomination.selecting) this.tableNomination.selectSeat(playerIndex);
        else this.tableNomination.toggleVote(playerIndex);
        return;
      }
      if (this.nominationStage) {
        this.handleNominationSeatClick(playerIndex);
        return;
      }
      const player = this.players[playerIndex];
      if (!player) return;

      this.reminderPickerSeat = -1;

      if (this.swap >= 0) {
        await this.completeSeatSwap(playerIndex);
        return;
      }

      if (this.isPersonalGrimoire) {
        this.closeSeatActions();
        this.openRoleModal(playerIndex);
        return;
      }

      if (this.actionSeatMode === "token" && this.actionSeatIndex === playerIndex) {
        this.closeSeatActions();
        return;
      }
      if (this.canNominateFromToken && this.canNominateTokenSeat(playerIndex)) {
        const nominatorIndex = this.actionSeatIndex;
        this.closeSeatActions();
        if (this.canManualNominate) {
          this.tableNomination.begin(nominatorIndex, this.players, this.grimoire.voteDuration);
          this.tableNomination.selectSeat(playerIndex, 'nominee');
        } else if (this.isApiRoom) {
          await this.startRealtimeVote(playerIndex);
          if (this.nominationStage === 'nominator') this.handleNominationSeatClick(nominatorIndex);
        } else {
          this.tableNomination.begin(nominatorIndex, this.players, this.grimoire.voteDuration);
          this.tableNomination.selectSeat(playerIndex, 'nominee');
        }
        return;
      }
      this.openSeatActions(playerIndex, event);
      this.actionSeatMode = "token";
      this.roleMenuAnchor = event?.currentTarget || null;
    },
    revealTokenRole(seat) {
      if (!this.stagedReveal || this.stagedReveal.revealedUserIds.includes(this.demoStore?.active ? `demo-seat-${seat.index}` : seat.player.id || `@seat:${seat.index + 1}`)) return seat.role;
      return { id: '' };
    },
    startRevealPreview(index, event) {
      if (!this.stagedReveal || !this.isStoryteller || event.pointerType === 'mouse') return;
      this.revealLongPress = false;
      this.revealPressTimer = setTimeout(() => { this.previewRevealSeat = index; this.revealLongPress = true; }, 450);
    },
    finishRevealPress() { clearTimeout(this.revealPressTimer); if (this.revealLongPress) setTimeout(() => { this.previewRevealSeat = -1; }, 1200); },
    endRevealPreview() { clearTimeout(this.revealPressTimer); this.previewRevealSeat = -1; },
    openNightConversation(index) {
      const player = this.players[index];
      if (!this.canWakeTokenSeat || (!this.demoStore?.active && !player?.id) || this.seatActionPending) return;
      this.nightMessageTarget = { seatIndex: index, playerUserId: player.id, levelDays: this.gameStore.levelDays };
      this.closeSeatActions();
    },
    async handleRoleTokenAction(action) {
      const index = this.actionSeatIndex;
      const player = this.players[index];
      if (!player || this.seatActionPending) return;
      if (action === "role" && (this.canManageActionSeat || this.isPersonalGrimoire)) {
        this.closeSeatActions();
        this.openRoleModal(index);
      } else if (action === "wake" && this.canWakeTokenSeat) {
        this.openNightConversation(index);
      } else if (action === "life" && this.canManageSeatLife) {
        const success = await this.cycleSeatLifeState(index, Boolean(player.isDead));
        if (success) this.closeSeatActions();
      } else if (action === "alignment" && this.canChangeTokenAlignment) {
        const role = this.actionTokenRole;
        const current = role.alignment || (['minion', 'demon'].includes(role.team) ? 'evil' : 'good');
        const alignment = current === 'evil' ? 'good' : 'evil';
        if (this.isPersonalGrimoire) {
          usePlayerViewStore().setRole(player, index, { ...role, alignment });
          this.closeSeatActions();
          return;
        }
        await this.runSeatAction('alignment', async () => {
          if (this.isApiRoom && player.id) {
            const privateExtras = this.gameStore.players[player.id]?.privateExtras || {};
            await this.gameController.updatePlayer({ userId: player.id, privateExtras: { ...privateExtras, alignment } });
          } else if (this.isApiRoom) {
            await this.gameController.request(SocketClientEvent.DMSetSeatRoles, {
              assignments: [{ seat: index + 1, characterId: role.id, alignment }],
              expectedSeatUsers: this.players.map(player => player.id || ''),
            });
          } else {
            this.updatePlayerState({ player, property: 'role', value: { ...role, alignment } });
          }
        }, `已改为${alignment === 'evil' ? '邪恶' : '善良'}阵营`, { close: true });
      } else if (action === "nominate-self" && this.canSelfNominateActionSeat) {
        this.closeSeatActions();
        if (this.canManualNominate) {
          this.tableNomination.begin(index, this.players, this.grimoire.voteDuration);
          return;
        }
        if (this.isApiRoom) {
          await this.startRealtimeVote(index);
          if (this.nominationStage === 'nominator') this.handleNominationSeatClick(index);
        } else {
          this.tableNomination.begin(index, this.players, this.grimoire.voteDuration);
        }
      }
    },
    reminderEntries(playerIndex) {
      const player = this.players[playerIndex];
      if (!player) return [];
      return this.isApiRoom && !this.isPersonalGrimoire && !player.id
        ? this.emptySeatReminders[playerIndex] || [] : player.reminders || [];
    },
    isReminderRotated(playerIndex, reminderName) {
      const player = this.players[playerIndex];
      if (!player) return false;
      if (this.isApiRoom && !this.isPersonalGrimoire && player.id) {
        const rotated = this.gameStore.players[player.id]?.hiddenExtras?.rotatedReminders;
        return Array.isArray(rotated) && rotated.includes(reminderName);
      }
      return this.reminderEntries(playerIndex).some(item => typeof item === 'object'
        && item?.name === reminderName && item.isRotated === true);
    },
    async rotateApiReminder(playerIndex, reminderName) {
      if ((!this.canManageActionSeat && !this.isPersonalGrimoire) || this.reminderActionPending) return;
      const player = this.players[playerIndex];
      if (!player) return;
      const reminders = this.reminderEntries(playerIndex);
      if (!reminders.some(item => (typeof item === 'string' ? item : item?.name) === reminderName)) return;
      const isRotated = !this.isReminderRotated(playerIndex, reminderName);
      this.reminderActionPending = `rotate:${playerIndex}:${reminderName}`;
      try {
        if (this.isPersonalGrimoire || !this.isApiRoom || !player.id) {
          const value = reminders.map(item => (typeof item === 'string' ? item : item?.name) === reminderName
            ? { ...(typeof item === 'string' ? { name: item } : item), isRotated } : item);
          if (this.isPersonalGrimoire) usePlayerViewStore().setReminders(player, playerIndex, value);
          else if (this.isApiRoom) this.emptySeatReminders[playerIndex] = value;
          else this.updatePlayerState({ player, property: 'reminders', value });
          return;
        }
        const hiddenExtras = this.gameStore.players[player.id]?.hiddenExtras || {};
        const rotated = new Set(Array.isArray(hiddenExtras.rotatedReminders) ? hiddenExtras.rotatedReminders : []);
        if (isRotated) rotated.add(reminderName);
        else rotated.delete(reminderName);
        await this.gameController.updatePlayer({ userId: player.id,
          hiddenExtras: { ...hiddenExtras, rotatedReminders: [...rotated] } });
        await this.gameController.refreshGameState();
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "旋转提示标记失败，请重试");
      } finally {
        this.reminderActionPending = "";
      }
    },
    async removeApiReminder(playerIndex, reminderName) {
      if ((!this.canManageActionSeat && !this.isPersonalGrimoire) || this.reminderActionPending) return;
      const player = this.players[playerIndex];
      if (!player) return;
      this.reminderActionPending = `remove:${playerIndex}:${reminderName}`;
      try {
        if (this.isPersonalGrimoire) {
          usePlayerViewStore().setReminders(player, playerIndex, (player.reminders || []).filter(item => (typeof item === 'string' ? item : item.name) !== reminderName));
          return;
        }
        if (!this.isApiRoom || !player.id) {
          const reminders = this.isApiRoom ? this.emptySeatReminders[playerIndex] || [] : player.reminders || [];
          const value = reminders.filter((item) => (typeof item === 'string' ? item : item.name) !== reminderName);
          if (this.isApiRoom) this.emptySeatReminders[playerIndex] = value;
          else this.updatePlayerState({ player, property: 'reminders', value });
          return;
        }
        const marks = (player.reminders || [])
          .map((reminder) => typeof reminder === "string" ? reminder : reminder?.name)
          .filter((mark) => mark && mark !== reminderName);
        const hiddenExtras = this.gameStore.players[player.id]?.hiddenExtras || {};
        const rotated = hiddenExtras.rotatedReminders;
        await this.gameController.updatePlayer({ userId: player.id, marks,
          ...(Array.isArray(rotated) && rotated.includes(reminderName)
            ? { hiddenExtras: { ...hiddenExtras, rotatedReminders: rotated.filter(name => name !== reminderName) } } : {}) });
        await this.gameController.refreshGameState();
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "移除提醒标记失败，请重试");
      } finally {
        this.reminderActionPending = "";
      }
    },
    reminderVisual(name) {
      return this.apiReminderOptions.find((option) => option.name === name) || { role: "custom", name };
    },
    availableApiReminders(playerIndex) {
      const player = this.players[playerIndex];
      const isProfile = playerIndex === -1 && this.isStoryteller;
      if (!player && !isProfile) return [];
      const existingForEmpty = !player?.id && this.emptySeatReminders[playerIndex]
        ? this.emptySeatReminders[playerIndex]
        : [];
      const selected = new Set(
        (isProfile ? this.profileReminderRoles : this.isPersonalGrimoire || player.id ? (player.reminders || []) : existingForEmpty)
          .map((reminder) => typeof reminder === "string" ? reminder : reminder?.name)
          .filter(Boolean),
      );
      const source = this.reminderPickerTab === "related"
        ? this.apiReminderRelatedOptions
        : this.apiReminderOptions;
      const query = this.reminderSearch.trim().toLowerCase();
      return source.filter((reminder) => !selected.has(reminder.name) && (!query || reminder.name.toLowerCase().includes(query)));
    },
    async resolveReminderName(reminder) {
      if (!reminder) return "";
      let reminderName = reminder.name;
      if (reminder.role === "custom") {
        const input = await requestInputModal({
          inputType: "reminder",
          inputModal: "input",
          inputData: {
            name: ["输入自定义提醒"],
            length: 1,
            placeholder: [""],
          },
        }).catch(() => null);
        if (!input || !Array.isArray(input) || !input[0]) return;
        reminderName = String(input[0]).trim();
        if (!reminderName) return;
      }
      return reminderName;
    },
    async addApiReminder(playerIndex, reminder) {
      if ((!this.canManageActionSeat && !this.isPersonalGrimoire) || !reminder) return;
      const player = this.players[playerIndex];
      if (!player) return;
      const notebookKey = this.isPersonalGrimoire ? usePlayerViewStore().notebookKey : null;
      const reminderName = await this.resolveReminderName(reminder);
      if (!reminderName) return;
      if (notebookKey !== null && (!this.isPersonalGrimoire || usePlayerViewStore().notebookKey !== notebookKey)) return;
      if (this.isPersonalGrimoire) {
        usePlayerViewStore().setReminders(player, playerIndex, [...(player.reminders || []), { ...reminder, name: reminderName }]);
        this.reminderPickerSeat = -1;
        return;
      }
      if (!this.isApiRoom || !player.id) {
        const reminders = this.isApiRoom ? this.emptySeatReminders[playerIndex] || [] : player.reminders || [];
        const value = [...reminders, { ...reminder, name: reminderName }];
        if (this.isApiRoom) this.emptySeatReminders[playerIndex] = value;
        else this.updatePlayerState({ player, property: 'reminders', value });
        this.reminderPickerSeat = -1;
        return;
      }
      const marks = (player.reminders || [])
        .map((mark) => typeof mark === "string" ? mark : mark?.name)
        .filter(Boolean);
      if (marks.includes(reminderName)) {
        this.reminderPickerSeat = -1;
        return;
      }
      marks.push(reminderName);

      try {
        await this.gameController.updatePlayer({ userId: player.id, marks });
        await this.gameController.refreshGameState();
        this.reminderPickerSeat = -1;
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : "添加提醒标记失败，请重试");
      }
    },
    async startRealtimeVote(playerIndex) {
      const player = this.players[playerIndex];
      if (!player || !this.canManageActionSeat || !this.isApiRoom) return;
      if (!["prepare", "day"].includes(this.gameStore.level)) {
        window.$toast.warning("请在准备或白天阶段发起提名。");
        return;
      }
      if (!this.gameController.isConnected) {
        this.seatActionStatus = "房间正在重连，暂时无法建立提名。";
        window.$toast.warning(this.seatActionStatus);
        return;
      }
      if (this.realtimeVoteStore.isActive) {
        window.$toast.warning("当前已有投票进行中，请等待本轮裁定完成。");
        return;
      }

      this.seatActionStatus = "";
      this.nominationNomineeIndex = playerIndex;
      this.nominationNominatorIndex = -1;
      this.nominationStage = "nominator";
      this.closeSeatActions();
      // Same as startNominationFromSelf: clear the table before seat picking.
      this.realtimeVoteStore.hide();
    },
    /**
     * Seat clicks while a nomination draft is active. The nominee is chosen
     * first (both entry points agree on that: the seat panel's 发起裁定 button
     * pre-fills it, the vote panel entry asks for it), then the nominator; in
     * the confirm stage further clicks re-pick the nominator so a mis-click is
     * one tap to fix. Self-nomination is legal, so nominee === nominator is
     * allowed.
     */
    handleNominationSeatClick(playerIndex) {
      if (!this.nominationStage || this.seatActionPending || !this.canManageActionSeat) return;
      const player = this.players[playerIndex];
      if (!player) {
        window.$toast.warning("座位已变化，请重新选择。");
        return;
      }
      if (this.nominationStage === "nominee") {
        this.nominationNomineeIndex = playerIndex;
        this.nominationStage = "nominator";
        return;
      }
      this.nominationNominatorIndex = playerIndex;
      this.nominationStage = "confirm";
    },
    cancelNominationDraft() {
      // A confirm request is already on the wire; the card stays until the
      // server answers so the outcome is never ambiguous.
      if (this.seatActionPending === "start-vote") return;
      this.nominationStage = "";
      this.nominationNomineeIndex = -1;
      this.nominationNominatorIndex = -1;
      this.seatActionStatus = "";
    },
    async confirmNominationDraft() {
      const nominator = this.players[this.nominationNominatorIndex];
      const nominee = this.players[this.nominationNomineeIndex];
      if (!nominator || !nominee) {
        this.cancelNominationDraft();
        return;
      }
      const nominatorName = this.nominationDraftNominatorName;
      const nomineeName = this.nominationDraftNomineeName;
      const success = await this.runSeatAction(
        "start-vote",
        () => this.gameController.startVote({
          sweepVote: true,
          ...(this.privateVoteDraft ? { privateVote: true } : {}),
          nominatorUserId: voteParticipantId(nominator, this.nominationNominatorIndex),
          nomineeUserId: voteParticipantId(nominee, this.nominationNomineeIndex),
          turnDurationMs: this.grimoire.voteDuration,
        }),
        `${nominatorName} 已提名 ${nomineeName}`,
        { refresh: false, close: true },
      );
      if (!success) return;
      this.nominationStage = "";
      this.nominationNomineeIndex = -1;
      this.nominationNominatorIndex = -1;
      this.realtimeVoteStore.show();
    },
    async cycleSeatLifeState(playerIndex, restore = false) {
      const player = this.players[playerIndex];
      if (!player || !this.canManageSeatLife || this.seatActionPending || (this.isApiRoom && !player.id)) return;

      if (this.isApiRoom) {
        const nextState = !player.isDead
          ? { isAlive: false, voteChancesAfterDeath: 1 }
          : restore || player.isVoteless
            ? { isAlive: true, voteChancesAfterDeath: 1 }
            : { voteChancesAfterDeath: 0 };
        const successMessage = !player.isDead
          ? `已将 ${this.playerDisplayName(player, playerIndex)} 标记为死亡`
          : restore || player.isVoteless
            ? `已恢复 ${this.playerDisplayName(player, playerIndex)} 的存活状态`
            : `已消耗 ${this.playerDisplayName(player, playerIndex)} 的鬼票`;

        return this.runSeatAction(
          "life",
          () => this.gameController.updatePlayer({ userId: player.id, ...nextState }),
          successMessage,
        );
      }

      if (!player.isDead) {
        this.updatePlayerSeat(player, { isDead: true, isVoteless: false, votes: 1 });
        this.seatActionStatus = "已标记为死亡，并保留一次鬼票。";
      } else if (!restore && !player.isVoteless) {
        this.updatePlayerSeat(player, { isVoteless: true, votes: 0 });
        this.seatActionStatus = "已消耗鬼票。";
      } else {
        this.updatePlayerSeat(player, { isDead: false, isVoteless: false, votes: 1 });
        this.seatActionStatus = "已恢复存活状态。";
      }
      return true;
    },
    beginSeatSwap(playerIndex) {
      const player = this.players[playerIndex];
      if (
        !player ||
        !player.id ||
        !this.canManageActionSeat ||
        this.session.lockedVote ||
        this.occupiedCount < 2
      ) return;

      this.swap = playerIndex;
      this.closeSeatActions();
      window.$toast.info("请选择另一位已入座玩家交换座位。按 Esc 可取消。");
    },
    cancelSeatOperation() {
      this.cancel();
    },
    async completeSeatSwap(targetIndex) {
      const sourceIndex = this.swap;
      if (sourceIndex < 0) return;
      if (targetIndex === sourceIndex) {
        this.cancelSeatOperation();
        return;
      }

      const source = this.players[sourceIndex];
      const target = this.players[targetIndex];
      if (!source || !source.id || !target || !target.id) {
        window.$toast.info("只能与另一位已入座玩家交换座位。");
        return;
      }

      if (this.isApiRoom) {
        const success = await this.runSeatAction(
          "swap",
          () => this.gameController.swapPlayers({
            seat1: sourceIndex + 1,
            seat1UserId: source.id,
            seat2: targetIndex + 1,
            seat2UserId: target.id,
          }),
          `已交换第 ${sourceIndex + 1} 席与第 ${targetIndex + 1} 席`,
        );
        if (success) this.cancelSeatOperation();
        return;
      }

      this.swapPlayer(sourceIndex, target);
    },
    async leaveCurrentSeat(playerIndex) {
      const player = this.players[playerIndex];
      if (!player || player.id !== this.session.playerId) return;

      if (this.isApiRoom) {
        await this.runSeatAction(
          "leave-seat",
          () => this.gameController.leaveSeat(),
          "已离开座位，你仍在当前房间中",
          { close: true },
        );
        return;
      }

      this.claimSeat(playerIndex);
      this.emptyPlayerState({ player });
      this.closeSeatActions();
    },
    async forcePlayerLeaveSeat(playerIndex) {
      const player = this.players[playerIndex];
      if (!player || !player.id || !this.canManageActionSeat) return;

      if (this.isApiRoom) {
        await this.runSeatAction(
          "force-leave",
          () => this.gameController.forceLeaveSeat({ userId: player.id }),
          `已将 ${this.playerDisplayName(player, playerIndex)} 移出座位`,
          { close: true },
        );
        return;
      }

      this.emptyPlayerState({ player });
      this.updatePlayerState({ player, property: "role", value: {} });
      this.closeSeatActions();
    },
    async kickPlayerFromRoom(playerIndex) {
      const player = this.players[playerIndex];
      if (
        !this.isApiRoom ||
        !player ||
        !player.id ||
        !this.canManageActionSeat
      ) return;

      await this.runSeatAction(
        "kick",
        () => this.gameController.kickUser({
          userId: player.id,
          reason: "由说书人移出房间",
        }),
        `已将 ${this.playerDisplayName(player, playerIndex)} 踢出房间`,
        { close: true },
      );
    },
    toggleLeftPanel(panel) {
      if (panel === 'text') {
        if (this.session.isChatOpen && !this.isChatMin) this.minimiseChat();
        else {
          this.minimising = false;
          if (this.isApiRoom) { this.maximiseChat(); void this.loadApiChatHistory(); }
          else this.openPublicChat();
        }
      } else if (panel === 'voice') this.isVoiceOpen = !this.isVoiceOpen;
      else if (panel === 'npc') this.isFabledOpen = !this.isFabledOpen;
      else if (panel === 'bluffs') this.isBluffsOpen = !this.isBluffsOpen;
    },
    toggleBluffs() {
      this.toggleLeftPanel('bluffs');
    },
    toggleFabled() {
      this.toggleLeftPanel('npc');
    },
    openFabledManagement() {
      useAppStore().toggleModal("fabled");
    },
    handleFabledTokenClick(index) {
      if (this.isApiRoom) {
        if (this.canManageFabled) this.openFabledManagement();
        return;
      }
      this.removeFabled(index);
    },
    toggleGroups() {
      this.isShowGroup = !this.isShowGroup;
    },
    removeFabled(index) {
      if (this.session.isSpectator) {
        if (index === 0) {
          if (this.session.claimedSeat >= 0) this.openChat(0); //open chat box if user is a player
        }
      } else {
        this.setFabledState({ index });
      }
    },
    handleTrigger(playerIndex, [method, params]) {
      if (typeof this[method] === "function") {
        this[method](playerIndex, params);
      }
    },
    handleResize() {
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    handleSeatOperationKeyup(event) {
      if (event.key === 'Escape' && this.chatConversationsOpen) { this.chatConversationsOpen = false; return; }
      if (event.key === "Escape" && this.voice?.selectingInvitee) { this.voice.selectingInvitee = false; return; }
      if (event.key === "Escape" && this.manualNominationOpen) {
        if (this.tableNomination.selecting) this.tableNomination.selecting = null;
        else this.tableNomination.close();
        return;
      }
      if (event.key === "Escape" && (this.swap >= 0 || this.apiNominationTargeting)) {
        this.cancelSeatOperation();
      }
    },
    claimSeat(playerIndex) {
      if (!this.session.isSpectator) return;
      if (this.session.playerId === this.players[playerIndex].id) {
        this.setClaimedSeat(-1);
      } else {
        this.setClaimedSeat(playerIndex);
        this.createLocalChatHistory(this.session.stId);
      }
    },
    openReminderModal(playerIndex) {
        if (!this.canManageActionSeat && !this.isPersonalGrimoire) return;
        this.reminderSearch = "";
        this.reminderPickerTab = "related";
        this.reminderPickerSeat = this.reminderPickerSeat === playerIndex ? -1 : playerIndex;
    },
    openRoleModal(playerIndex) {
      if (this.isApiRoom && !this.canEditApiRoom && !this.isPersonalGrimoire) {
        window.$toast.info("只有说书人可以调整玩家身份。");
        return;
      }
      this.selectedPlayer = playerIndex;
      this.profileRolePickerOpen = false;
      this.openModal("role");
    },
    async setStorytellerRole(role) {
      if (!this.isStoryteller || this.storytellerPending) return;
      const selected = role?.id ? role : null;
      if (this.isApiRoom) {
        const saved = await this.saveStorytellerProfile({ privateExtras: {
          ...(this.gameStore.currentPlayer.privateExtras || {}), storytellerRole: selected,
        } });
        if (!saved) return;
      } else this.storytellerRole = selected;
      this.profileRolePickerOpen = false;
    },
    handleRoleSelected({ playerIndex, role } = {}) {
      if (playerIndex === undefined || playerIndex < 0) return;
      const player = this.players[playerIndex];
      if (this.isPersonalGrimoire) return;
      if (this.isApiRoom) return;
      if (player?.id) return;
      this.emptySeatRoles = {
        ...this.emptySeatRoles,
        [playerIndex]: role?.id ? role : {},
      };
    },
    removePlayer(playerIndex) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      const { nomination } = this.session;
      if (nomination) {
        if (nomination.includes(playerIndex)) {
          // abort vote if removed player is either nominator or nominee
          this.updateLocalNomination();
        } else if (nomination[0] > playerIndex || nomination[1] > playerIndex) {
          // update nomination array if removed player has lower index
          this.setLocalNomination([
            nomination[0] > playerIndex ? nomination[0] - 1 : nomination[0],
            nomination[1] > playerIndex ? nomination[1] - 1 : nomination[1],
          ]);
        }
      }
      this.removePlayerState(playerIndex);
    },
    swapPlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.swap = from;
      } else {
        if (this.session.nomination) {
          // update nomination if one of the involved players is swapped
          const swapTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map((nom) => {
            if (nom === this.swap) return swapTo;
            if (nom === swapTo) return this.swap;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.setLocalNomination(updatedNomination);
          }
        }
        this.swapPlayerState([
          this.swap,
          this.players.indexOf(to),
        ]);
        this.cancel();
      }
    },
    movePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.move = from;
      } else {
        if (this.session.nomination) {
          // update nomination if it is affected by the move
          const moveTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map((nom) => {
            if (nom === this.move) return moveTo;
            if (nom > this.move && nom <= moveTo) return nom - 1;
            if (nom < this.move && nom >= moveTo) return nom + 1;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.setLocalNomination(updatedNomination);
          }
        }
        this.movePlayerState([
          this.move,
          this.players.indexOf(to),
        ]);
        this.cancel();
      }
    },
    nominatePlayer(from, to) {
      if (this.isApiRoom || this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        if (from !== this.nominate) {
          this.nominate = from;
        }
      } else {
        const nomination = [this.nominate, this.players.indexOf(to)];
        this.updateLocalNomination({ nomination });
        this.cancel();
      }
    },
    cancel() {
      this.move = -1;
      this.swap = -1;
      this.nominate = -1;
      this.cancelNominationDraft();
    },
    addVote(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      const vote = player.votes + 1;
      this.updatePlayerState({
        player,
        property: "votes",
        value: vote,
      });
    },
    subtractVote(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      const vote = player.votes - 1;
      if (vote < 1) return;
      this.updatePlayerState({
        player,
        property: "votes",
        value: vote,
      });
    },
    setStoryTeller(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      if (player.id) {
        if (player.id != "host") return;
        this.updatePlayerState({
          player,
          property: "id",
          value: "",
        });
        this.updatePlayerState({
          player,
          property: "name",
          value: "",
        });
        this.updatePlayerState({
          player,
          property: "isVoteless",
          value: false,
        });
        this.updatePlayerState({
          player,
          property: "isDead",
          value: false,
        });
      } else {
        this.updatePlayerState({
          player,
          property: "id",
          value: "host",
        });
        this.updatePlayerState({
          player,
          property: "name",
          value: "说书人",
        });
        this.updatePlayerState({
          player,
          property: "isVoteless",
          value: true,
        });
        this.updatePlayerState({
          player,
          property: "isDead",
          value: true,
        });
      }
    },
    openChat(playerIndex, maximise = true, isPublic = false) {
      if (maximise) this.maximiseChat();

      // Public chat must win over the legacy spectator branch: API players
      // are represented as spectators by the old store compatibility layer.
      if (isPublic) {
        this.chattingPlayer = "public";
        this.chattingGroup = "";
        this.$refs.chatWith.innerText = "公聊";
      } else if (this.session.isSpectator) {
        const groupChats = this.session.groupChats;
        const name = groupChats.length === 0 ? (this.fabled[0]?.name || "说书人") : "群聊";
        this.$refs.chatWith.innerText = name;
        if (maximise) this.setStorytellerMessageCount(0);
      } else {
        this.chattingPlayer = this.players[playerIndex].id;
        this.chattingGroup = this.players[playerIndex].chatGroup;
        const name =
          this.chattingGroup === ""
            ? this.players[playerIndex].name
            : this.session.groupChats.filter(
                (group) => group.id === this.chattingGroup,
              )[0].name;
        this.$refs.chatWith.innerText = name;
        if (maximise)
          this.setPlayerMessageCount({
            playerId: this.chattingPlayer,
            num: 0,
          });
      }

      this.$nextTick(() => {
        this.scrollToBottom();
      });
    },
    toggleChat() {
      if (this.isChatMin) {
        this.maximiseChat();
      } else {
        this.minimiseChat();
      }
    },
    maximiseChat() {
      if (this.minimising) {
        this.minimising = false;
        return;
      }
      if (this.session.isChatOpen && !this.isChatMin) return;
      this.setChatOpen(true);
      this.isChatMin = false;
      if (this.isApiRoom) this.markTextConversationRead();

      this.$nextTick(() => {
        this.$refs.message.focus();
      });
    },
    minimiseChat() {
      this.isChatMin = true;
      this.minimising = true;
    },
    async sendChat() {
      const nextMessage = this.message.trim();
      if (!nextMessage || this.chatSending) return;
      this.chatError = "";
      if (!this.canSendChat) {
        this.chatError = this.gameController.isConnected
          ? "入座后才能发送公聊消息。"
          : "房间连接已断开，请重连后再发送。";
        return;
      }

      if (this.isApiRoom) {
        const scope = this.apiChatScope;
        const conversationKey = this.apiChatConversationKey;
        const channel = this.apiChatChannel;
        const targetUserId = this.apiChatTargetUserId;
        const draft = this.message;
        this.chatSending = true;
        try {
          const content = [{ type: "text", text: nextMessage }];
          if (channel === "public") {
            await this.gameController.request(SocketClientEvent.SendPublicMessage, {
              content,
            });
          } else if (channel === "whisper") {
            await this.gameController.request(SocketClientEvent.SendWhisperMessage, {
              toUserId: targetUserId,
              content,
            });
          } else {
            await this.gameController.request(SocketClientEvent.SendDMMessage, {
              playerUserId: targetUserId,
              channel: "chat",
              content,
            });
          }
          if (scope !== this.apiChatScope) return;
          if (this.chatDrafts[conversationKey] === draft) this.chatDrafts[conversationKey] = '';
          if (this.apiChatConversationKey === conversationKey && this.message === draft) {
            this.message = "";
            this.$nextTick(() => this.$refs.message?.focus());
          }
        } catch (error) {
          if (scope !== this.apiChatScope) return;
          const message = error instanceof Error ? error.message : "消息发送失败，请重试。";
          if (conversationKey === this.apiChatConversationKey) this.chatError = message;
          window.$toast.error(message);
        } finally {
          this.chatSending = false;
        }
        return;
      }

      if (!this.session.isSpectator) {
        let seated = false;
        this.players.forEach((player) => {
          if (
            player.id === this.chattingPlayer ||
            this.chattingPlayer === "public"
          )
            seated = true;
        });
        if (!seated) return;
      }
      const sender = this.session.playerName;
      const sendingPlayerId = this.session.playerId;
      const message = sender.concat(": ", nextMessage);
      if (this.chattingGroup === "") {
        if (this.chattingPlayer === "public") {
          // 公聊消息发送给所有玩家
          this.players.forEach((player) => {
            if (player.id) {
              this.recordSentChat({
                message,
                sendingPlayerId,
                receivingPlayerId: player.id,
              });
            }
          });
        } else {
          const receivingPlayerId = this.session.isSpectator
            ? "host"
            : this.chattingPlayer;
          this.recordSentChat({
            message,
            sendingPlayerId,
            receivingPlayerId,
          });
        }
      } else {
        const group = this.session.groupChats.filter(
          (group) => group.id === this.chattingGroup,
        )[0];
        const playerIds = group.players.map((player) => player.id);
        playerIds.forEach((id) => {
          this.recordSentChat({
            message,
            sendingPlayerId,
            receivingPlayerId: id,
          });
        });
      }

      if (!this.session.isSpectator) {
        const wraithMessage = `[亡魂][（说书人）${message}]`;
        const players = this.players.filter(
          (player) =>
            player.isWraith &&
            player.isUsingWraith &&
            player.isAllowRole &&
            !!player.id,
        );
        players.forEach((player) => {
          if (
            !(
              player.id === this.chattingPlayer ||
              player.chatGroup === this.chattingGroup
            )
          )
            this.recordSentChat({
              message: wraithMessage,
              sendingPlayerId,
              receivingPlayerId: player.id,
            });
        });
        // this.setRoleState({
        //   role: 'wraith',
        //   property: 'st',
        //   value: this.session.isRole.wraith.player + 1
        // });
        // 每10次互动会让暴露概率增加1%，最高10%
        // const prob = Math.min(0.05 + Math.floor(Math.min(this.session.isRole.wraith.st, this.session.isRole.wraith.player) / 10) * 0.01, this.session.isRole.wraith.probMax);
        // this.setRoleState({
        //   role: 'wraith',
        //   property: 'prob',
        //   value: prob
        // });
      }

      this.message = "";

      this.$nextTick(() => {
        this.scrollToBottom();
      });
    },
    scrollToBottom() {
      this.$nextTick(() => {
        this.$refs.chatContent.scrollTop = this.$refs.chatContent.scrollHeight;
      });
      this.checkToBottom();
    },
    checkToBottom() {
      if (this.$refs.chatContent.scrollTop >= -20) {
        // 划至最底则删除红点
        if (!this.session.isSpectator) {
          if (this.chattingPlayer === "public") {
            // 公聊不需要删除红点，因为公聊消息会发送给所有玩家，每个玩家都会有自己的红点
          } else {
            this.setPlayerMessageCount({
              playerId: this.chattingPlayer,
              num: 0,
            });
          }
        } else {
          this.setStorytellerMessageCount(0);
        }
      }
    },
    typing() {
      this.setTyping(true);
      if (this.$refs.chatContent.scrollTop >= -20) {
        if (!this.session.isSpectator) {
          if (this.chattingPlayer === "public") {
            // 公聊不需要删除红点
          } else {
            this.setPlayerMessageCount({
              playerId: this.chattingPlayer,
              num: 0,
            });
          }
        } else {
          this.setStorytellerMessageCount(0);
        }
      }
    },
    notTyping() {
      this.setTyping(false);
    },
    setUsingWraith() {
      const usingWraith = this.session.isRole.wraith.using;
      this.setRoleState({
        role: "wraith",
        property: "using",
        value: !usingWraith,
      });
    },
  },
};
</script>

<style lang="scss">
/* 游戏桌样式已拆分到 src/styles/townsquare/ 下的模块，按 index.scss 的顺序加载。
   这里保持非 scoped（与拆分前一致）：Player / Token / Vote 等子组件依赖这些全局类。 */
@use "../styles/townsquare";
</style>

<style scoped>
.voice-conversation-active .reference-seat-group.outside-voice-room { filter: brightness(.45); }
</style>

<style scoped>
.storyteller-hand-signals { position: absolute; top: 10px; left: 10px; z-index: 54; display: grid; gap: 16px; pointer-events: none; }
.room-storyteller-profiles { position: absolute; top: 10px; left: 10px; z-index: 55; display: flex; flex-wrap: wrap; gap: 12px 48px; max-width: calc(100% - 280px); padding-right: 40px; pointer-events: none; }
.room-storyteller-profiles :deep(.storyteller-profile) { position: relative; top: auto; left: auto; flex: 0 0 auto; margin-bottom: 40px; pointer-events: auto; }
.room-storyteller-profiles :deep(.storyteller-profile.has-hand-signal) { margin-right: calc(var(--portrait-size) * .62); }
.room-storyteller-profiles :deep(.storyteller-profile:focus-within) { z-index: 56; }
.room-storyteller-profiles + .storyteller-hand-signals { top: 230px; }
.storyteller-hand-signals__portrait { display: flex; align-items: center; gap: 36px; }
.storyteller-hand-signals__portrait > img { width: clamp(72px, 12vmin, 144px); aspect-ratio: 1; object-fit: cover; border: 2px solid #161118; border-radius: 6px; }
.storyteller-signal-enter-active, .storyteller-signal-leave-active { transition: opacity .24s ease; }
.storyteller-signal-enter-from, .storyteller-signal-leave-to { opacity: 0; }
@media (max-width: 900px) {
  .room-storyteller-profiles { position: relative; grid-area: profile; top: auto; left: auto; max-width: 100%; }
}
</style>

<style scoped>.reveal-identity-preview { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); white-space:nowrap; color:#ffe8a4; background:#17101f; padding:6px 12px; border:1px solid #ab8548; border-radius:4px; z-index:100; font:14px sans-serif; pointer-events:none; }</style>

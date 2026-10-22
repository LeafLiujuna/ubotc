<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import TownSquare from "@/components/TownSquare.vue";
import Menu from "@/components/Menu.vue";
import ImageCropper from "@/components/ImageCropper.vue";
import RoomApplyModal from "@/components/RoomApplyModal.vue";
import StorytellerElection from "@/components/StorytellerElection.vue";
import Gradients from "@/components/Gradients.vue";
import PhaseTransition from "@/components/PhaseTransition.vue";
import HotkeyCheatSheet from "@/components/HotkeyCheatSheet.vue";
import NightInfoViewer from "@/components/NightInfoViewer.vue";
import InputModal from "@/components/modals/InputModal.vue";
import { usePlayerMenuActions } from "@/composables/usePlayerMenuActions";
import { useStorytellerUiStore } from "@/composables/useStoryteller";
import { useAppStore } from "@/stores/app";
import { useSeatEditorStore } from "@/stores/seatEditor";
import { usePlayersStore } from "@/stores/players";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useRoomChatStore } from "@/stores/roomChat";
import { useRoomNotificationsStore } from "@/stores/roomNotifications";
import { useSessionStore } from "@/stores/session";
import { useGameStore } from "@/stores/game";
import { useGameScriptStore } from "@/stores/gameScript";
import { useUserStore } from "@/stores/user";
import { usePlayerViewStore } from "@/stores/playerView";
import { createHandShortcut } from "@/utils/handShortcut";
import { useGameController } from "@/controllers/GameController";
import { useVoiceController } from "@/controllers/VoiceController";
import { useInputDialog } from "@/composables/useInputDialog";
import { useDraggablePanel } from "@/composables/useDraggablePanel";
import {
	usePhaseTransition,
	usePhaseTransitionSource,
} from "@/composables/usePhaseTransition";
import {
	cheatSheetEntries,
	dispatchGameHotkey,
	type HotkeyContext,
} from "@/composables/useGameHotkeys";
import { playChime } from "@/utils/chime";
import { useTitleNotification } from "@/composables/useTitleNotification";
import { GameApi } from "@/api/http/game";
import { isDev } from "@/config/env";
import { AuthHelper } from "@/helpers/auth";
import { AUTH_LOGIN_KIND_KEY } from "@/auth/session";
import { authenticateDevIdentity } from "@/router/authGuard";
import { bindGameStateBridge } from "@/services/gameStateBridge";
import {
	getRoomJoinFailure,
	isAuthenticationFailure,
	isRoomUnavailableFailure,
	shouldPromptForRoomPassword,
} from "@/services/roomJoinFailure";
import type { JoinRoomData } from "@/types/game";
import {
	SocketClientEvent,
	type ServerReceiveApplyMessage,
} from "@/types/socket";

// These surfaces are opened on demand. Keeping them out of the initial game
// render avoids downloading their large role lists, voice client and editor
// code before the player asks for them (especially helpful on LAN phones).
const RolesModal = defineAsyncComponent(() => import("@/components/modals/RolesModal.vue"));
const EditionModal = defineAsyncComponent(() => import("@/components/modals/EditionModal.vue"));
const NightOrderModal = defineAsyncComponent(() => import("@/components/modals/NightOrderModal.vue"));
const FabledModal = defineAsyncComponent(() => import("@/components/modals/FabledModal.vue"));
const VoteHistoryModal = defineAsyncComponent(() => import("@/components/modals/VoteHistoryModal.vue"));
const SettingsModal = defineAsyncComponent(() => import("@/components/modals/SettingsModal.vue"));
const GameStateModal = defineAsyncComponent(() => import("@/components/modals/GameStateModal.vue"));
const GroupChatModal = defineAsyncComponent(() => import("@/components/modals/GroupChatModal.vue"));
const VersionModal = defineAsyncComponent(() => import("@/components/modals/VersionModal.vue"));
const VoiceRoomModal = defineAsyncComponent(() => import("@/components/modals/VoiceRoomModal.vue"));
const RoomInfoModal = defineAsyncComponent(() => import("@/components/modals/RoomInfoModal.vue"));
const SeatSelector = defineAsyncComponent(() => import("@/components/SeatSelector.vue"));
const TestPlayerPanel = defineAsyncComponent(() => import("@/components/TestPlayerPanel.vue"));

const router = useRouter();
const route = useRoute();
const gameController = useGameController();
const voice = useVoiceController();
let pttHeld = false;
function releasePtt() {
  if (!pttHeld) return;
  pttHeld = false;
  void voice.pttRelease().catch(() => {});
}
function captureVoiceKeydown(event: KeyboardEvent) {
  if (event.code !== (isApiRoom.value ? "KeyB" : "Space") || event.ctrlKey || event.metaKey || event.altKey || event.repeat || voice.speakingMode !== "push-to-talk") return;
  if (isInteractiveKeyTarget(event.target) || session.isTyping || document.body.dataset.tsModalLockCount) return;
  if (voice.connectionStatus.active !== "connected") return;
  event.preventDefault(); event.stopPropagation(); pttHeld = true;
  void voice.pttPress().catch(() => { releasePtt(); });
}
function captureVoiceKeyup(event: KeyboardEvent) {
  if ((event.code === "Space" || event.code === "KeyB") && pttHeld) { event.preventDefault(); event.stopPropagation(); releasePtt(); }
}

const menuRef = ref<any>(null);
const townSquareRef = ref<any>(null);
const imageCropperRef = ref<any>(null);
const isSeatSelectorOpen = ref(false);
const gameViewRef = ref<HTMLElement | null>(null);
const pendingApplies = ref<ServerReceiveApplyMessage[]>([]);
const applyResponsePending = ref(false);
const applyResponseError = ref("");
const connectionPanelRef = ref<HTMLElement | null>(null);
const connectionDragRef = ref<HTMLElement | null>(null);
useDraggablePanel("room-connection", connectionPanelRef, connectionDragRef, connectionPanelRef);

const appStore = useAppStore();
const storytellerUi = useStorytellerUiStore();
storytellerUi.$reset();
const playerMenuActions = usePlayerMenuActions();
const sessionStore = useSessionStore();
const playersStore = usePlayersStore();
const realtimeVoteStore = useRealtimeVoteStore();
const roomChatStore = useRoomChatStore();
const gameStore = useGameStore();
const gameScriptStore = useGameScriptStore();
const userStore = useUserStore();

const { grimoire } = storeToRefs(appStore);
const {
	connectionStatus,
	errorMessage,
	disconnectReason,
	reconnectAttempt,
} = storeToRefs(gameController);
const session = sessionStore.$state as any;
const inputDialog = useInputDialog();
const { flash: flashTitle } = useTitleNotification();
const isApiRoom = computed(() => Boolean(session.sessionId && session.gameServerId));
const activeApply = computed(() => pendingApplies.value[0] || null);
let suppressEscapeKeyup = false;

// Day/night announcements. The source composable installs the watchers that
// turn authoritative phase changes into cues; all this view needs back is the
// flag that jolts the hall as a struck-bell cue lands.
usePhaseTransitionSource();
const { shaking: phaseShaking } = usePhaseTransition();

// "It's your turn to vote" must not depend on the vote panel being open: the
// panel is v-if'd on isVisible and the store's startPlayerTurn never touches
// that flag, so a player who tucked the panel away could sit out their whole
// turn without a single cue. This watcher lives here, in the always-mounted
// view: reopen the panel and ring a small ding the moment the turn is theirs.
watch(
	() => realtimeVoteStore.currentVoterUserId,
	(voterId) => {
		if (!voterId || voterId !== userStore.userId) return;
		if (!realtimeVoteStore.isActive) return;
		playChime("turn", { muted: grimoire.value.isMuted, volume: grimoire.value.soundVolume });
		if (!realtimeVoteStore.isVisible) realtimeVoteStore.show();
		flashTitle("轮到你投票了");
	},
);

watch(
	() => gameStore.gameEnd,
	(result) => {
		if (result) flashTitle("游戏已结束");
	},
	{ immediate: true },
);

function openRoomModal(name: string): void {
	appStore.toggleMenu(false);
	appStore.toggleModal(name);
}

async function openTableVote(): Promise<void> {
	if (realtimeVoteStore.phase === "idle") {
		if (gameStore.currentIsDm) startDayNomination();
		else window.$toast.info("当前暂无提名投票。");
		return;
	}
	realtimeVoteStore.show();
	await nextTick();
	document.getElementById("table-nomination-panel")?.focus({ preventScroll: true });
}

function startDayNomination(): void {
	townSquareRef.value?.startNominationFromSelf?.();
}

async function closeTableVote(): Promise<void> {
	if (!realtimeVoteStore.hide()) return;
	await nextTick();
	document.querySelector<HTMLElement>('[aria-label="房间命令"]')?.focus({ preventScroll: true });
}

function closeActiveRoomSurface(): void {
	if (appStore.grimoire.isMenuOpen) {
		appStore.toggleMenu(false);
		return;
	}
	if (appStore.modals.input) {
		appStore.toggleModal("input");
		return;
	}
	const activeModal = Object.entries(appStore.modals)
		.find(([, isOpen]) => Boolean(isOpen))?.[0];
	if (activeModal) {
		appStore.toggleModal(activeModal);
		return;
	}
	if (useSeatEditorStore().open) {
		useSeatEditorStore().close();
		return;
	}
	if (realtimeVoteStore.isVisible) void closeTableVote();
}

function handleSeatSelected(seatIndex: number) {
	console.log("Selected seat:", seatIndex);
	isSeatSelectorOpen.value = false;
}

function isInteractiveKeyTarget(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && Boolean(
		target.closest("button, input, textarea, select, a[href], [contenteditable='true']"),
	);
}

function captureKeydown(event: KeyboardEvent): void {
	if (event.key !== "Escape") return;
	suppressEscapeKeyup = Boolean(
		appStore.grimoire.isMenuOpen
		|| inputDialog.visible.value
		|| Object.values(appStore.modals).some(Boolean),
	);
}

function captureKeyup(event: KeyboardEvent): void {
	if (event.key !== "Escape" || !suppressEscapeKeyup) return;
	suppressEscapeKeyup = false;
	event.preventDefault();
	event.stopPropagation();
}

const cheatSheetOpen = ref(false);

// A fresh snapshot per keystroke; also read by the cheat-sheet computed, where
// touching the same reactive sources keeps the listing live as the game moves.
function buildHotkeyContext(): HotkeyContext {
	return {
		isApiRoom: isApiRoom.value,
		isSpectator: Boolean(session.isSpectator),
		isDm: Boolean(gameStore.currentIsDm),
		voteActive: Boolean(realtimeVoteStore.isActive),
		votePaused: Boolean(realtimeVoteStore.paused),
		hasVoteHistory: session.voteHistory.length > 0,
		inputDialogVisible: inputDialog.visible.value,
		cheatSheetOpen: cheatSheetOpen.value,
		actions: {
			storytellerAction: (action: string) => menuRef.value?.runStorytellerShortcut?.(action),
			playerAction: playerMenuActions.run,
			leaveGame: () => void menuRef.value?.leaveSession?.(),
			toggleMenu: () => appStore.toggleMenu(),
			toggleGrimoire: () => appStore.toggleGrimoire(),
			hostSession: () => menuRef.value?.hostSession?.(),
			joinSession: () => menuRef.value?.joinSession?.(),
			returnEveryoneToTown: () => menuRef.value?.returnEveryoneToTown?.(),
			// Menu bridges both to GameTableFlowControls.goNight(), which does
			// the local flag flip or the confirmed API phase advance itself.
			goNightLegacy: () => menuRef.value?.goNight?.(),
			goNightApi: () => menuRef.value?.goNight?.(),
			openModal: openRoomModal,
			openRealtimeVote: () => void openTableVote(),
			openDayNomination: startDayNomination,
			showTownSquare: () => isApiRoom.value ? void playerMenuActions.town() : menuRef.value?.showTownSquare?.(),
			setTimer: () => menuRef.value?.openLocalTimerSettings?.(),
			skipVoter: () =>
				void gameController.skipVoter().catch((error: unknown) => {
					console.error("跳过当前投票席失败:", error);
				}),
			pauseVote: () =>
				void gameController.pauseVote().catch((error: unknown) => {
					console.error("暂停投票倒计时失败:", error);
				}),
			resumeVote: () =>
				void gameController.resumeVote().catch((error: unknown) => {
					console.error("恢复投票倒计时失败:", error);
				}),
			closeActiveSurface: closeActiveRoomSurface,
			rejectInputDialog: () => inputDialog.reject(null),
			toggleCheatSheet: () => {
				cheatSheetOpen.value = !cheatSheetOpen.value;
			},
			closeCheatSheet: () => {
				cheatSheetOpen.value = false;
			},
		},
	};
}

const hotkeyEntries = computed(() => cheatSheetEntries(buildHotkeyContext()));
const handShortcut = createHandShortcut(() => void usePlayerViewStore().toggleHand());

function keyup(event: KeyboardEvent) {
	if (isApiRoom.value && event.key === " ") {
		if (handShortcut.keyup(event)) event.preventDefault();
		return;
	}
	if (!grimoire.value.hotkeysEnabled && event.key !== "Escape") return;
	const handled = dispatchGameHotkey(
		{
			key: event.key,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			altKey: event.altKey,
			typingGuard:
				Boolean(session.isTyping) || Boolean(document.body.dataset.tsModalLockCount) || isInteractiveKeyTarget(event.target),
		},
		buildHotkeyContext(),
	);
	if (handled) event.preventDefault();
}

function keydown(event: KeyboardEvent) {
	if (isApiRoom.value && event.key === " ") {
		const enabled = grimoire.value.hotkeysEnabled && !session.isTyping
			&& !document.body.dataset.tsModalLockCount && !isInteractiveKeyTarget(event.target)
			&& !inputDialog.visible.value && !cheatSheetOpen.value;
		if (handShortcut.keydown(event, enabled)) event.preventDefault();
		return;
	}
	if (!grimoire.value.hotkeysEnabled) return;
	const { key, ctrlKey, metaKey } = event;
	if (ctrlKey || metaKey) return;
	if (key.toLocaleLowerCase() !== " ") return;
	if (session.isTyping || isInteractiveKeyTarget(event.target)) return;
	if (isApiRoom.value) {
		event.preventDefault();
		return;
	}

	if (session.claimedSeat >= 0) {
		event.preventDefault();
		menuRef.value?.toggleRaiseHand?.();
	}
}

function handleTrigger([method]: [string]) {
	menuRef.value?.[method]?.();
	imageCropperRef.value?.[method]?.();

	if (session.isSpectator) return;
	if (method === "openEditionModal") {
		if (appStore.modals.settings) appStore.toggleModal("settings");
		appStore.toggleModal("edition");
		return;
	}
	if (method === "openRolesModal") {
		if (appStore.modals.settings) appStore.toggleModal("settings");
		if (isApiRoom.value) {
			if (!gameStore.currentIsDm) {
				window.$toast.warning("只有说书人可以配置房间角色。");
				return;
			}
			appStore.toggleModal("roles");
			return;
		}
		appStore.toggleModal("roles");
		return;
	}
	if (method === "openFabledModal") {
		if (appStore.modals.settings) appStore.toggleModal("settings");
		appStore.toggleModal("fabled");
	}
}

type ConnectionAttempt = {
	generation: number;
	roomId: string;
	hasRetriedAuthentication: boolean;
};

let detachGameStateBridge: (() => void) | null = null;
let lastRoomPassword: string | undefined;
let retriedHistoryConnection = false;
let connectionGeneration = 0;
let isUnmounted = false;
let roomPrivacy: { roomId: string; isPrivate: boolean } | null = null;

const routeRoomId = computed(() =>
	String(route.params.roomId || "").trim().toLocaleUpperCase(),
);

const connectionStatusText = computed(() => ({
	idle: "尚未连接",
	connecting: "正在连接",
	connected: "已连接",
	reconnecting: "正在重连",
	disconnected: "连接已断开",
	error: "连接失败",
})[connectionStatus.value]);

const connectionDetail = computed(() => {
	if (connectionStatus.value === "reconnecting") {
		return `第 ${reconnectAttempt.value || 1} 次尝试`;
	}
	return errorMessage.value || disconnectReason.value || "";
});

const canRetryConnection = computed(() =>
	connectionStatus.value === "error" ||
	connectionStatus.value === "disconnected",
);

function createConnectionAttempt(
	hasRetriedAuthentication = false,
): ConnectionAttempt {
	connectionGeneration += 1;
	return {
		generation: connectionGeneration,
		roomId: routeRoomId.value,
		hasRetriedAuthentication,
	};
}

function isActiveConnectionAttempt(attempt: ConnectionAttempt): boolean {
	return (
		!isUnmounted &&
		attempt.generation === connectionGeneration &&
		attempt.roomId === routeRoomId.value
	);
}

function clearRealtimeState(): void {
	storytellerUi.$reset();
	connectionGeneration += 1;
	roomPrivacy = null;
	pendingApplies.value = [];
	applyResponsePending.value = false;
	applyResponseError.value = "";
	detachGameStateBridge?.();
	detachGameStateBridge = null;
	if (inputDialog.visible.value) inputDialog.reject(null);
	void voice.disconnect();
	voice.resetRoomView();
	gameController.reset();
	gameStore.resetRoomState();
	gameScriptStore.resetRoomScript();
	playersStore.reset();
	realtimeVoteStore.reset();
	roomChatStore.resetRoomState();
	useRoomNotificationsStore().reset();
	sessionStore.resetRoomScopedState();
	appStore.closeAllModals();
	appStore.toggleMenu(false);
	appStore.toggleNight(false);
}

async function returnToLobby(message?: string): Promise<void> {
	if (message) window.$toast.warning(message);
	clearRealtimeState();
	await router.replace({ name: "RoomList" });
}

function takeHistoryConnection(): JoinRoomData | null {
	const state = window.history.state as Partial<JoinRoomData> &
		Record<string, unknown>;
	if (
		typeof state?.token !== "string" ||
		typeof state.gameServerUrl !== "string" ||
		typeof state.gameServerId !== "string" ||
		String(state.roomId || "").toLocaleUpperCase() !== routeRoomId.value
	) {
		return null;
	}

	const connection: JoinRoomData = {
		token: state.token,
		roomId: routeRoomId.value,
		gameServerId: state.gameServerId,
		gameServerUrl: state.gameServerUrl,
	};

	// Keep Vue Router's own history fields, but do not leave the short-lived
	// game token in browser history after it has been handed to Socket.IO.
	const nextHistoryState = { ...state };
	delete nextHistoryState.token;
	window.history.replaceState(nextHistoryState, document.title);
	return connection;
}

function startRealtimeConnection(
	connection: JoinRoomData,
	attempt?: ConnectionAttempt,
): void {
	if (attempt && !isActiveConnectionAttempt(attempt)) return;
	detachGameStateBridge?.();
	detachGameStateBridge = null;
	sessionStore.setApiRoomSession(connection);
	sessionStore.setRoomActive(true);
	if (userStore.current) {
		sessionStore.setPlayerId(userStore.current.id);
		sessionStore.setPlayerName(userStore.current.displayName);
		sessionStore.updatePlayerAvatar(userStore.current.avatarUrl || "");
	}

	const socket = gameController.connectToGameServer({
		roomId: connection.roomId,
		gameServerId: connection.gameServerId,
		gameServerUrl: connection.gameServerUrl,
		token: connection.token,
	});

	detachGameStateBridge = bindGameStateBridge(socket, {
		onReceiveApply: (apply) => {
			if (apply.type === "voiceRoomInvite" || apply.type === "voiceRoomApplyJoin") {
				voice.receiveInvite(apply);
				playChime("invite", { muted: grimoire.value.isMuted, volume: grimoire.value.soundVolume });
				flashTitle("收到私聊邀请");
				return;
			}
			if (!pendingApplies.value.some((item) => item.applyId === apply.applyId)) {
				pendingApplies.value.push(apply);
				if (apply.type === "voiceRoomInvite") {
					playChime("invite", { muted: grimoire.value.isMuted, volume: grimoire.value.soundVolume });
					flashTitle("收到私聊邀请");
				}
			}
			applyResponseError.value = "";
		},
		onApplyDone: ({ applyId }) => {
			voice.finishInvite(applyId);
			pendingApplies.value = pendingApplies.value
				.filter((item) => item.applyId !== applyId);
			applyResponsePending.value = false;
			applyResponseError.value = "";
		},
		onRoomClose: ({ message }) => {
			void returnToLobby(message || "房间已关闭");
		},
		onKicked: ({ message }) => {
			void returnToLobby(message || "你已离开该房间");
		},
		onServerError: ({ code, error }) => {
			if (isRoomUnavailableFailure({ status: code, errorCode: error })) {
				void returnToLobby("房间因服务重启或服务器离线已结束");
				return;
			}
		},
	});
}

async function respondToRoomApply(accept: boolean): Promise<void> {
	const apply = activeApply.value;
	if (!apply || applyResponsePending.value) return;
	applyResponsePending.value = true;
	applyResponseError.value = "";
	try {
		if (accept && apply.type === "voiceRoomInvite") await voice.ensureConnected();
		await gameController.request(SocketClientEvent.RespondApply, {
			applyId: apply.applyId,
			accept,
		});
		if (!accept && apply.type === "voiceRoomInvite") {
			playChime("decline", { muted: grimoire.value.isMuted, volume: grimoire.value.soundVolume });
		}
		pendingApplies.value = pendingApplies.value
			.filter((item) => item.applyId !== apply.applyId);
		if (accept && apply.type === "dmInvitePlayer") {
			window.$toast.success("已同意说书人的入座邀请，正在同步座位。");
		}
	} catch (error) {
		applyResponseError.value = error instanceof Error
			? error.message
			: "请求处理失败，请重试。";
	} finally {
		applyResponsePending.value = false;
	}
}

async function askForRoomPassword(isRetry: boolean): Promise<string | null> {
	try {
		const result = await inputDialog.show({
			mode: "input",
			title: isRetry ? "密码不正确，请重新输入" : "请输入房间密码",
			placeholders: [""],
			inputTypes: ["password"],
			allowEmpty: false,
		}) as string[];
		return result?.[0]?.trim() || null;
	} catch {
		return null;
	}
}

async function resolveRoomPrivacy(
	attempt: ConnectionAttempt,
): Promise<boolean | null> {
	if (roomPrivacy?.roomId === attempt.roomId) return roomPrivacy.isPrivate;

	try {
		const response = await GameApi.getRoom(attempt.roomId);
		if (!isActiveConnectionAttempt(attempt)) return null;
		if (response.status < 200 || response.status >= 300 || !response.data) {
			return null;
		}

		roomPrivacy = {
			roomId: attempt.roomId,
			isPrivate: Boolean(response.data.isPrivate),
		};
		return roomPrivacy.isPrivate;
	} catch {
		return null;
	}
}

async function recoverRoomAuthentication(
	attempt: ConnectionAttempt,
	password: string | undefined,
): Promise<void> {
	if (!isActiveConnectionAttempt(attempt)) return;
	if (attempt.hasRetriedAuthentication) {
		throw new Error("重新认证后仍无法加入房间，请返回大厅后重试");
	}

	window.$toast.warning("登录状态已失效，正在重新认证。");
	const wasDevelopmentLogin = localStorage.getItem(AUTH_LOGIN_KIND_KEY) === "development";
	AuthHelper.clearToken();
	userStore.setCurrentUser(null);
	clearRealtimeState();

	if (!isDev() || !wasDevelopmentLogin) {
		AuthHelper.doLogin(route.fullPath);
		return;
	}

	const authenticated = await authenticateDevIdentity("player");
	if (!authenticated) {
		throw new Error("本地玩家身份认证失败");
	}
	if (isUnmounted) return;

	const retryAttempt = createConnectionAttempt(true);
	await requestFreshConnection(password, retryAttempt);
}

async function handleRoomJoinFailure(
	failureValue: unknown,
	password: string | undefined,
	attempt: ConnectionAttempt,
): Promise<void> {
	const failure = getRoomJoinFailure(failureValue);
	if (isRoomUnavailableFailure(failure)) {
		await returnToLobby("房间因服务重启或服务器离线已结束");
		return;
	}
	const isPrivate = await resolveRoomPrivacy(attempt);
	if (!isActiveConnectionAttempt(attempt)) return;

	if (shouldPromptForRoomPassword(failure, {
		isPrivate: isPrivate === true,
		hasAuthToken: Boolean(AuthHelper.token),
		hasSuppliedPassword: Boolean(password),
	})) {
		const isRetry = failure.errorCode === "ERR::WRONG_PASSWORD" || Boolean(password);
		const nextPassword = await askForRoomPassword(isRetry);
		if (!isActiveConnectionAttempt(attempt)) return;
		if (nextPassword) {
			await requestFreshConnection(nextPassword, attempt);
			return;
		}
		await returnToLobby();
		return;
	}

	if (isAuthenticationFailure(failure)) {
		await recoverRoomAuthentication(attempt, password);
		return;
	}

	throw new Error(failure.message || "加入房间失败");
}

async function requestFreshConnection(
	password: string | undefined,
	attempt: ConnectionAttempt,
): Promise<void> {
	if (!isActiveConnectionAttempt(attempt)) return;

	let response: Awaited<ReturnType<typeof GameApi.joinRoom>>;
	try {
		response = await GameApi.joinRoom(attempt.roomId, { password });
	} catch (error) {
		await handleRoomJoinFailure(error, password, attempt);
		return;
	}

	if (!isActiveConnectionAttempt(attempt)) return;
	if (response.status >= 200 && response.status < 300 && response.data) {
		lastRoomPassword = password;
		startRealtimeConnection(response.data, attempt);
		return;
	}

	await handleRoomJoinFailure(response, password, attempt);
}

async function connectToCurrentRoom(): Promise<void> {
	if (!routeRoomId.value) {
		await returnToLobby("未指定房间号");
		return;
	}
	const attempt = createConnectionAttempt();

	try {
		const historyConnection = takeHistoryConnection();
		if (!isActiveConnectionAttempt(attempt)) return;
		if (historyConnection) {
			startRealtimeConnection(historyConnection, attempt);
			return;
		}
		await requestFreshConnection(lastRoomPassword, attempt);
	} catch (error) {
		if (!isActiveConnectionAttempt(attempt)) return;
		window.$toast.error(
			`连接游戏服务器失败：${
				error instanceof Error ? error.message : "未知错误"
			}`,
		);
	}
}

function retryConnection(): void {
	retriedHistoryConnection = true;
	const attempt = createConnectionAttempt();
	void requestFreshConnection(lastRoomPassword, attempt).catch((error) => {
		if (!isActiveConnectionAttempt(attempt)) return;
		window.$toast.error(
			error instanceof Error ? error.message : "重新连接失败",
		);
	});
}

watch(connectionStatus, (status) => {
	sessionStore.setReconnecting(
		status === "connecting" || status === "reconnecting",
	);

	if (status === "connected") {
		sessionStore.setRoomActive(true);
		void gameController.refreshGameState().catch((error) => {
			console.warn("刷新游戏状态失败", error);
		});
		return;
	}

	if (
		status === "error" &&
		!retriedHistoryConnection
	) {
		retriedHistoryConnection = true;
		const attempt = createConnectionAttempt();
		void requestFreshConnection(lastRoomPassword, attempt).catch((error) => {
			if (!isActiveConnectionAttempt(attempt)) return;
			console.warn("历史连接凭据失效，重新加入房间失败", error);
		});
	}
});

watch(
	() => route.params.roomId,
	(nextRoomId, previousRoomId) => {
		if (nextRoomId === previousRoomId) return;
		handShortcut.reset();
		clearRealtimeState();
		roomPrivacy = null;
		retriedHistoryConnection = false;
		lastRoomPassword = undefined;
		void connectToCurrentRoom();
	},
);

onMounted(() => {
	isUnmounted = false;
	window.addEventListener("keydown", captureKeydown, true);
	window.addEventListener("keyup", captureKeyup, true);
  window.addEventListener("keydown", captureVoiceKeydown, true);
  window.addEventListener("keyup", captureVoiceKeyup, true);
  window.addEventListener("blur", releasePtt);
  window.addEventListener("blur", handShortcut.reset);
	void nextTick(() => gameViewRef.value?.focus({ preventScroll: true }));
	void connectToCurrentRoom();
});

onBeforeUnmount(() => {
	isUnmounted = true;
	window.removeEventListener("keydown", captureKeydown, true);
	window.removeEventListener("keyup", captureKeyup, true);
  window.removeEventListener("keydown", captureVoiceKeydown, true);
  window.removeEventListener("keyup", captureVoiceKeyup, true);
  window.removeEventListener("blur", releasePtt);
  window.removeEventListener("blur", handShortcut.reset);
  handShortcut.reset();
  releasePtt();
	clearRealtimeState();
});
</script>

<template>
	<div
		ref="gameViewRef"
		class="game-view"
		@keyup="keyup"
		@keydown="keydown"
		tabindex="-1"
		:class="{
			night: grimoire.isNight || Boolean(townSquareRef?.privateVotingActive),
			static: grimoire.isStatic,
			'phase-shake': phaseShaking,
		}"
	>
		<div class="backdrop"></div>

		<section
			ref="connectionPanelRef"
			class="game-connection"
			:class="`game-connection--${connectionStatus}`"
			role="status"
			aria-live="polite"
		>
			<div ref="connectionDragRef" class="game-connection__summary" tabindex="0"
				aria-label="移动房间状态栏" title="拖动移动；方向键微调；双击或 Home 恢复位置">
				<span class="game-connection__dot" aria-hidden="true"></span>
				<strong>房间 {{ routeRoomId || "—" }}</strong>
				<span class="game-connection__status">{{ connectionStatusText }}</span>
				<small v-if="connectionDetail">{{ connectionDetail }}</small>
			</div>
			<div class="game-connection__actions">
				<button
					v-if="canRetryConnection"
					type="button"
					@click="retryConnection"
				>
					重新连接
				</button>
				<button type="button" @click="returnToLobby()">返回大厅</button>
			</div>
		</section>

		<TownSquare ref="townSquareRef" />
		<TestPlayerPanel v-if="isDev() && gameStore.currentIsDm" :key="routeRoomId" />
		<NightInfoViewer class="game-night-info-viewer" />
		<Menu
			ref="menuRef"
			@trigger="handleTrigger($event)"
			@open-table-vote="openTableVote"
		/>

		<ImageCropper ref="imageCropperRef" />
		<EditionModal v-if="appStore.modals.edition" />
		<FabledModal v-if="appStore.modals.fabled" />
		<RolesModal v-if="appStore.modals.roles" />
		<NightOrderModal v-if="appStore.modals.nightOrder" />
		<VoteHistoryModal v-if="appStore.modals.voteHistory" />
		<GameStateModal v-if="appStore.modals.gameState" />
		<InputModal
			:visible="inputDialog.visible.value"
			:mode="inputDialog.mode.value"
			:titles="inputDialog.titles.value"
			:placeholders="inputDialog.placeholders.value"
			:input-types="inputDialog.inputTypes.value"
			:allow-empty="inputDialog.allowEmpty.value"
			:validate="inputDialog.validate.value"
			@confirm="inputDialog.resolve"
			@cancel="inputDialog.reject"
			@typing="sessionStore.setTyping"
		/>
		<GroupChatModal v-if="appStore.modals.groupChat" />
		<VersionModal v-if="appStore.modals.version" />
		<SettingsModal v-if="appStore.modals.settings" @trigger="handleTrigger($event)" />
		<Gradients />
		<VoiceRoomModal v-if="appStore.modals.voiceRoom" />
		<RoomInfoModal v-if="appStore.modals.roomInfo" />
		<RoomApplyModal
			v-if="activeApply"
			:apply="activeApply"
			:pending="applyResponsePending"
			:error-message="applyResponseError"
			@respond="respondToRoomApply"
		/>
		<StorytellerElection v-if="isApiRoom" />
		<SeatSelector
			v-if="isSeatSelectorOpen"
			@seat-selected="handleSeatSelected"
			@close="isSeatSelectorOpen = false"
		/>
		<PhaseTransition />
		<HotkeyCheatSheet
			v-if="cheatSheetOpen"
			:entries="hotkeyEntries"
			@close="cheatSheetOpen = false"
		/>
	</div>
</template>

<style scoped lang="scss">
.game-view {
	position: absolute;
	inset: 0;
	outline: none;
}

.backdrop {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	top: 0;
	pointer-events: none;
}

.game-night-info-viewer {
	position: fixed;
	top: max(76px, calc(env(safe-area-inset-top) + 64px));
	right: max(14px, env(safe-area-inset-right));
	z-index: 80;
}

@media (max-width: 900px) {
	.game-night-info-viewer {
		top: max(72px, calc(env(safe-area-inset-top) + 60px));
		right: max(10px, env(safe-area-inset-right));
	}
}

.game-connection {
	position: fixed;
	cursor: grab;
	touch-action: none;
	&.is-hud-dragging { cursor: grabbing; }
	top: max(10px, env(safe-area-inset-top));
	left: 50%;
	z-index: 90;
	display: flex;
	min-height: 42px;
	max-width: min(760px, calc(100vw - 24px));
	align-items: center;
	gap: 9px;
	padding: 6px 8px 6px 12px;
	color: #f3ead7;
	background: rgba(16, 12, 20, 0.9);
	border: 1px solid rgba(211, 177, 92, 0.52);
	border-radius: 999px;
	box-shadow: 0 10px 32px rgba(0, 0, 0, 0.34);
	transform: translateX(-50%);
	backdrop-filter: blur(12px);

	&__summary,
	&__actions {
		display: flex;
		align-items: center;
	}

	&__summary {
		min-width: 0;
		gap: 9px;
		user-select: none;
		&:focus-visible {
			outline: 2px solid #e8cd83;
			outline-offset: 4px;
			border-radius: 4px;
		}
	}

	&__actions {
		flex: 0 0 auto;
		gap: 6px;
	}

	strong {
		color: #e8cd83;
		letter-spacing: 0.04em;
	}

	small {
		max-width: 220px;
	overflow: hidden;
		color: rgba(243, 234, 215, 0.72);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	button {
		min-height: 44px;
		padding: 7px 12px;
		color: #f3ead7;
		font: inherit;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(211, 177, 92, 0.28);
		border-radius: 999px;
		cursor: pointer;
		touch-action: manipulation;
	}

	button:hover,
	button:focus-visible {
		background: rgba(211, 177, 92, 0.18);
		outline: 2px solid rgba(232, 205, 131, 0.55);
		outline-offset: 1px;
	}
}

.game-connection__dot {
	width: 9px;
	height: 9px;
	flex: 0 0 auto;
	background: #bca65e;
	border-radius: 50%;
	box-shadow: 0 0 0 4px rgba(188, 166, 94, 0.14);
}

.game-connection--connected .game-connection__dot {
	background: #77c88a;
	box-shadow: 0 0 0 4px rgba(119, 200, 138, 0.15);
}

.game-connection--connecting .game-connection__dot,
.game-connection--reconnecting .game-connection__dot {
	animation: connection-pulse 1.25s ease-in-out infinite;
}

.game-connection--error .game-connection__dot,
.game-connection--disconnected .game-connection__dot {
	background: #d06c6c;
	box-shadow: 0 0 0 4px rgba(208, 108, 108, 0.15);
}

@keyframes connection-pulse {
	50% {
		opacity: 0.4;
		transform: scale(0.78);
	}
}

@media (min-width: 901px) {
	.game-connection {
		top: 76px;
		left: auto;
		right: 56px;
		max-width: calc(100vw - 470px);
		transform: none;
	}
}

@media (max-width: 900px) {
	.game-connection {
		cursor: auto;
		touch-action: auto;
		top: max(8px, env(safe-area-inset-top));
		left: max(8px, env(safe-area-inset-left));
		right: max(8px, env(safe-area-inset-right));
		width: auto;
		max-width: none;
		min-height: 52px;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 5px 4px 10px;
		border-radius: 14px;
		font-size: 12px;
		transform: none;
	}

	.game-connection small {
		display: none;
	}

	.game-connection__summary {
		gap: 7px;
		overflow: hidden;
	}

	.game-connection__summary strong,
	.game-connection__status {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.game-connection__summary strong {
		flex: 0 1 auto;
	}

	.game-connection__status {
		flex: 1 1 auto;
	}

	.game-connection button {
		min-height: 44px;
		padding: 6px 9px;
		white-space: nowrap;
	}
}

@media (max-width: 380px) {
	.game-connection__status {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.game-connection__summary strong {
		max-width: 92px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.game-connection__dot {
		animation: none !important;
	}
}
</style>

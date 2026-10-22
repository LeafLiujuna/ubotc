import { usePlayersStore } from "@/stores/players";
import { useRoomChatStore } from "@/stores/roomChat";
import { useRoomNotificationsStore } from "@/stores/roomNotifications";
import { useSessionStore } from "@/stores/session";

export type RoomSessionResetOptions = {
  deactivateRoom?: boolean;
};

export function resetRoomSessionState({
  deactivateRoom = false,
}: RoomSessionResetOptions = {}): void {
  const playersStore = usePlayersStore();
  const roomChatStore = useRoomChatStore();
  const sessionStore = useSessionStore();

  sessionStore.claimSeat(-1);
  if (deactivateRoom) {
    sessionStore.setRoomActive(false);
  }
  sessionStore.setSpectator(false);
  sessionStore.setSessionId("");
  sessionStore.setIsHostAllowed(null);
  sessionStore.setIsJoinAllowed(null);

  if (sessionStore.nomination) {
    sessionStore.nominationUpdate({});
  }
  playersStore.clear(true);

  if (sessionStore.bootlegger) {
    sessionStore.setBootlegger("");
  }
  if (sessionStore.playerVotes > 1) {
    sessionStore.setPlayerVotes(1);
  }
  if (sessionStore.isSecretVote) {
    sessionStore.setSecretVote(false);
  }
  if (sessionStore.isReview) {
    sessionStore.setIsReview(false);
  }
  sessionStore.setChatOpen(false);
  roomChatStore.resetRoomState();
  useRoomNotificationsStore().reset();

  const groupIds = (sessionStore.groupChats as Array<{ id: string }>).map(
    (group) => group.id,
  );
  groupIds.forEach((chatId) => {
    sessionStore.removeGroupChat({ chatId });
  });
  while (sessionStore.messageQueue.length > 0) {
    sessionStore.deleteMessageQueue(0);
  }

  sessionStore.setIsRole({
    role: "wraith",
    property: "active",
    value: false,
  });
  sessionStore.setIsRole({
    role: "wraith",
    property: "using",
    value: false,
    st: true,
  });
}

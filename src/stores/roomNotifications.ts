import { defineStore } from 'pinia';

type NotificationInput = {
  key?: string;
  message: string;
  tone?: 'info' | 'warning' | 'error';
  sticky?: boolean;
};
export type RoomNotification = NotificationInput & {
  id: number;
  timestamp: number;
  read: boolean;
};

export const useRoomNotificationsStore = defineStore('roomNotifications', {
  state: () => ({
    roomKey: '',
    items: [] as RoomNotification[],
    previewId: null as number | null,
    nextId: 0,
  }),
  getters: {
    unreadCount: state => state.items.filter(item => !item.read).length,
    preview: state => state.items.find(item => item.id === state.previewId),
  },
  actions: {
    enterRoom(key: string) {
      if (key === this.roomKey) return;
      this.reset();
      this.roomKey = key;
    },
    add(input: NotificationInput) {
      if (!input.message.trim()) return;
      const existing = input.key ? this.items.find(item => item.key === input.key) : undefined;
      if (existing?.message === input.message) {
        existing.read = false;
        existing.timestamp = Date.now();
        this.previewId = existing.id;
        return;
      }
      if (existing) this.items = this.items.filter(item => item !== existing);
      const item = { ...input, id: ++this.nextId, timestamp: Date.now(), read: false };
      this.items = [item, ...this.items].slice(0, 50);
      this.previewId = item.id;
    },
    markRead() {
      this.items.forEach(item => { item.read = true; });
      this.previewId = null;
    },
    hidePreview() { this.previewId = null; },
    dismiss(id: number) {
      this.items = this.items.filter(item => item.id !== id);
      if (this.previewId === id) this.previewId = null;
    },
    clear() {
      this.items = [];
      this.previewId = null;
    },
    reset() {
      this.roomKey = '';
      this.clear();
    },
  },
});

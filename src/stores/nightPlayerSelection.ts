import { defineStore } from 'pinia';
import { usePlayersStore } from './players';

export type NightPlayerReference = { id: string; name?: string; seat: number };

// A seat is captured when clicked, so empty seats can also be referenced without
// making them message recipients or exposing the role assigned to that seat.
export const useNightPlayerSelectionStore = defineStore('nightPlayerSelection', {
  state: () => ({
    owner: '',
    active: false,
    selected: null as NightPlayerReference | null,
  }),
  actions: {
    begin(owner: string) {
      this.owner = owner;
      this.selected = null;
      this.active = true;
    },
    choose(index: number) {
      const player = usePlayersStore().players[index];
      if (!this.active || !Number.isInteger(index) || index < 0 || !player) return;
      this.selected = { id: player.id || '', name: player.name, seat: index + 1 };
      this.active = false;
    },
    cancel() {
      this.selected = null;
      this.active = false;
    },
    release(owner: string) {
      if (this.owner === owner) this.$reset();
    },
  },
});

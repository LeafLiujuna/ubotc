export type NominationPresentation = 'idle' | 'manual' | 'legacy' | 'online' | 'draft';

// Online rooms always use the server's voting system, including empty seats.
export function resolveNominationPresentation(state: {
  isApiRoom: boolean;
  manualOpen: boolean;
  legacyOpen: boolean;
  onlineVisible: boolean;
  onlineActive: boolean;
  draftActive: boolean;
}): NominationPresentation {
  if (state.isApiRoom) {
    if (state.draftActive && !state.onlineActive) return 'draft';
    return state.onlineVisible ? 'online' : 'idle';
  }
  if (state.manualOpen) return 'manual';
  return state.legacyOpen ? 'legacy' : 'idle';
}

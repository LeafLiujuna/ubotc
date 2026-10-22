/** Vote-only identities for unoccupied seats; these never create room users. */
export function emptyVoteSeat(userId: string | null | undefined): number {
  const match = /^@seat:([1-9]|1\d|20)$/.exec(userId || '');
  return match ? Number(match[1]) : 0;
}

export function voteParticipantId(player: { id?: string } | null | undefined, index: number): string {
  return player ? player.id || `@seat:${index + 1}` : '';
}

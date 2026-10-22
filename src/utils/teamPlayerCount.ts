export type TeamCountTable = Record<string, string | number[]>;

export function resolveTeamPlayerCount(
  table: TeamCountTable,
  playerCount: number,
): Record<string, number> {
  const totalPlayers = Math.max(0, Math.trunc(playerCount));
  const result: Record<string, number> = {};
  const percentageTeams: Array<{ team: string; weight: number }> = [];
  let allocated = 0;

  for (const [team, rule] of Object.entries(table)) {
    if (Array.isArray(rule)) {
      const requested = Math.max(
        0,
        Math.trunc(Number(rule[Math.max(0, totalPlayers - 1)] ?? 0)),
      );
      const count = Math.min(requested, totalPlayers - allocated);
      result[team] = count;
      allocated += count;
      continue;
    }

    const match = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(rule);
    if (match) {
      percentageTeams.push({ team, weight: Number(match[1]) });
      result[team] = 0;
    }
  }

  let remaining = Math.max(0, totalPlayers - allocated);
  const totalWeight = percentageTeams.reduce((sum, entry) => sum + entry.weight, 0);
  percentageTeams.forEach((entry, index) => {
    const isLast = index === percentageTeams.length - 1;
    const count = isLast || totalWeight <= 0
      ? remaining
      : Math.min(
          remaining,
          Math.floor((Math.max(0, totalPlayers - allocated) * entry.weight) / totalWeight),
        );
    result[entry.team] = count;
    remaining -= count;
  });

  return result;
}

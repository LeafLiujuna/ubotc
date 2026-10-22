type TeamType = "good" | "evil";

type GamePlayer = {
  id: string;
  name: string;
  role: string;
  team: TeamType;
  survived: boolean;
};

type MockGameResult = {
  id: string;
  roomId: string;
  gameServerId: string;
  status: "finished";
  winner: TeamType;
  players: GamePlayer[];
  createdAt: number;
  finishedAt: number;
};

type ScriptRole = {
  name: string;
  count: number;
  team: TeamType;
};

type MockGameScript = {
  id: string;
  name: string;
  description: string;
  roles: ScriptRole[];
  totalPlayers: number;
  createdAt: number;
};

type UploadGameScriptInput = {
  name?: string;
};

type UploadGameScriptResult = {
  id: string;
  name: string;
  hash: string;
  isPublic: boolean;
  createdAt: number;
};

type GameServerLoad = {
  serverId: string;
  status: "active";
  activeRooms: number;
  maxRooms: number;
};

type GameServerLoadResult = {
  servers: GameServerLoad[];
  preferred: string;
};

type RankingItem = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  level: number;
  gamesPlayed: number;
  winRate: number;
};

type Jwk = {
  kty: string;
  n: string;
  e: string;
  use: string;
  alg: string;
  kid: string;
};

const randomId = (len = 9): string => Math.random().toString(36).slice(2, 2 + len);

const mockGameService = {
  getGameResult(gameId: string): MockGameResult {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      id: gameId,
      roomId: `room-${randomId()}`,
      gameServerId: "server-001",
      status: "finished",
      winner: "good",
      players: [
        { id: "user1", name: "玩家1", role: "villager", team: "good", survived: true },
        { id: "user2", name: "玩家2", role: "seer", team: "good", survived: true },
        { id: "user3", name: "玩家3", role: "werewolf", team: "evil", survived: false },
        { id: "user4", name: "玩家4", role: "witch", team: "good", survived: true },
      ],
      createdAt: Date.now() - 3600000,
      finishedAt: Date.now(),
    };
  },

  getGameScript(scriptId: string): MockGameScript {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      id: scriptId,
      name: "标准剧本",
      description: "经典的狼人杀标准剧本",
      roles: [
        { name: "狼人", count: 3, team: "evil" },
        { name: "村民", count: 4, team: "good" },
        { name: "预言家", count: 1, team: "good" },
        { name: "女巫", count: 1, team: "good" },
        { name: "猎人", count: 1, team: "good" },
      ],
      totalPlayers: 10,
      createdAt: Date.now() - 86400000,
    };
  },

  uploadGameScript(script: UploadGameScriptInput, isPublic = false): UploadGameScriptResult {
    console.warn("后端服务不可用，使用模拟数据");
    const id = randomId();
    return {
      id,
      name: script.name || "自定义剧本",
      hash: `hash-${randomId(16)}`,
      isPublic,
      createdAt: Date.now(),
    };
  },

  getServerLoad(): GameServerLoadResult {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      servers: [
        { serverId: "server-001", status: "active", activeRooms: 5, maxRooms: 50 },
        { serverId: "server-002", status: "active", activeRooms: 3, maxRooms: 50 },
        { serverId: "server-003", status: "active", activeRooms: 8, maxRooms: 50 },
      ],
      preferred: "server-002",
    };
  },

  getRankings(limit = 50): RankingItem[] {
    console.warn("后端服务不可用，使用模拟数据");
    const rankings: RankingItem[] = [];
    for (let i = 1; i <= Math.min(limit, 20); i += 1) {
      rankings.push({
        rank: i,
        userId: `user-${i}`,
        displayName: `玩家${i}`,
        score: 10000 - i * 100,
        level: Math.floor(i / 5) + 1,
        gamesPlayed: 100 + i * 10,
        winRate: 0.5 + Math.random() * 0.3,
      });
    }
    return rankings;
  },

  healthCheck(): { status: "ok" } {
    return { status: "ok" };
  },

  getJwks(): { keys: Jwk[] } {
    return {
      keys: [
        {
          kty: "RSA",
          n: "mock-public-key-n-value",
          e: "AQAB",
          use: "sig",
          alg: "RS256",
          kid: "mock-key-id",
        },
      ],
    };
  },
};

export default mockGameService;
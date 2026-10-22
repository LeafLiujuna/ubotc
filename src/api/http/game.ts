import { apiClient } from "@/transport/http";
import type {
	CreateRoomRequest,
	CreateRoomResponse,
	GameResultResponse,
	GameScriptResponse,
	GetRoomResponse,
	JoinRoomRequest,
	JoinRoomResponse,
	ListRoomsResponse,
	OwnerDiscardRoomResponse,
	RankingsResponse,
	ServerLoadResponse,
	UploadGameScriptRequest,
	UploadGameScriptResponse,
} from "../../types/game";

export class GameApi {
	static async listRooms(page: number = 1, pageSize: number = 20): Promise<ListRoomsResponse> {
		const { data } = await apiClient.get<ListRoomsResponse>("/rooms", {
			params: { page, page_size: pageSize },
		});
		return data;
	}

	static async createRoom(payload: CreateRoomRequest): Promise<CreateRoomResponse> {
		const { data } = await apiClient.post<CreateRoomResponse>("/rooms", payload);
		return data;
	}

	static async ownerDiscardRoom(roomId: string): Promise<OwnerDiscardRoomResponse> {
		const { data } = await apiClient.post<OwnerDiscardRoomResponse>(`/rooms/${roomId}/discard`);
		return data;
	}

	static async getRoom(roomId: string): Promise<GetRoomResponse> {
		const { data } = await apiClient.get<GetRoomResponse>(`/room/${roomId}`);
		return data;
	}

	static async joinRoom(roomId: string, payload: JoinRoomRequest = {}): Promise<JoinRoomResponse> {
		const { data } = await apiClient.post<JoinRoomResponse>(`/room/${roomId}/join`, payload);
		return data;
	}

	static async listServerLoad(): Promise<ServerLoadResponse> {
		const { data } = await apiClient.get<ServerLoadResponse>("/servers");
		return data;
	}

	static async getGameResult(id: string): Promise<GameResultResponse> {
		const { data } = await apiClient.get<GameResultResponse>(`/game-result/${id}`);
		return data;
	}

	static async getGameScript(id: string): Promise<GameScriptResponse> {
		const { data } = await apiClient.get<GameScriptResponse>(`/game-script/${id}`);
		return data;
	}

	static async uploadGameScript(payload: UploadGameScriptRequest): Promise<UploadGameScriptResponse> {
		const { data } = await apiClient.post<UploadGameScriptResponse>("/game-scripts", payload);
		return data;
	}

	static async listRankings(page = 1, pageSize = 20): Promise<RankingsResponse> {
		const { data } = await apiClient.get<RankingsResponse>("/rankings", {
			params: { page, page_size: pageSize },
		});
		return data;
	}
}

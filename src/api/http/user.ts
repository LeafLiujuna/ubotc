import { apiClient } from "@/transport/http";
import type {
	BatchGetUsersQuery,
	BatchUsersResponse,
	UserGamesQuery,
	UserGamesResponse,
	UserMeResponse,
	UserProfileResponse,
} from "../../types/user";

export class UserApi {
  static async updateAvatar(image: string) {
    const { data } = await apiClient.post<{ status: number; data?: { avatarUrl: string }; message?: string }>("/user/me/avatar", { image });
    return data;
  }
  static async updateProfile(displayName: string) {
    const { data } = await apiClient.patch<{ status: number; data?: { displayName: string }; message?: string }>("/user/me/profile", { displayName });
    return data;
  }
  static async setGameResultsHidden(hideGameResults: boolean) {
    const { data } = await apiClient.patch<{ status: number; data?: { hideGameResults: boolean } }>("/user/me/preferences", { hideGameResults });
    return data;
  }
	static async getMe(): Promise<UserMeResponse> {
		const { data } = await apiClient.get<UserMeResponse>("/user/me");
		return data;
	}

	static async getMyGames(page: number = 1, pageSize: number = 20, query: UserGamesQuery = {}): Promise<UserGamesResponse> {
		const { data } = await apiClient.get<UserGamesResponse>("/user/me/games", {
			params: {
				...query,
				page,
				page_size: pageSize
			},
		});
		return data;
	}

	static async getUserProfile(id: string): Promise<UserProfileResponse> {
		const { data } = await apiClient.get<UserProfileResponse>(`/user/${id}`);
		return data;
	}

	static async batchGetUsers(query: BatchGetUsersQuery): Promise<BatchUsersResponse> {
		const { data } = await apiClient.get<BatchUsersResponse>("/users/batch", {
			params: query,
			paramsSerializer: { indexes: null },
		});
		return data;
	}

	static async getUserGames(id: string, page: number = 1, pageSize: number = 20, query: UserGamesQuery = {}): Promise<UserGamesResponse> {
		const { data } = await apiClient.get<UserGamesResponse>(`/user/${id}/games`, {
			params: {
				...query,
				page,
				page_size: pageSize
			},
		});
		return data;
	}
}

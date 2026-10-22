import { defineStore } from 'pinia';
import { UserApi } from '@/api/http/user';
import { BaseUserInfo, DetailedUserInfo } from '@/types';
import { AuthHelper, handleResponse, HandleResponseOptions } from '@/helpers';

export const useUserStore = defineStore('user', {
  state: () => ({
    current: null as DetailedUserInfo | null,
    cachedUsers: {} as Record<string, BaseUserInfo>,

    role: 'guest' as 'guest' | 'player' | 'dm',
  }),
  getters: {
    isLoggedIn: (state) => !!state.current,
    userId: (state) => state.current?.id || null,
  },
  actions: {
    setCurrentUser(user: DetailedUserInfo | null) {
      this.current = user;
      if (user) {
        this.cachedUsers[user.id] = user;
      }
    },
    getUserById(id: string): BaseUserInfo | null {
      return this.cachedUsers[id] || null;
    },
    async getUsersInfo(ids: string[], forceRefresh = false): Promise<BaseUserInfo[]> {
      const uncachedIds = ids.filter(id => !this.cachedUsers[id] || forceRefresh);
      if (uncachedIds.length > 0) {
        try {
          /** @todo Fetch user info from API for uncachedIds */
          const response = await UserApi.batchGetUsers({ id: uncachedIds });
          if (response.data) {
            response.data.forEach(user => {
              this.cachedUsers[user.id] = user;
            });
          }
        } catch (error) {
          console.error('Failed to fetch user info:', error);
        }
      }
      return ids.map(id => this.cachedUsers[id]) as BaseUserInfo[];
    },
    async refreshCurrentUserInfo(opts?: HandleResponseOptions) {
      const tokenAtStart = AuthHelper.token;
      if (!tokenAtStart) {
        // 未登录状态
        this.setCurrentUser(null);
        return;
      }

      try {
        const response = await UserApi.getMe();
        if (AuthHelper.token !== tokenAtStart) return;
        if (await handleResponse(response, opts) && response.data) {
          this.setCurrentUser(response.data);
        } else {
          this.setCurrentUser(null);
        }
      } catch (error) {
        if (AuthHelper.token !== tokenAtStart) return;
        const status =
          error && typeof error === 'object'
            ? (error as { response?: { status?: unknown } }).response?.status
            : undefined;
        if (status === 401) {
          if (AuthHelper.token === tokenAtStart) {
            AuthHelper.token = null;
            this.setCurrentUser(null);
          }
          return;
        }
        console.error('Failed to refresh current user info:', error);
        this.setCurrentUser(null);
        throw error;
      }
    }
  },
});

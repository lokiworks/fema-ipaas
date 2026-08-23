import { isNil } from '@fema/core-utils';
import { AuthenticationResponse, Principal, PrincipalType } from '@fema/shared';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';

import { authenticationApi } from '@/api/authentication-api';
import { queryClient } from '@/app/query-client';

import { ApStorage } from './ap-browser-storage';
const tokenKey = 'token';
const workspaceIdKey = 'workspaceId';
export const authenticationSession = {
  setWorkspaceId(workspaceId: string) {
    ApStorage.getInstance().setItem(workspaceIdKey, workspaceId);
  },
  saveResponse(response: AuthenticationResponse, isEmbedding: boolean) {
    if (isEmbedding) {
      ApStorage.setInstanceToSessionStorage();
    }
    ApStorage.getInstance().setItem(tokenKey, response.token);
    if (!isNil(response.workspaceId)) {
      ApStorage.getInstance().setItem(workspaceIdKey, response.workspaceId);
    }
    queryClient.invalidateQueries({ queryKey: ['flags'] });
    window.dispatchEvent(new Event('storage'));
  },
  isJwtExpired(token: string): boolean {
    if (!token) {
      return true;
    }
    try {
      const decoded = jwtDecode(token);
      if (decoded && decoded.exp && dayjs().isAfter(dayjs.unix(decoded.exp))) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  },
  getToken(): string | null {
    return ApStorage.getInstance().getItem(tokenKey) ?? null;
  },

  getWorkspaceId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const workspaceId = ApStorage.getInstance().getItem(workspaceIdKey);
    if (!isNil(workspaceId)) {
      return workspaceId;
    }
    const decodedJwt = getDecodedJwt(token);
    if (
      'workspaceId' in decodedJwt &&
      typeof decodedJwt.workspaceId === 'string'
    ) {
      return decodedJwt.workspaceId;
    }
    return null;
  },
  getCurrentUserId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    return decodedJwt.id;
  },
  appendWorkspaceRoutePrefix(path: string): string {
    const workspaceId = this.getWorkspaceId();

    if (isNil(workspaceId)) {
      return path;
    }
    return `/workspaces/${workspaceId}${
      path.startsWith('/') ? path : `/${path}`
    }`;
  },
  getPlatformId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('platform' in decodedJwt && decodedJwt.platform) {
      return decodedJwt.platform.id;
    }
    return null;
  },
  isOnboarding(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    const decodedJwt = jwtDecode<{ type: string }>(token);
    return decodedJwt.type === PrincipalType.ONBOARDING;
  },
  async switchToPlatform(platformId: string) {
    if (authenticationSession.getPlatformId() === platformId) {
      return;
    }
    const result = await authenticationApi.switchPlatform({
      platformId,
    });
    ApStorage.getInstance().setItem(tokenKey, result.token);
    if (!isNil(result.workspaceId)) {
      ApStorage.getInstance().setItem(workspaceIdKey, result.workspaceId);
    }
    window.location.href = '/';
  },
  switchToWorkspace(workspaceId: string) {
    if (authenticationSession.getWorkspaceId() === workspaceId) {
      return;
    }
    ApStorage.getInstance().setItem(workspaceIdKey, workspaceId);
    window.dispatchEvent(new Event('storage'));
  },
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    return !this.isJwtExpired(token);
  },
  clearSession() {
    ApStorage.getInstance().removeItem(workspaceIdKey);
    ApStorage.getInstance().removeItem(tokenKey);
  },
  logOut() {
    this.clearSession();
    window.location.href = '/sign-in';
  },
};

function getDecodedJwt(token: string): Principal {
  return jwtDecode<Principal>(token);
}

import { isNil } from '@fema-ipaas/core-utils';
import {
  AuthenticationResponse,
  Principal,
  PrincipalType,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';

import { authenticationApi } from '@/api/authentication-api';
import { queryClient } from '@/app/query-client';

import { BrowserStorage } from './browser-storage';
const tokenKey = 'token';
const workspaceIdKey = 'workspaceId';
export const authenticationSession = {
  setWorkspaceId(workspaceId: string) {
    BrowserStorage.getInstance().setItem(workspaceIdKey, workspaceId);
  },
  saveResponse(response: AuthenticationResponse, isEmbedding: boolean) {
    if (isEmbedding) {
      BrowserStorage.setInstanceToSessionStorage();
    }
    BrowserStorage.getInstance().setItem(tokenKey, response.token);
    if (!isNil(response.workspaceId)) {
      BrowserStorage.getInstance().setItem(
        workspaceIdKey,
        response.workspaceId,
      );
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
    return BrowserStorage.getInstance().getItem(tokenKey) ?? null;
  },

  getWorkspaceId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const workspaceId = BrowserStorage.getInstance().getItem(workspaceIdKey);
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
  getTenantId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('tenant' in decodedJwt && decodedJwt.tenant) {
      return decodedJwt.tenant.id;
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
  async switchToTenant(tenantId: string) {
    if (authenticationSession.getTenantId() === tenantId) {
      return;
    }
    const result = await authenticationApi.switchTenant({
      tenantId,
    });
    BrowserStorage.getInstance().setItem(tokenKey, result.token);
    if (!isNil(result.workspaceId)) {
      BrowserStorage.getInstance().setItem(workspaceIdKey, result.workspaceId);
    }
    window.location.href = '/';
  },
  switchToWorkspace(workspaceId: string) {
    if (authenticationSession.getWorkspaceId() === workspaceId) {
      return;
    }
    BrowserStorage.getInstance().setItem(workspaceIdKey, workspaceId);
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
    BrowserStorage.getInstance().removeItem(workspaceIdKey);
    BrowserStorage.getInstance().removeItem(tokenKey);
  },
  logOut() {
    this.clearSession();
    window.location.href = '/sign-in';
  },
};

function getDecodedJwt(token: string): Principal {
  return jwtDecode<Principal>(token);
}

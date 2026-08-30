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
const projectIdKey = 'projectId';
export const authenticationSession = {
  setProjectId(projectId: string) {
    BrowserStorage.getInstance().setItem(projectIdKey, projectId);
  },
  saveResponse(response: AuthenticationResponse, isEmbedding: boolean) {
    if (isEmbedding) {
      BrowserStorage.setInstanceToSessionStorage();
    }
    BrowserStorage.getInstance().setItem(tokenKey, response.token);
    if (!isNil(response.projectId)) {
      BrowserStorage.getInstance().setItem(projectIdKey, response.projectId);
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

  getProjectId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const projectId = BrowserStorage.getInstance().getItem(projectIdKey);
    if (!isNil(projectId)) {
      return projectId;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('projectId' in decodedJwt && typeof decodedJwt.projectId === 'string') {
      return decodedJwt.projectId;
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
  appendProjectRoutePrefix(path: string): string {
    const projectId = this.getProjectId();

    if (isNil(projectId)) {
      return path;
    }
    return `/projects/${projectId}${path.startsWith('/') ? path : `/${path}`}`;
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
    if (!isNil(result.projectId)) {
      BrowserStorage.getInstance().setItem(projectIdKey, result.projectId);
    }
    window.location.href = '/';
  },
  switchToProject(projectId: string) {
    if (authenticationSession.getProjectId() === projectId) {
      return;
    }
    BrowserStorage.getInstance().setItem(projectIdKey, projectId);
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
    BrowserStorage.getInstance().removeItem(projectIdKey);
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

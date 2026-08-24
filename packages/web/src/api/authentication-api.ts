import { WorkspaceRole } from '@fema-ipaas/core-utils';
import {
  CreateOtpRequestBody,
  CompleteSignUpRequest,
  RequestEmailCodeRequest,
  ResetPasswordRequestBody,
  VerifyEmailRequestBody,
  AuthenticationResponse,
  ClaimTokenRequest,
  SignInRequest,
  SignUpRequest,
  SwitchTenantRequest,
  UserIdentity,
  VerifyEmailCodeRequest,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const authenticationApi = {
  signIn(request: SignInRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/sign-in',
      request,
    );
  },
  signUp(request: SignUpRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/sign-up',
      request,
    );
  },
  getCurrentWorkspaceRole(query: { workspaceId: string }) {
    return api.get<WorkspaceRole | null>('/v1/workspace-members/role', query);
  },
  claimThirdPartyRequest(request: ClaimTokenRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authn/federated/claim',
      request,
    );
  },
  requestEmailCode(request: RequestEmailCodeRequest) {
    return api.post<void>('/v1/authentication/otp/request', request);
  },
  completeSignUp(request: CompleteSignUpRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/complete-sign-up',
      request,
    );
  },
  verifyEmailCode(request: VerifyEmailCodeRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/otp/verify',
      request,
    );
  },
  sendOtpEmail(request: CreateOtpRequestBody) {
    return api.post<void>('/v1/otp', request);
  },
  resetPassword(request: ResetPasswordRequestBody) {
    return api.post<void>('/v1/authn/local/reset-password', request);
  },
  verifyEmail(request: VerifyEmailRequestBody) {
    return api.post<UserIdentity>('/v1/authn/local/verify-email', request);
  },
  switchTenant(request: SwitchTenantRequest) {
    return api.post<AuthenticationResponse>(
      `/v1/authentication/switch-tenant`,
      request,
    );
  },
};

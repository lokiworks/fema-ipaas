import {
  CheckResetPasswordLinkRequestBody,
  CheckResetPasswordLinkResponse,
  CreateOtpRequestBody,
  CompleteSignUpRequest,
  RequestEmailCodeRequest,
  ResetPasswordRequestBody,
  VerifyEmailRequestBody,
  AuthenticationResponse,
  SignInRequest,
  SignUpRequest,
  SsoPublicProvidersResponse,
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
  signOut() {
    return api.post<void>('/v1/authentication/sign-out');
  },
  signUp(request: SignUpRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/sign-up',
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
  checkResetPasswordLink(request: CheckResetPasswordLinkRequestBody) {
    return api.post<CheckResetPasswordLinkResponse>(
      '/v1/authn/local/reset-password/check',
      request,
    );
  },
  resetPassword(request: ResetPasswordRequestBody) {
    return api.post<void>('/v1/authn/local/reset-password', request);
  },
  verifyEmail(request: VerifyEmailRequestBody) {
    return api.post<UserIdentity>('/v1/authn/local/verify-email', request);
  },
  ssoProviders() {
    return api.get<SsoPublicProvidersResponse>('/v1/authn/sso/providers');
  },
  ssoExchange(ticket: string) {
    return api.post<AuthenticationResponse>('/v1/authn/sso/exchange', {
      ticket,
    });
  },
  switchTenant(request: SwitchTenantRequest) {
    return api.post<AuthenticationResponse>(
      `/v1/authentication/switch-tenant`,
      request,
    );
  },
};

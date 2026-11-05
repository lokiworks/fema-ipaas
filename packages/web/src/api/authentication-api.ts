import {
  CheckResetPasswordLinkRequestBody,
  CheckResetPasswordLinkResponse,
  CreateOtpRequestBody,
  CompleteSignUpRequest,
  RequestEmailCodeRequest,
  ResetPasswordRequestBody,
  VerifyEmailRequestBody,
  AccountSecurityStatus,
  AuthenticationResponse,
  CaptchaChallenge,
  ConfirmPhoneBindingRequest,
  MfaDisableRequest,
  MfaEnrollConfirmRequest,
  MfaEnrollConfirmResponse,
  MfaEnrollStartRequest,
  MfaEnrollStartResponse,
  MfaVerifyRequest,
  PublicTenantInfo,
  RequestPhoneBindingRequest,
  RequestSmsCodeRequest,
  SelectTenantRequest,
  SignInRequest,
  SignUpRequest,
  SsoPublicProvidersResponse,
  SwitchTenantRequest,
  TenantDiscoveryRequestBody,
  TenantDiscoveryResponse,
  TenantSelectionOptionsRequest,
  TenantSelectionOptionsResponse,
  UserIdentity,
  VerifyEmailCodeRequest,
  VerifySmsCodeRequest,
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
  ssoProviders({ tenant }: { tenant: string | null }) {
    return api.get<SsoPublicProvidersResponse>(
      '/v1/authn/sso/providers',
      tenant === null ? undefined : { tenant },
    );
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
  publicTenant(slugOrId: string) {
    return api.get<PublicTenantInfo>(
      `/v1/tenants/public/${encodeURIComponent(slugOrId)}`,
    );
  },
  discoverTenants(request: TenantDiscoveryRequestBody) {
    return api.post<TenantDiscoveryResponse>('/v1/tenants/discover', request);
  },
  captchaChallenge() {
    return api.get<CaptchaChallenge>('/v1/authentication/captcha/challenge');
  },
  requestSmsCode(request: RequestSmsCodeRequest) {
    return api.post<void>('/v1/authentication/sms/request', request);
  },
  verifySmsCode(request: VerifySmsCodeRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/sms/verify',
      request,
    );
  },
  verifyMfa(request: MfaVerifyRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/mfa/verify',
      request,
    );
  },
  startMfaEnrollment(request: MfaEnrollStartRequest) {
    return api.post<MfaEnrollStartResponse>(
      '/v1/authentication/mfa/enroll/start',
      request,
    );
  },
  confirmMfaEnrollment(request: MfaEnrollConfirmRequest) {
    return api.post<MfaEnrollConfirmResponse>(
      '/v1/authentication/mfa/enroll/confirm',
      request,
    );
  },
  disableMfa(request: MfaDisableRequest) {
    return api.post<void>('/v1/authentication/mfa/disable', request);
  },
  regenerateRecoveryCodes() {
    return api.post<{ recoveryCodes: string[] }>(
      '/v1/users/me/mfa/recovery-codes',
    );
  },
  tenantSelectionOptions(request: TenantSelectionOptionsRequest) {
    return api.post<TenantSelectionOptionsResponse>(
      '/v1/authentication/select-tenant/options',
      request,
    );
  },
  selectTenant(request: SelectTenantRequest) {
    return api.post<AuthenticationResponse>(
      '/v1/authentication/select-tenant',
      request,
    );
  },
  securityStatus() {
    return api.get<AccountSecurityStatus>('/v1/users/me/security');
  },
  requestPhoneBinding(request: RequestPhoneBindingRequest) {
    return api.post<void>('/v1/users/me/phone/request', request);
  },
  confirmPhoneBinding(request: ConfirmPhoneBindingRequest) {
    return api.post<void>('/v1/users/me/phone/confirm', request);
  },
};

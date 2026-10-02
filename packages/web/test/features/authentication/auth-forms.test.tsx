/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordForm } from '@/features/authentication/components/reset-password-form';
import { SignInForm } from '@/features/authentication/components/sign-in-form';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  sendOtpEmail: vi.fn(),
  flags: {} as Record<string, unknown>,
}));

vi.mock('@/api/authentication-api', () => ({
  authenticationApi: {
    signIn: mocks.signIn,
    sendOtpEmail: mocks.sendOtpEmail,
  },
}));

vi.mock('@/hooks/flags-hooks', () => ({
  flagsHooks: {
    useFlag: (flagId: string) => ({ data: mocks.flags[flagId] }),
  },
}));

vi.mock('@/components/providers/telemetry-provider', () => ({
  useTelemetry: () => ({ capture: vi.fn() }),
}));

vi.mock('@/lib/navigation-utils', () => ({
  useRedirectAfterLogin: () => vi.fn(),
}));

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: { saveResponse: vi.fn() },
}));

let container: HTMLDivElement;
let root: Root;

async function render(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

async function type({ selector, value }: { selector: string; value: string }) {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) {
    throw new Error(`No input matches ${selector}`);
  }
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`No button labelled ${label}`);
  }
  await act(async () => {
    button.click();
  });
}

describe('auth forms', () => {
  beforeEach(() => {
    mocks.signIn.mockReset();
    mocks.sendOtpEmail.mockReset();
    mocks.flags = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  describe('SignInForm', () => {
    it('shows the translated validation messages instead of the raw schema ones', async () => {
      await render(<SignInForm />);

      await type({ selector: '#email', value: 'not-an-email' });
      await clickButton('Sign in');

      const text = container.textContent ?? '';
      expect(text).toContain('Email is invalid');
      expect(text).toContain('Password is required');
      expect(text).not.toContain('must match pattern');
      expect(text).not.toContain('Too small');
      expect(mocks.signIn).not.toHaveBeenCalled();
    });

    it('trims the address before checking and sending it', async () => {
      mocks.signIn.mockResolvedValue({ token: 't', projectId: 'p' });
      await render(<SignInForm />);

      await type({ selector: '#email', value: '  dev@example.com  ' });
      await type({ selector: '#password', value: 'secret-12345' });
      await clickButton('Sign in');

      expect(mocks.signIn).toHaveBeenCalledTimes(1);
      expect(mocks.signIn.mock.calls[0][0]).toEqual({
        email: 'dev@example.com',
        password: 'secret-12345',
      });
    });
  });

  describe('ResetPasswordForm', () => {
    it('tells the user to ask an administrator when email delivery is not configured', async () => {
      await render(<ResetPasswordForm />);

      expect(container.textContent).toContain('Email is not set up');
      expect(container.querySelector('#email')).toBeNull();
      expect(container.textContent).not.toContain('If the user exists');
    });

    it('asks for the email in words when the field is left empty', async () => {
      mocks.flags = { SMTP_CONFIGURED: true };
      await render(<ResetPasswordForm />);

      await clickButton('Send Password Reset Link');

      expect(container.textContent).toContain('Please enter your email');
      expect(container.textContent).not.toContain('expected string');
      expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('links the email label to its input', async () => {
      mocks.flags = { SMTP_CONFIGURED: true };
      await render(<ResetPasswordForm />);

      const label = container.querySelector('label');
      expect(label?.getAttribute('for')).toBe('email');
      expect(container.querySelector('#email')).not.toBeNull();
    });
  });
});

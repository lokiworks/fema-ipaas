/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AcceptInvitation } from '@/features/invitations/components/accept-invitation';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const accept = vi.hoisted(() => vi.fn());

vi.mock('@/features/invitations/api/user-invitation', () => ({
  userInvitationApi: { accept },
}));

function LocationDisplay() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: {},
  });
}

let container: HTMLDivElement;
let root: Root;

async function render({
  url,
  strict = false,
}: {
  url: string;
  strict?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationDisplay />
        <Routes>
          <Route path="/invitation" element={<AcceptInvitation />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  await act(async () => {
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function text() {
  return container.textContent ?? '';
}

function location() {
  return container.querySelector('[data-testid="location"]')?.textContent;
}

describe('AcceptInvitation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    accept.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('shows the invalid message without calling the server when there is no token', async () => {
    await render({ url: '/invitation' });

    expect(text()).toContain('Invalid invitation token');
    expect(accept).not.toHaveBeenCalled();
  });

  it('does not claim success before the server has answered', async () => {
    accept.mockReturnValue(new Promise(() => undefined));

    await render({ url: '/invitation?token=abc' });

    expect(text()).not.toContain('Team Invitation Accepted');
    expect(text()).not.toContain('Invalid invitation token');
  });

  it('sends a registered user to sign in right after accepting', async () => {
    accept.mockResolvedValue({ registered: true });

    await render({ url: '/invitation?token=abc&email=a@b.com' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(accept).toHaveBeenCalledWith('abc');
    expect(location()).toBe('/sign-in');
  });

  it('shows the confirmation and then sends a new user to finish sign up with an encoded email', async () => {
    accept.mockResolvedValue({ registered: false });

    await render({ url: '/invitation?token=abc&email=new%2Buser@b.com' });

    expect(text()).toContain('Team Invitation Accepted');
    expect(location()).toBe('/invitation?token=abc&email=new%2Buser@b.com');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(location()).toBe('/sign-up?email=new%2Buser%40b.com');
  });

  it('never appends an empty email when the link carries none', async () => {
    accept.mockResolvedValue({ registered: false });

    await render({ url: '/invitation?token=abc' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(location()).toBe('/sign-in');
  });

  it('shows the invalid message when the server rejects the token', async () => {
    accept.mockRejectedValue(httpError(404));

    await render({ url: '/invitation?token=expired' });

    expect(text()).toContain('Invalid invitation token');
    expect(text()).not.toContain('Team Invitation Accepted');
  });

  it('accepts the invitation only once under React strict mode and still reaches the result', async () => {
    accept.mockResolvedValue({ registered: false });

    await render({ url: '/invitation?token=abc&email=a@b.com', strict: true });

    expect(accept).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Team Invitation Accepted');
  });

  it('shows the invalid message under React strict mode when the server rejects the token', async () => {
    accept.mockRejectedValue(httpError(404));

    await render({ url: '/invitation?token=expired', strict: true });

    expect(accept).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Invalid invitation token');
  });
});

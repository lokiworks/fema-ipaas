/* eslint-disable testing-library/no-unnecessary-act */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

class ResizeObserverStub {
  observe() {
    return undefined;
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

function createHarness() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = ResizeObserverStub;
  document.elementFromPoint = () => null;
  window.scrollTo = () => undefined;
  let container: HTMLDivElement;
  let root: Root;

  return {
    mount() {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
      await new Promise((resolve) => setTimeout(resolve, 60));
    },
    async render(element: React.ReactElement) {
      const queryClient = new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      });
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>{element}</MemoryRouter>
          </QueryClientProvider>,
        );
      });
    },
    async type({ selector, value }: { selector: string; value: string }) {
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
    },
    async click(selector: string) {
      const element = container.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`No element matches ${selector}`);
      }
      await act(async () => {
        element.click();
      });
    },
    async clickButton(label: string) {
      const button = [...container.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.includes(label),
      );
      if (!button) {
        throw new Error(`No button labelled ${label}`);
      }
      await act(async () => {
        button.click();
      });
    },
    async flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    },
    async waitFor(selector: string, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (container.querySelector(selector) === null) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for ${selector}`);
        }
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
      }
    },
    text() {
      return container.textContent ?? '';
    },
    query(selector: string) {
      return container.querySelector(selector);
    },
    queryAll(selector: string) {
      return [...container.querySelectorAll(selector)];
    },
  };
}

export const renderHarness = { createHarness };

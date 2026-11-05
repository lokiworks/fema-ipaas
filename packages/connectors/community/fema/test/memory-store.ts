import type { Store } from '@fema-ipaas/connector-sdk';

export function memoryStore(): Store & { snapshot: () => Record<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    put: async <T>(key: string, value: T): Promise<T> => {
      values.set(key, value);
      return value;
    },
    get: async <T>(key: string): Promise<T | null> => {
      const value: unknown = values.get(key);
      return value === undefined ? null : value as T;
    },
    delete: async (key: string): Promise<void> => {
      values.delete(key);
    },
    snapshot: () => Object.fromEntries(values),
  };
}

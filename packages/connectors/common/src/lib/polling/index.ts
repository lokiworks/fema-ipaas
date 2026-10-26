import { ConnectionValueForAuthProperty, FilesService, RateLimitContext, ServerContext, Store } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';


interface TimebasedPolling<AuthValue, PropsValue> {
  strategy: DedupeStrategy.TIMEBASED;
  items: (params: {
    auth: AuthValue;
    store: Store;
    propsValue: PropsValue;
    lastFetchEpochMS: number;
    server?: ServerContext;
    rateLimit?: RateLimitContext;
  }) => Promise<
    {
      epochMilliSeconds: number;
      data: unknown;
    }[]
  >;
}

interface LastItemPolling<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue> {
  strategy: DedupeStrategy.LAST_ITEM;
  items: (params: {
    auth: AuthValue;
    store: Store;
    files?: FilesService;
    propsValue: PropsValue;
    lastItemId: unknown;
    server?: ServerContext;
    rateLimit?: RateLimitContext;
  }) => Promise<
    {
      id: unknown;
      data: unknown;
    }[]
  >;
}

export enum DedupeStrategy {
  TIMEBASED,
  LAST_ITEM,
}

export type Polling<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue> =
  | TimebasedPolling<AuthValue, PropsValue>
  | LastItemPolling<AuthValue, PropsValue>;

export const pollingHelper = {
  async poll<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue>(
    polling: Polling<AuthValue, PropsValue>,
    {
      store,
      auth,
      propsValue,
      maxItemsToPoll,
      files,
      server,
      rateLimit,
    }: {
      store: Store;
      auth: AuthValue;
      propsValue: PropsValue;
      files: FilesService;
      maxItemsToPoll?: number;
      server?: ServerContext;
      rateLimit?: RateLimitContext;
    }
  ): Promise<unknown[]> {
    switch (polling.strategy) {
      case DedupeStrategy.TIMEBASED: {
        const lastEpochMilliSeconds = (await store.get<number>('lastPoll'));
        if (isNil(lastEpochMilliSeconds)) {
          throw new Error("lastPoll doesn't exist in the store.");
        }
        const items = await polling.items({
          store,
          auth,
          propsValue,
          lastFetchEpochMS: lastEpochMilliSeconds,
          server,
      rateLimit,
        });
        const newLastEpochMilliSeconds = items.reduce(
          (acc, item) => Math.max(acc, item.epochMilliSeconds),
          lastEpochMilliSeconds
        );
        await store.put('lastPoll', newLastEpochMilliSeconds);
        return items
          .filter((f) => f.epochMilliSeconds > lastEpochMilliSeconds)
          .map((item) => item.data);
      }
      case DedupeStrategy.LAST_ITEM: {
        const lastItemId = await store.get<unknown>('lastItem');
        const items = await polling.items({
          store,
          auth,
          propsValue,
          lastItemId,
          files,
          server,
      rateLimit,
        });

        const lastItemIndex = items.findIndex((f) => f.id === lastItemId);
        let newItems = [];
        if (isNil(lastItemId) || lastItemIndex == -1) {
          newItems = items ?? [];
        } else {
          newItems = items?.slice(0, lastItemIndex) ?? [];
        }
        // Sorted from newest to oldest
        if (!isNil(maxItemsToPoll)) {
          // Get the last polling.maxItemsToPoll items
          newItems = newItems.slice(-maxItemsToPoll);
        }
        const newLastItem = newItems?.[0]?.id;
        if (!isNil(newLastItem)) {
          await store.put('lastItem', newLastItem);
        }
        return newItems.map((item) => item.data);
      }
    }
  },
  async onEnable<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue>(
    polling: Polling<AuthValue, PropsValue>,
    {
      store,
      auth,
      propsValue,
      server,
      rateLimit,
      isRepublish,
    }: { store: Store; auth: AuthValue; propsValue: PropsValue; server?: ServerContext; rateLimit?: RateLimitContext; isRepublish?: boolean }
  ): Promise<void> {
    switch (polling.strategy) {
      case DedupeStrategy.TIMEBASED: {
        if (isRepublish && !isNil(await store.get<number>('lastPoll'))) {
          break;
        }
        await store.put('lastPoll', Date.now());
        break;
      }
      case DedupeStrategy.LAST_ITEM: {
        if (isRepublish && !isNil(await store.get('lastItem'))) {
          break;
        }
        const items = await polling.items({
          store,
          auth,
          propsValue,
          lastItemId: null,
          server,
      rateLimit,
        });
        const lastItemId = items?.[0]?.id;
        if (!isNil(lastItemId)) {
          await store.put('lastItem', lastItemId);
        } else {
          await store.delete('lastItem');
        }
        break;
      }
    }
  },
  async onDisable<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue>(
    polling: Polling<AuthValue, PropsValue>,
    params: { store: Store; auth: AuthValue; propsValue: PropsValue }
  ): Promise<void> {
    switch (polling.strategy) {
      case DedupeStrategy.TIMEBASED:
      case DedupeStrategy.LAST_ITEM:
        return;
    }
  },
  async test<AuthValue extends ConnectionValueForAuthProperty<any>, PropsValue>(
    polling: Polling<AuthValue, PropsValue>,
    {
      auth,
      propsValue,
      store,
      files,
      server,
      rateLimit,
    }: { store: Store; auth: AuthValue; propsValue: PropsValue, files: FilesService; server?: ServerContext; rateLimit?: RateLimitContext }
  ): Promise<unknown[]> {
    let items = [];
    switch (polling.strategy) {
      case DedupeStrategy.TIMEBASED: {
        items = await polling.items({
          store,
          auth,
          propsValue,
          lastFetchEpochMS: 0,
          server,
      rateLimit,
        });
        break;
      }
      case DedupeStrategy.LAST_ITEM: {
        items = await polling.items({
          store,
          auth,
          propsValue,
          lastItemId: null,
          files,
          server,
      rateLimit,
        });
        break;
      }
    }
    return getFirstFiveOrAll(items.map((item) => item.data));
  },
};

function getFirstFiveOrAll(array: unknown[]) {
  if (array.length <= 5) {
    return array;
  } else {
    return array.slice(0, 5);
  }
}

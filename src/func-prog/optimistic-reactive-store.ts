/**
 * Reactive state + pure updaters — optimistic "mark as read"
 *
 * Source: flamingo-home-space, apps/web/hooks/swr/useNotificationSWR.ts
 * Task:   mark notifications as read/unread; the UI must react instantly
 *         and roll back if the server call fails.
 *
 * Idea:   state changes are described by PURE functions `(state) => newState`.
 *         The reactive store only applies them and notifies subscribers,
 *         so the same updater serves the optimistic step, tests and the cache.
 */

// ---------------------------------------------------------------------------
// BEFORE (project code)
// ---------------------------------------------------------------------------
//
// const updateReadStatus = async (payload: UpdateReadStatusDto) => {
//   await notificationsService.updateReadStatus(payload);    // 1. wait for the network
//
//   await mutate((currentData) => {                          // 2. patch the cache (pure, immutable — good)
//     if (!currentData) return currentData;
//     const updatedList = currentData.list.map((notification) => {
//       const newIsRead = payload.ids[notification.id];
//       return newIsRead !== undefined ? { ...notification, isRead: newIsRead } : notification;
//     });
//     return { ...currentData, list: updatedList };
//   }, false);
//
//   await updateNotificationCash();                          // 3. refetch list AND stats anyway
// };
//
// Good: the updater is immutable. Weak: it is not optimistic (the UI waits for step 1),
// the local patch is thrown away by the refetch in step 3, and the updater is
// an inline closure that cannot be reused or tested on its own.

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

type Notification = {
  readonly id: string;
  readonly title: string;
  readonly isRead: boolean;
};

type NotificationsPage = {
  readonly list: readonly Notification[];
  readonly total: number;
};

type ReadStatusPatch = Readonly<Record<string, boolean>>;

// ---------------------------------------------------------------------------
// Pure updater — curried: configure with the patch, apply to any state
// ---------------------------------------------------------------------------

const applyReadStatus =
  (patch: ReadStatusPatch) =>
  (page: NotificationsPage): NotificationsPage => ({
    ...page,
    list: page.list.map((notification) => {
      const isRead = patch[notification.id];
      return isRead === undefined ? notification : { ...notification, isRead };
    }),
  });

// ---------------------------------------------------------------------------
// Minimal reactive store (what SWR's cache does for us in the project)
// ---------------------------------------------------------------------------

type Listener<T> = (state: T) => void;

type Store<T> = {
  get: () => T;
  update: (updater: (state: T) => T) => void;
  subscribe: (listener: Listener<T>) => () => void;
};

const createStore = <T>(initialState: T): Store<T> => {
  let state = initialState;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => state,
    update: (updater) => {
      state = updater(state);
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

// Higher-order effect: apply now, confirm with the server, roll back on failure.
const optimistic = async <T>(
  store: Store<T>,
  updater: (state: T) => T,
  request: () => Promise<unknown>,
): Promise<void> => {
  const snapshot = store.get();
  store.update(updater);

  try {
    await request();
  } catch (error) {
    store.update(() => snapshot);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// AFTER — in the project the same thing is a single SWR call:
//
// const updateReadStatus = async (payload: UpdateReadStatusDto) => {
//   const apply = applyReadStatus(payload.ids);
//   await mutate(
//     async (current) => {
//       await notificationsService.updateReadStatus(payload);
//       return current && apply(current);
//     },
//     { optimisticData: (current) => current && apply(current), rollbackOnError: true, revalidate: false },
//   );
//   await mutateStats();   // only the counters need the server
// };
// ---------------------------------------------------------------------------

const store = createStore<NotificationsPage>({
  total: 2,
  list: [
    { id: 'a', title: 'New planning added', isRead: false },
    { id: 'b', title: 'Price changed', isRead: false },
  ],
});

const unsubscribe = store.subscribe((page) => {
  const unread = page.list.filter((notification) => !notification.isRead).length;
  console.log(`render: ${unread} unread`);
});

const fakeRequest = (shouldFail: boolean) => () =>
  new Promise<void>((resolve, reject) => {
    setTimeout(() => (shouldFail ? reject(new Error('Network error')) : resolve()), 300);
  });

const demo = async () => {
  await optimistic(store, applyReadStatus({ a: true }), fakeRequest(false));
  // render: 1 unread   ← instantly, before the request finishes

  try {
    await optimistic(store, applyReadStatus({ b: true }), fakeRequest(true));
  } catch (error) {
    console.log('rolled back:', error instanceof Error ? error.message : error);
  }
  // render: 0 unread   ← optimistic
  // render: 1 unread   ← rollback
  // rolled back: Network error

  unsubscribe();
};

void demo();

// React state updates are asynchronous: guard duplicate submissions synchronously.
export function createActionRunner() {
  let running = false;
  return async (action: () => Promise<void>) => {
    if (running) return false;
    running = true;
    try {
      await action();
      return true;
    } finally {
      running = false;
    }
  };
}

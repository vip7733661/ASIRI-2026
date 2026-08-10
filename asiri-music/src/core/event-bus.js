export class EventBus {
  #listeners = new Map();

  on(eventName, handler) {
    if (typeof handler !== 'function') throw new TypeError('Event handler must be a function.');
    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(handler);
    this.#listeners.set(eventName, listeners);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return;
    listeners.delete(handler);
    if (!listeners.size) this.#listeners.delete(eventName);
  }

  emit(eventName, payload) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return;
    for (const handler of [...listeners]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[Asiri Music] Event handler failed: ${eventName}`, error);
      }
    }
  }
}

export const eventBus = new EventBus();

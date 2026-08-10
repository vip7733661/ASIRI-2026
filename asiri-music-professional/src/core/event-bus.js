export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }

  once(eventName, listener) {
    const off = this.on(eventName, payload => {
      off();
      listener(payload);
    });
    return off;
  }

  off(eventName, listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  emit(eventName, payload) {
    const listeners = [...(this.listeners.get(eventName) || [])];
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[Asiri Music EventBus] ${eventName}`, error);
      }
    }
  }

  clear(eventName) {
    if (eventName) this.listeners.delete(eventName);
    else this.listeners.clear();
  }
}

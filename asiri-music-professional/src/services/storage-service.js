const ENVELOPE_VERSION = 1;

export class StorageService {
  constructor({ namespace, version }) {
    this.namespace = namespace;
    this.version = version;
  }

  key(name) {
    return `${this.namespace}.v${this.version}.${name}`;
  }

  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(name));
      if (raw === null) return fallback;
      const envelope = JSON.parse(raw);
      if (envelope?.envelopeVersion !== ENVELOPE_VERSION) return fallback;
      return envelope.value;
    } catch {
      return fallback;
    }
  }

  set(name, value) {
    const envelope = {
      envelopeVersion: ENVELOPE_VERSION,
      savedAt: Date.now(),
      value,
    };
    localStorage.setItem(this.key(name), JSON.stringify(envelope));
    return value;
  }

  remove(name) {
    localStorage.removeItem(this.key(name));
  }

  update(name, updater, fallback = null) {
    const current = this.get(name, fallback);
    const next = updater(current);
    this.set(name, next);
    return next;
  }

  migrateLegacy(migrations = {}) {
    Object.entries(migrations).forEach(([legacyKey, targetName]) => {
      if (this.get(targetName) !== null) return;
      const raw = localStorage.getItem(legacyKey);
      if (raw === null) return;
      try {
        this.set(targetName, JSON.parse(raw));
      } catch {
        this.set(targetName, raw);
      }
    });
  }
}

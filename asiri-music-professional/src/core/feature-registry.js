import { safely } from './error-boundary.js';

export class FeatureRegistry {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
    this.features = new Map();
  }

  register(name, initializer, options = {}) {
    if (this.features.has(name)) throw new Error(`Feature already registered: ${name}`);
    this.features.set(name, {
      name,
      initializer,
      critical: Boolean(options.critical),
      enabled: options.enabled !== false,
      status: 'registered',
      cleanup: null,
    });
  }

  async start(name, context) {
    const feature = this.features.get(name);
    if (!feature || !feature.enabled || feature.status === 'ready') return;

    feature.status = 'starting';
    const result = await safely(`feature:${name}`, async () => feature.initializer(context), {
      onError: error => {
        feature.status = 'failed';
        this.eventBus.emit('feature:failed', { name, error, critical: feature.critical });
      },
    });

    if (feature.status === 'failed') {
      if (feature.critical) throw new Error(`Critical feature failed: ${name}`);
      return;
    }

    feature.cleanup = typeof result === 'function' ? result : result?.cleanup || null;
    feature.status = 'ready';
    this.eventBus.emit('feature:ready', { name });
  }

  async startAll(context) {
    for (const feature of this.features.values()) {
      await this.start(feature.name, context);
    }
  }

  async stop(name) {
    const feature = this.features.get(name);
    if (!feature) return;
    try {
      await feature.cleanup?.();
    } finally {
      feature.status = 'stopped';
      feature.cleanup = null;
    }
  }

  status() {
    return [...this.features.values()].map(({ name, critical, enabled, status }) => ({
      name,
      critical,
      enabled,
      status,
    }));
  }
}

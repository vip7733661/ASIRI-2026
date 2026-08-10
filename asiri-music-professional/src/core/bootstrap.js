import { EventBus } from './event-bus.js';
import { StorageService } from '../services/storage-service.js';
import { SpotifyClient } from '../services/spotify-client.js';
import { PlayerEngine } from '../services/player-engine.js';
import { FeatureRegistry } from './feature-registry.js';
import { installGlobalErrorBoundary } from './error-boundary.js';

const CLIENT_ID = '3ac122f971744e508bfd33ad0637d421';

export async function bootstrapApp({ features = [] } = {}) {
  const eventBus = new EventBus();
  const storage = new StorageService({ namespace: 'asiri.music', version: 2 });
  const spotify = new SpotifyClient({ clientId: CLIENT_ID, storage, eventBus });
  const player = new PlayerEngine({ spotify, eventBus });
  const registry = new FeatureRegistry({ eventBus });

  installGlobalErrorBoundary(eventBus);

  const context = Object.freeze({ eventBus, storage, spotify, player, registry });
  features.forEach(feature => registry.register(feature.name, feature.initialize, feature.options));

  eventBus.on('app:error', error => {
    const region = document.querySelector('[data-app-error]');
    if (!region) return;
    region.textContent = error.message || 'حدث خطأ غير متوقع';
    region.hidden = false;
  });

  await registry.startAll(context);
  eventBus.emit('app:ready', { features: registry.status() });

  return context;
}

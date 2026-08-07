import { AppError } from '../core/error-boundary.js';

export class PlayerEngine {
  constructor({ spotify, eventBus }) {
    this.spotify = spotify;
    this.eventBus = eventBus;
    this.sdkPlayer = null;
    this.deviceId = null;
    this.readyPromise = null;
    this.state = { track: null, paused: true, position: 0, duration: 0 };
  }

  async initialize() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.#initialize();
    return this.readyPromise;
  }

  async #initialize() {
    if (!window.Spotify?.Player) throw new AppError('SDK_NOT_READY', 'Spotify Web Playback SDK غير جاهز');

    this.sdkPlayer = new window.Spotify.Player({
      name: 'Asiri Music Player',
      getOAuthToken: async callback => callback(await this.spotify.getAccessToken()),
      volume: 0.75,
      enableMediaSession: true,
    });

    this.sdkPlayer.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id;
      this.eventBus.emit('player:ready', { deviceId: device_id });
    });
    this.sdkPlayer.addListener('not_ready', () => {
      this.deviceId = null;
      this.eventBus.emit('player:not-ready');
    });
    this.sdkPlayer.addListener('player_state_changed', state => this.#syncState(state));
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(type => {
      this.sdkPlayer.addListener(type, payload => this.eventBus.emit('player:error', { type, ...payload }));
    });

    const connected = await this.sdkPlayer.connect();
    if (!connected) throw new AppError('PLAYER_CONNECT_FAILED', 'تعذر ربط مشغل Asiri Music');
    return true;
  }

  #syncState(state) {
    if (!state) return;
    const track = state.track_window?.current_track;
    this.state = {
      track: track ? {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artists: track.artists || [],
        album: track.album || {},
        external_urls: track.external_urls || {},
      } : null,
      paused: state.paused,
      position: state.position || 0,
      duration: state.duration || 0,
    };
    this.eventBus.emit('player:state', this.state);
  }

  async ensureDevice(timeoutMs = 6000) {
    await this.initialize();
    if (this.deviceId) return this.deviceId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new AppError('PLAYER_NOT_READY', 'المشغل لم يصبح جاهزًا في الوقت المحدد'));
      }, timeoutMs);
      const off = this.eventBus.on('player:ready', ({ deviceId }) => {
        clearTimeout(timeout);
        off();
        resolve(deviceId);
      });
    });
  }

  async activate() {
    const deviceId = await this.ensureDevice();
    await this.spotify.put('/me/player', { device_ids: [deviceId], play: false });
    return deviceId;
  }

  async playUris(uris, { queueRemainder = true } = {}) {
    const validUris = [...new Set((uris || []).filter(Boolean))];
    if (!validUris.length) throw new AppError('EMPTY_QUEUE', 'لا توجد أغنيات للتشغيل');

    const deviceId = await this.activate();
    await this.spotify.put(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      uris: [validUris[0]],
    });

    let queued = 1;
    if (queueRemainder) {
      for (const uri of validUris.slice(1)) {
        try {
          await this.spotify.post(`/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${encodeURIComponent(deviceId)}`);
          queued += 1;
        } catch (error) {
          this.eventBus.emit('queue:item-failed', { uri, error });
        }
      }
    }

    this.eventBus.emit('queue:started', { requested: validUris.length, queued });
    return { requested: validUris.length, queued };
  }

  toggle() { return this.sdkPlayer?.togglePlay(); }
  next() { return this.sdkPlayer?.nextTrack(); }
  previous() { return this.sdkPlayer?.previousTrack(); }
  seek(positionMs) { return this.sdkPlayer?.seek(positionMs); }
  getState() { return { ...this.state }; }
}

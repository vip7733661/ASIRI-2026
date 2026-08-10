const STORAGE_PREFIX = 'asiri_music';
const STORAGE_VERSION = 1;

function key(name) {
  return `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${name}`;
}

export const storageService = {
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(key(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`[Asiri Music] Failed to read storage key: ${name}`, error);
      return fallback;
    }
  },

  set(name, value) {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[Asiri Music] Failed to write storage key: ${name}`, error);
      return false;
    }
  },

  remove(name) {
    try {
      localStorage.removeItem(key(name));
      return true;
    } catch (error) {
      console.error(`[Asiri Music] Failed to remove storage key: ${name}`, error);
      return false;
    }
  }
};

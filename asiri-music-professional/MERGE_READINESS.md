# Asiri Music Professional — Merge Readiness

## Current status

The professional core is isolated on `asiri-music-professional`. Production on `main` remains untouched.

## Completed architecture

- Central Event Bus with listener isolation.
- Versioned storage service with legacy migration support.
- Unified Spotify API client with token refresh deduplication, 401 retry, rate-limit handling, and normalized errors.
- Central Player Engine with device activation, resilient queue creation, state events, and partial queue failure handling.
- Feature Registry with lifecycle management and non-critical feature isolation.
- Global error boundary for runtime and promise failures.
- Safe application bootstrap with immutable shared context.
- Runtime health checks.

## Required migration order

1. Authentication and token storage.
2. Spotify API calls.
3. Player and queue commands.
4. Search.
5. Favorites and Taste Engine.
6. AI DJ and Smart Queue.
7. Driver Mode.
8. Analytics dashboard.

Each step must be merged separately and validated before the next step.

## Production gates

- No uncaught runtime errors during a 30-minute playback session.
- Login, refresh, search, single-track playback, queue playback, next, previous, and pause pass on iPhone Safari.
- A failed optional feature does not hide or freeze the main UI.
- Service Worker uses network-first for HTML, JS, and CSS.
- Existing local favorites and Taste data survive migration.
- No MutationObserver may observe `document.body` and mutate the same subtree without throttling and re-entry protection.
- No feature may create its own Spotify token refresh implementation.
- All Spotify playback commands route through PlayerEngine.

## Merge decision

The core foundation is ready. The full application is not yet ready for a one-shot merge. It should be integrated behind a feature flag and migrated module by module using the order above.

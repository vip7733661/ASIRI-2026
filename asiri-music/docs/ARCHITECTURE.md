# Asiri Music — Professional Architecture

## Objectives

- Keep `main` as the stable production release.
- Build and test all changes on `asiri-music-professional`.
- Separate Spotify integration, application state, storage, intelligence, and UI.
- Prevent one optional feature from crashing the application.
- Use explicit lifecycle methods and centralized error handling.

## Target structure

```text
asiri-music/
├── index.html
├── src/
│   ├── core/
│   │   ├── config.js
│   │   ├── event-bus.js
│   │   ├── errors.js
│   │   └── bootstrap.js
│   ├── services/
│   │   ├── storage.service.js
│   │   ├── spotify.service.js
│   │   └── telemetry.service.js
│   ├── player/
│   │   ├── player.controller.js
│   │   └── queue.service.js
│   ├── intelligence/
│   │   ├── taste-engine.js
│   │   ├── recommendation-engine.js
│   │   └── analytics-engine.js
│   ├── features/
│   │   ├── search/
│   │   ├── ai-dj/
│   │   ├── smart-queue/
│   │   ├── driver-mode/
│   │   └── dashboard/
│   └── ui/
│       ├── router.js
│       ├── components/
│       └── views/
├── tests/
└── docs/
```

## Stability rules

1. Optional features initialize inside isolated `try/catch` boundaries.
2. No feature may observe the entire document body with an unrestricted mutation loop.
3. Service Worker never caches JavaScript or HTML using stale-first behavior.
4. Spotify API calls pass through one service with timeout, token refresh, and normalized errors.
5. Application state is versioned and migrations are explicit.
6. Production promotion requires smoke tests for login, search, single-track playback, queue playback, favorites, and Driver Mode.

## Release flow

```text
feature branch → asiri-music-professional → smoke test → main
```

`main` remains deployable at all times.
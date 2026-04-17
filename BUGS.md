# Flutter Web Loading Bugs — Problem & Solution

This document explains the four runtime errors that can appear in the browser console
when a Flutter Web app fails to load, why they happen, and how to fix each one.

---

## The errors

```
flutter_bootstrap.js:31  Exception while loading service worker:
    Error: Service Worker API unavailable.
    The current context is NOT secure.

canvaskit.js:1  Failed to load resource: net::ERR_TIMED_OUT

main.dart.js:7381  Uncaught (in promise) Error: TypeError:
    Failed to fetch dynamically imported module:
    https://www.gstatic.com/flutter-canvaskit/<hash>/canvaskit.js

canvaskit.wasm:1  Failed to load resource: net::ERR_TIMED_OUT

flutter_bootstrap.js:3  Uncaught (in promise) TypeError: Failed to fetch
```

These are **two independent problems** that often appear together.

---

## Problem 1 — Service Worker API unavailable

### What you see
```
Exception while loading service worker: Error: Service Worker API unavailable.
The current context is NOT secure.
```

### Why it happens
Browsers only expose `navigator.serviceWorker` in a **secure context**. A page
counts as a secure context only if it is served from one of:

- `https://…`
- `http://localhost` or `http://127.0.0.1`
- `file://`

If you load the app from a plain-HTTP URL that is **not** `localhost` — for
example a LAN IP like `http://10.10.0.121:8000`, an office server, or a public
HTTP host — the Service Worker API is disabled and Flutter's bootstrap logs
this error. The app still runs, but offline caching is off.

### Solutions

| Environment | Fix |
|---|---|
| Local development | Use `http://localhost:<port>` (do **not** use the LAN IP). |
| Production | Serve the site over **HTTPS**. Get a certificate from Let's Encrypt, Cloudflare, or your hosting provider. |
| Internal/LAN testing | Either (a) add a TLS reverse proxy like Caddy, or (b) put a self-signed cert on the server and trust it on the test devices, or (c) accept that the service worker will be disabled — the app still works. |
| CI smoke test | Use `localhost` inside the runner, or a self-signed HTTPS dev server. |

If you don't need offline support at all, you can also **disable service-worker
registration** so the error never shows:

```dart
// In a custom web/flutter_bootstrap.js template:
_flutter.loader.load({
  serviceWorkerSettings: null,  // skip SW registration entirely
});
```

---

## Problem 2 — CanvasKit failed to load from gstatic.com

### What you see
```
canvaskit.js: net::ERR_TIMED_OUT
canvaskit.wasm: net::ERR_TIMED_OUT
Failed to fetch dynamically imported module:
    https://www.gstatic.com/flutter-canvaskit/<hash>/canvaskit.js
flutter_bootstrap.js:  Uncaught (in promise) TypeError: Failed to fetch
```

### Why it happens
Flutter Web's default renderer (**CanvasKit**) is a ~2 MB WASM module. To keep
your build small, Flutter by default downloads it at runtime from Google's CDN:

```
https://www.gstatic.com/flutter-canvaskit/<engine-hash>/canvaskit.{js,wasm}
```

If the browser cannot reach `gstatic.com`, the fetch hangs until the TCP
connection times out (`ERR_TIMED_OUT`), the dynamic `import()` rejects
(`Failed to fetch dynamically imported module`), and the whole Flutter bootstrap
aborts (`Failed to fetch`) — leaving a blank page.

Common reasons gstatic is unreachable:
- Offline / captive portal.
- Corporate firewall or school network blocks `gstatic.com`.
- Regions where Google services are restricted (e.g. mainland China).
- DNS blackhole, content filter, or Pi-hole.
- The user's machine literally has no internet, but the Flutter app itself was served from a local cache or intranet.

### Solution — bundle CanvasKit with your app (recommended)

Build with the CDN disabled so CanvasKit is served from your own host:

```bash
flutter build web --no-web-resources-cdn
```

This copies `canvaskit.js` / `canvaskit.wasm` into `build/web/canvaskit/` and
the bootstrap loads them from the **same origin** as your app. No external
network request, no firewall problem, no timeout.

Trade-off: your deployed bundle is ~2 MB bigger. For almost all apps this is
the right choice — it also makes the app fully self-contained and works offline
(once the service worker has cached it).

### Alternative — use the WebAssembly (skwasm) renderer

Flutter's newer WASM build is also self-hosted by default and doesn't need
gstatic:

```bash
flutter build web --wasm
```

Requires a browser with WASM-GC support (Chrome 119+, Firefox 120+, Safari 18.2+).

### Alternative — override `canvasKitBaseUrl` to your own mirror

If you already host CanvasKit somewhere (S3, a CDN you control, an internal
artifact server), point Flutter at it via a custom `web/flutter_bootstrap.js`:

```js
{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load({
  config: {
    canvasKitBaseUrl: "https://cdn.mycompany.com/flutter-canvaskit/"
  }
});
```

The engine hash subpath is appended automatically — upload the files to
`https://cdn.mycompany.com/flutter-canvaskit/<hash>/canvaskit.{js,wasm}`.

---

## Quick diagnosis checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| Only the service-worker error; app still runs | Served over HTTP on a non-localhost host | Use HTTPS or `localhost` |
| Only the CanvasKit timeouts; blank page | gstatic.com unreachable | `flutter build web --no-web-resources-cdn` |
| Both together | Deploy is HTTP-only **and** on a restricted network | Apply both fixes above |
| Works on dev machine, fails on user machine | User's network blocks gstatic | Bundle CanvasKit so no external fetch is needed |

---

## The fix in one command

For almost every real-world deployment, this single command fixes **both**
classes of errors once your host is configured for HTTPS:

```bash
flutter build web --no-web-resources-cdn
```

Then serve `build/web/` over HTTPS.

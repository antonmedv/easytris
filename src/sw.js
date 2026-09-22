const { version, files } = self.PRECACHE_MANIFEST;

const CACHE_NAME = `easytris-${version}`;
const CACHE_PREFIX = "easytris-";
const SHELL = "./";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(files)));
});

/**
 * No skipWaiting, deliberately. A worker that took over immediately would swap
 * the bundle under a game in progress, and the reload that follows is the one
 * thing a falling-blocks game cannot afford. A new deploy installs quietly and
 * takes effect the next time the game is opened.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      // Claiming matters on the first visit only, where there is no other worker
      // to disturb: without it the page that registered us would go uncontrolled
      // and offline would not work until the second launch.
      await self.clients.claim();
    })(),
  );
});

async function fromCache(request, key) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key, { ignoreSearch: true });
  return cached ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Everything else -- a POST, another origin's analytics -- is none of our
  // business, and left alone it goes straight to the network as it always did.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // The game is one page: every navigation within the scope is that page.
  const key = request.mode === "navigate" ? SHELL : request;
  event.respondWith(fromCache(request, key));
});

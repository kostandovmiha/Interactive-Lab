// Kids Playground: offline shell + all 18 Ukrainian voice clips.
const CACHE = "kids-playground-v5";
const SHELL = ["./", "./index.html", "./icon.svg", "./manifest.webmanifest", "./audio/phrases.json"];
const CLIPS = [
  "hello", "free", "red", "yellow", "blue", "green",
  "retry-red", "retry-yellow", "retry-blue", "retry-green",
  "great", "wonderful", "super", "hooray", "yes", "again",
  "excellent", "good-job"
].map(name => "./audio/" + name + ".ogg");

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Precache voice so the game can be installed and played offline.
    // If one audio URL is temporarily unavailable, keep the update installable.
    await Promise.allSettled(CLIPS.map(file => cache.add(file)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("kids-playground-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Network-first HTML avoids old versions being stuck after a game update.
    if (request.mode === "navigate" || url.pathname.endsWith("/kids-games/index.html")) {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || (await cache.match("./index.html")) || Response.error();
      }
    }
    // Cached clips and static assets work offline; newly fetched clips are cached.
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && url.pathname.includes("/kids-games/")) await cache.put(request, response.clone());
    return response;
  })());
});

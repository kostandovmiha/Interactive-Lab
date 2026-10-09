// Kids Playground: offline shell + all 28 Ukrainian voice clips.
const CACHE = "kids-playground-v7";
const SHELL = ["./", "./index.html", "./icon.svg", "./manifest.webmanifest", "./audio/phrases.json"];
const CLIPS = [
  "hello", "free",
  "red", "yellow", "blue", "green", "orange", "purple", "pink", "turquoise", "brown",
  "retry-red", "retry-yellow", "retry-blue", "retry-green",
  "retry-orange", "retry-purple", "retry-pink", "retry-turquoise", "retry-brown",
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
    // Support byte-range requests made by media decoders after seeking or app resume.
    if (request.headers.has("range") && url.pathname.includes("/kids-games/audio/") && url.pathname.endsWith(".ogg")) {
      const whole = await cache.match(url.href);
      if (!whole) return fetch(request);
      const buf = await whole.arrayBuffer();
      const bytes = buf.byteLength;
      const range = request.headers.get("range");
      const m = /^bytes=(\d*)-(\d*)$/.exec(range || "");
      if (!m || (!m[1] && !m[2])) return new Response(null, {
        status: 416, headers: {"Content-Range": "bytes */" + bytes}
      });
      const start = m[1] ? Number(m[1]) : Math.max(0, bytes - Number(m[2]));
      const end = m[2] && m[1] ? Math.min(bytes - 1, Number(m[2])) : bytes - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes || end < start) {
        return new Response(null, {status: 416, headers: {"Content-Range": "bytes */" + bytes}});
      }
      const headers = new Headers(whole.headers);
      headers.set("Content-Type", "audio/ogg");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Range", "bytes " + start + "-" + end + "/" + bytes);
      headers.set("Content-Length", String(end - start + 1));
      headers.delete("Content-Encoding");
      return new Response(buf.slice(start, end + 1), {status: 206, headers});
    }
    // Cached clips and static assets work offline; newly fetched clips are cached.
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && url.pathname.includes("/kids-games/")) await cache.put(request, response.clone());
    return response;
  })());
});

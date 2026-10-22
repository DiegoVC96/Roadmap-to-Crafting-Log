const CACHE_NAME = 'roadmap-to-crafting-log-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/roadmap-logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy))
          }

          return response
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/index.html')
          }

          return Response.error()
        })
    }),
  )
})

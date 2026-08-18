const SHARE_DB_NAME = 'nayla-share-target-db';
const SHARE_DB_VERSION = 1;
const SHARE_STORE_NAME = 'pending-shares';
const SHARE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const APP_SHELL_CACHE = 'nayla-app-shell-v1';
const APP_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/assets/imagenes/icon-192x192.png',
  '/assets/imagenes/icon-512x512.png',
  '/assets/imagenes/Icono-intro.jpeg',
  '/assets/imagenes/icono-9-16.jpeg'
];

const openShareDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
      db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id' });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
});

const savePendingShare = async (pendingShare) => {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SHARE_STORE_NAME, 'readwrite');
      transaction.objectStore(SHARE_STORE_NAME).put(pendingShare);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el archivo compartido.'));
      transaction.onabort = () => reject(transaction.error || new Error('Guardado de archivo compartido abortado.'));
    });
  } finally {
    db.close();
  }
};

const cleanupExpiredPendingShares = async () => {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const now = Date.now();
      const transaction = db.transaction(SHARE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SHARE_STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const pendingShare = cursor.value;
        if (!pendingShare.expiresAt || pendingShare.expiresAt < now) {
          cursor.delete();
        }
        cursor.continue();
      };

      request.onerror = () => reject(request.error || new Error('No se pudieron limpiar archivos expirados.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Error limpiando archivos expirados.'));
      transaction.onabort = () => reject(transaction.error || new Error('Limpieza de archivos expirados abortada.'));
    });
  } finally {
    db.close();
  }
};

const handleShareTarget = async (request) => {
  const formData = await request.formData();
  const sharedFiles = formData.getAll('media').filter((entry) => entry instanceof File && entry.size > 0);
  const now = Date.now();
  const shareId = self.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`;

  await cleanupExpiredPendingShares();

  if (sharedFiles.length > 0) {
    await savePendingShare({
      id: shareId,
      createdAt: now,
      expiresAt: now + SHARE_PENDING_TTL_MS,
      title: formData.get('title')?.toString() || '',
      text: formData.get('text')?.toString() || '',
      url: formData.get('url')?.toString() || '',
      files: sharedFiles.map((file) => ({
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        file
      }))
    });
  }

  return Response.redirect(`/share-target?share_id=${encodeURIComponent(shareId)}`, 303);
};

self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== APP_SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request))
  );
});

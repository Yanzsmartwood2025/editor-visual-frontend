import { SHARED_MEDIA_PENDING_TTL_MS } from './mediaUpload';

export type PendingShareFile = {
  name: string;
  type: string;
  lastModified: number;
  file: File;
};

export type PendingShare = {
  id: string;
  createdAt: number;
  expiresAt: number;
  title?: string;
  text?: string;
  url?: string;
  files: PendingShareFile[];
};

const DB_NAME = 'nayla-share-target-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-shares';

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('Error en IndexedDB.'));
  transaction.onabort = () => reject(transaction.error || new Error('Transacción de IndexedDB abortada.'));
});

export const getPendingShare = async (id: string): Promise<PendingShare | null> => {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    const result = await new Promise<PendingShare | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo leer el archivo pendiente.'));
    });
    await transactionDone(transaction);
    return result || null;
  } finally {
    db.close();
  }
};

export const deletePendingShare = async (id: string): Promise<void> => {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
};

export const cleanupExpiredPendingShares = async (): Promise<void> => {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const now = Date.now();
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        const pendingShare = cursor.value as PendingShare;
        if (!pendingShare.expiresAt || pendingShare.expiresAt < now) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error('No se pudieron limpiar archivos expirados.'));
    });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
};

export const isPendingShareExpired = (pendingShare: Pick<PendingShare, 'expiresAt' | 'createdAt'>): boolean => {
  const expiresAt = pendingShare.expiresAt || pendingShare.createdAt + SHARED_MEDIA_PENDING_TTL_MS;
  return expiresAt < Date.now();
};

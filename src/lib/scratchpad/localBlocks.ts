export type LocalBlockRow = {
  id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  date: string | null; // YYYY-MM-DD
  order_index: number;
  created_at: string;
  updated_at: string;
};

type DirtyRow = { id: string; user_id: string; at: number };

const DB_NAME = "bacup_local";
const DB_VERSION = 1;

const STORE_BLOCKS = "blocks";
const STORE_DIRTY = "blocks_dirty";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BLOCKS)) {
        const s = db.createObjectStore(STORE_BLOCKS, { keyPath: "id" });
        s.createIndex("by_user_date", ["user_id", "date"]);
        s.createIndex("by_user", "user_id");
      }
      if (!db.objectStoreNames.contains(STORE_DIRTY)) {
        const s = db.createObjectStore(STORE_DIRTY, { keyPath: "id" });
        s.createIndex("by_user", "user_id");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function localGetBlocksForDate(userId: string, ymd: string) {
  const db = await openDb();
  const tx = db.transaction([STORE_BLOCKS], "readonly");
  const store = tx.objectStore(STORE_BLOCKS);
  const idx = store.index("by_user_date");
  const req = idx.getAll([userId, ymd]);
  const rows = await new Promise<LocalBlockRow[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result ?? []) as LocalBlockRow[]);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return rows.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

export async function localUpsertBlocks(rows: LocalBlockRow[]) {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction([STORE_BLOCKS], "readwrite");
  const store = tx.objectStore(STORE_BLOCKS);
  for (const r of rows) store.put(r);
  await txDone(tx);
}

export async function localMarkDirty(userId: string, blockIds: string[]) {
  if (blockIds.length === 0) return;
  const db = await openDb();
  const tx = db.transaction([STORE_DIRTY], "readwrite");
  const store = tx.objectStore(STORE_DIRTY);
  const now = Date.now();
  for (const id of blockIds) {
    const row: DirtyRow = { id: `${userId}:${id}`, user_id: userId, at: now };
    store.put(row);
  }
  await txDone(tx);
}

export async function localPopDirtyBatch(userId: string, limit = 50) {
  const db = await openDb();
  const tx = db.transaction([STORE_DIRTY], "readwrite");
  const store = tx.objectStore(STORE_DIRTY);
  const idx = store.index("by_user");
  const req = idx.openCursor(IDBKeyRange.only(userId));

  const keys: string[] = [];
  const blockIds: string[] = [];
  await new Promise<void>((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || keys.length >= limit) return resolve();
      const key = String(cursor.primaryKey);
      keys.push(key);
      const rawId = key.slice(`${userId}:`.length);
      blockIds.push(rawId);
      cursor.continue();
    };
  });

  // delete popped
  for (const k of keys) store.delete(k);
  await txDone(tx);
  return blockIds;
}


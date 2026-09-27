import { createWorld, isWorld, sanitizeWorld, type World } from './world';

const LEGACY_KEY = 'golden-courtyard.world.v1';
const ACTIVE_KEY = 'golden-courtyard.active.v1';
const BRANCHES_KEY = 'golden-courtyard.branches.v1';
const DATABASE = 'golden-courtyard';
const STORE = 'worlds';

export interface Branch { id: string; name: string }

export function branches(): Branch[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BRANCHES_KEY) ?? '[]');
    if (Array.isArray(value)) return [{ id: 'main', name: '主庭院' }, ...value.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.id !== 'main')];
  } catch { /* Keep the main courtyard available. */ }
  return [{ id: 'main', name: '主庭院' }];
}

export function activeBranch(): string {
  const id = localStorage.getItem(ACTIVE_KEY) ?? 'main';
  return branches().some((branch) => branch.id === id) ? id : 'main';
}

export function rememberBranch(branch: Branch): void {
  localStorage.setItem(BRANCHES_KEY, JSON.stringify([...branches().filter((entry) => entry.id !== 'main'), branch]));
}

export function selectBranch(id: string): void { localStorage.setItem(ACTIVE_KEY, id); }

export function legacyWorld(): World {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return createWorld();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isWorld(parsed)) {
      const clean = sanitizeWorld(parsed);
      if (clean !== parsed) localStorage.setItem(`${LEGACY_KEY}.recovered`, raw);
      return clean;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  localStorage.setItem(`${LEGACY_KEY}.corrupt`, raw);
  return createWorld();
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readWorld(id: string): Promise<World | null> {
  if (typeof indexedDB === 'undefined') return id === 'main' ? legacyWorld() : null;
  const db = await database();
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value === undefined) return null;
    if (!isWorld(value)) throw new Error('本地庭院存档已损坏；请先导出浏览器数据或导入备份，原存档不会被覆盖。');
    const clean = sanitizeWorld(value);
    if (clean !== value) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(value, `${id}.recovered`);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    return clean;
  } finally { db.close(); }
}

export async function readRawWorld(id: string): Promise<unknown> {
  const legacy = () => id === 'main' ? localStorage.getItem(LEGACY_KEY)
    ?? localStorage.getItem(`${LEGACY_KEY}.corrupt`)
    ?? localStorage.getItem(`${LEGACY_KEY}.recovered`) : null;
  if (typeof indexedDB === 'undefined') return legacy();
  const db = await database();
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === undefined ? legacy() : value;
  } finally { db.close(); }
}

export async function writeWorld(id: string, world: World): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    if (id !== 'main') throw new Error('当前浏览器不支持多庭院存档。');
    localStorage.setItem(LEGACY_KEY, JSON.stringify(world));
    return;
  }
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(world, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (id === 'main') localStorage.removeItem(LEGACY_KEY);
  } finally { db.close(); }
}

export async function openWorld(id: string): Promise<World> {
  const saved = await readWorld(id);
  if (saved) return saved;
  if (id !== 'main') throw new Error('找不到这个分支的存档。');
  const world = legacyWorld();
  await writeWorld('main', world);
  return world;
}

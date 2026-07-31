import { supabase, cloudConfigured, fetchCloudSave, pushCloudSave } from "./supabase.js";

/* =======================================================================
   Storage — offline first, cloud second.

   The phone's own storage stays the working copy: the app must be fully
   usable in a gym basement with no signal, and a failed network call must
   never cost someone a logged workout. The cloud is a mirror that catches
   up when it can.

   Interface is deliberately identical to the old window.storage shim
   (get/set returning { value }), so the game code needs no changes.
   ======================================================================= */

const KEY = "rlxp-state-v1";
const BACKUP_KEY = "rlxp-state-v1.backup";
const REV_KEY = "rlxp-revision";
const PENDING_KEY = "rlxp-pending-sync";
const CONFLICT_KEY = "rlxp-conflict-backup";

let currentUserId = null;
let pushTimer = null;
let lastPushedJson = null;
const listeners = new Set();

function safeGet(k) {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function safeSet(k, v) {
  try {
    window.localStorage.setItem(k, v);
    return true;
  } catch (e) {
    return false;
  }
}

export function localStorageWorks() {
  try {
    const probe = "__rlxp_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false;
  }
}

function getRevision() {
  const n = parseInt(safeGet(REV_KEY) || "0", 10);
  return Number.isFinite(n) ? n : 0;
}
function bumpRevision() {
  const next = getRevision() + 1;
  safeSet(REV_KEY, String(next));
  return next;
}

export function syncState() {
  return {
    cloudConfigured,
    signedIn: Boolean(currentUserId),
    pending: safeGet(PENDING_KEY) === "1",
    hadConflict: Boolean(safeGet(CONFLICT_KEY)),
  };
}

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  const s = syncState();
  listeners.forEach((fn) => {
    try {
      fn(s);
    } catch (e) {
      /* ignore */
    }
  });
}

/* How much real progress a save represents. Used only as a safety net so a
   sync can never quietly replace a bigger save with a smaller one. */
function weigh(payload) {
  if (!payload || typeof payload !== "object") return -1;
  const history = Array.isArray(payload.history) ? payload.history.length : 0;
  const xp = Number(payload.totalXp) || 0;
  return history * 1000 + xp;
}

export const storage = {
  async get(key) {
    const raw = safeGet(key === KEY ? KEY : key);
    return raw == null ? null : { key, value: raw };
  },

  async set(key, value) {
    const ok = safeSet(key, value);
    if (ok && key === KEY) {
      const prev = safeGet(BACKUP_KEY);
      // rolling one-deep backup, so a corrupt write is recoverable
      if (prev !== value) safeSet(BACKUP_KEY, safeGet(KEY) || "");
      bumpRevision();
      schedulePush(value);
    }
    return ok ? { key, value } : null;
  },

  async delete(key) {
    try {
      window.localStorage.removeItem(key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },
};

/* ---- cloud push, debounced ---- */

function schedulePush(json) {
  if (!cloudConfigured || !currentUserId) return;
  safeSet(PENDING_KEY, "1");
  notify();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => flushPush(json), 1500);
}

async function flushPush(jsonArg) {
  if (!cloudConfigured || !currentUserId) return;
  const json = jsonArg ?? safeGet(KEY);
  if (!json || json === lastPushedJson) {
    safeSet(PENDING_KEY, "0");
    notify();
    return;
  }
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    return;
  }
  try {
    await pushCloudSave(currentUserId, payload, getRevision());
    lastPushedJson = json;
    safeSet(PENDING_KEY, "0");
  } catch (e) {
    // Stays pending; retried on the next save, on reconnect, or on next load.
    safeSet(PENDING_KEY, "1");
  }
  notify();
}

export async function flushNow() {
  if (pushTimer) clearTimeout(pushTimer);
  await flushPush();
}

/* ---- sign-in handoff ---- */

/**
 * Called once a user is known. Reconciles the phone's save with the cloud's
 * and returns the JSON the game should boot from.
 *
 * Rules, in order:
 *  1. Nothing in the cloud -> upload whatever is on the phone (first login,
 *     or a brand-new device for an existing offline player).
 *  2. Nothing on the phone -> adopt the cloud save (new device).
 *  3. Both exist -> take the higher revision, EXCEPT never accept a save
 *     that represents less progress than the one being replaced. The losing
 *     copy is kept in local storage rather than discarded.
 */
export async function reconcileOnSignIn(userId) {
  currentUserId = userId || null;
  notify();
  const localJson = safeGet(KEY);
  if (!cloudConfigured || !userId) return localJson;

  let cloud = null;
  try {
    cloud = await fetchCloudSave(userId);
  } catch (e) {
    // Offline or the table isn't set up yet: carry on with the local save.
    return localJson;
  }

  if (!cloud || !cloud.payload) {
    if (localJson) await flushPush(localJson);
    return localJson;
  }

  const cloudJson = JSON.stringify(cloud.payload);
  if (!localJson) {
    safeSet(KEY, cloudJson);
    safeSet(REV_KEY, String(cloud.revision || 1));
    lastPushedJson = cloudJson;
    notify();
    return cloudJson;
  }

  let localPayload = null;
  try {
    localPayload = JSON.parse(localJson);
  } catch (e) {
    localPayload = null;
  }

  const localRev = getRevision();
  const cloudRev = Number(cloud.revision) || 0;
  const localWeight = weigh(localPayload);
  const cloudWeight = weigh(cloud.payload);

  const cloudWins = cloudRev > localRev && cloudWeight >= localWeight;

  if (cloudWins) {
    // Keep the replaced local copy — recoverable rather than gone.
    safeSet(CONFLICT_KEY, localJson);
    safeSet(KEY, cloudJson);
    safeSet(REV_KEY, String(cloudRev));
    lastPushedJson = cloudJson;
    notify();
    return cloudJson;
  }

  if (cloudWeight > localWeight && cloudRev <= localRev) {
    // Divergence: the cloud holds more logged work than this phone does.
    // Prefer the fuller record and keep the local one aside.
    safeSet(CONFLICT_KEY, localJson);
    safeSet(KEY, cloudJson);
    safeSet(REV_KEY, String(Math.max(cloudRev, localRev) + 1));
    lastPushedJson = null;
    await flushPush(cloudJson);
    notify();
    return cloudJson;
  }

  await flushPush(localJson);
  return localJson;
}

export function clearUser() {
  currentUserId = null;
  lastPushedJson = null;
  notify();
}

export function recoverConflictBackup() {
  return safeGet(CONFLICT_KEY);
}
export function dismissConflictBackup() {
  try {
    window.localStorage.removeItem(CONFLICT_KEY);
  } catch (e) {
    /* ignore */
  }
  notify();
}

/* Retry a stalled sync as soon as the network returns or the app refocuses. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => flushPush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushPush();
  });
  window.addEventListener("pagehide", () => {
    if (pushTimer) clearTimeout(pushTimer);
    flushPush();
  });
}

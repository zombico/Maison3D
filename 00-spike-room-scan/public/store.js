// Scans kept in this browser, newest first: the headset keeps what it saw even with no laptop around.
// localStorage holds a few MB; a scan with the global mesh may not fit, and then lives only until the page reloads.
const KEY = 'maison3d.scans';
const KEEP = 20;
const unsaved = []; // { name, scan } too big to persist

function stored() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function scanName(scan) {
  return `scan-${scan.capturedAt.replace(/[:.]/g, '-')}-${scan.reason}`;
}

export function listScans() {
  return [...unsaved, ...stored()].sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Keeps `scan`; returns { name, persisted }. */
export function keepScan(scan) {
  const name = scanName(scan);
  const all = [{ name, scan }, ...stored()].slice(0, KEEP);
  // drop the oldest until it fits; if even the new one alone does not, hold it in memory
  while (all.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
      return { name, persisted: true };
    } catch {
      all.pop();
      if (!all.length) break;
    }
  }
  unsaved.unshift({ name, scan });
  return { name, persisted: false };
}

export function clearScans() {
  unsaved.length = 0;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

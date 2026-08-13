/** The key that authorises writing to the catalog — the value of
 *  CATALOG_WRITE_KEY on the deployment. Asked for once per device and kept
 *  here, since every page that changes the catalog needs it. */

const STORAGE_KEY = "cardCatalog.writeKey.v1";

/** Guarded because Safari throws on localStorage in private browsing rather
 *  than returning null, which would take the page down on load. */
export function readCatalogKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberCatalogKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* not remembering it is survivable; it just gets asked for again */
  }
}

export function forgetCatalogKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up if it was never stored */
  }
}

/** True for the one failure worth asking about again. Anything else is the
 *  server's problem, and retyping the key won't fix it. */
export const isWrongKey = (error: string) => /wrong key/i.test(error);

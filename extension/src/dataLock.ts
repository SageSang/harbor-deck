/** Coordinate import with writes from other extension pages; no lock state is persisted. */
export async function withExtensionDataLock<T>(work: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('harbordeck-user-data', work)
}

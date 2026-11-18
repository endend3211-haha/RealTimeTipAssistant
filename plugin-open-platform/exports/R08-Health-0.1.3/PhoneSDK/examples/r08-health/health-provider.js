/**
 * Replace this adapter with the manufacturer-confirmed MemoMind GATT Bridge.
 * The rest of the plugin consumes this contract.
 *
 * readHealth() returns {
 *   measurements: [{ id, nameKo, nameEn, value, unit, measuredAt, state }],
 *   records: [{ timestamp, hr }],
 *   queriedAt: unixMilliseconds
 * }
 * state is measured, empty, unsupported, pending, or error.
 * measuredAt must be the ring's measurement time when known, otherwise null.
 * Zero must not be interpreted as an absent step count.
 * Unknown metrics are retained and displayed using their supplied names.
 * Real reads must use current list_id/handles and verify ring checksums.
 */
export async function readHealth() {
  const error = new Error('MemoMind GATT Bridge integration pending');
  error.code = 'GATT_BRIDGE_PENDING';
  throw error;
}

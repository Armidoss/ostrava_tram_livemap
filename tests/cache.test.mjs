import { test } from 'node:test';
import assert from 'node:assert/strict';
test('route cache query enforces expiry and remains parameterized', async () => {
  process.env.DATABASE_URL = 'postgres://test-only';
  globalThis.__ostravaTramSchemaReady = Promise.resolve();
  let fresh = true;
  globalThis.__ostravaTramPool = { async query(sql, values) {
    assert.match(sql, /fetched_at > now\(\) - interval '6 hours'/);
    assert.match(sql, /route_key = \$1/);
    assert.deepEqual(values, ['1:8:42:0']);
    return { rows: fresh ? [{ route: [{ lat: 49.8, lng: 18.2 }, { lat: 49.81, lng: 18.21 }], stops: [], geometry_available: true }] : [] };
  }};
  const { getCachedVehicleRoute } = await import('../lib/db.ts');
  const request = { cat: 1, num1: '8', num2: '42' };
  assert.ok(await getCachedVehicleRoute(request));
  fresh = false;
  assert.equal(await getCachedVehicleRoute(request), null);
});

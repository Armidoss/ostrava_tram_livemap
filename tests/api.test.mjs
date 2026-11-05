import { test } from 'node:test';
import assert from 'node:assert/strict';

test('collector fails closed without triggering upstream', async () => {
  const { GET } = await import('../app/api/collect/route.ts');
  const original = process.env.CRON_SECRET;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('Must not fetch'); };
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request('http://local/api/collect'))).status, 503);
    process.env.CRON_SECRET = 'test-only';
    assert.equal((await GET(new Request('http://local/api/collect'))).status, 401);
    assert.equal((await GET(new Request('http://local/api/collect', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});
test('route rejects malformed and unbounded parameters', async () => {
  const { POST } = await import('../app/api/vehicle-route/route.ts');
  for (const body of [{}, { num1: '8', num2: '2', cat: 0.5 }, { num1: 'x'.repeat(100), num2: '2', cat: 1 }]) {
    const response = await POST(new Request('http://local/api/vehicle-route', { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
  }
});
test('history rejects invalid minutes before database access', async () => {
  const { GET } = await import('../app/api/vehicle-history/[vehicleId]/route.ts');
  for (const minutes of ['NaN', '-1', '1441', '1.5']) assert.equal((await GET(new Request(`http://local/?minutes=${minutes}`), { params: Promise.resolve({ vehicleId: '42' }) })).status, 400);
});
test('upstream malformed JSON and timeout are controlled; collection deduplicates fallback', async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMpvnetVehicles } = await import('../lib/mpvnet.ts');
  try {
    globalThis.fetch = async (_url, options) => { assert.ok(options.signal); return new Response('invalid JSON'); };
    await assert.rejects(fetchMpvnetVehicles());
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new DOMException('Timed out', 'TimeoutError'); };
    const { collectVehiclePositions } = await import('../lib/vehicle-collector.ts');
    const results = await Promise.all([collectVehiclePositions(), collectVehiclePositions()]);
    assert.equal(calls, 1); assert.equal(results[0].source, 'demo'); assert.equal(results[0].persisted, false);
    assert.equal(results[0], results[1]);
  } finally { globalThis.fetch = originalFetch; }
});

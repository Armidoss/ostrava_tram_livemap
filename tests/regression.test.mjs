import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicles } from '../lib/vehicle-normalizer.ts';
const point = { id: '42', lat: 49.82, lng: 18.26, line: '8' };
test('normalizes nested formats and deduplicates stable identities', () => {
  const result = normalizeVehicles({ data: [point, point] });
  assert.equal(result.length, 1); assert.equal(result[0].type, 'tram');
});
test('rejects invalid and empty coordinates', () => {
  assert.equal(normalizeVehicles([{ ...point, lat: 90 }, { ...point, lng: '' }]).length, 0);
});
test('MPVnet x/y coordinates and trolleybus category', () => {
  const [vehicle] = normalizeVehicles({ items: [{ id: 'a', x: 49.82, y: 18.26, type: 'trolleybus', line: '102' }] });
  assert.equal(vehicle.type, 'trolleybus'); assert.equal(vehicle.lng, 18.26);
});
test('upstream text remains text and not executable data', () => {
  const [vehicle] = normalizeVehicles([{ ...point, line: '<img src=x onerror="globalThis.pwned=1">' }]);
  assert.equal(typeof vehicle.line, 'string'); assert.equal(globalThis.pwned, undefined);
});

test('marker places malicious HTML only in textContent', async () => {
  const { createMarkerElement } = await import('../lib/marker-element.ts');
  // This DOM contract deliberately throws on HTML sinks or event properties.
  globalThis.document = { createElement(tag) {
    return new Proxy({ tag, children: [], style: {}, append(...nodes) { this.children.push(...nodes); } }, {
      set(target, key, value) { assert.notEqual(key, 'innerHTML'); assert.ok(!String(key).startsWith('on')); target[key] = value; return true; }
    });
  }};
  const element = createMarkerElement('<img onerror=alert(1)>', 'vehicle-marker--tram', false, NaN);
  assert.equal(element.children[1].tag, 'span');
  assert.equal(element.children[1].textContent, '<img onerror=ale');
  assert.ok(!element.children[0].style.transform.includes('NaN'));
  delete globalThis.document;
});

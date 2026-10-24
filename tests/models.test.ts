import test from 'node:test';
import assert from 'node:assert/strict';
import { vehicleIdentifier } from '../src/models';
test('accepts manual registration and QR identifiers', () => {
  assert.equal(vehicleIdentifier(' as 01 uc 8803 '), 'AS 01 UC 8803');
  assert.equal(vehicleIdentifier('{"vehicleId":"BUS-014"}'), 'BUS-014');
  assert.equal(vehicleIdentifier('{"vehicleNumber":"AS 01 UC 8803"}'), 'AS 01 UC 8803');
});
test('rejects unrelated, malformed, or non-string QR content', () => {
  for (const value of ['', 'https://untrusted.example', '{bad', '{"vehicleId":123}', '{"other":"value"}', 'x'.repeat(41)]) assert.throws(() => vehicleIdentifier(value));
});

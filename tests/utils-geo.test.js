import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, sameCoordinate } from '../src/utils/geo.js';

test('distanceMeters returns zero for the same point', () => {
  assert.equal(distanceMeters([41.563, 2.008], [41.563, 2.008]), 0);
});

test('distanceMeters calculates a known equatorial distance', () => {
  const distance = distanceMeters([0, 0], [0, 1]);
  assert.ok(Math.abs(distance - 111_195) < 1);
});

test('distanceMeters is symmetric for latitude and longitude coordinates', () => {
  const terrassa = [41.563, 2.008];
  const barcelona = [41.387, 2.17];
  assert.equal(distanceMeters(terrassa, barcelona), distanceMeters(barcelona, terrassa));
});

test('sameCoordinate compares latitude and longitude using a small tolerance', () => {
  assert.equal(sameCoordinate([41, 2], [41 + 1e-8, 2 - 1e-8]), true);
  assert.equal(sameCoordinate([41, 2], [41 + 1e-6, 2]), false);
});

test('sameCoordinate accepts a caller-provided tolerance', () => {
  assert.equal(sameCoordinate([41, 2], [41.001, 2], 0.002), true);
});

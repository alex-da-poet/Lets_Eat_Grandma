/**
 * Tests for the deterministic measurement layer.
 * Run with:  node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVague,
  convertUnit,
  normalizeIngredient,
  parseLooseNumber
} from './measurements.js';

test('resolveVague handles articles and casing', () => {
  assert.equal(resolveVague('a pinch').unit, 'tsp');
  assert.equal(resolveVague('Pinch').unit, 'tsp');
  assert.equal(resolveVague('an obscure thing'), null);
});

test('parseLooseNumber handles fractions, mixed, ranges, unicode', () => {
  assert.equal(parseLooseNumber('1 1/2'), 1.5);
  assert.equal(parseLooseNumber('3/4'), 0.75);
  assert.equal(parseLooseNumber('2-3'), 2.5);
  assert.equal(parseLooseNumber('½'), 0.5);
  assert.equal(parseLooseNumber('2'), 2);
  assert.equal(parseLooseNumber('a'), null);
});

test('convertUnit: 1 cup → ~237 ml metric and ~1 cup US', () => {
  const c = convertUnit(1, 'cup');
  assert.equal(c.metric.unit, 'ml');
  assert.ok(Math.abs(c.metric.value - 237) < 1);
  assert.equal(c.us.unit, 'cup');
});

test('convertUnit: 500 g stays 500 g metric and ~1.1 lb US', () => {
  const c = convertUnit(500, 'g');
  assert.equal(c.metric.unit, 'g');
  assert.equal(c.metric.value, 500);
  assert.equal(c.us.unit, 'lb');
  assert.ok(Math.abs(c.us.value - 1.1) < 0.05);
});

test('convertUnit: 1500 g → 1.5 kg metric', () => {
  const c = convertUnit(1500, 'g');
  assert.equal(c.metric.unit, 'kg');
  assert.equal(c.metric.value, 1.5);
});

test('convertUnit returns null for non-convertible units', () => {
  assert.equal(convertUnit(3, 'count'), null);
  assert.equal(convertUnit(1, 'clove'), null);
});

test('normalizeIngredient: "a pinch of salt" becomes quantified', () => {
  const n = normalizeIngredient({ item: 'salt', quantity: '', unit: 'pinch', original: 'a pinch of salt' });
  // 1/16 tsp ≈ 0.308 ml
  assert.ok(n.metric.value > 0);
  assert.equal(n.metric.unit, 'ml');
  assert.ok(n.notes.some(x => x.includes('pinch')));
});

test('normalizeIngredient: "2 pinches" multiplies the vague amount', () => {
  const one = normalizeIngredient({ item: 'pepper', quantity: '1', unit: 'pinch', original: '1 pinch' });
  const two = normalizeIngredient({ item: 'pepper', quantity: '2', unit: 'pinch', original: '2 pinches' });
  assert.ok(two.metric.value > one.metric.value);
});

test('normalizeIngredient: "a bag of flour" resolves to 500 g', () => {
  const n = normalizeIngredient({ item: 'flour', quantity: '', unit: 'bag', original: 'a bag of flour' });
  assert.equal(n.metric.value, 500);
  assert.equal(n.metric.unit, 'g');
  assert.ok(n.notes.some(x => x.toLowerCase().includes('bag')));
});

test('normalizeIngredient: "a knob of butter" ≈ 15 g', () => {
  const n = normalizeIngredient({ item: 'butter', quantity: '', unit: 'knob', original: 'a knob of butter' });
  assert.equal(n.metric.value, 15);
  assert.equal(n.metric.unit, 'g');
});

test('normalizeIngredient: "to taste" passes through without a quantity', () => {
  const n = normalizeIngredient({ item: 'salt', quantity: '', unit: 'to taste', original: 'salt to taste' });
  assert.equal(n.quantity, null);
  assert.equal(n.unit, 'to taste');
});

test('normalizeIngredient: counted eggs need no conversion', () => {
  const n = normalizeIngredient({ item: 'eggs', quantity: '3', unit: 'count', original: '3 eggs' });
  assert.equal(n.metric, null);
  assert.ok(n.notes.some(x => x.includes('counted')));
});

test('normalizeIngredient: "2 cups sugar" produces both systems', () => {
  const n = normalizeIngredient({ item: 'sugar', quantity: '2', unit: 'cup', original: '2 cups sugar' });
  assert.equal(n.metric.unit, 'ml');          // ~473 ml
  assert.ok(Math.abs(n.metric.value - 473) < 2);
  assert.equal(n.us.unit, 'cup');
});

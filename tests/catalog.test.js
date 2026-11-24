import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { recommend } from '../src/worker.js';

test('incluye más de 100 títulos de cada tipo', () => {
  for (const type of ['book', 'movie', 'series']) {
    assert.ok(CATALOG.filter(item => item.type === type).length > 100);
  }
});

test('todos los IDs son únicos y los datos esenciales son válidos', () => {
  assert.equal(new Set(CATALOG.map(item => item.id)).size, CATALOG.length);
  for (const item of CATALOG) {
    assert.ok(item.title && item.genre && item.description);
    assert.ok(item.rating >= 1 && item.rating <= 5);
  }
});

test('el recomendador excluye favoritos y prioriza el género elegido', () => {
  const liked = CATALOG.find(item => item.type === 'book' && item.genre === 'Fantasía');
  const result = recommend(CATALOG, { likedIds: [liked.id], preferredTypes: ['book'], preferredGenres: ['Fantasía'], limit: 10 });
  assert.equal(result.length, 10);
  assert.ok(!result.some(item => item.id === liked.id));
  assert.ok(result.slice(0, 5).every(item => item.type === 'book' && item.genre === 'Fantasía'));
});

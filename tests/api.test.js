import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

async function call(path, options = {}) {
  const response = await worker.fetch(new Request(`https://example.test${path}`, options), {});
  return { response, body: await response.json() };
}

test('health informa 360 elementos', async () => {
  const { response, body } = await call('/api/health');
  assert.equal(response.status, 200);
  assert.equal(body.catalog, 360);
  assert.equal(body.database, false);
});

test('catálogo filtra y pagina 120 libros', async () => {
  const { body } = await call('/api/catalog?type=book&limit=60&page=1');
  assert.equal(body.total, 120);
  assert.equal(body.pages, 2);
  assert.equal(body.items.length, 60);
  assert.ok(body.items.every(item => item.type === 'book'));
});

test('API devuelve 12 recomendaciones válidas', async () => {
  const { response, body } = await call('/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preferredTypes: ['movie'], preferredGenres: ['Ciencia ficción'], limit: 12 })
  });
  assert.equal(response.status, 200);
  assert.equal(body.items.length, 12);
  assert.ok(body.items.slice(0, 5).every(item => item.type === 'movie' && item.genre === 'Ciencia ficción'));
});

test('votar sin D1 falla de forma explícita', async () => {
  const { response, body } = await call('/api/votes', { method: 'POST', body: '{}' });
  assert.equal(response.status, 503);
  assert.match(body.error, /base de datos/i);
});

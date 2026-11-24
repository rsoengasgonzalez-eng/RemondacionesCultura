import { CATALOG } from '../src/catalog.js';
const types = ['book', 'movie', 'series'];
const errors = [];
for (const type of types) {
  const items = CATALOG.filter(item => item.type === type);
  if (items.length <= 100) errors.push(`${type}: solo ${items.length} elementos`);
}
if (new Set(CATALOG.map(item => item.id)).size !== CATALOG.length) errors.push('Hay IDs duplicados');
for (const item of CATALOG) {
  if (!item.id || !item.title || !item.genre || item.rating < 1 || item.rating > 5) errors.push(`Elemento inválido: ${item.id}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Catálogo válido: ${CATALOG.length} títulos (${types.map(t => `${t}=${CATALOG.filter(i => i.type === t).length}`).join(', ')}).`);

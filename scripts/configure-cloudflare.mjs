import fs from 'node:fs';
const id = process.argv[2];
if (!id || !/^[a-f0-9-]{20,}$/i.test(id)) {
  console.error('Uso: npm run configure -- <DATABASE_ID_DE_D1>');
  process.exit(1);
}
const file = new URL('../wrangler.toml', import.meta.url);
const text = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, text.replace(/database_id = ".*"/, `database_id = "${id}"`));
console.log('wrangler.toml configurado. Ya puedes aplicar migraciones y desplegar.');

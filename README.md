# RecomiendaTop

Aplicación comunitaria en español para descubrir, votar y recomendar **libros, películas y series**. Está preparada para GitHub y se despliega en **Cloudflare Workers** con **D1** y activos estáticos.

## Qué incluye

- **360 títulos reales y curados**: 120 libros, 120 películas y 120 series.
- Catálogo con búsqueda, filtros por tipo/género, orden y paginación.
- Votos de 1 a 5 estrellas; un voto por dispositivo y título, actualizable.
- Rankings general y por categoría, recalculados con votos de la comunidad.
- Recomendador por formato, género, favoritos y votos positivos.
- Formulario para que la comunidad sugiera nuevos títulos.
- Diseño responsive, accesible, PWA instalable y sin framework de frontend.
- Flujo CI/CD de GitHub Actions para probar, migrar D1 y desplegar.

## Arquitectura

```text
Navegador (HTML/CSS/JS)
        │
        ├── /api/catalog, /api/top, /api/recommendations
        ├── /api/votes
        └── /api/suggestions
                 │
       Cloudflare Worker ─── Cloudflare D1
                 │
         Static Assets (public/)
```

El catálogo curado vive en `src/catalog.js`. D1 guarda solo datos de comunidad (votos y sugerencias), por lo que el primer despliegue no necesita importar cientos de registros.

## Desarrollo local

Requisitos: Node.js 20 o superior y una cuenta de Cloudflare.

```bash
npm install
npm test
npm run db:local
npm run dev
```

Wrangler mostrará la URL local, normalmente `http://localhost:8787`.

## Primer despliegue en Cloudflare

1. Inicia sesión:

   ```bash
   npx wrangler login
   ```

2. Crea la base D1:

   ```bash
   npx wrangler d1 create recomienda-top-db
   ```

3. Copia el `database_id` que devuelve Cloudflare y actualiza la configuración:

   ```bash
   npm run configure -- TU_DATABASE_ID
   ```

4. Aplica el esquema y despliega:

   ```bash
   npm run db:remote
   npm run deploy
   ```

Al finalizar, Wrangler devuelve una dirección similar a `https://recomienda-top.<subdominio>.workers.dev`.

> No subas `wrangler.toml` a producción dejando `REEMPLAZA_CON_TU_DATABASE_ID`; el despliegue fallará de forma intencionada hasta configurar D1.

## Publicarlo en GitHub

Crea un repositorio vacío en GitHub y, desde esta carpeta, ejecuta:

```bash
git init
git add .
git commit -m "feat: crear RecomiendaTop"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/recomienda-top.git
git push -u origin main
```

### Despliegue automático desde GitHub Actions

El flujo `.github/workflows/deploy.yml` se ejecuta en cada `push` a `main`.

Añade estos secretos en **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: token con permisos para editar Workers y D1.
- `CLOUDFLARE_ACCOUNT_ID`: identificador de la cuenta de Cloudflare.

Antes del primer `push`, configura el `database_id` real en `wrangler.toml` y confirma el cambio.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Salud, tamaño de catálogo y estado de D1 |
| GET | `/api/stats` | Totales por categoría y votos comunitarios |
| GET | `/api/genres` | Géneros disponibles por categoría |
| GET | `/api/catalog` | Búsqueda, filtros, orden y paginación |
| GET | `/api/top` | Ranking general o por categoría |
| POST | `/api/votes` | Crear o actualizar un voto |
| POST | `/api/recommendations` | Obtener recomendaciones personalizadas |
| POST | `/api/suggestions` | Proponer un título nuevo |

Ejemplo de recomendación:

```bash
curl -X POST https://TU_APP.workers.dev/api/recommendations \
  -H 'content-type: application/json' \
  -d '{"preferredTypes":["book","series"],"preferredGenres":["Fantasía"],"likedIds":[],"limit":12}'
```

## Decisiones y límites actuales

- La identidad de voto se guarda como UUID local en el navegador: es sencilla y no recoge correo, pero no sustituye autenticación fuerte.
- El ranking combina una valoración inicial editorial con votos nuevos; esto evita un ranking vacío en el lanzamiento.
- Para un lanzamiento público de alto tráfico conviene añadir Turnstile y limitación de frecuencia al voto y al formulario.
- Las sugerencias quedan en D1 con estado `pending`; no se muestran automáticamente ni alteran el catálogo hasta moderarlas.
- El catálogo usa carátulas abstractas propias para evitar depender de APIs, claves externas o imágenes con derechos.

## Estructura

```text
.github/workflows/deploy.yml  CI/CD
migrations/0001_initial.sql  Esquema D1
public/                       Interfaz y PWA
scripts/                      Validación y configuración
src/catalog.js                360 títulos
src/worker.js                 API y recomendador
tests/                        Pruebas sin dependencias externas
wrangler.toml                 Configuración Cloudflare
```

## Licencia

Código bajo licencia MIT. Los nombres de obras se usan con fines descriptivos; las marcas y obras pertenecen a sus respectivos titulares.

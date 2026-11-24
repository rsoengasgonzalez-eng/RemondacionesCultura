import { CATALOG } from './catalog.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin'
};
const TYPES = new Set(['book', 'movie', 'series']);
const MAX_BODY = 8_192;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function readBody(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
  return request.json();
}

async function getVoteMap(env) {
  if (!env.DB) return new Map();
  const result = await env.DB.prepare(
    'SELECT item_id, COUNT(*) AS user_votes, AVG(score) AS user_rating FROM votes GROUP BY item_id'
  ).all();
  return new Map((result.results || []).map(row => [row.item_id, row]));
}

function withScores(items, voteMap) {
  return items.map(item => {
    const user = voteMap.get(item.id);
    const userVotes = Number(user?.user_votes || 0);
    const userRating = Number(user?.user_rating || 0);
    const votes = item.votes + userVotes;
    const rating = userVotes
      ? (item.rating * item.votes + userRating * userVotes) / votes
      : item.rating;
    return { ...item, rating: Number(rating.toFixed(2)), votes, userVotes };
  });
}

export function recommend(catalog, { likedIds = [], preferredTypes = [], preferredGenres = [], limit = 12 } = {}) {
  const liked = new Set(likedIds);
  const typeSet = new Set(preferredTypes.filter(type => TYPES.has(type)));
  const genreSet = new Set(preferredGenres.map(normalize));
  const likedGenres = new Set(catalog.filter(item => liked.has(item.id)).map(item => normalize(item.genre)));
  return catalog
    .filter(item => !liked.has(item.id))
    .map(item => {
      let match = item.rating * 1.7 + Math.log10(item.votes + 1) * 0.45;
      if (typeSet.has(item.type)) match += 2.2;
      if (genreSet.has(normalize(item.genre))) match += 3.5;
      if (likedGenres.has(normalize(item.genre))) match += 4.25;
      match += ((item.color * 17) % 23) / 100;
      return { ...item, match: Number(match.toFixed(2)) };
    })
    .sort((a, b) => b.match - a.match || b.rating - a.rating)
    .slice(0, Math.max(1, Math.min(Number(limit) || 12, 30)));
}

async function routeApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health') {
    return json({ ok: true, catalog: CATALOG.length, database: Boolean(env.DB) });
  }

  if (path === '/api/stats') {
    const counts = CATALOG.reduce((acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }), {});
    let communityVotes = 0;
    if (env.DB) {
      const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM votes').first();
      communityVotes = Number(row?.total || 0);
    }
    return json({ total: CATALOG.length, counts, communityVotes });
  }

  if (path === '/api/genres') {
    const byType = {};
    for (const type of TYPES) {
      byType[type] = [...new Set(CATALOG.filter(item => item.type === type).map(item => item.genre))].sort();
    }
    return json(byType);
  }

  if (path === '/api/catalog' && method === 'GET') {
    const type = url.searchParams.get('type') || '';
    const genre = url.searchParams.get('genre') || '';
    const q = normalize(url.searchParams.get('q') || '');
    const sort = url.searchParams.get('sort') || 'top';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 24, 60));
    let items = CATALOG.filter(item => (!type || item.type === type) && (!genre || item.genre === genre));
    if (q) items = items.filter(item => normalize(`${item.title} ${item.genre} ${item.description}`).includes(q));
    const voteMap = await getVoteMap(env);
    items = withScores(items, voteMap);
    if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'es'));
    else if (sort === 'popular') items.sort((a, b) => b.votes - a.votes || b.rating - a.rating);
    else items.sort((a, b) => b.rating - a.rating || b.votes - a.votes);
    const total = items.length;
    const start = (page - 1) * limit;
    return json({ items: items.slice(start, start + limit), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }

  if (path === '/api/top' && method === 'GET') {
    const type = url.searchParams.get('type') || '';
    const limit = Math.max(3, Math.min(Number(url.searchParams.get('limit')) || 10, 50));
    const voteMap = await getVoteMap(env);
    const items = withScores(CATALOG.filter(item => !type || item.type === type), voteMap)
      .sort((a, b) => b.rating - a.rating || b.votes - a.votes)
      .slice(0, limit);
    return json({ items });
  }

  if (path === '/api/votes' && method === 'POST') {
    if (!env.DB) return json({ error: 'La base de datos no está configurada.' }, 503);
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
    const itemId = String(body.itemId || '');
    const voterId = String(body.voterId || '');
    const score = Number(body.score);
    if (!CATALOG.some(item => item.id === itemId) || !/^[a-zA-Z0-9-]{12,80}$/.test(voterId) || !Number.isInteger(score) || score < 1 || score > 5) {
      return json({ error: 'Voto no válido.' }, 422);
    }
    await env.DB.prepare(
      `INSERT INTO votes (item_id, voter_id, score, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(item_id, voter_id) DO UPDATE SET score = excluded.score, updated_at = CURRENT_TIMESTAMP`
    ).bind(itemId, voterId, score).run();
    const row = await env.DB.prepare('SELECT COUNT(*) AS count, AVG(score) AS average FROM votes WHERE item_id = ?').bind(itemId).first();
    return json({ ok: true, itemId, userVotes: Number(row?.count || 0), userRating: Number(Number(row?.average || 0).toFixed(2)) });
  }

  if (path === '/api/recommendations' && method === 'POST') {
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'Preferencias no válidas.' }, 400); }
    const voteMap = await getVoteMap(env);
    const scored = withScores(CATALOG, voteMap);
    const items = recommend(scored, {
      likedIds: Array.isArray(body.likedIds) ? body.likedIds.slice(0, 100) : [],
      preferredTypes: Array.isArray(body.preferredTypes) ? body.preferredTypes.slice(0, 3) : [],
      preferredGenres: Array.isArray(body.preferredGenres) ? body.preferredGenres.slice(0, 12) : [],
      limit: body.limit
    });
    return json({ items, basedOn: { liked: body.likedIds?.length || 0, genres: body.preferredGenres?.length || 0 } });
  }

  if (path === '/api/suggestions' && method === 'POST') {
    if (!env.DB) return json({ error: 'La base de datos no está configurada.' }, 503);
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'Sugerencia no válida.' }, 400); }
    const title = String(body.title || '').trim().slice(0, 160);
    const type = String(body.type || '');
    const reason = String(body.reason || '').trim().slice(0, 800);
    if (title.length < 2 || !TYPES.has(type) || reason.length < 10) return json({ error: 'Completa el título, tipo y una razón de al menos 10 caracteres.' }, 422);
    await env.DB.prepare('INSERT INTO suggestions (title, type, reason, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .bind(title, type, reason).run();
    return json({ ok: true, message: '¡Gracias! Tu recomendación se ha enviado.' }, 201);
  }

  return json({ error: 'Ruta no encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await routeApi(request, env, url);
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        const response = new Response(asset.body, asset);
        response.headers.set('x-content-type-options', 'nosniff');
        response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
        response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
        response.headers.set('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        return response;
      }
      return new Response('Assets no configurados', { status: 503 });
    } catch (error) {
      console.error('Unhandled error', error);
      return json({ error: 'No se pudo completar la solicitud.' }, 500);
    }
  }
};

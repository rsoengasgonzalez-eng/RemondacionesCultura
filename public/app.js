const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const labels = { book: 'Libro', movie: 'Película', series: 'Serie' };
const icons = { book: '📖', movie: '🎬', series: '📺' };
const state = { view: 'inicio', type: '', genre: '', q: '', sort: 'top', page: 1, genres: {}, topType: '', recTypes: new Set(), recGenres: new Set() };
const favorites = new Set(JSON.parse(localStorage.getItem('recomienda:favorites') || '[]'));
const myVotes = JSON.parse(localStorage.getItem('recomienda:votes') || '{}');
const voterId = localStorage.getItem('recomienda:voter') || crypto.randomUUID();
localStorage.setItem('recomienda:voter', voterId);
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function typeIcon(type) { return icons[type] || '✦'; }
function card(item) {
  const vote = myVotes[item.id] || 0;
  return `<article class="media-card" data-id="${item.id}">
    <div class="cover" style="--hue:${item.color}"><span>${typeIcon(item.type)}</span><b class="badge">${escapeHtml(item.badge)}</b><button class="favorite ${favorites.has(item.id) ? 'active' : ''}" data-favorite="${item.id}" aria-label="${favorites.has(item.id) ? 'Quitar de' : 'Añadir a'} favoritos">♥</button></div>
    <div class="card-body"><span class="card-type">${labels[item.type]} · ${escapeHtml(item.genre)}</span><h3>${escapeHtml(item.title)}</h3><div class="description">${escapeHtml(item.description)}</div>
      <div class="card-footer"><div class="stars" aria-label="Votar ${escapeHtml(item.title)}">${[1,2,3,4,5].map(n => `<button class="${n <= vote ? 'voted' : ''}" data-vote="${n}" data-item="${item.id}" title="${n} estrellas">★</button>`).join('')}</div><span class="score"><strong>${Number(item.rating).toFixed(1)}</strong> · ${item.votes}</span></div>
    </div></article>`;
}
function podiumCard(item, index) {
  return `<article class="podium-card"><span class="rank">${index + 1}</span><div class="mini-cover" style="--hue:${item.color}"><span>${typeIcon(item.type)}</span></div><div><span class="card-type">${labels[item.type]} · ${escapeHtml(item.genre)}</span><h3>${escapeHtml(item.title)}</h3><div class="rating">★ ${Number(item.rating).toFixed(1)} <small>(${item.votes} votos)</small></div></div></article>`;
}
function rankRow(item, index) {
  return `<article class="rank-row"><span class="rank-number">${String(index + 1).padStart(2, '0')}</span><div class="rank-thumb" style="--hue:${item.color}">${typeIcon(item.type)}</div><div class="rank-info"><span class="card-type">${labels[item.type]} · ${escapeHtml(item.genre)}</span><h3>${escapeHtml(item.title)}</h3></div><div class="rank-rating">★ ${Number(item.rating).toFixed(1)} <small>/ 5</small></div><div class="rank-votes">${item.votes} votos</div></article>`;
}
async function loadStats() {
  try { const stats = await api('/api/stats'); $('#hero-stats').innerHTML = `<span><strong>${stats.counts.book}</strong> libros</span><i></i><span><strong>${stats.counts.movie}</strong> películas</span><i></i><span><strong>${stats.counts.series}</strong> series</span>`; } catch {}
}
async function loadGenres() {
  state.genres = await api('/api/genres');
  renderGenreFilter();
  const all = [...new Set(Object.values(state.genres).flat())].sort((a,b) => a.localeCompare(b, 'es'));
  $('#rec-genres').innerHTML = all.map(g => `<button data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('');
}
function renderGenreFilter() {
  const genres = state.type ? state.genres[state.type] || [] : [...new Set(Object.values(state.genres).flat())].sort((a,b) => a.localeCompare(b, 'es'));
  if (state.genre && !genres.includes(state.genre)) state.genre = '';
  $('#genre-filter').innerHTML = genres.map(g => `<button class="${state.genre === g ? 'active' : ''}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('');
}
async function loadCatalog() {
  const grid = $('#catalog-grid'); grid.innerHTML = '';
  const params = new URLSearchParams({ page: state.page, limit: 24, sort: state.sort });
  if (state.type) params.set('type', state.type); if (state.genre) params.set('genre', state.genre); if (state.q) params.set('q', state.q);
  try {
    const data = await api(`/api/catalog?${params}`);
    $('#results-count').textContent = `${data.total} ${data.total === 1 ? 'resultado' : 'resultados'}`;
    grid.innerHTML = data.items.length ? data.items.map(card).join('') : '<div class="empty">No encontramos coincidencias. Prueba con otros filtros.</div>';
    renderPagination(data.page, data.pages);
    $('#clear-filters').hidden = !(state.type || state.genre || state.q || state.sort !== 'top');
  } catch (error) { grid.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
function renderPagination(page, pages) {
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a,b) => a-b);
  $('#pagination').innerHTML = nums.map((n,i) => `${i && n - nums[i-1] > 1 ? '<span>…</span>' : ''}<button class="${n === page ? 'active' : ''}" data-page="${n}">${n}</button>`).join('');
}
async function loadTop(type = state.topType) {
  const list = $('#top-list'); list.innerHTML = '';
  try { const data = await api(`/api/top?limit=20${type ? `&type=${type}` : ''}`); list.innerHTML = data.items.map(rankRow).join(''); }
  catch (error) { list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
async function loadHomeTop() {
  try { const data = await api('/api/top?limit=3'); $('#home-podium').innerHTML = data.items.map(podiumCard).join(''); } catch { $('#home-podium').innerHTML = '<div class="empty">No se pudo cargar el podio.</div>'; }
}
function switchView(view, push = true) {
  state.view = view;
  $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  $$('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (push) history.pushState({ view }, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'catalogo') loadCatalog(); if (view === 'top') loadTop();
}
async function vote(itemId, score) {
  try {
    await api('/api/votes', { method: 'POST', body: JSON.stringify({ itemId, voterId, score }) });
    myVotes[itemId] = score; localStorage.setItem('recomienda:votes', JSON.stringify(myVotes)); showToast(`Tu voto de ${score} ★ se ha guardado`);
    if (state.view === 'catalogo') loadCatalog(); if (state.view === 'top') loadTop(); loadHomeTop();
  } catch (error) { showToast(error.message); }
}
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  localStorage.setItem('recomienda:favorites', JSON.stringify([...favorites]));
  $$(`[data-favorite="${CSS.escape(id)}"]`).forEach(btn => btn.classList.toggle('active', favorites.has(id)));
  showToast(favorites.has(id) ? 'Añadido a tus favoritos' : 'Eliminado de favoritos');
}
async function getRecommendations() {
  const button = $('#get-recommendations'); button.disabled = true; button.textContent = 'Buscando coincidencias…';
  try {
    const likedIds = [...new Set([...favorites, ...Object.entries(myVotes).filter(([,v]) => v >= 4).map(([id]) => id)])];
    const data = await api('/api/recommendations', { method: 'POST', body: JSON.stringify({ likedIds, preferredTypes: [...state.recTypes], preferredGenres: [...state.recGenres], limit: 12 }) });
    $('#recommendations-grid').innerHTML = data.items.map(card).join('');
    $('#rec-basis').textContent = `${data.basedOn.liked} favoritos/votos · ${data.basedOn.genres} géneros`;
    $('#recommendations-results').hidden = false; $('#recommendations-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.innerHTML = 'Encontrar mis recomendaciones <span>✦</span>'; }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view], [data-go]'); if (nav) switchView(nav.dataset.view || nav.dataset.go);
  const favorite = event.target.closest('[data-favorite]'); if (favorite) toggleFavorite(favorite.dataset.favorite);
  const voteButton = event.target.closest('[data-vote]'); if (voteButton) vote(voteButton.dataset.item, Number(voteButton.dataset.vote));
  const page = event.target.closest('[data-page]'); if (page) { state.page = Number(page.dataset.page); loadCatalog(); $('#catalog-grid').scrollIntoView({behavior:'smooth'}); }
  const suggestOpen = event.target.closest('[data-open-suggest]'); if (suggestOpen) $('#suggest-dialog').showModal();
  if (event.target.closest('[data-close-suggest]')) $('#suggest-dialog').close();
});
$('#type-filter').addEventListener('click', event => { const b = event.target.closest('[data-type]'); if (!b) return; state.type = b.dataset.type; state.genre = ''; state.page = 1; $$('#type-filter button').forEach(x => x.classList.toggle('active', x === b)); renderGenreFilter(); loadCatalog(); });
$('#genre-filter').addEventListener('click', event => { const b = event.target.closest('[data-genre]'); if (!b) return; state.genre = state.genre === b.dataset.genre ? '' : b.dataset.genre; state.page = 1; renderGenreFilter(); loadCatalog(); });
$('#sort-filter').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; loadCatalog(); });
let searchTimer; $('#search-input').addEventListener('input', event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = event.target.value.trim(); state.page = 1; loadCatalog(); }, 250); });
$('#clear-filters').addEventListener('click', () => { Object.assign(state, {type:'',genre:'',q:'',sort:'top',page:1}); $('#search-input').value=''; $('#sort-filter').value='top'; $$('#type-filter button').forEach((b,i)=>b.classList.toggle('active',i===0)); renderGenreFilter(); loadCatalog(); });
$('#top-filter').addEventListener('click', event => { const b = event.target.closest('[data-type]'); if (!b) return; state.topType = b.dataset.type; $$('#top-filter button').forEach(x => x.classList.toggle('active', x === b)); loadTop(); });
$('#rec-types').addEventListener('click', event => { const b = event.target.closest('[data-type]'); if (!b) return; state.recTypes.has(b.dataset.type) ? state.recTypes.delete(b.dataset.type) : state.recTypes.add(b.dataset.type); b.classList.toggle('active'); });
$('#rec-genres').addEventListener('click', event => { const b = event.target.closest('[data-genre]'); if (!b) return; state.recGenres.has(b.dataset.genre) ? state.recGenres.delete(b.dataset.genre) : state.recGenres.add(b.dataset.genre); b.classList.toggle('active'); });
$('#get-recommendations').addEventListener('click', getRecommendations);
$('#suggest-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const status = $('#suggest-status'); const body = Object.fromEntries(new FormData(form)); status.textContent='Enviando…'; try { const data=await api('/api/suggestions',{method:'POST',body:JSON.stringify(body)}); status.textContent=data.message; form.reset(); setTimeout(()=>$('#suggest-dialog').close(),1200); } catch(error){ status.textContent=error.message; } });
window.addEventListener('popstate', () => switchView(location.hash.slice(1) || 'inicio', false));

Promise.all([loadStats(), loadGenres(), loadHomeTop()]).catch(() => showToast('Algunos datos no pudieron cargarse.'));
switchView(location.hash.slice(1) || 'inicio', false);

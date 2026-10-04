/* app.py のDrive関連ロジックをブラウザ側に移植したもの */
(() => {
const C = window.CFG, FOLDER = 'application/vnd.google-apps.folder';
const ID_RE = /^[\w-]+$/;
const parseId = s => { s = String(s).trim(); const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/); return m ? m[1] : s };
C.folders = C.folders.map(f => typeof f === 'string' ? { id: parseId(f), name: '', series: null } : { name: f.name || '', id: parseId(f.id), series: f.series ?? null });
if (!['single', 'two', 'scroll'].includes(C.default_mode)) C.default_mode = 'scroll';
C.anime_start = Object.fromEntries(Object.entries(C.anime_start || {}).map(([k, v]) => [k.toLowerCase(), v]));

/* ---------- Drive API(APIキー・ログイン不要。フォルダは「リンクを知っている全員」に共有しておく) ---------- */
async function api(path, params) {
  const u = new URL('https://www.googleapis.com/drive/v3/' + path);
  for (const [k, v] of Object.entries({ ...params, key: C.apiKey })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(r.status === 404 ? 'フォルダが見つかりません(共有設定を「リンクを知っている全員」にしてください)' : 'Drive APIエラー: ' + r.status);
  return r.json();
}

/* ---------- キャッシュ(タブ内) ---------- */
const mem = new Map();
async function cache(key, fn) {
  const now = Date.now(), ttl = C.cache_seconds * 1000;
  let h = mem.get(key);
  if (!h) { try { h = JSON.parse(sessionStorage.getItem('c:' + key) || 'null') } catch (e) {} }
  if (h && now - h.t < ttl) { mem.set(key, h); return h.v }
  h = { t: now, v: await fn() };
  mem.set(key, h);
  try { sessionStorage.setItem('c:' + key, JSON.stringify(h)) } catch (e) {}
  return h.v;
}

/* ---------- Drive操作 ---------- */
let pm = {};  // 子ID -> 親ID (APIキー経由だと parents が返らないので、listの結果から記録する)
try { pm = JSON.parse(localStorage.getItem('pm') || '{}') } catch (e) {}
const savePm = () => { try { localStorage.setItem('pm', JSON.stringify(pm)) } catch (e) {} };
const natcmp = (a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true, sensitivity: 'base' });
const meta = fid => cache('m:' + fid, () => api('files/' + fid, { fields: 'id,name,mimeType,parents', supportsAllDrives: true }));
const listRaw = fid => cache('l:' + fid, async () => {
  let files = [], pageToken = '';
  do {
    const p = { q: `'${fid}' in parents and trashed=false`, pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true,
      fields: 'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,imageMediaMetadata(width,height))' };
    if (pageToken) p.pageToken = pageToken;
    const res = await api('files', p);
    files = files.concat(res.files || []);
    pageToken = res.nextPageToken;
  } while (pageToken);
  files.forEach(f => { pm[f.id] = fid }); savePm();
  return { dirs: files.filter(f => f.mimeType === FOLDER).sort(natcmp), imgs: files.filter(f => f.mimeType.startsWith('image/')).sort(natcmp) };
});
async function list(fid) {  // キャッシュ命中時も親子対応を必ず記録する
  const v = await listRaw(fid);
  let changed = false;
  for (const f of [...v.dirs, ...v.imgs]) if (pm[f.id] !== fid) { pm[f.id] = fid; changed = true }
  if (changed) savePm();
  return v;
}
async function roots() {
  return Promise.all(C.folders.map(async f => { const m = await meta(f.id); return { id: m.id, name: f.name || m.name, series: f.series } }));
}
async function walk(fid, rootIds, limit) {
  const chain = [];
  let cur = fid;
  for (let i = 0; i < limit; i++) {
    const m = await meta(cur);
    chain.unshift(m);
    if (rootIds.has(m.id)) return chain;
    const p = pm[cur] || m.parents?.[0];
    if (!p) return null;
    cur = p;
  }
  return null;
}
async function discover(fid, rs, maxDepth = 5) {  // 親が分からないとき、設定フォルダから下へ辿って探す
  let level = rs.map(r => r.id);
  for (let d = 0; d < maxDepth && level.length; d++) {
    const next = [];
    for (const id of level) {
      const { dirs } = await list(id);
      if (dirs.some(x => x.id === fid)) return true;
      next.push(...dirs.map(x => x.id));
    }
    level = next;
  }
  return false;
}
async function ancestors(fid, limit = 15) {
  const rs = await roots(), rootIds = new Set(rs.map(r => r.id));
  let chain = await walk(fid, rootIds, limit);
  if (!chain && await discover(fid, rs)) chain = await walk(fid, rootIds, limit);
  return chain;
}

/* ---------- 漫画・巻 ---------- */
const volNum = n => { const m = n.match(/(\d+(?:\.\d+)?)\D*$/); return m ? parseFloat(m[1]) : null };
const vlabel = n => { const m = n.match(/(?:^|[_\-\s])v(\d+(?:\.\d+)?)$/i); return m ? parseFloat(m[1]) + '巻' : n };
const isSeriesRoot = async () => true;  // 設定フォルダ=漫画1作品(中に巻フォルダ)で固定
async function seriesOf(chain) {
  const root = (await roots()).find(r => r.id === chain[0].id);
  return chain.length === 1 || await isSeriesRoot(root) ? { id: root.id, name: root.name } : chain[1];
}
async function volumesOf(sid) {
  const { dirs, imgs } = await list(sid);
  return dirs.length ? dirs : imgs.length ? [await meta(sid)] : [];
}
function firstVolume(vols) {  // 巻番号が最小の巻(番号が読めなければ並び順の先頭)
  const nums = vols.map(v => volNum(v.name)).filter(n => n !== null);
  return nums.length ? vols.find(v => volNum(v.name) === Math.min(...nums)) : vols[0];
}
function findVolume(vols, spec) {
  const n = Number(spec);
  if (spec !== '' && spec != null && !isNaN(n)) return vols.find(v => volNum(v.name) === n) || null;
  spec = String(spec);
  return vols.find(v => v.id === spec || v.name === spec) || vols.find(v => v.name.toLowerCase().includes(spec.toLowerCase())) || null;
}
async function resolvePage(spec, volId) {
  if (typeof spec === 'string' && spec.trim().endsWith('%')) {
    const total = (await list(volId)).imgs.length;
    return Math.max(0, Math.min(total - 1, Math.floor(total * parseFloat(spec) / 100)));
  }
  return Math.max((parseInt(spec) || 1) - 1, 0);
}
async function animeFor(series) {
  const keys = [series.id, series.name, (await meta(series.id)).name].map(s => s.toLowerCase());
  const k = keys.find(k => k in C.anime_start);
  return k ? C.anime_start[k] : null;
}

/* ---------- Cookie(読書位置) ---------- */
function cookiePos(sid) {
  const m = document.cookie.split('; ').find(c => c.startsWith('p_' + sid + '='));
  if (!m) return null;
  const [vid, p] = m.slice(m.indexOf('=') + 1).split('.');
  return ID_RE.test(vid || '') ? [vid, /^\d+$/.test(p || '') ? +p : 0] : null;
}

/* ---------- URL ---------- */
const U = {
  home: 'index.html#/', folder: id => `index.html#/f/${id}`, open: id => `index.html#/open/${id}`,
  go: (sid, mode) => `index.html#/go/${sid}/${mode}`,
  read: (id, p) => `reader.html?v=${id}` + (p != null ? `&p=${p}` : '')
};

/* ---------- リーダー用データ(元: app.py の /read/<fid>) ---------- */
async function getReaderData() {
  const q = new URLSearchParams(location.search), fid = q.get('v') || '';
  if (!ID_RE.test(fid)) { location.replace(U.home); return new Promise(() => {}) }
  const chain = await ancestors(fid);
  if (!chain) { location.replace(U.home); return new Promise(() => {}) }
  const { imgs } = await list(fid);
  if (!imgs.length) { location.replace(U.folder(fid)); return new Promise(() => {}) }
  const series = await seriesOf(chain), sid = series.id;
  let prev = null, next = null, next_id = null, next_label = null, prev_label = null;
  if (chain.length >= 2) {
    const sib = (await list(chain[chain.length - 2].id)).dirs, k = sib.findIndex(s => s.id === fid);
    if (k > 0) { prev = U.read(sib[k - 1].id); prev_label = vlabel(sib[k - 1].name) }
    if (k >= 0 && k + 1 < sib.length) { next_id = sib[k + 1].id; next = U.read(next_id); next_label = vlabel(sib[k + 1].name) }
  }
  const back = U.folder(chain.length >= 2 ? chain[chain.length - 2].id : fid);
  const pArg = q.has('p') ? parseInt(q.get('p')) : null, cpos = cookiePos(sid);
  let start = pArg !== null && !isNaN(pArg) ? pArg : (cpos && cpos[0] === fid ? cpos[1] : 0);
  start = Math.max(0, Math.min(start, imgs.length - 1));
  const last = chain[chain.length - 1];
  const title = last.id === sid ? last.name : `${series.name} ${vlabel(last.name)}`;
  const src = f => f.thumbnailLink ? f.thumbnailLink.replace(/=[swh]\d+[\w-]*$/, '=' + C.image_size)
    : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${C.apiKey}`;  // サムネが無い画像は原本を直接取得
  document.cookie = `last=${sid}; max-age=31536000; path=/; samesite=lax`;
  document.title = title;
  document.getElementById('ttl').textContent = title;
  document.querySelectorAll('[data-back]').forEach(a => { a.href = back });
  return { id: fid, series: sid, title, start, back, prev, prev_label, next, next_id, next_label,
    images: imgs.map(f => ({ id: f.id, w: f.imageMediaMetadata?.width, h: f.imageMediaMetadata?.height, src: src(f) })),
    rtl: C.default_direction === 'rtl', mode: C.default_mode };
}

window.Drv = { C, meta, list, roots, ancestors, isSeriesRoot, seriesOf, volumesOf, firstVolume, findVolume, resolvePage, animeFor, cookiePos, vlabel, U,
  lastSeries: () => (document.cookie.split('; ').find(c => c.startsWith('last=')) || '').slice(5) };
window.getReaderData = getReaderData;
})();

(() => {
const C = window.CFG, FOLDER = 'application/vnd.google-apps.folder';
const ID_RE = /^[\w-]+$/;
const parseId = s => { s = String(s).trim(); const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/); return m ? m[1] : s };
C.folders = C.folders.map(f => typeof f === 'string' ? { id: parseId(f), name: '' } : { name: f.name || '', id: parseId(f.id) });

/* ---------- Drive API ---------- */
async function api(path, params) {
  const u = new URL('https://www.googleapis.com/drive/v3/' + path);
  for (const [k, v] of Object.entries({ ...params, key: C.apiKey })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(r.status === 404 ? 'フォルダが見つかりません(共有設定を確認してください)' : 'Drive APIエラー: ' + r.status);
  return r.json();
}

/* ---------- キャッシュ ---------- */
const mem = new Map();
async function cache(key, fn) {
  const now = Date.now(), ttl = C.cache_seconds * 1000;
  let h = mem.get(key);
  if (!h) { try { h = JSON.parse(sessionStorage.getItem('c_mus:' + key) || 'null') } catch (e) {} }
  if (h && now - h.t < ttl) { mem.set(key, h); return h.v }
  h = { t: now, v: await fn() };
  mem.set(key, h);
  try { sessionStorage.setItem('c_mus:' + key, JSON.stringify(h)) } catch (e) {}
  return h.v;
}

let pm = {};
try { pm = JSON.parse(localStorage.getItem('pm_audio') || '{}') } catch (e) {}
const savePm = () => { try { localStorage.setItem('pm_audio', JSON.stringify(pm)) } catch (e) {} };
const natcmp = (a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true, sensitivity: 'base' });
const meta = fid => cache('m:' + fid, () => api('files/' + fid, { fields: 'id,name,mimeType,parents', supportsAllDrives: true }));

const listRaw = fid => cache('l:' + fid, async () => {
  let files = [], pageToken = '';
  do {
    const p = { q: `'${fid}' in parents and trashed=false`, pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true,
      fields: 'nextPageToken,files(id,name,mimeType,parents,fileExtension)' };
    if (pageToken) p.pageToken = pageToken;
    const res = await api('files', p);
    files = files.concat(res.files || []);
    pageToken = res.nextPageToken;
  } while (pageToken);
  files.forEach(f => { pm[f.id] = fid }); savePm();
  return {
    dirs: files.filter(f => f.mimeType === FOLDER).sort(natcmp),
    tracks: files.filter(f => f.mimeType.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus'].includes(f.fileExtension?.toLowerCase())).sort(natcmp)
  };
});

async function list(fid) {
  const v = await listRaw(fid);
  let changed = false;
  for (const f of [...v.dirs, ...v.tracks]) if (pm[f.id] !== fid) { pm[f.id] = fid; changed = true }
  if (changed) savePm();
  return v;
}

async function roots() {
  return Promise.all(C.folders.map(async f => { const m = await meta(f.id); return { id: m.id, name: f.name || m.name } }));
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

async function discover(fid, rs, maxDepth = 5) {
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

const U = {
  home: 'player.html', // ホームに戻るボタン等もプレイヤーに戻す
  play: (id, idx = 0) => `player.html?v=${id}&i=${idx}`
};

/* ---------- プレイヤー用データローダー ---------- */
async function getPlayerData() {
  const q = new URLSearchParams(location.search), fid = q.get('v') || '';
  
  // vパラメータがない場合（直接開かれた場合など）、config.js の最初のフォルダを見るようにフォールバック
  const targetId = fid || C.folders[0]?.id;
  if (!ID_RE.test(targetId)) {
    console.error("フォルダIDが見つかりません");
    return { title: "エラー", tracks: [], back: "../index.html" };
  }

  const { tracks } = await list(targetId);
  const startIdx = parseInt(q.get('i')) || 0;
  
  const trackList = tracks.map((f, index) => ({
    id: f.id,
    title: f.name.replace(/\.[^/.]+$/, ''), // 拡張子を除く
    src: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${C.apiKey}`
  }));

  const m = await meta(targetId);

  return { 
    fid: targetId, 
    title: m.name, 
    startIdx: startIdx, 
    tracks: trackList, 
    back: "../index.html" 
  };
}

window.Drv = { C, meta, list, roots, ancestors, U };
window.getPlayerData = getPlayerData;
})();
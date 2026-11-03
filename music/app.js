(() => {
const { C, list, roots, ancestors, U } = Drv;
const main = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let seq = 0;

const page = (title, body, crumbs = '', error = '') => {
  document.title = `${title} - Cloud Music Player`;
  main.innerHTML = `<h1><a href="${U.home}">🎵 Cloud Music Player</a></h1>${crumbs}${error ? `<p class="error">${esc(error)}</p>` : ''}${body}`;
};
const fail = msg => page('エラー', '', '', msg);

async function home() {
  if (!C.folders.length) return page('設定が必要です', '', '', 'config.js の folders に音楽フォルダを指定してください。');
  const r = (await roots())[0];
  const { dirs, tracks } = await list(r.id);
  
  let body = `<div class="card">
    <h2>📁 ${esc(r.name)}</h2>
    ${tracks.length ? `<a class="btn pri" href="${U.play(r.id, 0)}"><b>▶ すべて再生 (${tracks.length}曲)</b></a>` : ''}
  </div>`;

  if (dirs.length) {
    body += `<h2 class="shelf">アルバム / フォルダ一覧</h2><div class="list">`;
    for (const d of dirs) {
      const sub = await list(d.id);
      body += `<a class="item" href="${U.folder(d.id)}"><span>📁 ${esc(d.name)}</span><small>${sub.tracks.length}曲</small></a>`;
    }
    body += `</div>`;
  }

  if (tracks.length) {
    body += `<h2 class="shelf">楽曲一覧</h2><div class="list">`;
    tracks.forEach((t, i) => {
      body += `<a class="item" href="${U.play(r.id, i)}"><span>🎵 ${esc(t.title)}</span><small>再生</small></a>`;
    });
    body += `</div>`;
  }

  page('ライブラリ', body);
}

async function folder(fid) {
  const chain = await ancestors(fid);
  if (!chain) return fail('このフォルダは参照できません。');
  const last = chain[chain.length - 1];
  const { dirs, tracks } = await list(last.id);

  const crumbs = `<nav class="crumbs">${chain.map((c, i) => i < chain.length - 1
    ? `<a href="${U.folder(c.id)}">${esc(c.name)}</a> / ` : `<span>${esc(c.name)}</span>`).join('')}</nav>`;

  let body = `<div class="card">
    <h2>📁 ${esc(last.name)}</h2>
    ${tracks.length ? `<a class="btn pri" href="${U.play(last.id, 0)}"><b>▶ このフォルダを再生 (${tracks.length}曲)</b></a>` : ''}
  </div>`;

  if (dirs.length || tracks.length) {
    body += `<div class="list">`;
    for (const d of dirs) {
      body += `<a class="item" href="${U.folder(d.id)}"><span>📁 ${esc(d.name)}</span><small>フォルダ</small></a>`;
    }
    tracks.forEach((t, i) => {
      body += `<a class="item" href="${U.play(last.id, i)}"><span>🎵 ${esc(t.title)}</span><small>再生</small></a>`;
    });
    body += `</div>`;
  } else {
    body += '<p class="empty">このフォルダには音楽ファイルがありません。</p>';
  }

  page(last.name, body, crumbs);
}

async function route() {
  const my = ++seq;
  const [, kind, a] = (location.hash.slice(1) || '/').split('/');
  main.innerHTML = '<p class="empty">読み込み中…</p>';
  try {
    if (kind === 'f') await folder(a);
    else await home();
  } catch (e) { if (my === seq) fail(e.message || String(e)) }
}

addEventListener('hashchange', route);
route();
})();
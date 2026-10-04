/* index.html(Jinja)と app.py のルートをブラウザ側で再現。マークアップ/クラスは元のまま */
(() => {
const { C, meta, list, roots, ancestors, isSeriesRoot, seriesOf, volumesOf, firstVolume, findVolume, resolvePage, animeFor, cookiePos, vlabel, U, lastSeries } = Drv;
const main = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let seq = 0;

const actions = (c, pick = true) => `
<div class="actions">
  <a class="btn" href="${c.first_url}"><b>1巻から</b>${c.first_label ? `<small>${esc(c.first_label)}</small>` : ''}</a>
  ${c.anime ? `<a class="btn mark" href="${c.anime}"><b>アニメの続きから</b></a>`
    : `<span class="btn off" aria-disabled="true"><b>アニメの続きから</b><small>未設定</small></span>`}
  ${c.resume ? `<a class="btn pri" href="${c.resume.url}"><b>読み途中から</b><small>${esc(c.resume.sub)}</small></a>`
    : `<span class="btn off" aria-disabled="true"><b>読み途中から</b><small>まだ読んでいません</small></span>`}
  ${pick ? `<a class="btn" href="${c.url}#volumes"><b>特定巻鑑賞</b><small>巻を選ぶ</small></a>` : ''}
</div>`;

async function makeCard(series) {
  const sid = series.id;
  const card = { id: sid, name: series.name, url: U.folder(sid), first_url: U.go(sid, 'first'), first_label: '', resume: null, anime: null };
  try { const v = firstVolume(await volumesOf(sid)); if (v) card.first_label = vlabel(v.name) } catch (e) {}
  const pos = cookiePos(sid);
  if (pos) {
    try { card.resume = { url: U.go(sid, 'resume'), sub: vlabel((await meta(pos[0])).name) + (pos[1] ? `  ${pos[1] + 1}ページ` : '') } } catch (e) {}
  }
  if (await animeFor(series)) card.anime = U.go(sid, 'anime');
  return card;
}

const page = (title, body, crumbs = '', error = '') => {
  document.title = `${title} - Drive漫画リーダー`;
  main.innerHTML = `<h1><a href="${U.home}">Drive漫画リーダー</a></h1>${crumbs}${error ? `<p class="error">${esc(error)}</p>` : ''}${body}`;
};
const fail = msg => page('エラー', '', '', msg);

async function home() {
  if (!C.folders.length) return page('設定が必要です', '', '', 'config.js の folders に漫画の親フォルダを指定してください。');
  const r = (await roots())[0], card = await makeCard(r);  // 漫画は1作品のみ。ボタンも1組だけ
  let notices = [];
  try { notices = (await (await fetch('announcements.json', { cache: 'no-cache' })).json()).slice().reverse().slice(0, C.announce_limit) } catch (e) {}
  const nhtml = notices.length ? `<section class="notices" aria-label="お知らせ">${notices.map(n => `
    <div class="card notice"><div class="meta">${esc(n.created)}</div>${n.title ? `<b>${esc(n.title)}</b>` : ''}<p>${esc(n.body)}</p></div>`).join('')}</section>` : '';
  page('ライブラリ', nhtml + `<div class="card"><h2><a href="${card.url}">${esc(card.name)}</a></h2>${actions(card)}</div>`);
}

async function folder(fid) {
  const chain = await ancestors(fid);
  if (!chain) return fail('このフォルダは参照できません。');
  const series = await seriesOf(chain), last = chain[chain.length - 1], isSeries = last.id === series.id;
  if (chain.length === 1 && !isSeries) return location.replace(U.home);
  const { dirs, imgs } = await list(last.id), pos = cookiePos(series.id), cur = pos ? pos[0] : null;
  const card = isSeries ? await makeCard(series) : null;
  const crumbs = `<nav class="crumbs">${chain.map((c, i) => i < chain.length - 1
    ? `<a href="${U.folder(c.id)}">${esc(c.name)}</a> / ` : `<span>${esc(c.name)}</span>`).join('')}</nav>`;
  let body = '';
  if (card) {
    body += `<div class="card">${actions(card, false)}</div>`;
    if (dirs.length) body += `<h2 class="shelf" id="volumes">特定巻鑑賞(読みたい巻を選んでください)</h2><div class="chips">${dirs.map(d =>
      `<a class="chip${d.id === cur ? ' cur' : ''}" href="${U.open(d.id)}" title="${esc(d.name)}">${esc(vlabel(d.name))}</a>`).join('')}</div>`;
  }
  body += '<div class="list">';
  if (imgs.length) body += `<a class="item primary" href="${U.read(last.id)}"><span>このフォルダを読む</span><small>${imgs.length}ページ</small></a>`;
  if (!card) body += dirs.map(d => `<a class="item" href="${U.open(d.id)}"><span>📁 ${esc(vlabel(d.name))}</span>${
    d.id === cur ? '<small class="badge">読書中</small>' : `<small>${esc(d.name)}</small>`}</a>`).join('');
  if (!dirs.length && !imgs.length && !card) body += '<p class="empty">このフォルダには画像もサブフォルダもありません。</p>';
  page(last.name, body + '</div>', crumbs);
  if (location.hash.endsWith('#volumes')) document.getElementById('volumes')?.scrollIntoView();
}

async function open_(fid) {
  if (!await ancestors(fid)) return fail('このフォルダは参照できません。');
  location.replace((await list(fid)).imgs.length ? U.read(fid) : U.folder(fid));
}

async function go(sid, mode) {
  const chain = await ancestors(sid);
  if (!chain) return fail('このフォルダは参照できません。');
  const series = await seriesOf(chain), vols = await volumesOf(series.id);
  if (!vols.length) return fail('この漫画には読める画像がありません。');
  const to = u => location.replace(u);
  if (mode === 'resume') {
    const pos = cookiePos(series.id);
    return to(pos && await ancestors(pos[0]) ? U.read(pos[0], pos[1]) : U.read(firstVolume(vols).id, 0));
  }
  if (mode === 'anime') {
    const spec = await animeFor(series);
    if (!spec) return fail('config.js の anime_start にこの漫画の設定がありません。');
    const vol = findVolume(vols, spec.volume);
    if (!vol) return fail(`anime_start の巻「${spec.volume}」が見つかりません。`);
    return to(U.read(vol.id, await resolvePage(spec.page ?? 1, vol.id)));
  }
  to(U.read(firstVolume(vols).id, 0));
}

async function route() {
  const my = ++seq;
  const [, kind, a, b] = (location.hash.slice(1).replace(/#volumes$/, '') || '/').split('/');  // 末尾の #volumes は巻一覧へのスクロール用
  main.innerHTML = '<p class="empty">読み込み中…</p>';
  try {
    if (kind === 'f') await folder(a);
    else if (kind === 'open') await open_(a);
    else if (kind === 'go') await go(a, b);
    else await home();
  } catch (e) { if (my === seq) fail(e.message || String(e)) }
}
addEventListener('hashchange', route);
route();
})();

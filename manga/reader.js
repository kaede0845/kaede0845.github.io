(async () => {
const D = await window.getReaderData();  // Drive APIから組み立てる(元: サーバーが埋め込んだJSON)
const $ = s => document.querySelector(s);
const store = {
  get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} }
};
const N = D.images.length;
const MODES = ['single', 'two', 'scroll'];
const MODE_LABEL = { single: '単ページ', two: '見開き', scroll: '縦スクロール' };
const url = i => D.images[i].src;
let opts = Object.assign({ mode: D.mode, rtl: D.rtl, fitw: false, wide: false }, JSON.parse(store.get('opts2') || '{}'));
if (!MODES.includes(opts.mode)) opts.mode = D.mode;
let page = Math.max(0, Math.min(D.start, N - 1));
let seq = 0;

/* ---------- Cookie(シリーズごとの読書位置) ---------- */
function setCookie(volId, p) {
  document.cookie = `p_${D.series}=${volId}.${p}; max-age=31536000; path=/; samesite=lax`;
}
let atEnd = false, saveTimer = null;
function savePos() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPos, 400);
}
function flushPos() {
  // 最後まで読んだら、次回の「続きから」は次の巻の頭にする
  if (atEnd && D.next_id) setCookie(D.next_id, 0);
  else setCookie(D.id, page);
}
addEventListener('pagehide', flushPos);
if (D.prev) { const a = $('#endprev'); a.href = D.prev; a.textContent = `前の巻へ（${D.prev_label}）`; a.hidden = false }
if (D.next) { const a = $('#endnext'); a.href = D.next; a.textContent = `次の巻へ（${D.next_label}）`; a.hidden = false }
else $('#endmsg').textContent = '最後まで読みました';

/* ---------- 共通 ---------- */
const wide = i => { const m = D.images[i]; return m.w && m.h && m.w > m.h };
function spreads() {
  if (opts.mode !== 'two') return D.images.map((_, i) => [i]);
  const s = [[0]];
  let i = 1;
  while (i < N) {
    if (i + 1 < N && !wide(i) && !wide(i + 1)) { s.push([i, i + 1]); i += 2 }
    else { s.push([i]); i += 1 }
  }
  return s;
}
function applyOpts() {
  const m = opts.mode, sc = m === 'scroll';
  $('#pages').className = sc ? 'scroll' : (m === 'two' ? 'two' : 'single') + (opts.rtl ? ' rtl' : '');
  $('#stage').classList.toggle('scrollmode', sc);
  $('#stage').classList.toggle('wide', sc && opts.wide);
  $('#stage').classList.toggle('fitw', !sc && opts.fitw);
  $('#seek').classList.toggle('rtl', opts.rtl && !sc);
  $('#mode').textContent = MODE_LABEL[m];
  $('#dir').hidden = sc;
  $('#dir').textContent = opts.rtl ? '右開き' : '左開き';
  $('#fit').textContent = sc ? (opts.wide ? '全幅' : '標準幅') : (opts.fitw ? '幅に合わせる' : '全体表示');
  store.set('opts2', JSON.stringify(opts));
}
function updateCount(label) {
  $('#cnt').textContent = (label || page + 1) + ' / ' + N;
  $('#seek').max = N;
  $('#seek').value = page + 1;
}

/* ---------- 縦スクロール ---------- */
function renderScroll() {
  const imgs = D.images.map((m, i) => {
    const im = new Image();
    im.alt = '';
    im.loading = 'lazy';
    im.decoding = 'async';
    im.style.aspectRatio = m.w && m.h ? `auto ${m.w} / ${m.h}` : 'auto 2 / 3';  // 読み込み前の高さを確保
    im.src = url(i);
    return im;
  });
  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.innerHTML = '<p>この巻は読み終わりました</p><div class="row"></div>';
  const row = foot.lastChild;
  if (D.prev) row.insertAdjacentHTML('beforeend', `<a class="btn" href="${D.prev}">前の巻へ（${D.prev_label}）</a>`);
  if (D.next) row.insertAdjacentHTML('beforeend', `<a class="btn pri" href="${D.next}">次の巻へ（${D.next_label}）</a>`);
  row.insertAdjacentHTML('beforeend', `<a class="btn" href="${D.back}">一覧へ</a>`);
  $('#pages').replaceChildren(...imgs, foot);
  $('#stage').scrollTop = imgs[page].offsetTop;
  atEnd = page >= N - 1;
  updateCount();
  savePos();
}
function pageAtScroll() {
  const st = $('#stage'), imgs = $('#pages').children;
  const line = st.scrollTop + st.clientHeight * 0.35;
  let lo = 0, hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (imgs[mid].offsetTop <= line) lo = mid; else hi = mid - 1;
  }
  return lo;
}
let ticking = false;
$('#stage').addEventListener('scroll', () => {
  if (opts.mode !== 'scroll' || ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const st = $('#stage');
    page = pageAtScroll();
    atEnd = page >= N - 1 || st.scrollTop + st.clientHeight >= st.scrollHeight - 200;
    updateCount();
    savePos();
  });
});

/* ---------- ページ送り(単ページ/見開き) ---------- */
async function show() {
  const S = spreads(), si = Math.max(0, S.findIndex(g => g.includes(page))), g = S[si];
  page = g[0];
  const my = ++seq;
  $('#load').textContent = '読み込み中…';
  const imgs = g.map(i => { const im = new Image(); im.alt = ''; im.src = url(i); return im });
  await Promise.all(imgs.map(im => im.decode().catch(() => {})));
  if (my !== seq) return;
  $('#pages').replaceChildren(...imgs);
  $('#stage').scrollTop = 0;
  $('#load').textContent = '';
  atEnd = g.includes(N - 1);
  $('#end').hidden = !atEnd;
  updateCount(g.length > 1 ? `${g[0] + 1}-${g[1] + 1}` : g[0] + 1);
  savePos();
  for (let k = 1; k <= 2; k++) (S[si + k] || []).forEach(i => { new Image().src = url(i) });  // 先読み
}
function move(d) {
  if (opts.mode === 'scroll') return;
  const S = spreads(), si = S.findIndex(g => g.includes(page)), n = si + d;
  if (n >= S.length || n < 0) return;  // 次の巻へは最後に出るボタンで進む
  page = S[n][0];
  show();
}
function render() {
  seq++;
  $('#end').hidden = true;
  applyOpts();
  if (opts.mode === 'scroll') renderScroll(); else show();
}

/* ---------- 操作 ---------- */
$('#mode').onclick = () => { opts.mode = MODES[(MODES.indexOf(opts.mode) + 1) % MODES.length]; render() };
$('#dir').onclick = () => { opts.rtl = !opts.rtl; applyOpts() };
$('#fit').onclick = () => {
  if (opts.mode === 'scroll') { opts.wide = !opts.wide; applyOpts(); $('#stage').scrollTop = $('#pages').children[page].offsetTop }
  else { opts.fitw = !opts.fitw; applyOpts() }
};
$('#fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
$('#seek').oninput = e => {
  page = +e.target.value - 1;
  if (opts.mode === 'scroll') { $('#stage').scrollTop = $('#pages').children[page].offsetTop; updateCount() }
  else show();
};
$('#zl').onclick = () => move(opts.rtl ? 1 : -1);
$('#zr').onclick = () => move(opts.rtl ? -1 : 1);
document.addEventListener('keydown', e => {
  const k = e.key, st = $('#stage');
  if (k === 'f' || k === 'F') $('#fs').click();
  else if (k === 'Escape' && !document.fullscreenElement) location.href = D.back;
  else if (opts.mode === 'scroll') {
    if (k === 'ArrowDown') st.scrollBy({ top: 120 });
    else if (k === 'ArrowUp') st.scrollBy({ top: -120 });
    else if (k === 'PageDown' || (k === ' ' && !e.shiftKey)) st.scrollBy({ top: st.clientHeight * 0.9, behavior: 'smooth' });
    else if (k === 'PageUp' || (k === ' ' && e.shiftKey)) st.scrollBy({ top: -st.clientHeight * 0.9, behavior: 'smooth' });
    else if (k === 'Home') st.scrollTo({ top: 0 });
    else if (k === 'End') st.scrollTo({ top: st.scrollHeight });
    else return;
  }
  else if (k === 'ArrowLeft') move(opts.rtl ? 1 : -1);
  else if (k === 'ArrowRight') move(opts.rtl ? -1 : 1);
  else if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) move(1);
  else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) move(-1);
  else return;
  e.preventDefault();
});
let tx = null;
$('#stage').addEventListener('touchstart', e => { tx = e.touches[0].clientX }, { passive: true });
$('#stage').addEventListener('touchend', e => {
  if (tx === null || opts.mode === 'scroll') { tx = null; return }
  const dx = e.changedTouches[0].clientX - tx; tx = null;
  if (Math.abs(dx) > 60) move((dx > 0) === opts.rtl ? 1 : -1);
});
render();
})();

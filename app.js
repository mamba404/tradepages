// Plain JS app. APP_TOKEN arrives once as #t=..., kept in localStorage. Data from /api/* (plan A) .
(function(){
const h = new URLSearchParams(location.hash.slice(1)); if (h.get('t')) { localStorage.setItem('desk_t', h.get('t')); history.replaceState(null, '', location.pathname); }
if (h.get('d')) { localStorage.setItem('desk_d', h.get('d')); }   // keep #d in the URL: iOS home-screen apps get their own storage
const T = localStorage.getItem('desk_t') || '';
const D = T ? '' : (localStorage.getItem('desk_d') || '');      // plan B: static data from GitHub
const REPO = 'mamba404/tradepages', POLL_S = 75;
let B = null, bAt = 0, bErr = null, nextPoll = 0;
const COL = {scanner:'#64d2ff', analyst:'#ffd60a', brain:'#bf5af2', executor:'#00d35a', risk:'#ff6b9a'};
let tab = 'home', range = 'LIVE', S = null, lastOk = null, failN = 0;
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let inflight = null;
async function bundle(force) {
  if (B && !force && Date.now() < nextPoll) return B;
  if (inflight) return inflight;
  inflight = _bundle().finally(() => { inflight = null; }); return inflight; }
async function _bundle() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/d/${D}/state.json?ref=data`, {headers: {'Accept': 'application/vnd.github.raw'}, cache: 'no-store'});
  if (r.status === 403 || r.status === 429) { const reset = +r.headers.get('x-ratelimit-reset') || 0; nextPoll = Math.max(Date.now() + 60000, reset * 1000); throw new Error('rate limit'); }
  if (!r.ok) { nextPoll = Date.now() + 30000; throw new Error(r.status); }
  B = await r.json(); bAt = Date.now(); nextPoll = Date.now() + POLL_S * 1000; return B; }
async function api(p, opt={}) {
  if (D) {   // read-only static mode: map API paths onto the bundle
    if (opt.method === 'POST') throw new Error('read-only: use Telegram for changes');
    const b = await bundle(), path = p.split('?')[0];
    if (path === 'state') return Object.assign({}, b.state, {data_ts: b.ts});
    if (path === 'chart') return b.charts[new URLSearchParams(p.split('?')[1]).get('range') || 'LIVE'];
    if (path === 'activity') return b.activity;
    if (path === 'orders') return b.orders;
    if (path === 'account') return b.account;
    if (path === 'settings') return b.settings;
    const m = path.match(/^bots\/(\w+)\/decisions$/); if (m) return b.decisions[m[1]] || [];
    throw new Error('not in static data');
  }
  const r = await fetch('api/' + p, Object.assign({headers: {'Authorization': 'Bearer ' + T, 'Content-Type': 'application/json'}}, opt));
  if (!r.ok) throw new Error(r.status); return r.json(); }
const screenUrl = () => D ? (B && B.screen ? `https://raw.githubusercontent.com/${REPO}/data/d/${D}/${B.screen}` : '') : 'api/screen.jpg?t=' + encodeURIComponent(T) + '&_=' + Date.now();
const fmtT = s => s ? s.slice(11, 19) : '—';
function err(on) { const e = $('#err'); if (!on) { e.classList.add('hidden'); failN = 0; return; } failN++;
  e.textContent = `Desk offline · retrying · son güncelleme ${B ? fmtT(B.ts) : (lastOk ? lastOk.toLocaleTimeString() : '—')}`; e.classList.remove('hidden'); }
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
function actRow(r) { const isTrade = r.kind !== 'rejected';
  return `<div class="row"><div class="m"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)} · ${esc((r.ts||'').slice(11,16))}</div></div>
  <div class="v ${r.kind==='stopped'?'red':(r.kind==='sold'?'green':'')}">${esc(r.value)}<br>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Open on FOMO</a>` : ''}</div></div>`; }
async function home() {
  const [st, ch, act] = await Promise.all([api('state'), api('chart?range=' + range), api('activity')]); S = st;
  const pct = st.today_pct; const lane = st.lane || 'Idle';
  const ageS = st.data_ts ? Math.round((Date.now() - new Date(st.data_ts).getTime()) / 1000) : null;
  $('#view').innerHTML = `${st.mode==='PAPER'?'<div class="paperbar">PAPER · simulated money · no real trades</div>':''}
   <div class="nav"><div class="av" onclick="go('account')"></div><div class="name">Grok Bot ›</div><div class="upd">son güncelleme ${st.data_ts ? fmtT(st.data_ts) + (ageS !== null ? ` · ${ageS < 120 ? ageS + 's' : Math.round(ageS/60) + 'dk'} önce` : '') : 'canlı'}</div></div>
   <div class="bal">${money(st.balance)} ${st.mode==='PAPER'?'<span class="pill paper">PAPER</span>':''}</div>
   <div class="sub"><span class="${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct.toFixed(2)}%</span> today · <span class="pill mult">${st.multiplier.toFixed(2)}×</span> · cash ${money(st.cash)}</div>
   <canvas class="chart" id="cv"></canvas>
   <div class="ranges">${['LIVE','1H','4H','1D','1W','ALL'].map(r=>`<button class="${r===range?'on':''}" data-r="${r}">${r}</button>`).join('')}</div>
   <div class="live" id="live"><img id="sa" alt=""><img id="sb" alt="" style="opacity:0"><div class="tl" id="ltl"><span class="dot"></span>…</div>
     <div class="tr" style="color:${COL[(lane.split(' ')[0]||'').toLowerCase()]||'#fff'}">${esc(lane)}</div></div>
   <div class="lastorder">${st.last_order ? esc(`${st.last_order.side==='buy'?'Bought':'Sold'} ${st.last_order.mint.slice(0,6)} · ${money(st.last_order.fill_usd||st.last_order.usd||0)} · PAPER · screen ${st.last_order.screen_ok?'✓':'–'} api – chain –`) : 'Waiting for the first trade'}</div>
   ${!/^ok/.test(st.fomo_session||'') && st.fomo_session !== 'token in memory' ? '<div class="card" style="color:var(--o)">FOMO session: '+esc(st.fomo_session)+' — PAPER runs on public data.</div>' : ''}
   <h2>Bots · 5 running</h2><div class="carousel">${Object.entries(st.bots).map(([k,b])=>`<div class="card"><div class="bt" style="color:${COL[k]}">${k[0].toUpperCase()+k.slice(1)}</div><div class="bt">${esc(b.title)}</div><div class="bs">${esc(b.sub)}</div>${k==='risk'?`<div class="pills" style="margin-top:6px"><span class="pill red">stop -${esc(st.bots.risk.sub.match(/\d+/)[0])}%</span><span class="pill green">trail</span></div>`:''}</div>`).join('')}</div>
   <h2>Activity · <a href="#" onclick="go('activity');return false">See all</a></h2>${act.slice(0,5).map(actRow).join('') || '<div class="empty">Waiting for the first trade</div>'}
   ${st.positions.length?'<h2>Open positions</h2>'+st.positions.map(p=>`<div class="row"><div class="m"><div class="t">${esc(p.symbol||p.mint.slice(0,6))}</div><div class="s">${money(p.size_usd)} in · Executor</div></div><div class="v ${p.pnl_pct>=0?'green':'red'}">${p.pnl_pct.toFixed(1)}%<br><a href="${esc(p.link)}" target="_blank" rel="noopener">Open on FOMO</a></div></div>`).join(''):''}`;
  drawChart($('#cv'), ch.points, ch.start, ch.marks);
  document.querySelectorAll('.ranges button').forEach(b => b.onclick = () => { range = b.dataset.r; refresh(); });
  $('#live').onclick = () => { $('#fullimg').src = screenUrl(); $('#full').classList.remove('hidden'); };
  frame();
}
let flip = false;
let lastSrc = '';
function frame() { const a = $('#sa'), b = $('#sb'); if (!a) return; const src = screenUrl(); if (!src || (D && src === lastSrc && a.src)) return; lastSrc = src; const next = flip ? a : b, cur = flip ? b : a;
  const im = new Image(); im.onload = () => { next.src = im.src; next.style.opacity = 1; cur.style.opacity = 0; flip = !flip;
    $('#ltl').innerHTML = S && S.screen === 'Paused · private' ? '<span class="dot"></span>Paused · private' : '<span class="dot red"></span>Live · Bot\'s computer'; };
  im.onerror = () => { $('#ltl').innerHTML = '<span class="dot"></span>Last frame —'; };
  im.src = src; }
async function bots() {
  const st = await api('state'); const names = Object.keys(st.bots);
  const dec = await Promise.all(names.map(n => api(`bots/${n}/decisions`)));
  $('#view').innerHTML = '<h2>Bots</h2>' + names.map((n,i) => { const b = st.bots[n]; const fresh = b.heartbeat && (Date.now() - new Date(b.heartbeat).getTime() < 120000);
    return `<div class="card" style="margin-bottom:12px"><div class="bt"><span class="dot ${fresh?'':'red'}" style="background:${fresh?'#00d35a':''}"></span><span style="color:${COL[n]}">${n[0].toUpperCase()+n.slice(1)}</span> · ${esc(b.title)}</div>
    <div class="bs">${esc(b.sub)}</div><button class="btn ${D?'hidden':''}" style="margin:8px 0" data-p="${n}" data-a="${b.paused?'resume':'pause'}">${b.paused?'Resume':'Pause'}</button>
    ${dec[i].map(d=>`<div class="row"><div class="m"><div class="t">${esc(d.verdict)}</div><div class="s">${esc(d.reason)} · ${esc(d.ts.slice(11,19))}</div></div><div class="v">${d.link?`<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.mint.slice(0,6))}…</a>`:''}</div></div>`).join('') || '<div class="empty">No decisions yet</div>'}</div>`; }).join('');
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => { try { await api(`bots/${b.dataset.p}/${b.dataset.a}`, {method:'POST'}); } catch(e) { alert('Refused: ' + e.message); } bots(); });
}
async function activity() { const rows = await api('activity'); $('#view').innerHTML = '<h2>Activity</h2>' + (rows.map(actRow).join('') || '<div class="empty">Nothing yet tonight</div>'); }
async function account() {
  const [a, s] = await Promise.all([api('account'), api('settings')]);
  const groups = {}; Object.entries(s).forEach(([k,v]) => { const [g,n] = k.split('.'); (groups[g] = groups[g] || []).push([k,n,v]); });
  $('#view').innerHTML = `<h2>Account</h2><div class="card"><div class="bt">Mode: ${esc(a.mode)} <span class="pill paper">PAPER</span></div><div class="bs">LIVE is locked in this build.${D ? ' Read-only view: change settings and pause bots through Telegram.' : ''}</div>
   <div class="bs">PAPER cash ${money(a.cash)} · Telegram: ${a.telegram?'connected':'not connected'}</div>
   <p><a class="btn" href="${esc(a.profile_url)}" target="_blank" rel="noopener">Your FOMO profile</a> <button class="btn" id="inv">Invite a friend</button></p></div>
   ${Object.entries(groups).map(([g,items])=>`<h2>${esc(g)}</h2>`+items.map(([k,n,v])=> v.min===null ? `<div class="set"><label>${esc(n)}</label><span>${esc(v.value)}</span></div>` :
     `<div class="set"><label>${esc(n)}</label><input type="range" min="${v.min}" max="${v.max}" step="any" value="${v.value}" data-k="${k}"><input type="number" min="${v.min}" max="${v.max}" step="any" value="${v.value}" data-k="${k}"></div>`).join('')).join('')}`;
  $('#inv').onclick = async () => { if (navigator.share) { try { await navigator.share({url: a.signup_url}); } catch(e){} } else { await navigator.clipboard.writeText(a.signup_url); alert('Link copied'); } };
  document.querySelectorAll('.set input').forEach(i => i.onchange = async () => { const r = await api('settings', {method:'POST', body: JSON.stringify({[i.dataset.k]: i.value})});
    const [ok, msg] = r[i.dataset.k]; if (!ok) alert(msg); account(); });
}
const VIEWS = {home, bots, activity, account};
window.go = t => { tab = t; document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); refresh(); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fullclose').onclick = () => $('#full').classList.add('hidden');
async function refresh() { try { await VIEWS[tab](); lastOk = new Date(); err(false); } catch(e) { err(true); } }
if (!T && !D) { $('#view').innerHTML = '<div class="empty">Open this app once with its private link (#d=…).</div>'; return; }
refresh();
if (D) { setInterval(async () => { try { await bundle(true); } catch(e) {} refresh(); }, POLL_S * 1000); setInterval(() => { if (tab === 'home') refresh(); }, 15000); }
else { setInterval(() => { if (tab === 'home') frame(); }, 1000); setInterval(() => { if (tab === 'home' || tab === 'activity') refresh(); }, 15000);
  try { const es = new EventSource('api/stream?t=' + encodeURIComponent(T)); es.onmessage = m => { const d = JSON.parse(m.data); if (['fill','exit','balance'].includes(d.type) && tab === 'home') refresh(); }; } catch(e) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();

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
const money = v => (v == null || isNaN(v)) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
const sgn = v => v == null ? 'flat' : (v > 0.004 ? 'up' : (v < -0.004 ? 'down' : 'flat'));
const hm = s => s ? s.slice(11, 16) : '—';      // desk timestamps are Istanbul local time
const clock = () => new Intl.DateTimeFormat('tr-TR', {timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit'}).format(new Date());
const BOTS = ['scanner','analyst','brain','executor','risk'];
const cap = s => s[0].toUpperCase() + s.slice(1);
function actRow(r) {
  const k = r.kind, rej = k === 'rejected' || k === 'skipped';
  const ico = k === 'bought' ? ['buy','B'] : k === 'sold' ? ['sell','S'] : k === 'stopped' ? ['stop','✕'] : ['rej','–'];
  const v = String(r.value ?? ''); const neg = /^-/.test(v), pos = /^\+/.test(v);
  const cls = rej ? '' : (k === 'sold' || k === 'stopped') ? (neg ? 'down' : (pos || k === 'sold' ? 'up' : '')) : '';
  return `<div class="arow ${rej ? 'rej' : ''}"><div class="aico ${ico[0]}">${ico[1]}</div>
   <div class="am"><div class="t">${esc(r.title)}${rej ? '<span class="skip">SKIPPED</span>' : ''}</div><div class="s">${esc(r.subtitle)} · ${hm(r.ts)}</div></div>
   <div class="av ${cls}">${rej ? '' : esc(v || '—')}${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">FOMO ↗</a>` : ''}</div></div>`; }
function feed(act, dec, n) {   // activity already carries trades and 'Rejected X' (Skipped) rows; newest first
  return (act || []).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)) || (b.id || 0) - (a.id || 0)).slice(0, n); }
function chipFor(name, st, dec) {
  const b = st.bots[name] || {}, d = (dec[name] || [])[0];
  const fresh = b.heartbeat && (Date.now() - new Date(b.heartbeat).getTime() < 180000);
  if (b.paused) return ['idle', 'paused']; if (!fresh) return ['fail', 'offline'];
  if ((st.lane || '').toLowerCase().startsWith(name)) return ['chk', 'working'];
  if (!d) return ['idle', 'idle'];
  if (/pass|buy|done|ok|size/i.test(d.verdict)) return ['pass', 'passed'];
  if (/kill|reject|skip|fail|drop/i.test(d.verdict)) return ['fail', 'rejected'];
  return ['chk', 'checking']; }
async function home() {
  const [st, ch, act] = await Promise.all([api('state'), api('chart?range=' + range), api('activity')]); S = st;
  let dec = {}; try { dec = D ? (B.decisions || {}) : Object.fromEntries(await Promise.all(BOTS.map(async n => [n, await api(`bots/${n}/decisions`)]))); } catch (e) {}
  const base = st.night_start, bal = st.balance;
  const dUsd = (bal != null && base) ? bal - base : null, dPct = dUsd != null ? dUsd / base * 100 : null, mult = (bal != null && base) ? bal / base : null;
  const s = sgn(dUsd), lane = st.lane || 'Idle', busy = !/^idle/i.test(lane);
  const ageS = st.data_ts ? Math.round((Date.now() - new Date(st.data_ts).getTime()) / 1000) : null;
  const live = ageS !== null && ageS < 300;
  const lastTrade = (act || []).find(r => ['bought', 'sold', 'stopped'].includes(r.kind));
  const open = (st.positions || []).length;
  $('#view').innerHTML = `
   <div class="hdr"><span class="back">‹</span><span class="ttl">Grok Terminal</span>${st.mode === 'PAPER' ? '<span class="paper">PAPER</span>' : ''}<button class="share" id="share">Share</button></div>
   <div class="hsub"><span class="livep ${live ? '' : 'off'}"><i></i>${live ? 'Live' : 'Stale'}</span><span>fomo • ${open} open</span><span class="clock mono" id="clk">${clock()} İST</span></div>
   ${st.mode === 'PAPER' ? '<div class="paperbar">PAPER · simulated money · no real trades</div>' : ''}
   <div class="panel">
     <div class="bal">${money(bal)}</div>
     <div class="chg"><span class="${s}">${dUsd == null ? '—' : (dUsd >= 0 ? '+' : '-') + '$' + Math.abs(dUsd).toFixed(2)}</span><span class="${s}">${dPct == null ? '—' : (dPct >= 0 ? '+' : '') + dPct.toFixed(2) + '%'}</span><span class="badge ${s}">${mult == null ? '—' : mult.toFixed(2) + 'x'}</span><span class="mono" style="color:var(--t3);font-size:11px;margin-left:auto">vs ${money(base)} start</span></div>
     <canvas class="chart" id="cv"></canvas>
     <div class="ranges">${['LIVE','1H','4H','1D','1W','ALL'].map(r => `<button class="${r === range ? 'on' : ''}" data-r="${r}">${r}</button>`).join('')}</div>
   </div>
   <div class="panel"><div class="ph"><b>Live Screen</b><span>Bot's computer</span></div>
     <div class="win"><div class="bar"><i></i><i></i><i></i><span class="mono">fomo.family · desk chrome</span></div>
       <div class="live" id="live"><img id="sa" alt=""><img id="sb" alt="" style="opacity:0"><div class="none" id="ltl">${screenUrl() ? '' : 'No frame yet'}</div>
       <div class="tr ${busy ? 'busy' : 'idle'}">${esc(busy ? lane : 'Executor · idle')}</div></div></div>
     <div class="lastact">${lastTrade ? `<span class="ver">✓</span><span>${esc(lastTrade.title)} · ${esc(String(lastTrade.value || '').split(' · ')[0] || '—')}</span><span class="mono" style="color:var(--t3);font-size:11px;margin-left:auto">${hm(lastTrade.ts)}</span>` : '<span style="color:var(--t2)">No trade yet</span>'}</div>
   </div>
   ${!/^ok/.test(st.fomo_session || '') && st.fomo_session !== 'token in memory' ? `<div class="panel" style="color:var(--o);font-size:13px">FOMO session: ${esc(st.fomo_session || '—')} — PAPER runs on public data.</div>` : ''}
   <div class="panel"><div class="ph"><b>Bots</b><span>${BOTS.filter(n => st.bots[n] && !st.bots[n].paused).length} running</span></div>
     ${BOTS.map(n => { const b = st.bots[n] || {}; const [c, t] = chipFor(n, st, dec);
       return `<div class="brow"><div class="bico" style="background:${COL[n]}">${n[0].toUpperCase()}</div><div class="bm"><div class="n">${cap(n)} <span style="color:var(--t2);font-weight:600;font-size:13px">· ${esc(b.title || '—')}</span></div><div class="s">${esc(b.sub || '—')}</div></div><span class="chip ${c}">${t}</span></div>`; }).join('')}
   </div>
   ${open ? `<div class="panel"><div class="ph"><b>Open positions</b><span>${open}</span></div>${st.positions.map(p => `<div class="arow"><div class="aico buy">B</div><div class="am"><div class="t">${esc(p.symbol || p.mint.slice(0, 6))}</div><div class="s">${money(p.size_usd)} in · ${esc(p.mode || 'PAPER')}</div></div><div class="av ${sgn(p.pnl_pct)}">${p.pnl_pct == null ? '—' : (p.pnl_pct >= 0 ? '+' : '') + p.pnl_pct.toFixed(1) + '%'}<a href="${esc(p.link)}" target="_blank" rel="noopener">FOMO ↗</a></div></div>`).join('')}</div>` : ''}
   <div class="panel"><div class="ph"><b>Activity</b><span>newest first · İST</span><a class="rt" href="#" onclick="go('activity');return false">See all</a></div>
     ${feed(act, dec, 8).map(actRow).join('') || '<div class="empty">No activity yet</div>'}</div>
   <div class="upd">son güncelleme ${st.data_ts ? hm(st.data_ts) + ' İST' + (ageS !== null ? ` · ${ageS < 120 ? ageS + 's' : Math.round(ageS / 60) + 'dk'} önce` : '') : '—'} · refresh ~${POLL_S}s</div>`;
  drawChart($('#cv'), ch.points || [], ch.start, ch.marks, s);
  document.querySelectorAll('.ranges button').forEach(b => b.onclick = () => { range = b.dataset.r; refresh(); });
  $('#live').onclick = () => { const u = screenUrl(); if (!u) return; $('#fullimg').src = u; $('#full').classList.remove('hidden'); };
  $('#share').onclick = async () => { const url = location.origin + location.pathname;   // private #d= path is not shared
    try { if (navigator.share) await navigator.share({title: 'Grok Terminal', url}); else { await navigator.clipboard.writeText(url); alert('Link copied'); } } catch (e) {} };
  lastSrc = ''; frame();
}
setInterval(() => { const c = document.getElementById('clk'); if (c) c.textContent = clock() + ' İST'; }, 10000);
let flip = false;
let lastSrc = '';
function frame() { const a = $('#sa'), b = $('#sb'); if (!a) return; const src = screenUrl(); if (!src || (D && src === lastSrc && a.src)) return; lastSrc = src; const next = flip ? a : b, cur = flip ? b : a;
  const im = new Image(); im.onload = () => { next.src = im.src; next.style.opacity = 1; cur.style.opacity = 0; flip = !flip;
    $('#ltl').textContent = S && S.screen === 'Paused · private' ? 'Paused · private' : ''; };
  im.onerror = () => { $('#ltl').textContent = 'No frame'; };
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
async function activity() { const rows = await api('activity'); let dec = {}; try { dec = D ? (B.decisions || {}) : {}; } catch (e) {}
  $('#view').innerHTML = '<div class="hdr"><span class="back" onclick="go(\'home\')">‹</span><span class="ttl">Activity</span><span class="paper">PAPER</span></div><div class="panel">' + (feed(rows, dec, 200).map(actRow).join('') || '<div class="empty">Nothing yet tonight</div>') + '</div>'; }
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

// The HUD (Wins, Gems and the menu tiles down the left; RACE, the free gift, the SHOP and 2X down the right; the quest and a revive
// offer top middle; at the bottom what a step gives, your Speed, your walking speed, the Level bar and what multiplies a step; the
// stage you're in), the race's own (the queue, the clock, the scoreboard, the results) and every panel: Upgrades, Pets (pets, Star
// Capsules, trails, auras), Teleport (stages, worlds), the wheel, rebirth, the shop (Gems for Wins, x2s, codes), quests, the daily
// reward, gifts, leaderboards, settings. Prices are Wins or Gems only.
import { $, VIEW } from './engine.js';
import { S, net, actions } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume, playAsmr, soundOff } from './audio.js';
import { setQuality, getQuality } from './fx.js';
import { palSvg, jawSvg } from './icons.js';
// (a namespace: shared/config.js is being remade alongside, and a name missing for a moment mustn't stop the page loading)
import * as CF from '../../shared/config.js';
const {
    CFG, WORLDS, WALLS_N, RARITIES, SPIN, UPGRADES, upgradeCost, stepGain, fmtStep, nextPost, TRAILS, AURAS, POSTS, postOpen, JAWBREAKERS, PALS, palById, palsOf, teamMax, teamMult, jbGems, rebirthMult, xpNeed, worldOpen, stageName,
    worldReb, TASKS, QUESTS, DAILY, dailyStatus, dayLeft, GIFTS, PACKS, rewardText, rewardSpeed, clock, fmtComma, fmt, PLACES, SPOT_CSS,
} = CF;
const upLevel = CF.upLevel || ((p, id) => (p.ups && p.ups[id]) || 0);
const maxWalk = CF.maxWalk || ((p) => Math.min(CFG.vMax, CFG.walk + 2.2 * (Math.max(1, p.lv | 0) - 1)) * (1 + 0.04 * upLevel(p, 'feet')));
const rebirthLv = CF.rebirthLv || ((r) => 10 + 5 * (r || 0));
const rebirthPct = CF.rebirthPct || ((p) => Math.min(100, Math.floor(((p.lv | 0) || 1) / rebirthLv(p.rebirths) * 100)));
// your walking speed: your Custom Speed (S.cs, when you've set one under your top), never over the top speed your Level gives
export const walkTop = () => { const m = maxWalk(S); return S.cs > 0 ? Math.max(8, Math.min(S.cs, m)) : m; };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const rar = (r) => `<span class="rar" style="color:${RARITIES[r].color}">${RARITIES[r].name}</span>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const WC = '<i class="wc"></i>';
// a drawn icon (icons.js) for a panel's title
const IC = (k) => '<i class="ic ic-' + k + ' pic"></i>';
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;

// =====================================================================================
// Small things: toasts, big words, pop-ups, level ups, Wins
// =====================================================================================
// starts a CSS animation over without asking the page for its layout: the class comes back on the next frame
function replay(el) { el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); }
// Toasts: a short list under the quest. The same words again just stay up longer; the oldest goes when there's no room.
// (the window's shape from VIEW: reading innerWidth just after adding a toast made the page lay itself out there and then)
const TOAST_MAX = () => (VIEW.portrait ? 2 : 3);
// keep: a toast the others don't push out (Wins from a gate: a quest done and the next quest arrive with it, and a phone has two slots)
export function toast(text, color, html, keep) {
    const box = $('#toasts');
    for (const c of box.children) if (c.dataset.t === text) { c.getAnimations().forEach((a) => { a.currentTime = 400; }); clearTimeout(c.tm); c.tm = setTimeout(() => c.remove(), 2900); return; }
    const el = document.createElement('div');
    el.className = 'toast o1'; el.dataset.t = text; el.style.color = color || '#fff';
    if (html) el.innerHTML = text; else el.textContent = text;
    if (keep) el.dataset.keep = '1';
    box.appendChild(el);
    while (box.children.length > TOAST_MAX()) { let old = null; for (const c of box.children) if (c !== el && !c.dataset.keep) { old = c; break; } (old || box.firstChild).remove(); }
    el.tm = setTimeout(() => el.remove(), 3300);
}
// The big moments take turns in one lane over your head: a Level, a pile of Wins, new shoes never land on top of each other.
// Each shows until its time is up, a little shorter when others are waiting; Levels or Wins waiting already take in the new ones.
const lane = { q: [], on: null, t: 0 };
const LANE_KEEP = 5;
function laneNext() {
    clearTimeout(lane.t);
    if (lane.on) { lane.on.el.hidden = true; lane.on.el.classList.remove('go'); lane.on = null; }
    const it = lane.q.shift();
    if (!it) return;
    lane.on = it;
    it.show();
    it.el.hidden = false; replay(it.el);
    lane.t = setTimeout(laneNext, lane.q.length ? it.ms * 0.72 : it.ms);
}
function announce(kind, el, ms, show) {
    const w = lane.q.findIndex((x) => x.kind === kind);
    if (w >= 0 && (kind === 'level' || kind === 'wins')) { lane.q[w].show = show; return; }
    lane.q.push({ kind, el, ms, show });
    while (lane.q.length > LANE_KEEP) lane.q.shift();
    if (!lane.on) laneNext();
    // already up: it hurries along for what's waiting
    else if (lane.q.length === 1) { clearTimeout(lane.t); lane.t = setTimeout(laneNext, 900); }
}
export function bigText(text, color) {
    const el = $('#bigText');
    announce('big', el, 1900, () => { el.textContent = text; el.style.color = color || '#ffe24a'; });
}
// sub may hold the drawn icons (html)
export function popup(icon, title, sub, color, html) {
    announce('popup', $('#popup'), 2400, () => {
        $('#popIc').textContent = icon; $('#popT').textContent = title; $('#popT').style.color = color || '#ffe24a';
        if (html) $('#popS').innerHTML = sub || ''; else $('#popS').textContent = sub || '';
    });
}
// "LEVEL UP / Level 15" (several in a row show as one)
let lvFrom = 0;
export function levelUp(lv0, lv1) {
    if (!lane.q.some((x) => x.kind === 'level')) lvFrom = lv0;
    const from = lvFrom;
    announce('level', $('#lvlUp'), 1700, () => {
        $('#lu1').textContent = 'LEVEL UP';
        $('#lu2').textContent = 'Level ' + lv1 + (lv1 - from > 1 ? ' (+' + (lv1 - from) + ')' : '');
    });
    bump('#lvBar');
}
let winsWaiting = 0;
export function winPop(n) {
    winsWaiting = lane.q.some((x) => x.kind === 'wins') ? winsWaiting + n : n;
    const sum = winsWaiting;
    announce('wins', $('#winPop'), 1500, () => { $('#winPopV').textContent = '+' + fmt(sum) + (sum === 1 ? ' WIN' : ' WINS'); });
}
export function notEnough(m) {
    sfx('denied');
    const gems = m.cur === 'gems';
    askConfirm(gems ? '💎' : '🏆', 'Not enough ' + (gems ? 'Gems' : 'Wins'), `You need ${fmtComma(m.need)} more ${gems ? 'Gems' : 'Wins'} for ${esc(m.name)}.` + (gems ? '<br><small>Gems come from quests, daily tasks, races, gifts, the wheel and the daily reward.</small>' : '<br><small>Run through the stages\' gates on the Keyway, or race in Black Hole Rush.</small>'),
        gems ? 'Quests' : 'OK', () => { if (gems) openPanel('quests'); });
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); if (m.ok) sfx('reward'); else sfx('denied'); }
export function questDone(m) { const el = $('#questLine'); if (el.animate) el.animate(POP, { duration: 500 }); toast('🎯 ' + esc(m.text) + ' &nbsp;<span style="color:#ffe24a">+ ' + m.reward + '</span>', '#7dff6b', true); }

// =====================================================================================
// The HUD (written only when a value changes; the bars move with transforms)
// =====================================================================================
const shown = { w: 0, g: 0 }, shownTxt = { w: '', g: '' };
function rollCounter(key, v, sel, f, up, down) {
    const target = v || 0;
    if (shown[key] === target) return;
    shown[key] += (target - shown[key]) * (target > shown[key] ? up : down);
    if (Math.abs(target - shown[key]) < 0.05) shown[key] = target;
    const txt = f(Math.round(shown[key]));
    if (txt !== shownTxt[key]) { shownTxt[key] = txt; $(sel).textContent = txt; }
}
export function animateCounters(dt) {
    // Gems count up quickly; Wins roll up over a second or so, as the trophies fly in
    const kf = Math.min(1, dt * 12), ks = Math.min(1, dt * 2.6);
    rollCounter('w', S.wins, '#winsVal', fmt, ks, kf);
    rollCounter('g', S.gems, '#gemVal', fmtComma, kf, kf);
    // the level bar and your Speed (predicted between the server's updates; the words only when they change)
    const need = S.need || xpNeed(S.lv, S.rebirths), f = Math.min(1, (S.xp || 0) / need);
    if (Math.abs(f - lvFillShown) > 0.002) { lvFillShown = f; $('#lvFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; }
    const now = performance.now();
    if (now - lvNumAt > 110) {
        lvNumAt = now;
        put('#lvNum', xpText());
        put('#powerVal', fmt(S.powerShown || 0));
    }
}
// "178.8 / 547 XP", "1.07K / 2.27K XP"
const xpText = () => fmt1(Math.floor((S.xp || 0) * 10) / 10) + ' / ' + fmt(S.need || xpNeed(S.lv, S.rebirths)) + ' XP';
let lvFillShown = -1, lvNumAt = 0;
// a springy pop (an animation of its own: no class toggling, so no layout read)
const POP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }];
export function bump(sel) { const el = $(sel); if (el && el.animate) el.animate(POP, { duration: 420, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' }); }
// every step: the level bar ticks
const TICK = [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.4 }, { transform: 'scale(1)' }];
let tickAt = 0;
export function stepTick() { if (getQuality() === 'low') return; const now = performance.now(); if (now - tickAt < 130) return; tickAt = now; const el = $('#lvBar'); if (el.animate) el.animate(TICK, { duration: 160, easing: 'ease-out' }); }
// Wins: little crowns burst out of the middle of the screen and stream into the Wins counter, each one a chime
let winsAt = null, flying = 0;
export function flyWins(n) {
    if (!winsAt || flying > 24) return;
    const box = $('#flyLayer'), k = Math.min(10, Math.max(3, Math.round(Math.sqrt(n) * 2.5)));
    const fx = VIEW.w / 2, fy = VIEW.h * 0.42;
    for (let i = 0; i < k; i++) {
        const el = document.createElement('i');
        el.className = 'ic ic-trophy';
        box.appendChild(el);
        flying++;
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80, sx = fx + Math.cos(a) * r, sy = fy + Math.sin(a) * r * 0.7;
        const at = (x, y, sc) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) translate(-50%,-50%) scale(' + sc + ')';
        const anim = el.animate([
            { transform: at(fx, fy, 0.2), opacity: 0 },
            { transform: at(sx, sy, 1.3), opacity: 1, offset: 0.3 },
            { transform: at(winsAt.x, winsAt.y, 0.75), opacity: 1 },
        ], { duration: 820 + i * 60, delay: i * 50, easing: 'cubic-bezier(0.45, 0, 0.65, 1)', fill: 'both' });
        anim.onfinish = () => { el.remove(); flying--; bump('#winsBox'); playAsmr('tick', 0.14, 1.5 + i * 0.06); };
    }
}
const worth = (r) => ({ ...r, speed: rewardSpeed(r, S.lv) });
const put = (sel, v, html) => { const el = $(sel); if (html) { if (el.innerHTML !== v) el.innerHTML = v; } else if (el.textContent !== v) el.textContent = v; };
const fmt1 = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
// a multiplier as the reference writes it: x1, x1.5, x2.25
const mx = (v) => 'x' + (Math.round(v * 100) / 100);
let soundShown = null, pctShown = -1;
export function updateHud() {
    put('#lvTxt', 'LEVEL ' + S.lv);
    put('#lvNum', xpText());
    // what multiplies a step's Speed, over the Level bar's ends
    put('#mTA', 'TRAIL & AURA ' + mx((TRAILS[S.trail | 0] || TRAILS[0]).mult * (AURAS[S.aura | 0] || AURAS[0]).mult));
    put('#mUp', 'UPGRADES ' + mx(1 + 0.15 * upLevel(S, 'soles')));
    put('#mReb', 'REBIRTHS ' + mx(rebirthMult(S.rebirths)));
    put('#mPets', 'PETS ' + mx(teamMult(S.team)));
    // what a step gives right now (everything that multiplies it)
    put('#x20Badge', '+' + fmtStep(stepGain(S, S.x2, S.world)) + ' / STEP');
    // your walking speed: the top your Level gives, the one you've chosen (the box isn't written while you're typing in it)
    const top = Math.round(maxWalk(S)), cur = Math.round(walkTop());
    put('#csMax', 'WALK · MAX ' + top);
    put('#csCur', 'Walking at ' + cur);
    const ci = $('#csIn');
    if (document.activeElement !== ci && ci.value !== String(cur)) ci.value = String(cur);
    // the quest
    const Q = QUESTS[S.qi];
    if (Q) {
        const p = Math.min(Q.n, S.qv || 0);
        put('#questLine', Q.text + (Q.n > 1 ? ' ' + fmt(p) + '/' + fmt(Q.n) : ''));
        $('#questLine').hidden = false; $('#questBox').hidden = false;
    } else { $('#questLine').hidden = true; $('#questBox').hidden = true; }
    // the next playtime gift's clock
    const secs = sessionSecs(), gi = GIFTS.findIndex((g, i) => !(S.gifts && S.gifts[i]));
    const gb = $('#bGift');
    if (gi < 0) gb.hidden = true;
    else {
        gb.hidden = false;
        const left = GIFTS[gi].min * 60 - secs;
        gb.classList.toggle('ready', left <= 0);
        put('#giftTxt', left <= 0 ? 'CLAIM!' : clock(left));
    }
    // 2X SPEED
    put('#x2Txt', S.x2 ? clock(((S.x2Until || 0) - net.now()) / 1000) : '💎 ' + CFG.boostP2Gems);
    $('#bX2').classList.toggle('on', !!S.x2);
    // how far to a rebirth (100%: ready)
    const pct = rebirthPct(S);
    if (pct !== pctShown) { pctShown = pct; put('#rebPct', pct + '%'); $('#rebPct').classList.toggle('full', pct >= 100); }
    // the Sound button's picture
    const on = !soundOff();
    if (on !== soundShown) { soundShown = on; $('#soundIc').className = 'mi ic ic-' + (on ? 'sound' : 'mute'); }
    // badges: something to do
    const ds = dailyStatus(S.daily, net.now());
    setBadge('#bDaily', ds.can ? '!' : '');
    const list = (S.jq && S.jq.list) || [];
    setBadge('#bQuests', list.some((q) => !q.c && TASKS[q.k] && q.p >= TASKS[q.k].n) ? '!' : '');
    setBadge('#bSpin', S.spins > 0 ? String(S.spins) : '');
    const nw = WORLDS.findIndex((w, i) => i > S.world && worldOpen(S, i));
    setBadge('#bTele', nw > 0 && !(S.seen && S.seen['w' + nw]) ? 'NEW' : '');
    setBadge('#bWork', UPGRADES.some((u) => { const k = (S.ups && S.ups[u.id]) || 0; return k < u.max && S.wins >= upgradeCost(u, k); }) ? '!' : '');
    const canJaw = JAWBREAKERS.some((J) => S.wins >= J.wins && S.wins < J.wins * 8 && !(S.index && palsOf(JAWBREAKERS.indexOf(J)).every((a) => S.index[a.id])));
    setBadge('#bPals', canJaw || TRAILS.some((t, i) => i > 0 && !(S.trails && S.trails[t.id]) && S.wins >= t.wins && S.wins < t.wins * 6) ? '!' : '');
    tickPanel();
}
// The open panel's timers, written once a second on their own: a panel rebuilt under a finger loses the tap, and a rebuild
// from the frame loop means a layout. It's rebuilt only when what it shows changes (a gift's time comes).
function tickPanel() {
    const m = $('#modal');
    if (m.hidden || !panelKind) return;
    const set = (sel, text) => { const el = m.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    if (panelKind === 'quests') set('[data-t="day"]', 'Resets in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'daily') set('[data-t="daily"]', 'Next reward in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'shop') {
        const left = (u) => ((u || 0) > net.now() ? 'Active: ' + clock((u - net.now()) / 1000) + ' left' : '');
        set('[data-t="x2"]', left(S.x2Until) || 'Double every step');
        set('[data-t="w2"]', left(S.w2Until) || 'Double the Wins from gates');
    }
    else if (panelKind === 'spin' && !spinning) {
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        set('[data-t="spin"]', S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left));
    } else if (panelKind === 'gifts') {
        const secs = sessionSecs();
        for (let i = 0; i < GIFTS.length; i++) {
            if (S.gifts[i]) continue;
            const left = GIFTS[i].min * 60 - secs, b = m.querySelector('[data-act="gift"][data-i="' + i + '"]');
            if (!b) continue;
            if (left <= 0 && b.disabled) { renderPanel(); return; }
            if (left > 0) set('[data-act="gift"][data-i="' + i + '"]', clock(left));
        }
    }
}
function setBadge(sel, text) {
    const el = $(sel);
    let b = el.querySelector('.badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
    if (b.textContent !== text) b.textContent = text;
}
export function measureHud() {
    const w = $('#winsBox .ic').getBoundingClientRect(); if (w.width > 0) winsAt = { x: w.left + w.width / 2, y: w.top + w.height / 2 };
}
// the DASH button fills back up after a dash (on a treadmill it says SPRINT)
let dashShown = -1, dashTread = null;
export function dashFill(k, tread) {
    if (tread !== dashTread) { dashTread = tread; put('#lickTxt', tread ? 'SPRINT' : 'DASH'); }
    if (Math.abs(k - dashShown) < 0.01) return;
    dashShown = k;
    $('#lickFill').style.transform = 'scaleY(' + k.toFixed(2) + ')';
    $('#lickBtn').classList.toggle('ready', k >= 0.99);
}
// the stage you're in, at the top of the screen: its name, how far to its gate, its Recommended Level (a transform and short words, only when they change)
let wbKey = '', wbOn = false, wbF = -1, wbHot = null;
export function stageBar(on, name, f, txt, hot) {
    const el = $('#wallBar');
    if (!on) { if (wbOn) { wbOn = false; el.hidden = true; document.body.classList.remove('wallbar'); } return; }
    if (!wbOn) { wbOn = true; el.hidden = false; document.body.classList.add('wallbar'); }
    // (a long name a size smaller, so it fits a phone held upright; no measuring)
    if (name !== wbKey) { wbKey = name; const e = $('#wbName'); e.textContent = name; e.dataset.len = name.length > 44 ? 'xl' : name.length > 37 ? 'l' : ''; }
    f = Math.max(0, Math.min(1, f));
    if (Math.abs(f - wbF) > 0.003) { wbF = f; $('#wbFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; }
    if (hot !== wbHot) { wbHot = hot; el.classList.toggle('hot', !!hot); }
    put('#wbHp', txt);
}
// dead: "Revive to Stage N?" at the top middle, FREE or for Gems, until the offer runs out (its bar is an animation; it goes by a timer)
let rvT = 0, rvK = -1;
export function reviveShow(m) {
    const el = $('#revive'), left = Math.max(0.5, ((m.until || 0) - net.now()) / 1000);
    clearTimeout(rvT);
    if (rvK !== m.k) { rvK = m.k; $('#rvTxt').innerHTML = 'Revive to<br>Stage ' + (m.k + 1) + '?'; }
    put('#rvTag', m.free ? 'FREE' : '💎 ' + m.cost);
    $('#rvTag').classList.toggle('gem', !m.free);
    const bar = $('#rvFill');
    bar.style.animationDuration = left.toFixed(2) + 's';
    replay(bar);
    el.hidden = false;
    document.body.classList.add('reviving');
    rvT = setTimeout(reviveHide, left * 1000);
}
export function reviveHide() { clearTimeout(rvT); const el = $('#revive'); if (el && !el.hidden) { el.hidden = true; document.body.classList.remove('reviving'); } }
export const reviveOpen = () => !$('#revive').hidden;

// =====================================================================================
// Black Hole Rush: the queue, the race's own HUD, the results
// =====================================================================================
let queueTimer = 0, queueM = null;
export function queueState(m) {
    const el = $('#queueBar');
    clearInterval(queueTimer);
    queueM = m;
    document.body.classList.toggle('queued', !!m);
    if (!m) { el.hidden = true; $('#bPlay').classList.remove('queued'); put('#playTxt', 'RACE'); return; }
    el.hidden = false;
    $('#bPlay').classList.add('queued');
    put('#playTxt', 'CANCEL');
    const draw = () => {
        if (!queueM) return;
        const left = Math.max(0, Math.ceil((queueM.at - net.now()) / 1000));
        put('#qFound', queueM.found + ' / ' + queueM.spots + ' found');
        put('#qLeft', 'starts in ' + left + ' s · ' + WORLDS[queueM.map || 0].name + ' · Level ' + queueM.lv);
    };
    draw();
    queueTimer = setInterval(draw, 250);
}
export function showCount(t) { const el = $('#countdown'); if (!t) { el.hidden = true; return; } el.textContent = t; el.hidden = false; replay(el); }
let scoreRows = [];
export function matchHud(o) {
    const el = $('#matchHud');
    if (o.on === false) { el.hidden = true; return; }
    if (o.on) {
        el.hidden = false;
        put('#mClock', '0:00');
        $('#mClock').classList.remove('hot');
        put('#mMap', o.map + ' · Level ' + o.lv);
        scoreRows = [];
        $('#scores').innerHTML = '';
    }
    if (o.left !== undefined) { put('#mClock', clock(o.left)); $('#mClock').classList.toggle('hot', o.left <= 10); }
}
// the scoreboard: written only when a row changes. r: [spot, z, place (-1: still running), out]
export function setScores(A) {
    const names = A.names, total = Math.max(1, -A.plan.finish), list = (A.scores && A.scores.length ? A.scores : names.map((x) => [x.spot, 0, -1, 0])).map((r) => {
        const me = r[0] === A.spot, z = me && actions.myZ ? Math.min(r[1], actions.myZ()) : r[1];
        return [r[0], Math.round(Math.max(0, Math.min(1, -z / total)) * 100), r[2], r[3]];
    }).sort((a, b) => {
        if (a[2] >= 0 && b[2] >= 0) return a[2] - b[2];
        if (a[2] >= 0) return -1;
        if (b[2] >= 0) return 1;
        return b[1] - a[1];
    });
    const box = $('#scores');
    list.forEach((r, i) => {
        let el = scoreRows[i];
        if (!el) { el = document.createElement('div'); el.className = 'sr o1'; el.innerHTML = '<b></b><span></span><em></em>'; box.appendChild(el); scoreRows[i] = el; el._k = ''; }
        const x = names.find((y) => y.spot === r[0]), name = (x && x.n) || '?', me = r[0] === A.spot, txt = r[2] >= 0 ? '✓' : r[3] ? '🌀' : r[1] + '%', k = i + '|' + name + '|' + txt + '|' + me;
        if (el._k === k) return;
        el._k = k;
        el.children[0].textContent = String(i + 1);
        el.children[1].textContent = name; el.children[1].style.color = SPOT_CSS[r[0]] || '#fff';
        el.children[2].textContent = txt;
        el.classList.toggle('me', me);
    });
}
export function matchResults(m) {
    const P0 = m.place, title = P0 === 0 ? 'YOU WON!' : PLACES[P0] + ' PLACE';
    const rows = m.rows.map((r) => `<div class="row" style="padding:.3rem .6rem;margin-bottom:.3rem${r.spot === m.spot ? ';border-color:#ffe24a' : ''}"><b style="width:2.2rem">${['🥇', '🥈', '🥉'][r.place] || r.place + 1}</b><div class="rt"><b style="font-size:1.05rem;color:${SPOT_CSS[r.spot] || '#fff'}">${esc(r.n)}</b></div><b>${r.done ? 'Escaped' : r.out ? '🌀 ' + r.pct + '%' : r.pct + '%'}</b></div>`).join('');
    panelKind = 'results'; panelTab = null;
    resultsBody = `<div style="text-align:center;margin-bottom:.6rem"><div class="resPrize o">${rewardText({ wins: m.prize.wins, gems: m.prize.gems, speed: m.prize.speed })}</div></div>${rows}<div style="display:flex;gap:.6rem;justify-content:center;margin-top:.6rem"><button class="btn g-green o" data-act="again" style="min-width:9rem;height:3rem;font-size:1.25rem">Race again</button><button class="btn g-blue o" data-close style="min-width:7rem;height:3rem;font-size:1.25rem">Done</button></div>`;
    resultsTitle = title;
    $('#modal').hidden = false;
    renderPanel();
    sfx(P0 <= 2 ? 'win' : 'pass');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
}
let resultsBody = '', resultsTitle = '';

// =====================================================================================
// A Star Capsule opening: it shakes, bursts open, and who was inside drops out (one or three, one after another)
// =====================================================================================
let hatchT = 0;
export function hatchShow(m) {
    const el = $('#hatch'), J = JAWBREAKERS[m.j], list = m.got;
    clearTimeout(hatchT);
    el.innerHTML = `<div class="hatchRow">${list.map((g) => `<div class="hatchOne"><img class="hatchJaw go" src="${jawSvg(J)}" alt=""><div class="hatchOut"><img src="${palSvg(palById[g.id])}" alt=""><b class="o1">${esc(palById[g.id].name)}</b><small>${rar(palById[g.id].rarity)}</small><span class="palX o1">x${palById[g.id].mult}</span>${g.fresh ? '<em class="o1">NEW!</em>' : ''}</div></div>`).join('')}</div>`;
    el.hidden = false;
    sfx('shake');
    hatchT = setTimeout(() => {
        sfx('crack');
        const best = Math.max(...list.map((g) => palById[g.id].tier));
        if (best >= 3) sfx('lucky');
        for (const o of el.querySelectorAll('.hatchOne')) o.classList.add('open');
        hatchT = setTimeout(() => { el.hidden = true; el.innerHTML = ''; if (m.done) toast('🎉 Capsule collection complete: +' + m.done + ' 💎', '#ffe24a'); }, 1900);
    }, 900);
}

// =====================================================================================
// Panels
// =====================================================================================
let panelKind = null, panelTab = null, spinning = false, wheelAngle = 0, jawOpen = 0;
let openedAt = 0;
export function openPanel(kind, tab) {
    openedAt = performance.now();
    panelKind = kind; panelTab = tab || null;
    $('#modal').hidden = false;
    renderPanel();
    sfx('open');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
    if (kind === 'quests') net.send('want', {});
    if (kind === 'worlds' || kind === 'tele') { const nx = WORLDS.findIndex((w, i) => i > 0 && worldOpen(S, i) && !(S.seen && S.seen['w' + i])); if (nx > 0) { S.seen = { ...S.seen, ['w' + nx]: 1 }; net.send('tut', { seen: 'w' + nx }); } }
}
export function openJaw(j) { jawOpen = j; openPanel('inv', 'jaws'); }
export function closePanel() {
    if ($('#modal').hidden) return false;
    $('#modal').hidden = true; panelKind = null; renderedKind = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setMusicDuck(false);
    if (actions.onPanel) actions.onPanel(false);
    sfx('close');
    return true;
}
export const panelIs = (k) => !$('#modal').hidden && panelKind === k;
export function refreshPanels() { if (!$('#modal').hidden && !(panelKind === 'spin' && spinning)) renderPanel(); }
function frame(title, icon, body, opts) {
    opts = opts || {};
    return `<div class="panel ${opts.cls || ''}"${opts.w ? ` style="width:min(${opts.w}rem,94vw)"` : ''}>
        <header><h2 class="o">${icon} ${title}</h2><div class="hx">${opts.hx || ''}<button class="btn g-red o x" data-close>✕</button></div></header>
        ${opts.tabs ? `<div class="tabs">${opts.tabs.map(([k, l]) => `<button class="tab o1${k === opts.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '<div></div>'}
        <div class="body">${body}</div>${opts.foot ? `<div class="foot">${opts.foot}</div>` : '<div></div>'}</div>`;
}
let renderedKind = null, renderedHtml = '';
function renderPanel() {
    const m = $('#modal');
    const again = renderedKind === panelKind && !m.hidden && m.firstElementChild;
    const html = PANELS[panelKind] ? PANELS[panelKind]() : '';
    if (again && html === renderedHtml) return;
    renderedHtml = html;
    const scroller = again && m.querySelector('.body'), keep = scroller ? scroller.scrollTop : 0;
    m.innerHTML = html;
    renderedKind = panelKind;
    // a refresh of the open panel (a timer, a new value): no pop-in again, the scroll stays where it was
    if (again && m.firstElementChild) { m.firstElementChild.classList.add('still'); const b2 = m.querySelector('.body'); if (b2 && keep) b2.scrollTop = keep; }
    for (const x of m.querySelectorAll('[data-close]')) x.onclick = () => closePanel();
    m.onclick = (e) => { if (e.target === m && performance.now() - openedAt > 400) closePanel(); };
    for (const b of m.querySelectorAll('[data-tab]')) b.onclick = () => { panelTab = b.dataset.tab; sfx('click'); renderPanel(); };
    for (const b of m.querySelectorAll('[data-act]')) b.onclick = (e) => { e.stopPropagation(); doAct(b.dataset.act, b.dataset); };
    const code = m.querySelector('#codeIn');
    if (code) code.onkeydown = (e) => { if (e.key === 'Enter') doAct('code', {}); };
    for (const r of m.querySelectorAll('input[type=range]')) r.oninput = () => setVolume(r.dataset.vol, r.value / 100);
}
// a wheel prize's label
const spinLabel = (s) => (s.xp ? '<i class="pc"></i> Speed' : s.wins ? WC + ' Wins' : s.gems ? '💎 ' + s.gems : s.x2 ? 'x2 ' + s.x2 + 'm' : '');
// the Inventory's tabs, Teleport's
const INV_TABS = [['team', '🐾 Pets'], ['jaws', '🛸 Capsules'], ['trails', '🌈 Trails'], ['auras', '✨ Auras']];
const TELE_TABS = [['stages', '📍 Stages'], ['worlds', '🌍 Worlds']];
// the Inventory's pets: your team and all you own; the Star Capsules
function petPanel(tab) {
    const slots = teamMax(S), team = S.team || [], owned = PALS.filter((a) => S.pals && S.pals[a.id] > 0).sort((a, b) => b.mult - a.mult);
    const hx = `<span class="o1">${WC} ${fmtComma(S.wins)}</span>`;
    if (tab === 'jaws') {
        const J = JAWBREAKERS[jawOpen], list = palsOf(jawOpen), total = list.reduce((a, x) => a + x.odds, 0);
        const tabs = JAWBREAKERS.map((j, i) => `<button class="jawBtn${i === jawOpen ? ' on' : ''}" data-act="jaw" data-j="${i}"><img src="${jawSvg(j)}" alt=""><small class="o1">${fmt(j.wins)}</small></button>`).join('');
        const body = `<div class="jawRow">${tabs}</div><h3 class="o1" style="margin:.5rem 0 .4rem;text-align:center">${esc(J.name)}</h3><div style="display:flex;gap:.6rem;justify-content:center;margin-bottom:.7rem"><button class="btn ${S.wins >= J.wins ? 'g-green' : 'g-grey'} o" data-act="hatch" data-j="${jawOpen}" data-n="1" style="min-width:8.5rem;height:3rem;font-size:1.2rem">Open · ${WC} ${fmt(J.wins)}</button><button class="btn ${S.wins >= J.wins * 3 ? 'g-pink' : 'g-grey'} o" data-act="hatch" data-j="${jawOpen}" data-n="3" style="min-width:8.5rem;height:3rem;font-size:1.2rem">Open 3 · ${WC} ${fmt(J.wins * 3)}</button></div><div class="grid palGrid">${list.map((a) => { const have = S.index && S.index[a.id]; return `<div class="card${have ? '' : ' far'}"><div class="ci"><img src="${palSvg(a)}" class="${have ? '' : 'dim'}" alt=""></div><b class="o1">${have ? esc(a.name) : '???'}</b><small>${rar(a.rarity)} · ${(a.odds / total * 100).toFixed(0)}%</small><span class="palX o1">x${a.mult}</span></div>`; }).join('')}</div>`;
        return frame('Pets', IC('bag'), body, { tabs: INV_TABS, tab, hx, foot: 'Find all five in a capsule for ' + jbGems(jawOpen) + ' 💎. Pets stay when you rebirth.' });
    }
    const teamHtml = Array.from({ length: slots }, (_, i) => { const a = palById[team[i]]; return a ? `<button class="slot" data-act="teamoff" data-id="${a.id}"><img src="${palSvg(a)}" alt=""><span class="palX o1">x${a.mult}</span></button>` : '<div class="slot empty"></div>'; }).join('');
    const body = `<div class="slots">${teamHtml}</div><div style="text-align:center;margin:.4rem 0 .7rem"><span class="palX o">Team x${teamMult(team)}</span> &nbsp;<button class="btn g-blue o1" data-act="teambest" style="padding:.2rem .8rem;font-size:1rem">Best team</button></div>` + (owned.length ? `<div class="grid palGrid">${owned.map((a) => { const on = team.filter((x) => x === a.id).length, n = S.pals[a.id]; return `<div class="card${on ? ' on' : ''}"><div class="ci"><img src="${palSvg(a)}" alt=""></div><b class="o1">${esc(a.name)}${n > 1 ? ' x' + n : ''}</b><small>${rar(a.rarity)}</small><span class="palX o1">x${a.mult}</span><button class="btn ${on >= n ? 'g-grey' : 'g-green'} o1" data-act="teamon" data-id="${a.id}" ${on >= n || team.length >= slots ? 'disabled' : ''}>${on ? 'On team' : 'Add'}</button></div>`; }).join('')}</div>` : '<p class="o1" style="font-weight:700;text-align:center">Open a Star Capsule to find your first pet!</p>');
    return frame('Pets', IC('bag'), body, { tabs: INV_TABS, tab, hx, foot: 'Every pet on your team multiplies every step\'s Speed. Tap one on your team to take it off.' });
}
// the Inventory's trails (for Wins) and auras (for Gems)
function stylePanel(tab) {
    const trails = tab === 'trails', list = trails ? TRAILS : AURAS, owned = trails ? (S.trails || {}) : (S.auras || {}), on = trails ? (S.trail || 0) : (S.aura || 0);
    const body = '<div class="grid">' + list.map((x, i) => {
        const have = i === 0 || owned[x.id], cost = trails ? WC + ' ' + fmt(x.wins) : '💎 ' + fmtComma(x.gems);
        const bg = x.rainbow ? 'conic-gradient(#ff4a6a,#ffd23a,#46ec50,#3ab4ff,#b45aff,#ff4a6a)' : `radial-gradient(circle at 40% 35%, #fff, ${hex(x.c1)} 60%)`;
        return `<div class="card${i === on ? ' on' : ''}"><div class="ci"><span class="sw" style="background:${bg}"></span></div><b class="o1">${esc(x.name)}</b><small>${rar(x.rarity)}</small><span class="palX o1">x${x.mult} Speed</span><button class="btn ${i === on ? 'g-grey' : have ? 'g-blue' : 'g-green'} o1" data-act="${trails ? 'trail' : 'aura'}" data-i="${i}" ${i === on ? 'disabled' : ''}>${i === on ? 'On' : have ? 'Wear' : cost}</button></div>`;
    }).join('') + '</div>';
    return frame('Pets', IC('bag'), body, { tabs: INV_TABS, tab, hx: `<span class="o1">${trails ? WC + ' ' + fmtComma(S.wins) : '💎 ' + fmtComma(S.gems)}</span>`, foot: trails ? 'A trail behind you, and more Speed from every step.' : 'An aura round you, and more Speed from every step.' });
}
// the worlds: where you are, where you can go
function worldsPanel(tabs, tab) {
    const body = '<div class="grid wgrid">' + WORLDS.map((w, i) => {
        const open = worldOpen(S, i), here = S.world === i, best = (S.bests && S.bests[i]) || 0;
        const btn = here ? '<button class="btn g-blue o" data-act="world" data-w="' + i + '">Back to spawn</button>' : open ? `<button class="btn g-green o" data-act="world" data-w="${i}">Teleport</button>` : '<button class="btn g-grey o" disabled>🔒 Locked</button>';
        return `<div class="card wcard${here ? ' on' : ''}" style="--wc:${hex(w.sea)}"><div class="ci">${w.icon}</div><b class="o1">${esc(w.name)}</b><small class="o1">${open ? 'World ' + w.rank + ' · ' + best + ' / ' + WALLS_N + ' stages · Steps x' + fmt(w.pow) : i ? (((S.bests && S.bests[i - 1]) || 0) >= WALLS_N ? '' : 'Pass Stage ' + WALLS_N + ' of ' + esc(WORLDS[i - 1].name)) + ((S.rebirths || 0) < worldReb(i) ? (((S.bests && S.bests[i - 1]) || 0) >= WALLS_N ? '' : ' · ') + worldReb(i) + ' rebirths (' + (S.rebirths || 0) + ' / ' + worldReb(i) + ')' : '') : ''}</small>${btn}</div>`;
    }).join('') + '</div>';
    return frame(tabs ? 'Teleport' : 'Worlds', IC(tabs ? 'portal' : 'world'), body, { w: 40, tabs, tab, foot: 'Every world gives more a step and pays bigger Wins. Pass a world\'s last gate (and rebirth enough times) to open the next.' });
}
const PANELS = {
    results() { return frame(resultsTitle, '🏁', resultsBody, { w: 32 }); },
    // the Inventory: pets, Star Capsules, trails, auras
    inv() { const tab = panelTab || 'team'; return tab === 'trails' || tab === 'auras' ? stylePanel(tab) : petPanel(tab === 'jaws' ? 'jaws' : 'team'); },
    // (the old name: a chest booth in the world opens it on its chests)
    pals() { return PANELS.inv(); },
    // Upgrades, for Wins (the old trails / auras tabs open the Inventory's)
    work() {
        if (panelTab === 'trails' || panelTab === 'auras') return stylePanel(panelTab);
        const body = UPGRADES.map((u) => {
            const n = (S.ups && S.ups[u.id]) || 0, max = n >= u.max, cost = upgradeCost(u, n), can = !max && S.wins >= cost;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${u.icon}</span></div><div class="rt"><b class="o1">${esc(u.name)} <small style="display:inline;font-weight:700;color:#7dff6b">${u.stat(n)}</small></b><small>${esc(u.text)}</small><div class="prog"><i style="width:${(n / u.max * 100).toFixed(0)}%"></i></div></div><div class="rb"><button class="btn ${max ? 'g-grey' : can ? 'g-green' : 'g-grey'} o1" data-act="upgrade" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? 'MAX' : WC + ' ' + fmt(cost)}</button></div></div>`;
        }).join('');
        return frame('Upgrades', IC('up'), body, { hx: `<span class="o1">${WC} ${fmtComma(S.wins)}</span>`, foot: 'Upgrades stay when you rebirth.' });
    },
    // Teleport: the spawn, your best treadmill, any stage you've reached, the worlds
    tele() {
        const tab = panelTab || 'stages';
        if (tab === 'worlds') return worldsPanel(TELE_TABS, tab);
        const w = S.world || 0, best = Math.min(WALLS_N - 1, (S.bests && S.bests[w]) || 0);
        const stop = (k, label, sub, cls, on) => `<button class="tp ${cls}" data-act="tp" data-k="${k}"${on ? '' : ' disabled'}><b class="o1">${label}</b><small>${esc(sub)}</small></button>`;
        let body = '<div class="tpGrid">' + stop(-1, '🏠 Spawn', 'The Starport', 'home', true) + stop(-2, '🏃 Treadmill', 'Your best one', 'home', true);
        for (let k = 0; k < WALLS_N; k++) body += stop(k, (k <= best ? '' : '🔒 ') + 'Stage ' + (k + 1), k <= best ? stageName(w, k) : 'Not reached yet', '', k <= best);
        return frame('Teleport', IC('portal'), body + '</div>', { w: 40, tabs: TELE_TABS, tab, foot: 'Teleport to any stage of ' + esc(WORLDS[w].name) + ' you\'ve reached, or to another world.' });
    },
    worlds() { return worldsPanel(null); },
    spin() {
        const n = SPIN.length, seg = 360 / n;
        const grad = SPIN.map((s, i) => `${s.color} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`).join(',');
        const labels = SPIN.map((s, i) => `<span class="wl" style="transform:rotate(${((i + 0.5) * seg).toFixed(2)}deg)"><b class="o1">${spinLabel(s)}</b></span>`).join('');
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        const body = `<div class="wheelWrap"><div class="wptr"></div><div class="wheel" id="wheel" style="background:conic-gradient(${grad});transform:rotate(${wheelAngle}deg)">${labels}</div><div class="whub o">SPIN</div></div>
            <div style="text-align:center;margin-top:.8rem"><button class="btn ${S.spins > 0 ? 'g-green' : 'g-grey'} o" data-act="spin" ${S.spins > 0 && !spinning ? '' : 'disabled'} style="min-width:12rem;height:3.2rem;font-size:1.5rem">${S.spins > 0 ? 'Spin! (' + S.spins + ')' : 'No spins left'}</button>
            <p class="o1" data-t="spin" style="margin:.5rem 0 0;font-weight:700">${S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left)}</p></div>`;
        return frame('Lucky Wheel', IC('spin'), body, { w: 30, foot: 'A free spin every ' + CFG.spinMins + ' minutes of play (up to ' + CFG.spinMax + ' saved). Prizes grow with you.' });
    },
    // rebirth: at 100% (a Level), your Speed and Level start again for a bigger multiplier, for good
    rebirth() {
        const r = S.rebirths || 0, need = rebirthLv(r), pct = rebirthPct(S), can = pct >= 100;
        const body = `<div class="rebBox"><div class="rebRow"><span>Rebirths</span><b>${r}</b><i>→</i><b class="g">${r + 1}</b></div>
            <div class="rebRow"><span>Speed and XP</span><b>x${rebirthMult(r)}</b><i>→</i><b class="g">x${rebirthMult(r + 1)}</b></div>
            <div class="rebRow"><span>Level needed</span><b>${need}</b><i>→</i><b class="g">${rebirthLv(r + 1)}</b></div>
            <div class="prog" style="width:100%;max-width:22rem"><i style="width:${pct}%"></i></div>
            <small class="o1" style="font-weight:700">${pct}% · Level ${S.lv} / ${need}</small>
            <div class="rebNew o1">🏁 Every gate pays its first-time x3 again!</div>
            <p class="rebWarn">Your Speed goes back to 0 and your Level to 1, so you walk slower again for a while. You keep your Wins, Gems, pets, upgrades, trails, auras and worlds.</p>
            <button class="btn ${can ? 'g-pink' : 'g-grey'} o" data-act="rebirth" style="min-width:14rem;height:3.4rem;font-size:1.5rem" ${can ? '' : 'disabled'}>${can ? 'Rebirth!' : 'Needs Level ' + need}</button></div>`;
        return frame('Rebirth', IC('rebirth'), body, { w: 32 });
    },
    shop() {
        const tab = panelTab || 'gems';
        let body = '';
        if (tab === 'gems') {
            const packs = PACKS.map((p, i) => `<div class="card"><div class="ci">${['🏆', '🏆🏆', '🏆🏆🏆'][i]}</div><b class="o1">${fmtComma(Math.round(p.wins * WORLDS[S.world].wins))} ${WC}</b><button class="btn g-gem o" data-act="pack" data-id="${p.id}">💎 ${p.gems}</button></div>`).join('');
            const open = POSTS.map((c, i) => ({ c, i })).filter((o) => o.c.gems && !postOpen(S, o.i)).slice(0, 1).map((o) => `<div class="card"><div class="ci">🏃</div><b class="o1">${esc(o.c.name)}</b><small>Run on it for x${o.c.mult} Speed a step</small><button class="btn g-gem o" data-act="post" data-i="${o.i}">💎 ${o.c.gems}</button></div>`).join('');
            body = `<div class="grid">${packs}<div class="card"><div class="ci">⚡</div><b class="o1">x2 Speed · ${CFG.boostP2Mins} min</b><small data-t="x2">${S.x2 ? 'Active: ' + clock(((S.x2Until || 0) - net.now()) / 1000) + ' left' : 'Double every step'}</small><button class="btn g-gem o" data-act="x2">💎 ${CFG.boostP2Gems}</button></div>
                <div class="card"><div class="ci">🏆</div><b class="o1">x2 Wins · ${CFG.boostW2Mins} min</b><small data-t="w2">${(S.w2Until || 0) > net.now() ? 'Active: ' + clock(((S.w2Until || 0) - net.now()) / 1000) + ' left' : 'Double the Wins from gates'}</small><button class="btn g-gem o" data-act="w2">💎 ${CFG.boostW2Gems}</button></div>${open}</div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">💎 Gems come from quests, daily tasks, races, gifts, the wheel and the daily reward. Everything here is bought with Wins or Gems.</p>`;
        } else {
            body = `<h3 style="margin:.2rem 0 .5rem">🎟️ Codes</h3><div style="display:flex;gap:.5rem"><input class="code" id="codeIn" maxlength="20" placeholder="Enter a code"><button class="btn g-green o" data-act="code" style="min-width:6rem">Redeem</button></div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">Codes give free Speed, Wins, Gems and spins. Try SPACEBAR!</p>`;
        }
        return frame('Shop', IC('shop'), body, { tabs: [['gems', '💎 Gems'], ['codes', '🎟️ Codes']], tab });
    },
    quests() {
        const Q = QUESTS[S.qi];
        let body = '';
        if (Q) {
            const p = Math.min(Q.n, S.qv || 0);
            body += `<div class="row feat"><div class="ri"><span class="ci" style="font-size:2.4rem">🎯</span></div><div class="rt"><small style="color:#7af4ff;font-weight:700">QUEST ${S.qi + 1} / ${QUESTS.length}</small><b class="o1">${esc(Q.text)}</b><div class="prog"><i style="width:${(p / Q.n * 100).toFixed(0)}%"></i></div><em>${fmt(p)} / ${fmt(Q.n)} · Reward: ${rewardText(Q)} · pays as soon as it's done</em></div></div>`;
        } else body += '<div class="row"><div class="rt"><b>🏆 Every quest done! Nobody runs like you.</b></div></div>';
        body += `<h3 style="margin:.9rem 0 .4rem">🔥 Daily Tasks <small data-t="day" style="opacity:.75;font-size:.85rem">Resets in ${clock(dayLeft(net.now()))}</small></h3>`;
        body += ((S.jq && S.jq.list) || []).map((q, i) => {
            const T = TASKS[q.k], done = q.p >= T.n;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${T.icon}</span></div><div class="rt"><b class="o1">${esc(T.text)}</b><div class="prog"><i style="width:${Math.min(100, q.p / T.n * 100).toFixed(0)}%"></i></div><em>${fmt(q.p)} / ${fmt(T.n)} · ${rewardText(T)}</em></div><div class="rb"><button class="btn ${done && !q.c ? 'g-green' : 'g-grey'} o" data-act="tclaim" data-i="${i}" ${done && !q.c ? '' : 'disabled'}>${q.c ? 'Done ✓' : 'Claim'}</button></div></div>`;
        }).join('');
        return frame('Quests', IC('quest'), body);
    },
    daily() {
        const st = dailyStatus(S.daily, net.now());
        const ic = (r) => (r.gems && !r.wins ? '💎' : r.wins ? WC : r.spins ? '<i class="spinIc"></i>' : r.x2 ? '✨' : '<i class="pc"></i>');
        const days = DAILY.map((r, i) => `<div class="day${i === 6 ? ' big' : ''}${i < st.day ? ' got' : ''}${i === st.day && st.can ? ' now' : ''}"><span class="o1">DAY ${i + 1}</span><span class="di">${i < st.day ? '✅' : ic(r)}</span><span class="o1">${rewardText(worth(r))}</span></div>`).join('');
        const body = `<div class="days">${days}</div><div style="text-align:center;margin-top:1rem"><button class="btn ${st.can ? 'g-green' : 'g-grey'} o" data-act="daily" ${st.can ? '' : 'disabled'} ${st.can ? '' : 'data-t="daily"'} style="min-width:12rem;height:3rem;font-size:1.4rem">${st.can ? 'Claim Day ' + (st.day + 1) : 'Next reward in ' + clock(dayLeft(net.now()))}</button></div>`;
        return frame('Daily Rewards', IC('gift'), body, { w: 44, foot: 'Come back every day: the rewards grow for 7 days in a row.' });
    },
    gifts() {
        const secs = sessionSecs();
        const body = GIFTS.map((g, i) => {
            const left = g.min * 60 - secs, got = S.gifts[i];
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${got ? '✅' : '🎁'}</span></div><div class="rt"><b class="o1">${rewardText(worth(g))}</b><small>After ${g.min} minutes of play</small></div><div class="rb"><button class="btn ${!got && left <= 0 ? 'g-green' : 'g-grey'} o" data-act="gift" data-i="${i}" ${!got && left <= 0 ? '' : 'disabled'}>${got ? 'Claimed' : left <= 0 ? 'Claim!' : clock(left)}</button></div></div>`;
        }).join('');
        return frame('FREE Gifts', IC('gift'), body, { w: 34, foot: 'Gifts unlock the longer you play this session.' });
    },
    boards() {
        const b = actions.boards ? actions.boards() : { wins: [], speed: [], race: [] };
        const col = (title, rows) => `<div><h3 style="margin:.2rem 0 .5rem">${title}</h3>${(rows || []).map((r, i) => `<div class="row" style="padding:.35rem .6rem;margin-bottom:.3rem"><b style="width:2rem">${['🥇', '🥈', '🥉'][i] || i + 1}</b><div class="rt"><b style="font-size:1rem">${esc(r.n)}</b></div><b>${fmt(r.v)}</b></div>`).join('') || '<p>Be the first!</p>'}</div>`;
        const body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">You: ${fmtComma(S.totalWins)} Wins, top Speed ${fmt(S.topSpeed)}, ${S.matchWins || 0} races won</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem">${col('🏆 Most Wins', b.wins)}${col('⚡ Fastest', b.speed)}${col('🥇 Races Won', b.race)}</div>`;
        return frame('Leaderboards', '🏆', body);
    },
    settings() {
        const v = getVolumes(), q = getQuality();
        const body = `<div class="vol"><span>Graphics</span><div class="qbtns">${['low', 'medium', 'high'].map((k) => `<button class="btn g-blue o${q === k ? ' on' : ''}" data-act="quality" data-q="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
            <div class="vol"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" data-vol="music"></div>
            <div class="vol"><span>Footsteps</span><input type="range" min="0" max="100" value="${Math.round((v.asmr ?? 0.9) * 100)}" data-vol="asmr"></div>
            <div class="vol"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></div>
            <div class="vol"><span>Show FPS</span><div class="qbtns"><button class="btn g-grey o" data-act="fps">${actions.fpsOn && actions.fpsOn() ? 'On' : 'Off'}</button></div></div>
            ${S.matchId ? '' : '<div class="vol"><span>Stuck?</span><div class="qbtns"><button class="btn g-blue o" data-act="home">Back to spawn</button></div></div>'}
            <p style="margin:1rem 0 0;font-weight:600;opacity:.8">${document.body.classList.contains('pad') ? 'Left stick: run · right stick: look · RT or X: DASH (on a treadmill, hold to sprint) · A: jump · Y: revive, use, or go to a stage · LB: race · D-pad: the buttons on screen · A: press · B: back · View: quests · L3: home · R3: zoom' : isTouch ? 'The stick runs. DASH bursts ahead (on a treadmill, hold it to sprint). JUMP the rifts and the lasers. Drag to look around. The WALK box (bottom right) sets how fast you walk.' : 'WASD run · SHIFT: DASH (on a treadmill, hold to sprint) · SPACE jump · E revive / use · P race · T teleport · B to a stage · M sound · R home · drag to look'}</p>`;
        return frame('Settings', IC('gear'), body, { w: 36 });
    },
};

// =====================================================================================
// What the buttons do
// =====================================================================================
function doAct(act, d) {
    sfx('click');
    switch (act) {
        case 'spin':
            if (S.spins > 0 && !spinning) {
                spinning = true; net.send('spin', {}); renderSpinButton();
                // no answer (no spin left after all): the button comes back
                clearTimeout(spinWait); spinWait = setTimeout(() => { if (spinning) { spinning = false; refreshPanels(); } }, 4000);
            }
            break;
        case 'rebirth': {
            if (rebirthPct(S) < 100) break;
            askConfirm('🔄', 'Rebirth?', 'Your Level goes back to 1 and your Speed to 0. Every step gives x' + rebirthMult(S.rebirths + 1) + ' Speed and XP from now on.', 'Rebirth!', () => { closePanel(); net.send('rebirth', {}); });
            break;
        }
        case 'world': closePanel(); if (actions.world) actions.world(+d.w); break;
        // Teleport: the spawn (-1), your best treadmill (-2), a stage
        case 'tp': { const k = +d.k; closePanel(); if (actions.go) { if (k === -1) actions.go('spawn'); else if (k === -2) actions.go('post'); else actions.go('stage', k); } break; }
        case 'pack': net.send('pack', { id: d.id }); break;
        case 'x2': net.send('x2', {}); break;
        case 'w2': net.send('w2', {}); break;
        case 'code': { const v = ($('#codeIn') || {}).value || ''; if (v.trim()) net.send('code', { code: v.trim() }); break; }
        case 'tclaim': net.send('tclaim', { i: +d.i }); break;
        case 'daily': net.send('daily', {}); break;
        case 'gift': net.send('gift', { i: +d.i }); break;
        case 'quality': setQuality(d.q); renderPanel(); break;
        case 'fps': if (actions.toggleFps) actions.toggleFps(); renderPanel(); break;
        case 'home': closePanel(); if (actions.respawn) actions.respawn(); break;
        case 'upgrade': net.send('upgrade', { id: d.id }); break;
        case 'trail': net.send('trail', { i: +d.i }); sfx('equip'); break;
        case 'aura': net.send('aura', { i: +d.i }); sfx('equip'); break;
        case 'post': net.send('post', { i: +d.i }); break;
        case 'jaw': jawOpen = +d.j; renderPanel(); break;
        case 'hatch': if (S.wins >= JAWBREAKERS[+d.j].wins * +d.n) { net.send('hatch', { j: +d.j, n: +d.n }); } else net.send('hatch', { j: +d.j, n: +d.n }); break;
        case 'teamon': net.send('team', { id: d.id, on: true }); sfx('equip'); break;
        case 'teamoff': net.send('team', { id: d.id, on: false }); break;
        case 'teambest': net.send('teamBest', {}); sfx('equip'); break;
        case 'again': closePanel(); if (actions.pressPlay) actions.pressPlay(); break;
    }
}
function renderSpinButton() { const b = $('#modal').querySelector('[data-act="spin"]'); if (b) b.disabled = true; }
// the wheel's answer: turn to the prize, then show it
let spinWait = 0;
export function onSpun(m) {
    clearTimeout(spinWait);
    const seg = 360 / SPIN.length, target = -((m.i + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6;
    const base = wheelAngle + 360 * 5;
    wheelAngle = base + ((((target - base) % 360) + 360) % 360);
    const el = $('#wheel');
    spinning = true;
    if (el) { el.style.transition = 'transform 3.4s cubic-bezier(0.15, 0.85, 0.25, 1)'; el.style.transform = 'rotate(' + wheelAngle.toFixed(1) + 'deg)'; }
    let ticks = 0;
    const tick = () => { if (ticks++ < 22) { sfx('click'); setTimeout(tick, 40 + ticks * ticks * 0.35); } };
    tick();
    setTimeout(() => {
        spinning = false;
        sfx('reward');
        popup('🎡', 'YOU WON!', m.text, '#ffe24a', true);
        if (panelKind === 'spin') renderPanel();
    }, el ? 3500 : 50);
}
// a yes / no question (yes may hold html: the drawn icons)
export function askConfirm(icon, title, text, yes, act) {
    const c = $('#confirm');
    c.innerHTML = `<div class="panel"><header><h2 class="o">${title}</h2><div class="hx"><button class="btn g-red o x" data-no>✕</button></div></header><div></div><div class="cbody"><span class="bi">${icon}</span><p>${text}</p><div class="btns"><button class="btn g-green o" data-yes>${yes}</button><button class="btn g-grey o" data-no>Cancel</button></div></div><div></div></div>`;
    c.hidden = false;
    for (const b of c.querySelectorAll('[data-no]')) b.onclick = () => { c.hidden = true; sfx('close'); };
    c.querySelector('[data-yes]').onclick = () => { c.hidden = true; act(); };
    c.onclick = (e) => { if (e.target === c) c.hidden = true; };
}
export function closeTop() {
    if (!$('#confirm').hidden) { $('#confirm').hidden = true; return true; }
    if (closePanel()) return true;
    return false;
}
// the panels with their real content, for the loading warm-up; returns the clean-up
// lite (Low: a weak phone or laptop): the pop-ups of play and the menus opened first; the big menus (pets, gift boxes, boards,
// worlds) are laid out the first time they're opened instead, while you stand in a menu, not seconds more of loading
export function warmPanels(lite) {
    const m = $('#modal');
    panelKind = 'spin';
    const tabbed = (k, tabs) => tabs.map((t) => { panelTab = t; return PANELS[k](); }).join('');
    if (lite) m.innerHTML = PANELS.spin() + PANELS.quests() + PANELS.shop() + PANELS.rebirth() + tabbed('tele', ['stages']);
    else m.innerHTML = PANELS.spin() + PANELS.rebirth() + PANELS.daily() + PANELS.quests() + PANELS.shop() + PANELS.work() + tabbed('inv', ['team', 'jaws', 'trails', 'auras']) + tabbed('tele', ['stages', 'worlds']) + PANELS.gifts() + PANELS.boards() + PANELS.settings();
    panelTab = null;
    m.hidden = false; m.classList.add('warmui');
    $('#confirm').innerHTML = '<div class="panel"><header><h2 class="o">Buy?</h2></header><div></div><div class="cbody"><span class="bi">🏆</span><p>Sample</p><div class="btns"><button class="btn g-green o">Yes</button></div></div><div></div></div>';
    $('#confirm').hidden = false; $('#confirm').classList.add('warmui');
    $('#popIc').textContent = '⭐'; $('#popT').textContent = 'UNLOCKED!'; $('#popS').textContent = 'Sample';
    $('#lu1').textContent = 'LEVEL UP'; $('#lu2').textContent = 'Level 2';
    $('#winPopV').textContent = '+12 WINS'; $('#bigText').textContent = 'SAMPLE';
    toast('🏆 +12 Wins', '#ffe24a');
    // the revive offer (both its tags) painted too
    reviveShow({ k: 2, free: false, cost: 5, until: net.now() + 6000 });
    reviveShow({ k: 0, free: true, cost: 5, until: net.now() + 6000 });
    for (const s of ['#popup', '#lvlUp', '#winPop', '#bigText', '#matchHud', '#queueBar', '#wallBar', '#countdown', '#hatch', '#revive']) { $(s).hidden = false; $(s).classList.add('warmui'); }
    return () => {
        for (const s of ['#modal', '#confirm', '#popup', '#lvlUp', '#winPop', '#bigText', '#matchHud', '#queueBar', '#wallBar', '#countdown', '#hatch']) { $(s).classList.remove('warmui'); $(s).hidden = true; }
        reviveHide(); $('#revive').classList.remove('warmui');
        m.innerHTML = ''; $('#confirm').innerHTML = ''; panelKind = null; $('#toasts').innerHTML = '';
    };
}
export const anyPopup = () => !$('#confirm').hidden || !$('#modal').hidden;

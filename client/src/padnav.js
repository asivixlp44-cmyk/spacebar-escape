// Menus with a controller: a ring on what you'd press. The D-pad or the stick moves it to the nearest thing that way, A presses it,
// B goes back, the shoulders change tabs, the other stick scrolls. It works on whatever's on screen, so every panel and button of the
// HUD works without knowing about it. Layout is only read when the ring moves, never in a plain frame.
import { pad } from './gamepad.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const PICK = 'button, input[type=range], input[type=text], input.code';
const REPEAT_FIRST = 300, REPEAT_NEXT = 120;
let cur = null, curKey = '', curIdx = 0, layerNow = null, hudOn = false, heldDir = null, nextRepeat = 0, keepOnClose = null;

const keyOf = (el) => [el.tagName, el.id, el.dataset.act || '', el.dataset.tab || '', el.dataset.i || '', el.dataset.j || '', el.dataset.k || '', el.dataset.vol || '', el.dataset.yes !== undefined ? 'y' : '', el.textContent.trim().slice(0, 24)].join('|');
function canPress(el) {
    if (el.disabled || el.id === 'lickBtn' || el.id === 'jumpBtn' || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    // what's scrolled out of a panel can be reached; what's off the screen anywhere else can't
    if (!el.closest('.body') && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && +cs.opacity > 0.05;
}
function popupLayer() {
    const c = $('#confirm'); if (c && !c.hidden) return c;
    const m = $('#modal'); if (m && !m.hidden) return m;
    return null;
}
function layerOf() { return popupLayer() || (hudOn ? $('#hud') : null); }
const listIn = (layer) => {
    const out = [];
    for (const el of layer.querySelectorAll(PICK)) if (canPress(el)) out.push(el);
    return out;
};
function setRing(el) {
    if (cur === el) return;
    if (cur) cur.classList.remove('padRing');
    cur = el;
    if (!el) { curKey = ''; return; }
    el.classList.add('padRing');
    curKey = keyOf(el);
    if (el.closest('.body') && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement !== el) document.activeElement.blur();
}
// what a panel starts on: what most people came to press
function defaultIn(layer, list) {
    const pref = layer.querySelector('[data-yes]') || [...layer.querySelectorAll('.btn.g-green, .btn.g-yellow, .btn.g-orange')].find((b) => list.includes(b) && !b.classList.contains('x'));
    if (pref && list.includes(pref)) return pref;
    return list.find((b) => !b.classList.contains('x') && !b.dataset.tab && b.dataset.close === undefined) || list[0] || null;
}
function moveRing(dx, dy) {
    const layer = layerOf();
    if (!layer) return;
    const list = listIn(layer);
    if (!list.length) return;
    if (!cur || !list.includes(cur)) { setRing(defaultIn(layer, list)); sfx('click'); return; }
    const a = cur.getBoundingClientRect(), ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    let best = null, bs = 1e9;
    for (const el of list) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect();
        const along = dx ? (dx > 0 ? r.left + r.width / 2 - ax : ax - r.left - r.width / 2) : (dy > 0 ? r.top + r.height / 2 - ay : ay - r.top - r.height / 2);
        if (along < 4) continue;
        // how far off the line: boxes that overlap the ring's row or column are as good as on it
        const off = dx ? Math.max(0, Math.max(a.top - r.bottom, r.top - a.bottom)) : Math.max(0, Math.max(a.left - r.right, r.left - a.right));
        const s = along + off * 3;
        if (s < bs) { bs = s; best = el; }
    }
    if (best) { setRing(best); sfx('click'); }
}
function press() {
    if (!cur || !cur.isConnected) return false;
    if (cur.tagName === 'INPUT') { cur.focus(); return true; }
    cur.click();
    return true;
}
function slide(el, by) {
    el.value = Math.max(+el.min || 0, Math.min(+el.max || 100, +el.value + by));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    sfx('click');
}
function tabStep(by) {
    const layer = popupLayer();
    if (!layer) return false;
    const tabs = [...layer.querySelectorAll('[data-tab]')];
    if (tabs.length < 2) return false;
    const on = tabs.findIndex((t) => t.classList.contains('on'));
    const go = tabs[(Math.max(0, on) + by + tabs.length) % tabs.length];
    setRing(null);
    go.click();
    return true;
}

export const padNav = {
    get hud() { return hudOn; },
    get ring() { return cur; },
    // (for the tests)
    layer: () => layerOf(), list: (l) => listIn(l), setRing: (el) => setRing(el), step: (d) => stepDir(d),
    // into the HUD's buttons: from the world, the D-pad's first press
    enterHud(dir) {
        hudOn = true;
        const list = listIn($('#hud'));
        if (!list.length) { hudOn = false; return; }
        // (left: the menu's first button, Rebirth, or Leave in a race; right: RACE)
        const start = dir === 'RIGHT' ? ($('#bPlay') && list.includes($('#bPlay')) ? $('#bPlay') : list[list.length - 1]) : ($('#bRebirth') && list.includes($('#bRebirth')) ? $('#bRebirth') : $('#bQuit') && list.includes($('#bQuit')) ? $('#bQuit') : list[0]);
        setRing(start);
        // (the press that brought the ring in is still held next frame: it counts as held, it doesn't step the ring on as well)
        heldDir = dir; nextRepeat = performance.now() + REPEAT_FIRST;
        sfx('click');
    },
    leaveHud() { hudOn = false; if (!popupLayer()) setRing(null); },
    clear() { hudOn = false; setRing(null); },
    // every frame with a controller in hand. Returns true if the buttons went to a menu and not the world
    frame(now, dt, inPadMode) {
        const popup = popupLayer();
        // a panel opened or closed: the ring goes with it, and back to where it was
        if (popup !== layerNow) {
            layerNow = popup;
            if (popup) {
                if (hudOn && cur) keepOnClose = cur;
                setRing(null);
                if (inPadMode) { const list = listIn(popup); setRing(defaultIn(popup, list)); }
            } else {
                setRing(null);
                if (hudOn && keepOnClose && keepOnClose.isConnected) setRing(keepOnClose);
                keepOnClose = null;
            }
        }
        const inMenu = !!popup || hudOn;
        if (!inMenu) { heldDir = null; return false; }
        // a panel redrew itself (a timer, a purchase): the ring finds its button again
        if (cur && !cur.isConnected) {
            const layer = layerOf(), list = layer ? listIn(layer) : [];
            const same = list.find((el) => keyOf(el) === curKey);
            cur = null;
            setRing(same || list[Math.min(curIdx, list.length - 1)] || null);
        } else if (cur && popup) curIdx = Math.max(0, [...popup.querySelectorAll(PICK)].indexOf(cur));
        else if (!cur && popup && inPadMode) { const list = listIn(popup); setRing(defaultIn(popup, list)); }
        if (!inPadMode) return inMenu;
        // the ring: the D-pad, or the stick in a panel (out in the HUD the stick walks: that's you leaving)
        let dir = pad.held.has('UP') ? 'UP' : pad.held.has('DOWN') ? 'DOWN' : pad.held.has('LEFT') ? 'LEFT' : pad.held.has('RIGHT') ? 'RIGHT' : null;
        if (!dir && popup) {
            const ax = Math.abs(pad.lx), ay = Math.abs(pad.ly);
            if (Math.max(ax, ay) > 0.45) dir = ax > ay ? (pad.lx > 0 ? 'RIGHT' : 'LEFT') : (pad.ly > 0 ? 'DOWN' : 'UP');
        }
        if (dir !== heldDir) { heldDir = dir; nextRepeat = now + REPEAT_FIRST; if (dir) stepDir(dir); } else if (dir && now >= nextRepeat) { nextRepeat = now + REPEAT_NEXT; stepDir(dir); }
        if (!popup && (pad.lx || pad.ly) && Math.hypot(pad.lx, pad.ly) > 0.4) { padNav.leaveHud(); return false; }
        if (pad.pressed.has('A')) press();
        if (pad.pressed.has('B')) { if (popup) return 'back'; padNav.leaveHud(); return true; }
        if (popup) {
            if (pad.pressed.has('LB')) tabStep(-1);
            if (pad.pressed.has('RB')) tabStep(1);
            if (pad.ry) { const b = popup.querySelector('.body'); if (b) b.scrollTop += pad.ry * dt * 900; }
        }
        return inMenu;
    },
};
function stepDir(dir) {
    if (cur && cur.tagName === 'INPUT' && cur.type === 'range' && (dir === 'LEFT' || dir === 'RIGHT')) { slide(cur, dir === 'LEFT' ? -5 : 5); return; }
    moveRing(dir === 'LEFT' ? -1 : dir === 'RIGHT' ? 1 : 0, dir === 'UP' ? -1 : dir === 'DOWN' ? 1 : 0);
}

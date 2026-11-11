// Controller support through the Gamepad API (Xbox-style names; a PlayStation pad's buttons sit in the same places).
// Sticks and triggers are read every frame; buttons also say when they were pressed. Nothing is read until a controller has said
// hello (it does at its first button press), and a frame with a controller allocates nothing.

const DEAD = 0.2;
const TRIGGER_ON = 0.35;
const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
const LT = 6, RT = 7;
const states = new Map(); // per controller: what was held, where its axes rest
let activeIndex = null;
let onConnect = null;
let anyPad = false;

export const pad = {
    connected: false,
    lx: 0, ly: 0, rx: 0, ry: 0,
    rt: 0, lt: 0,       // the triggers, analog
    held: new Set(),    // names of buttons held down
    pressed: new Set(), // names of buttons pressed this frame
    lastUsed: 0,        // performance.now() of the last controller input
};

export function onGamepadConnection(cb) { onConnect = cb; }

addEventListener('gamepadconnected', (e) => {
    anyPad = true;
    if (!shaped(e.gamepad)) return;
    if (activeIndex === null || e.gamepad.mapping === 'standard') activeIndex = e.gamepad.index;
    states.delete(e.gamepad.index);
    pad.connected = true;
    pad.lastUsed = performance.now();
    if (onConnect) onConnect(e.gamepad, true);
});
addEventListener('gamepaddisconnected', (e) => {
    states.delete(e.gamepad.index);
    if (e.gamepad.index !== activeIndex) return;
    activeIndex = null;
    const other = pick();
    if (other) return;
    pad.connected = false;
    clearInput();
    if (onConnect) onConnect(e.gamepad, false);
});

// The browser's "standard" layout first. Failing that, anything shaped like a controller (an older or cheaper pad comes without the
// layout): its sticks only count once they've moved from where they rest, so a driver's idle axis can't walk you off by itself.
const shaped = (g) => !!g && g.connected && g.buttons.length >= 4 && g.axes.length >= 2;
function pick() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let fallback = null;
    for (const g of list) {
        if (!shaped(g)) continue;
        if (g.mapping === 'standard') { activeIndex = g.index; pad.connected = true; return g; }
        fallback = fallback || g;
    }
    if (fallback) { activeIndex = fallback.index; pad.connected = true; }
    return fallback;
}
function clearInput() {
    pad.lx = pad.ly = pad.rx = pad.ry = pad.rt = pad.lt = 0;
    pad.held.clear();
    pad.pressed.clear();
}
const isDown = (b) => !!b && (b.pressed || b.value > 0.5);
function stateOf(g) {
    let s = states.get(g.index);
    if (!s) { s = { was: new Uint8Array(32), first: true, rest: g.mapping === 'standard' ? null : Array.from(g.axes), awake: g.mapping === 'standard' ? null : new Uint8Array(g.axes.length) }; states.set(g.index, s); }
    return s;
}
function axisOf(g, s, i) {
    const v = g.axes[i] || 0;
    if (!s.rest) return v;
    if (!s.awake[i]) { if (Math.abs(v - s.rest[i]) < 0.3) return 0; s.awake[i] = 1; }
    return v;
}
// a stick's dead middle is a circle, not a square: it doesn't snap to an axis on its way out of the middle, and it reaches full speed
function stick(x, y, out, ax, ay) {
    const l = Math.hypot(x, y);
    if (l < DEAD) { out[ax] = 0; out[ay] = 0; return; }
    const k = Math.min(1, (l - DEAD) / (1 - DEAD)) / l;
    out[ax] = x * k; out[ay] = y * k;
}

export function pollGamepad() {
    if (!anyPad) return pad;
    pad.pressed.clear();
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let g = activeIndex !== null ? list[activeIndex] : null;
    if (!shaped(g)) g = pick();
    // two controllers plugged in (or one and a virtual copy of it): the one being pressed is the one in use
    if (list.length > 1) for (const o of list) {
        if (!o || o === g || !shaped(o)) continue;
        for (let i = 0; i < o.buttons.length; i++) if (isDown(o.buttons[i])) { g = o; activeIndex = o.index; break; }
        if (g === o) break;
    }
    if (!g) { clearInput(); return pad; }
    const s = stateOf(g), b = g.buttons;
    stick(axisOf(g, s, 0), axisOf(g, s, 1), pad, 'lx', 'ly');
    stick(axisOf(g, s, 2), axisOf(g, s, 3), pad, 'rx', 'ry');
    pad.rt = b[RT] ? (b[RT].value || (b[RT].pressed ? 1 : 0)) : 0;
    pad.lt = b[LT] ? (b[LT].value || (b[LT].pressed ? 1 : 0)) : 0;
    pad.held.clear();
    let used = false;
    for (let i = 0; i < NAMES.length; i++) {
        const on = i === RT ? pad.rt > TRIGGER_ON : i === LT ? pad.lt > TRIGGER_ON : isDown(b[i]);
        if (on) {
            pad.held.add(NAMES[i]);
            // the first look at a controller: buttons already held down don't count as presses
            if (!s.was[i] && !s.first) pad.pressed.add(NAMES[i]);
            used = true;
        }
        s.was[i] = on ? 1 : 0;
    }
    s.first = false;
    if (used || pad.lx || pad.ly || pad.rx || pad.ry) pad.lastUsed = performance.now();
    return pad;
}

// Short rumble; ignored by controllers or browsers that can't vibrate
export function rumble(strength, ms) {
    if (!pad.connected || activeIndex === null) return;
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const act = list[activeIndex] && list[activeIndex].vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', { duration: ms || 150, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.7) }).catch(() => {});
}

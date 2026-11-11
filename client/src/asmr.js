// The footsteps and the effects, synthesised sample by sample (no files) into short buffers once while the game loads.
// The keycap floor is a giant mechanical keyboard, so a step is a key press: a clicky switch's click, a creamy linear's deep thock
// or a tactile's bump and clack, then the softer upstroke as the key comes back; a dozen variations, so running sounds like fast
// typing. A step on the Starport's stone is a boot's tap; the treadmill thocks and its stabilisers rattle; a landing
// bottoms out a handful of keys at once; the x20 MEGA CLACK is a huge thock under a sparkle of chimes; a jump lets a key go with its
// switch spring's boing; an axe or a crate hits with an iron clang; a rift is a plunge; a keycap wall bursts into clattering keys; a
// boulder lands with a thud. The effects (sfx in audio.js) are made here too: the menus' key clicks, a Golden Key's jingle, a
// gate's portcullis, a chest's creak and coins, the fanfares and the rest.
// Playing one is a buffer source and a gain (and a pan for someone else's step); nothing is built note by note.
const SR = 44100;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let seed = 12345;
const noiseV = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ----- little DSP kit (in place on Float32Arrays) -----
const buf = (secs) => new Float32Array(Math.max(1, Math.round(secs * SR)));
function biquad(x, type, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.707));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
}
// a band-pass whose centre moves (f(t) in Hz; its tuning moved every 4 samples): a whoosh
function sweepBP(x, fOf, q) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, cs = 0, al = 0, a0 = 1;
    for (let i = 0; i < x.length; i++) {
        if ((i & 3) === 0) { const w = 2 * Math.PI * Math.min(fOf(i / SR), SR * 0.45) / SR; cs = Math.cos(w); al = Math.sin(w) / (2 * q); a0 = 1 + al; }
        const v = x[i], y = (al * v - al * x2 + 2 * cs * y1 - (1 - al) * y2) / a0;
        x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
    }
    return x;
}
// filtered noise brought to a known level (rms 0.33, peaks about 1), whatever the filter left of it
function rmsTo(x, r) {
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    const k = e > 0 ? r / Math.sqrt(e / x.length) : 0;
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return x;
}
function mix(x, at, g, amp) { const i0 = Math.round(at * SR); for (let i = 0; i < g.length && i0 + i < x.length; i++) x[i0 + i] += g[i] * amp; }
// (the envelopes and pitch curves below are smooth: worked out every 8 samples, in a straight line between)
const CR = 8;
// noise (through the filters [type, Hz, q], then about 1 at its peaks) from `at` s for len s, amplitude amp, shaped by env(t, len)
function addNoise(x, at, len, amp, env, filt) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    if (filt) { for (const f of filt) biquad(n, f[0], f[1], f[2]); rmsTo(n, 0.33); }
    const i0 = Math.round(at * SR), m = Math.min(n.length, x.length - i0);
    for (let i = 0, ea = env(0, len); i < m; i += CR) {
        const eb = env((i + CR) / SR, len);
        for (let j = 0; j < CR && i + j < m; j++) x[i0 + i + j] += n[i + j] * amp * (ea + (eb - ea) * j / CR);
        ea = eb;
    }
}
// a sine whose frequency follows f(t), amplitude env(t, len)
function addTone(x, at, len, f, amp, env) {
    const i0 = Math.round(at * SR), m = Math.min(Math.ceil(len * SR), x.length - i0), k = 2 * Math.PI / SR;
    let ph = 0;
    for (let i = 0, fa = f(0), ea = env(0, len); i < m; i += CR) {
        const t = (i + CR) / SR, fb = f(t), eb = env(t, len);
        for (let j = 0; j < CR && i + j < m; j++) { const u = j / CR; ph += k * (fa + (fb - fa) * u); if (ph > 6.283185307179586) ph -= 6.283185307179586; x[i0 + i + j] += Math.sin(ph) * amp * (ea + (eb - ea) * u); }
        fa = fb; ea = eb;
    }
}
// an attack of a s, then dying away at k a second
const dec = (k, a) => (t) => (a && t < a ? t / a : 1) * Math.exp(-(t - (a && t > a ? a : 0)) * k);
// a fade at the end (no click): a short one, or `fade` s for a sound still going
function scale(x, k, fade) {
    const f = Math.min(x.length, Math.max(220, Math.round((fade || 0) * SR)));
    for (let i = 0; i < x.length; i++) x[i] *= k * (i > x.length - f ? (x.length - i) / f : 1);
    return x;
}
const peakOf = (x) => { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; };
// to a peak
function norm(x, peak, fade) { const m = peakOf(x); return scale(x, m > 0 ? peak / m : 0, fade); }
// to a loudness (its loudest 30 ms: rms), its peaks no higher than `peak`: the switches' clicks and thocks all as loud as each other
function level(x, rms, peak, fade) {
    const W = Math.round(0.03 * SR), H = Math.round(0.005 * SR);
    let best = 0;
    for (let s = 0; s < x.length; s += H) { let e = 0; for (let i = s, m = Math.min(x.length, s + W); i < m; i++) e += x[i] * x[i]; if (e > best) best = e; }
    const l = Math.sqrt(best / W), m = peakOf(x);
    return scale(x, m > 0 && l > 0 ? Math.min(rms / l, peak / m) : 0, fade);
}
// a steady sine from `at` dying away: f Hz, amplitude amp, d per second, an attack of att s (a running recurrence, no sin() or
// exp() a sample: the bells, coins and keys below are dozens of these)
function addPartial(x, at, f, amp, d, att) {
    if (f >= SR * 0.45) return;
    const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w), e = Math.exp(-d / SR), A = Math.max(1, (att || 0) * SR), i0 = Math.round(at * SR);
    let s1 = 0, s2 = -Math.sin(w), env = amp;
    for (let i = 0; i0 + i < x.length && env > 1e-5; i++) { x[i0 + i] += s1 * env * (i < A ? i / A : 1); const s0 = c * s1 - s2; s2 = s1; s1 = s0; env *= e; }
}
// a bell: a struck sine and its glockenspiel overtones, the high ones gone first
function addBell(x, at, f, amp, d) { for (const [k, a, m] of [[1, 1, 1], [2.756, 0.3, 2.5], [5.404, 0.1, 5]]) addPartial(x, at, f * k, amp * a, d * m, 0.0008); }
// a chime (the effects' bells): note n, dur s to die away, brighter with more of its overtones
function chime(x, at, n, dur, amp, bright) {
    const f = midi(n), d = 9.2 / dur;
    addPartial(x, at, f, amp, d, 0.002);
    addPartial(x, at, f * 2.756, amp * (bright ? 0.42 : 0.24), d / 0.3, 0.001);
    addPartial(x, at, f * 5.404, amp * (bright ? 0.2 : 0.08), d / 0.12, 0.001);
}
// a bubble: a little sine chirping up by `rise` (a fraction) over its length
function bubble(x, at, f, len, amp, rise) { addTone(x, at, len, (t) => f * (1 + (rise || 1.6) * t / len), amp, (t, l) => Math.sin(Math.PI * Math.min(1, t / l))); }
// a thump: a sine falling from f*(1+drop) into f (k how fast), len s, dying away at d a second
const addThump = (x, at, f, drop, k, len, amp, d) => addTone(x, at, len, (t) => f * (1 + drop * Math.exp(-t * k)), amp, dec(d, 0.0012));
// a whoosh: noise through a band-pass sweeping f0 to f1 Hz over len s (q its sharpness), swelling in and out; flut: a cloak's flutter in it
function swish(x, at, len, f0, f1, q, amp, flut) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    sweepBP(n, (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / len)), q);
    rmsTo(n, 0.33);
    const i0 = Math.round(at * SR);
    for (let i = 0; i < n.length && i0 + i < x.length; i++) { const p = i / n.length; x[i0 + i] += n[i] * amp * Math.pow(Math.sin(Math.PI * p), 1.3) * (flut ? 1 - flut * (0.5 + 0.5 * Math.sin(TAU * 17 * i / SR)) : 1); }
}
// grit: n tiny crackles scattered over span s (thinning out), between lo and hi Hz
function addGrit(x, at, span, n, amp, lo, hi) {
    const g = buf(span + 0.004);
    for (let k = 0; k < n; k++) {
        const t0 = Math.pow(Math.random(), 1.6) * span, i0 = Math.round(t0 * SR), m = Math.max(2, Math.round(rnd(0.0003, 0.0015) * SR)), a = rnd(0.2, 1) * (1 - 0.7 * t0 / span);
        for (let i = 0; i < m && i0 + i < g.length; i++) g[i0 + i] += noiseV() * a * (1 - i / m);
    }
    biquad(g, 'hp', lo, 0.7); biquad(g, 'lp', hi, 0.7);
    const m = peakOf(g);
    if (m > 0) mix(x, at, g, amp / m);
}
// a triangle-ish tone (its odd harmonics) gliding f0 to f1 over len s: a dull "nuh-uh"
function addTri(x, at, len, f0, f1, amp) {
    for (const [k, a] of [[1, 1], [3, 1 / 9], [5, 1 / 25]]) addTone(x, at, len, (t) => k * f0 * Math.pow(f1 / f0, Math.min(1, t / len)), amp * a, (t, l) => Math.min(1, t / 0.012) * Math.pow(Math.max(0, 1 - t / l), 1.2));
}
// a horn: two band-limited saws a few cents apart (polyBLEP) through a resonant low-pass (a state-variable filter, kept inline: this
// is the costliest loop here) that opens as it's blown (br: how bright), scooping up into its pitch, a vibrato coming in late; held
// len s (an attack of att s; bend: its pitch drooping by that fraction, a sorry "wah")
function addBrass(x, at, f, len, amp, br, bend, att) {
    const i0 = Math.round(at * SR), L = Math.min(Math.round((len + 0.15) * SR), x.length - i0), A = Math.max(1, (att || 0.018) * SR), iLen = Math.round(len * SR), kr = Math.exp(-40 / SR);
    let p1 = 0, p2 = 0.37, d1 = 0, d2 = 0, fa = 0, fb = 0, a1 = 0, a2 = 0, a3 = 0, rel = 1;
    for (let i = 0; i < L; i++) {
        if ((i & 15) === 0) {
            const t = i / SR, sc = (1 - 0.03 * Math.exp(-t * 38)) * (1 + (bend || 0) * Math.min(1, t / len)) * (1 + 0.006 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, (t - 0.15) / 0.2)));
            d1 = f * 1.003 * sc / SR; d2 = f * 0.997 * sc / SR;
            const g = Math.tan(Math.PI * Math.min(250 + f * (1.1 + (br || 5) * (1 - Math.exp(-t * 30)) * (0.72 + 0.28 * Math.exp(-t * 5))), SR * 0.45) / SR);
            a1 = 1 / (1 + g * (g + 1)); a2 = g * a1; a3 = g * a2;
        }
        let s = 2 * p1 + 2 * p2 - 2;
        if (p1 < d1) { const q = p1 / d1; s -= q + q - q * q - 1; } else if (p1 > 1 - d1) { const q = (p1 - 1) / d1; s -= q * q + q + q + 1; }
        if (p2 < d2) { const q = p2 / d2; s -= q + q - q * q - 1; } else if (p2 > 1 - d2) { const q = (p2 - 1) / d2; s -= q * q + q + q + 1; }
        p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1;
        const v3 = s - fb, v1 = a1 * fa + a2 * v3, v2 = fb + a2 * fa + a3 * v3; fa = 2 * v1 - fa; fb = 2 * v2 - fb;
        if (i >= iLen) rel *= kr;
        x[i0 + i] += v2 * amp * 0.5 * (i < A ? i / A : 1) * rel;
    }
}
// a harp string plucked (Karplus-Strong): f Hz ringing T s, its peak amp
function addHarp(x, at, f, T, amp) {
    const i0 = Math.round(at * SR), L = Math.min(Math.round(T * SR), x.length - i0);
    if (L <= 0) return;
    const D = SR / f - 0.5, N = Math.floor(D), fr = D - N, rho = Math.pow(0.001, 1 / (f * T)), cut = 1 - Math.exp(-TAU * Math.min(f * 7, 6000) / SR);
    const ex = new Float32Array(N + 1), y = new Float32Array(L);
    let lp = 0, mean = 0;
    for (let i = 0; i <= N; i++) { lp += (noiseV() - lp) * cut; ex[i] = lp; mean += lp / (N + 1); }
    for (let i = 0; i < L; i++) { const j = i - N; y[i] = (i <= N ? ex[i] - mean : 0) + (j >= 2 ? rho * 0.5 * ((1 - fr) * y[j] + y[j - 1] + fr * y[j - 2]) : 0); }
    const m = peakOf(y), k = m > 0 ? amp / m : 0, F = Math.min(L, 400);
    for (let i = 0; i < L; i++) x[i0 + i] += y[i] * k * (i > L - F ? (L - i) / F : 1);
}
// a coin landing: a tink and its ring (p its pitch)
function addCoin(x, at, a, p) {
    const f = rnd(2600, 3800) * (p || 1);
    addNoise(x, at, 0.002, a * 0.6, dec(1800), [['hp', 4000, 0.7]]);
    for (const [k, aa, d] of [[1, 0.5, 22], [1.58, 0.35, 28], [2.31, 0.25, 35], [3.03, 0.15, 45]]) addPartial(x, at, f * k, a * aa, d * rnd(0.8, 1.3), 0.0002);
}
// a ring of keys jingling: three keys knocking together, each two or three times
function addKeys(x, at, a) {
    for (let k = 0; k < 3; k++) {
        const f = rnd(2100, 4300), d = rnd(28, 45);
        for (let h = 0, tt = at + rnd(0, 0.02), aa = a * rnd(0.6, 1); h < 3; h++, tt += rnd(0.018, 0.04), aa *= 0.55) {
            addNoise(x, tt, 0.0015, aa * 0.4, dec(2000), [['bp', f * 1.8, 1.2]]);
            for (const [m, pa] of [[1, 1], [1.73, 0.5], [2.62, 0.3], [3.9, 0.15]]) addPartial(x, tt, f * m, aa * pa * 0.25, d * (1 + m * 0.25), 0.0002);
        }
    }
}
// glitter: a high hiss sparkling away, a few tiny pings in it
function addSparkle(x, at, len, a) {
    addNoise(x, at, len, a * 0.5, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)) * Math.exp(-t * 2.5), [['hp', 7500, 0.7]]);
    for (let k = 0; k < 9; k++) addPartial(x, at + Math.random() * len * 0.7, rnd(4800, 9500), a * rnd(0.12, 0.35), rnd(22, 45), 0.001);
}
// a tambourine shaken once: its little cymbals and their hiss
function addTamb(x, at, a) {
    for (let k = 0; k < 6; k++) { const f = rnd(4300, 7200), tt = at + rnd(0, 0.014), aa = a * rnd(0.5, 1); for (const [m, pa] of [[1, 1], [1.37, 0.6], [1.92, 0.4], [2.6, 0.2]]) addPartial(x, tt, f * m, aa * pa * 0.12, rnd(28, 45) * (1 + m * 0.2), 0.0003); }
    addNoise(x, at, 0.14, a * 0.25, dec(28, 0.002), [['hp', 6500, 0.7]]);
}
// a big drum (a taiko): a deep boom falling into its note, the skin's slap, the stick
function addBoom(x, at, a) {
    addTone(x, at, 1.0, (t) => 58 * (1 + 1.2 * Math.exp(-t * 26)), a, dec(4.8, 0.001));
    addPartial(x, at, 92, 0.3 * a, 10, 0.001);
    addNoise(x, at, 0.1, 0.45 * a, dec(30, 0.001), [['lp', 1200, 0.7]]);
    addNoise(x, at, 0.008, 0.3 * a, dec(500), [['bp', 2000, 0.9]]);
}
// an iron blade or bar struck: its inharmonic modes [ratio, amplitude, damping]
const CLANG = [[1, 0.6, 7], [1.48, 0.4, 9], [2.13, 0.45, 11], [2.69, 0.28, 14], [3.47, 0.22, 18], [4.31, 0.14, 24], [5.6, 0.08, 32]];
// a wooden creak: a hinge's stick-slip (tiny clicks r0 to r1 a second) ringing the wood's resonances, swelling in and out
function addCreak(x, at, len, r0, r1, amp) {
    const n = buf(len);
    for (let i = 0, next = 0; i < n.length; i++) if (i >= next) { n[i] = rnd(0.5, 1); next = i + Math.max(6, Math.round(SR / (r0 + (r1 - r0) * i / n.length) * rnd(0.75, 1.25))); }
    const a = Float32Array.from(n), b = Float32Array.from(n), c = Float32Array.from(n);
    biquad(a, 'bp', 640, 7); biquad(b, 'bp', 1380, 8); biquad(c, 'bp', 2500, 9);
    for (let i = 0; i < n.length; i++) n[i] = a[i] + b[i] * 0.7 + c[i] * 0.45;
    const m = peakOf(n), i0 = Math.round(at * SR);
    for (let i = 0; i < n.length && i0 + i < x.length; i++) x[i0 + i] += (m > 0 ? n[i] / m : 0) * amp * Math.pow(Math.sin(Math.PI * i / n.length), 0.6);
}
// a chain running through: its links clinking (rate a second), louder in the middle
function addChain(x, at, len, amp, rate) {
    for (let t = rnd(0, 0.01); t < len; t += rnd(0.3, 1.7) / rate) {
        const e = amp * rnd(0.3, 1) * (0.25 + 0.75 * Math.sin(Math.PI * t / len)), f = rnd(1700, 4000);
        addNoise(x, at + t, 0.002, e * 0.6, dec(1600), [['bp', f * 1.3, 1.4]]);
        addPartial(x, at + t, f, e * 0.22, rnd(80, 150), 0.0002);
        addPartial(x, at + t, f * rnd(1.45, 1.65), e * 0.12, rnd(110, 200), 0.0002);
    }
}
// a growl: a low buzz (f Hz) whose pitch wanders and whose loudness shudders, through a throat's two resonances, rising and falling
function addGrowl(x, at, len, f, amp) {
    const n = buf(len);
    for (let i = 0, ph = 0, w = 0, d = 0, am = 1; i < n.length; i++) {
        if ((i & 7) === 0) {
            const t = i / SR;
            if ((i & 63) === 0) w = w * 0.94 + (Math.random() - 0.5) * 0.05;
            d = f * (1 + w + 0.25 * Math.sin(Math.PI * t / len)) / SR; am = 0.6 + 0.4 * Math.sin(TAU * 29 * t + 3 * Math.sin(TAU * 6 * t));
        }
        ph += d; if (ph >= 1) ph -= 1;
        n[i] = (2 * ph - 1) * am;
    }
    const a = Float32Array.from(n), b = Float32Array.from(n);
    biquad(a, 'bp', 300, 2.2); biquad(b, 'bp', 720, 3); biquad(n, 'lp', 220, 0.7);
    for (let i = 0; i < n.length; i++) n[i] = n[i] * 0.8 + a[i] * 1.2 + b[i] * 0.6;
    rmsTo(n, 0.33);
    const i0 = Math.round(at * SR);
    for (let i = 0; i < n.length && i0 + i < x.length; i++) { const t = i / SR; x[i0 + i] += n[i] * amp * Math.min(1, t / 0.12) * Math.pow(Math.max(0, 1 - t / len), 0.8); }
}

// ----- the keys -----
// The switches under the keycaps (in Hz before a pitch p): click, a clicky switch's click jacket (0..1); bump, a tactile bump;
// tf the thock (the body's low resonance under the key) and td its damping; cf the keycap's clack, rf its plastic ring;
// up, s from the bottom-out to the upstroke, ua its loudness
const SW = {
    blue: { click: 1, bump: 0, tf: 330, td: 62, cf: 2700, rf: 1850, up: 0.062, ua: 0.5 },
    cream: { click: 0, bump: 0, tf: 215, td: 48, cf: 1350, rf: 1050, up: 0.078, ua: 0.32 },
    tactile: { click: 0, bump: 1, tf: 275, td: 56, cf: 2050, rf: 1500, up: 0.068, ua: 0.42 },
    space: { click: 0, bump: 0, tf: 165, td: 34, cf: 1100, rf: 820, up: 0.092, ua: 0.4 },
};
// one of a switch, a little different (no two keys are quite the same)
const jit = (s) => ({ ...s, tf: s.tf * rnd(0.94, 1.06), td: s.td * rnd(0.9, 1.12), cf: s.cf * rnd(0.92, 1.08), rf: s.rf * rnd(0.9, 1.1), up: s.up * rnd(0.85, 1.15) });
// a key going down (from `at` s; returns when it bottoms out)
function keyDown(x, at, s, p, a) {
    let tb = at;
    // a tactile bump: the stem's leg scraping over it on the way down
    if (s.bump) { addNoise(x, at, 0.01, 0.3 * a * s.bump, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)), [['bp', 1600 * p, 1.3]]); tb += rnd(0.008, 0.011); }
    // a clicky switch: its click jacket snapping over just before the bottom, two cracks a millisecond apart and a glint of metal
    if (s.click) {
        addNoise(x, tb, 0.003, 1.0 * a * s.click, dec(1500), [['hp', 2000, 0.7], ['bp', 4200 * p, 0.9]]);
        addNoise(x, tb + 0.0012, 0.003, 0.6 * a * s.click, dec(1700), [['bp', 5600 * p, 1.1]]);
        addPartial(x, tb, 4300 * p, 0.06 * a * s.click, 380, 0.0002);
        tb += rnd(0.009, 0.013);
    }
    // the bottom-out: the keycap's rim against the plate (a hard clack)...
    addNoise(x, tb, 0.005, 0.8 * a, dec(950), [['bp', s.cf * p, 1.1]]);
    // ...the body under it resonating (the thock: low, round and damped, punching down a touch in pitch)...
    addTone(x, tb, Math.min(0.3, 6.5 / s.td), (t) => s.tf * p * (1 + 0.3 * Math.exp(-t * 150)), 0.55 * a, dec(s.td, 0.0005));
    addPartial(x, tb, s.tf * p * 1.53, 0.17 * a, s.td * 1.7, 0.0004);
    addPartial(x, tb, s.tf * p * 2.38, 0.08 * a, s.td * 2.4, 0.0003);
    addNoise(x, tb, 0.03, 0.45 * a, dec(120, 0.0004), [['lp', 1000 * p, 0.8]]);
    // ...and the plastic of the keycap ringing for a moment
    addPartial(x, tb, s.rf * p, 0.13 * a, 170, 0.0002);
    addPartial(x, tb, s.rf * p * 1.47, 0.07 * a, 240, 0.0002);
    return tb;
}
// the upstroke: the stem back up against the top of its housing (a lighter, higher clack; a clicky one clicks again)
function keyUp(x, at, s, p, a) {
    addNoise(x, at, 0.004, 0.55 * a, dec(1200), [['bp', s.cf * p * 1.3, 1.2]]);
    addPartial(x, at, s.rf * p * 1.22, 0.06 * a, 280, 0.0002);
    addTone(x, at, 0.05, () => s.tf * p * 1.7, 0.1 * a, dec(110, 0.0004));
    if (s.click) addNoise(x, at + 0.001, 0.0025, 0.4 * a * s.click, dec(1600), [['bp', 4800 * p, 1]]);
}
function keyPress(x, at, s, p, a) { const tb = keyDown(x, at, s, p, a); if (s.up) keyUp(x, tb + s.up, s, p, a * s.ua); return tb; }
// a spacebar's stabilisers: the wires ticking in their housings
function rattle(x, at, span, n, a, p) {
    for (let k = 0; k < n; k++) { const t0 = at + Math.random() * span; addNoise(x, t0, 0.002, a * rnd(0.4, 1), dec(1800), [['bp', rnd(2400, 4300) * p, 1.6]]); addPartial(x, t0, rnd(2600, 3400) * p, a * 0.05, 140, 0.0002); }
}
// a loose keycap landing on stone (or on another keycap) and skittering: a light plastic clack, its hollow ring
function capClack(x, at, a, p) {
    addNoise(x, at, 0.003, a, dec(1300), [['bp', rnd(1700, 3600) * p, 1.2]]);
    addPartial(x, at, rnd(1050, 1700) * p, 0.16 * a, rnd(110, 190), 0.0002);
    addPartial(x, at, rnd(2300, 3300) * p, 0.08 * a, rnd(190, 300), 0.0002);
    if (Math.random() < 0.5) addNoise(x, at + rnd(0.02, 0.06), 0.002, 0.45 * a, dec(1500), [['bp', rnd(2000, 3800) * p, 1.2]]);
}
// the steps' switches, one per variation (more of the creamy thock than the rest)
const STEP_MIX = ['cream', 'tactile', 'blue', 'cream', 'tactile', 'blue', 'cream', 'tactile', 'blue', 'cream'];

const MAKE = {
    // a step on the keycap floor: a key pressed and let go (a clicky, a creamy linear or a tactile switch, a little different each)
    step(i) {
        const x = buf(0.17), s = jit(SW[STEP_MIX[i % STEP_MIX.length]]), p = rnd(0.93, 1.07);
        keyPress(x, 0, s, p, 1);
        biquad(x, 'hp', 45, 0.7);
        return level(x, 0.105, 0.55, 0.02);
    },
    // a step on the Starport's stone: a boot's heel tapping down, a little grit under the sole, the toe after it
    crunch() {
        const x = buf(0.14), p = rnd(0.9, 1.12);
        addNoise(x, 0, 0.004, 0.9, dec(1100), [['bp', 2600 * p, 0.8]]);
        addThump(x, 0, 150 * p, 0.5, 90, 0.07, 0.5, 60);
        addNoise(x, 0, 0.025, 0.45, dec(140, 0.0004), [['lp', 1300 * p, 0.7]]);
        addGrit(x, 0.002, 0.05, 10, 0.22, 2500, 9000);
        const tt = rnd(0.032, 0.05);
        addNoise(x, tt, 0.003, 0.4, dec(1300), [['bp', 3200 * p, 1]]);
        addThump(x, tt, 190 * p, 0.3, 90, 0.05, 0.18, 80);
        biquad(x, 'hp', 60, 0.7);
        return level(x, 0.085, 0.5, 0.02);
    },
    // a step on a treadmill: the long key's deeper thock, its hollow, the stabilisers rattling (going down and coming up)
    space() {
        const x = buf(0.26), s = jit(SW.space), p = rnd(0.92, 1.08);
        const tb = keyDown(x, 0, s, p, 1);
        addPartial(x, tb, 410 * p, 0.14, 60, 0.0005);
        rattle(x, tb + 0.003, 0.025, 3 + ((Math.random() * 3) | 0), 0.3, p);
        keyUp(x, tb + s.up, s, p, s.ua);
        rattle(x, tb + s.up + 0.002, 0.018, 2 + ((Math.random() * 2) | 0), 0.18, p);
        biquad(x, 'hp', 40, 0.7);
        return level(x, 0.11, 0.55, 0.03);
    },
    // onto a treadmill: the spacebar going down, and the treadmill under it waking (a motor winding up, its gears ticking faster)
    belt() {
        const x = buf(0.5), s = jit(SW.space);
        const tb = keyDown(x, 0, s, 0.9, 1);
        rattle(x, tb + 0.003, 0.025, 4, 0.3, 0.9);
        addTone(x, 0, 0.5, (t) => 62 + 120 * Math.min(1, t * 2.6), 0.22, (t) => Math.min(1, t * 8) * Math.exp(-t * 3.2));
        addTone(x, 0, 0.5, (t) => 2 * (62 + 120 * Math.min(1, t * 2.6)), 0.07, (t) => Math.min(1, t * 8) * Math.exp(-t * 3.6));
        for (let k = 0, at = 0.06; k < 9 && at < 0.44; k++, at += 0.065 * Math.pow(0.84, k)) addNoise(x, at, 0.003, 0.25 * (1 - at), dec(1300), [['bp', 2200, 1.4]]);
        biquad(x, 'hp', 35, 0.7);
        return norm(x, 0.42, 0.12);
    },
    // landing from a jump: a handful of keys bottoming out together a hair apart (deep ones), the weight of it, and the keys
    // springing back up in a scatter of softer clacks
    land() {
        const x = buf(0.36), p = rnd(0.86, 1.02);
        for (let k = 0; k < 4; k++) keyDown(x, k ? rnd(0.002, 0.02) : 0, jit(SW[k % 2 ? 'tactile' : 'cream']), p * rnd(0.74, 0.92), k ? rnd(0.45, 0.75) : 1);
        addThump(x, 0.002, 74 * p, 0.7, 40, 0.3, 1.1, 14);
        for (let k = 0; k < 4; k++) keyUp(x, rnd(0.1, 0.16), jit(SW.cream), p * rnd(0.85, 1.05), rnd(0.25, 0.4));
        biquad(x, 'hp', 32, 0.7);
        return norm(x, 0.5, 0.04);
    },
    // the x20 MEGA CLACK: a huge clicky key with a deep creamy one under it and a boom, a whoosh flying up into a sparkle of chimes,
    // and the key coming back up
    mega() {
        const x = buf(0.95);
        const tb = keyDown(x, 0, { ...SW.blue, click: 1.3 }, 0.78, 1.1);
        keyDown(x, tb - 0.001, SW.cream, 0.62, 1.2);
        addThump(x, tb, 58, 1, 30, 0.45, 1.5, 8);
        rattle(x, tb + 0.003, 0.03, 4, 0.3, 0.9);
        swish(x, 0.03, 0.42, 500, 5200, 1.4, 0.3);
        [0, 4, 7, 12, 16].forEach((d, k) => addBell(x, 0.13 + k * 0.042, 1046.5 * Math.pow(2, d / 12), 0.15, 8));
        addSparkle(x, 0.14, 0.6, 0.08);
        keyUp(x, tb + 0.11, SW.blue, 0.8, 0.5);
        biquad(x, 'hp', 28, 0.7);
        return norm(x, 0.72, 0.1);
    },
    // knocked by a swinging axe or a sliding iron-banded crate: the blow, the iron ringing (each mode a pair a few hertz apart, so
    // the clang shimmers), the knock of the haft or the crate's wood
    bonk() {
        const x = buf(0.8), p = rnd(0.88, 1.12), f = 410 * p;
        addNoise(x, 0, 0.006, 0.9, dec(700), [['bp', 3000 * p, 0.9]]);
        for (const [k, a, d] of CLANG) { addPartial(x, 0, f * k, a * 0.5, d, 0.0003); addPartial(x, 0, f * k * 1.0045 + 1.3, a * 0.32, d * 1.15, 0.0003); }
        addThump(x, 0, 125 * p, 0.6, 60, 0.15, 0.7, 30);
        addNoise(x, 0, 0.03, 0.4, dec(110), [['lp', 1500, 0.7]]);
        return norm(x, 0.6, 0.05);
    },
    // into a rift (the rift, lava, icy water, the void): the deep plonk of it closing over you, the spray thrown up and falling
    // back, big bubbles coming up, a fizz as it settles
    splash() {
        const x = buf(0.72);
        addTone(x, 0, 0.1, (t) => 140 + 560 * Math.pow(Math.min(1, t / 0.1), 1.3), 0.55, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)));
        addThump(x, 0, 70, 0.6, 30, 0.3, 0.8, 12);
        addNoise(x, 0.004, 0.5, 0.55, (t) => Math.min(1, t / 0.006) * Math.exp(-t * 7), [['hp', 900, 0.7], ['lp', 6500, 0.7]]);
        for (let k = 0; k < 14; k++) bubble(x, rnd(0.06, 0.5), rnd(900, 2600), rnd(0.006, 0.016), rnd(0.04, 0.1), 0.8);
        for (let k = 0; k < 5; k++) bubble(x, 0.12 + k * rnd(0.05, 0.08), rnd(170, 400), rnd(0.04, 0.07), 0.22, 2);
        addGrit(x, 0.18, 0.5, 40, 0.14, 2800, 9500);
        biquad(x, 'hp', 35, 0.7);
        return norm(x, 0.5, 0.08);
    },
    // a boost: a burst of keys typed faster and faster and higher, a bright zap up, a whoosh, three chimes
    boost() {
        const x = buf(0.5);
        for (let k = 0, t = 0; k < 8; k++, t += 0.034 * Math.pow(0.86, k)) keyDown(x, t, jit(SW[k % 2 ? 'blue' : 'tactile']), 1 + k * 0.07, 0.45 + k * 0.04);
        addTone(x, 0.02, 0.32, (t) => 420 + 2300 * Math.pow(t / 0.32, 0.8), 0.18, (t) => Math.min(1, t / 0.006) * Math.exp(-t * 8) * (0.75 + 0.25 * Math.sin(TAU * 38 * t)));
        swish(x, 0, 0.36, 700, 6000, 1.2, 0.2);
        [0, 4, 7].forEach((d, k) => addBell(x, 0.1 + k * 0.05, 1318.5 * Math.pow(2, d / 12), 0.17, 10));
        return norm(x, 0.5, 0.05);
    },
    // a dash: the air tearing past, a cloak's flutter in it, a low rush under it
    whoosh() {
        const x = buf(0.38), p = rnd(0.9, 1.1);
        swish(x, 0, 0.36, 420 * p, 3400 * p, 1.5, 1, 0.25);
        addNoise(x, 0, 0.3, 0.25, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)), [['lp', 320, 0.8]]);
        return norm(x, 0.45, 0.04);
    },
    // a keycap wall smashed by a DASH: a crunch of keys all going at once, a heavy thump, then the keycaps flying off and
    // clattering down all round, fewer and fewer
    smash() {
        const x = buf(0.85), p = rnd(0.9, 1.05);
        for (let k = 0; k < 5; k++) keyDown(x, rnd(0, 0.014), jit(SW[pick(['blue', 'cream', 'tactile'])]), p * rnd(0.7, 1), rnd(0.5, 1));
        addThump(x, 0, 82 * p, 0.8, 40, 0.3, 1, 12);
        addGrit(x, 0, 0.08, 30, 0.45, 1500, 8000);
        for (let k = 0; k < 36; k++) { const t0 = 0.03 + Math.pow(Math.random(), 1.5) * 0.72; capClack(x, t0, rnd(0.25, 0.75) * (1 - t0), rnd(0.8, 1.5)); }
        biquad(x, 'hp', 40, 0.7);
        return norm(x, 0.7, 0.05);
    },
    // a catapult boulder landing on the keys: a deep boom and the stone's crack, the keys under it bottoming out, gravel and chips skittering
    thud() {
        const x = buf(0.7), p = rnd(0.88, 1.1);
        addThump(x, 0, 52 * p, 1.1, 30, 0.6, 1.4, 7);
        addNoise(x, 0, 0.09, 0.8, dec(40, 0.0008), [['lp', 1400 * p, 0.8]]);
        addNoise(x, 0, 0.006, 0.6, dec(700), [['bp', 2400, 0.9]]);
        for (let k = 0; k < 3; k++) keyDown(x, rnd(0.001, 0.015), jit(SW.cream), p * rnd(0.6, 0.8), rnd(0.4, 0.7));
        addGrit(x, 0.02, 0.35, 40, 0.3, 1200, 7000);
        for (let k = 0; k < 6; k++) capClack(x, rnd(0.04, 0.3), rnd(0.15, 0.35), rnd(0.8, 1.2));
        biquad(x, 'hp', 28, 0.7);
        return norm(x, 0.6, 0.06);
    },
};
// how many of each (a step's variations most of all: it's heard a few times a second)
const COUNT = { step: 10, crunch: 5, space: 4, belt: 2, land: 4, mega: 2, bonk: 4, splash: 3, boost: 2, whoosh: 4, smash: 3, thud: 3 };
// the jump: the key letting go (a light upstroke clack) and its switch spring's boing, the coil ringing as it shakes
function makeBoing() {
    const L = 0.28, x = buf(L), p = rnd(0.93, 1.07), sh = (t) => 1 + 0.07 * Math.sin(TAU * 23 * t) * Math.exp(-t * 7), up = (t) => 1 + 0.8 * (1 - Math.exp(-t * 32));
    keyUp(x, 0, jit(SW.tactile), p, 0.7);
    addTone(x, 0.003, L - 0.003, (t) => 290 * p * up(t) * sh(t), 0.55, dec(13, 0.003));
    addTone(x, 0.003, L * 0.6, (t) => 580 * p * up(t) * sh(t), 0.12, dec(24, 0.002));
    for (const [f, a, d] of [[1720, 0.07, 34], [2590, 0.05, 44], [3710, 0.035, 58]]) addTone(x, 0.003, L - 0.003, (t) => f * p * (1 + 0.015 * Math.sin(TAU * 23 * t) * Math.exp(-t * 6)), a, dec(d, 0.0005));
    return norm(x, 0.5, 0.03);
}
// a bright tick (Wins arriving in the counter, played a little higher each)
function makeTick() {
    const x = buf(0.34);
    addNoise(x, 0, 0.002, 0.3, dec(2000), [['bp', 4000, 1]]);
    addPartial(x, 0, 1318.5, 0.6, 12, 0.002);
    addPartial(x, 0, 2637, 0.14, 22, 0.002);
    addPartial(x, 0, 1318.5 * 2.756, 0.1, 34, 0.001);
    return norm(x, 0.5);
}

// ----- the effects (sfx in audio.js): n variations, wet (some into the room's reverb), lazy (nothing plays it yet: made when asked) -----
const FX = {
    // the menus: a little key's tock, a key pressed with a swish up and a tinkle, a key let go with a swish down, a dull locked "nuh-uh"
    click: { n: 3, make() { const x = buf(0.1); keyDown(x, 0, jit(SW.cream), rnd(1.8, 2.05), 1); return norm(x, 0.115, 0.03); } },
    open: { wet: 1, make() { const x = buf(0.42); keyDown(x, 0, jit(SW.cream), 1.6, 0.8); swish(x, 0.01, 0.14, 700, 3200, 1.6, 0.35); chime(x, 0.05, 91, 0.35, 0.22, true); return norm(x, 0.165, 0.05); } },
    close: { make() { const x = buf(0.2); keyUp(x, 0, SW.cream, 1.5, 1); swish(x, 0, 0.11, 2600, 700, 1.6, 0.3); return norm(x, 0.09, 0.03); } },
    denied: { make() { const x = buf(0.48); for (const [at, f0, f1, len] of [[0, 311, 277, 0.15], [0.16, 233, 196, 0.26]]) { keyDown(x, at, SW.cream, 0.9, 0.5); addTri(x, at, len, f0, f1, 0.6); } return norm(x, 0.085, 0.04); } },
    // bought: a handful of coins, bright bells, glitter
    buy: { wet: 1, make() { const x = buf(1.0); for (let k = 0; k < 7; k++) addCoin(x, rnd(0, 0.16), rnd(0.25, 0.5), rnd(0.9, 1.2)); [86, 91, 98].forEach((n, i) => chime(x, 0.04 + i * 0.07, n, 0.7, i === 2 ? 0.7 : 0.85, true)); addSparkle(x, 0.08, 0.6, 0.12); return norm(x, 0.205, 0.1); } },
    // boots on: a stomp, the buckle's clink, a chime
    equip: { wet: 1, make() { const x = buf(0.6); keyDown(x, 0, SW.cream, 0.85, 0.7); addCoin(x, 0.03, 0.5, 0.8); chime(x, 0.06, 91, 0.5, 0.8, true); return norm(x, 0.13, 0.06); } },
    reward: { wet: 1, make() { const x = buf(1.05); [79, 83, 86, 91].forEach((n, i) => chime(x, i * 0.065, n, 0.8, 0.85)); for (let k = 0; k < 8; k++) addCoin(x, 0.2 + rnd(0, 0.3), rnd(0.12, 0.3), rnd(0.95, 1.25)); addSparkle(x, 0.15, 0.6, 0.12); return norm(x, 0.19, 0.1); } },
    // a Golden Key: a ring of keys jingling, a bright run of chimes, glitter
    gem: { n: 2, wet: 1, make() { const x = buf(0.7); addKeys(x, 0, 0.7); [86, 91, 95, 98].forEach((n, i) => chime(x, 0.02 + i * 0.045, n, 0.45, 0.8, true)); addSparkle(x, 0.02, 0.45, 0.12); return norm(x, 0.17, 0.06); } },
    task: { wet: 1, make() { const x = buf(1.0); [83, 86, 91].forEach((n, i) => chime(x, i * 0.07, n, 0.55, 0.9)); addKeys(x, 0.22, 0.6); [86, 91, 95, 98].forEach((n, i) => chime(x, 0.24 + i * 0.045, n, 0.45, 0.65, true)); addSparkle(x, 0.22, 0.45, 0.1); return norm(x, 0.145, 0.08); } },
    // a level: a bright arpeggio up a harp and the bells, two octaves, its chord ringing on over a warm swell of horns
    levelup: { wet: 1, make() {
        const x = buf(1.9);
        [67, 71, 74, 79, 83, 86, 91].forEach((n, i) => { addHarp(x, i * 0.055, midi(n), 1.1, 0.5); chime(x, i * 0.055, n + 12, 0.6, 0.3, true); });
        [79, 83, 86, 91].forEach((n) => chime(x, 0.42, n, 1.5, 0.3));
        [55, 62, 67, 71].forEach((n) => addBrass(x, 0.4, midi(n), 0.9, 0.12, 2.5, 0, 0.12));
        addTamb(x, 0.4, 0.4); addSparkle(x, 0.36, 1.0, 0.13);
        return norm(x, 0.23, 0.25);
    } },
    // a rebirth: higher and brighter, up into D, the taiko's boom and the horns' chord swelling under it
    rankup: { wet: 1, make() {
        const x = buf(2.4);
        [62, 66, 69, 74, 78, 81, 86, 90, 93].forEach((n, i) => { addHarp(x, i * 0.06, midi(n), 1.2, 0.45); chime(x, i * 0.06, n + 12, 0.7, 0.28, true); });
        addBoom(x, 0.5, 0.9);
        [50, 57, 62, 66, 69].forEach((n) => addBrass(x, 0.5, midi(n), 1.3, 0.13, 3, 0, 0.15));
        addKeys(x, 0.5, 0.5); addTamb(x, 0.5, 0.5); addSparkle(x, 0.5, 1.3, 0.15);
        return norm(x, 0.215, 0.3);
    } },
    // through a portal: a swoosh, a glint at its end
    whoosh: { make() { const x = buf(0.5); swish(x, 0, 0.34, 380, 2400, 1.4, 1, 0.15); addSparkle(x, 0.18, 0.3, 0.12); return norm(x, 0.07, 0.06); } },
    // a rare one out of a chest: a magic run up the bells, keys jingling, glitter
    lucky: { wet: 1, make() { const x = buf(0.9); [86, 88, 91, 95, 98, 100, 103, 107].forEach((n, i) => chime(x, i * 0.032, n, 0.45, 0.6, true)); addKeys(x, 0.1, 0.5); addSparkle(x, 0, 0.6, 0.18); return norm(x, 0.165, 0.08); } },
    // a Star Capsule shaken: its wood knocking on the stone, the coins inside rattling, a creak
    shake: { make() {
        const x = buf(0.9);
        for (let i = 0; i < 6; i++) {
            const a = i * 0.13;
            addThump(x, a, 160, 0.4, 60, 0.08, 0.5, 45); addPartial(x, a, 430, 0.15, 55, 0.0003); addNoise(x, a, 0.004, 0.35, dec(900), [['bp', 1200, 1]]);
            for (let c = 0; c < 3; c++) addCoin(x, a + rnd(0.005, 0.05), rnd(0.08, 0.16), rnd(0.9, 1.2));
            if (i % 2) addCreak(x, a + 0.02, 0.09, 70, 50, 0.12);
        }
        return norm(x, 0.085, 0.05);
    } },
    // and opened: the lid's hinges creaking, the lid thrown back, a shower of coins spilling out, the treasure's chime
    crack: { wet: 1, make() {
        const x = buf(1.35);
        addCreak(x, 0, 0.36, 45, 110, 0.5);
        addThump(x, 0.34, 140, 0.5, 50, 0.1, 0.5, 38); addNoise(x, 0.34, 0.005, 0.4, dec(900), [['bp', 1500, 1]]);
        for (let k = 0; k < 26; k++) addCoin(x, 0.36 + Math.pow(Math.random(), 1.4) * 0.7, rnd(0.08, 0.22), rnd(0.85, 1.25));
        [86, 90, 93, 98, 102].forEach((n, i) => chime(x, 0.4 + i * 0.05, n, 0.6, 0.35, true));
        addSparkle(x, 0.4, 0.8, 0.12);
        return norm(x, 0.2, 0.1);
    } },
    // (a combo of keys: pitched up by the combo when played)
    wall: { wet: 1, lazy: 1, make() { const x = buf(0.6); keyDown(x, 0, SW.blue, 1.2, 0.6); [80, 84, 87, 92].forEach((n, i) => chime(x, i * 0.05, n, 0.5, 0.8, true)); return norm(x, 0.165, 0.06); } },
    // a fanfare on the horns (up a D major chord), the chord held under bells, a tambourine, a boom
    summit: { wet: 1, lazy: 1, make() {
        const x = buf(1.8);
        [62, 66, 69].forEach((n, i) => addBrass(x, i * 0.1, midi(n), 0.08, 0.45, 5));
        [[74, 0.5], [69, 0.3], [66, 0.28]].forEach(([n, a]) => addBrass(x, 0.3, midi(n), 0.9, a, 5));
        addBoom(x, 0.3, 0.7); addTamb(x, 0.3, 0.5);
        [86, 90, 93, 98].forEach((n, i) => chime(x, 0.3 + i * 0.07, n, 0.9, 0.35, true));
        addSparkle(x, 0.3, 1.1, 0.12);
        return norm(x, 0.235, 0.2);
    } },
    // a Win Pad (and a race won): a fanfare, "ta-ta-ta-TAAA" up to the top of the chord on the horns, the chord under it, a bell
    // over it, a tambourine, glitter
    win: { wet: 1, make() {
        const x = buf(1.3);
        [69, 74, 78].forEach((n, i) => addBrass(x, i * 0.08, midi(n), 0.065, 0.45, 5));
        [[81, 0.55], [78, 0.3], [74, 0.26]].forEach(([n, a]) => addBrass(x, 0.24, midi(n), 0.55, a, 5));
        chime(x, 0.24, 93, 1.0, 0.45, true); chime(x, 0.36, 98, 0.9, 0.3, true);
        addTamb(x, 0.24, 0.45); addSparkle(x, 0.26, 0.8, 0.1);
        return norm(x, 0.315, 0.15);
    } },
    // a sorry little tune down on a muted horn
    lose: { lazy: 1, make() { const x = buf(1.5); [55, 54, 53, 52].forEach((n, i) => addBrass(x, i * 0.28, midi(n), i === 3 ? 0.8 : 0.24, 0.4, 1.8, i === 3 ? -0.03 : 0)); return norm(x, 0.085, 0.15); } },
    // through a stage's gate: Wins (a quick bright chime up, a handful of coins, glitter)
    trophy: { wet: 1, make() { const x = buf(0.8); [83, 88, 91, 95].forEach((n, i) => chime(x, i * 0.05, n, 0.55, 0.85, true)); for (let k = 0; k < 5; k++) addCoin(x, 0.1 + rnd(0, 0.2), rnd(0.2, 0.4), rnd(1, 1.25)); addSparkle(x, 0.1, 0.45, 0.1); return norm(x, 0.17, 0.08); } },
    pass: { wet: 1, make() { const x = buf(0.95); chime(x, 0, 86, 0.5, 0.8); chime(x, 0.1, 91, 0.8, 0.8); addKeys(x, 0.1, 0.35); return norm(x, 0.12, 0.08); } },
    // a ground slam: a heavy thock of many keys
    slam: { lazy: 1, make() { const x = buf(0.4); for (let k = 0; k < 4; k++) keyDown(x, rnd(0, 0.016), jit(SW.cream), rnd(0.65, 0.85), rnd(0.6, 1)); addThump(x, 0, 64, 0.8, 40, 0.32, 1.2, 12); return norm(x, 0.105, 0.05); } },
    dash: { lazy: 1, make() { const x = buf(0.42); swish(x, 0, 0.3, 900, 3200, 1.4, 1, 0.2); rattle(x, 0.14, 0.05, 3, 0.25, 1); return norm(x, 0.067, 0.05); } },
    respawn: { wet: 1, lazy: 1, make() { const x = buf(0.75); addTone(x, 0, 0.35, (t) => 180 * Math.pow(520 / 180, t / 0.35) * (1 + 0.05 * Math.sin(TAU * 14 * t)), 0.4, (t, l) => Math.min(1, t / 0.02) * (1 - t / l)); [74, 79, 83, 86, 91].forEach((n, i) => chime(x, 0.05 + i * 0.04, n, 0.4, 0.5)); addSparkle(x, 0, 0.5, 0.1); return norm(x, 0.15, 0.08); } },
    snap: { lazy: 1, make() { const x = buf(0.1); keyUp(x, 0, SW.blue, 1.4, 1); return norm(x, 0.145, 0.03); } },
    // a new thing unwrapped: a swish, the chimes, keys
    newblade: { wet: 1, lazy: 1, make() { const x = buf(0.95); swish(x, 0, 0.4, 500, 3200, 1.6, 0.5); [79, 83, 86, 95].forEach((n, i) => chime(x, 0.12 + i * 0.06, n, 0.6, 0.7, true)); addKeys(x, 0.12, 0.4); return norm(x, 0.17, 0.08); } },
    // a race: you're in the queue; someone else found; the count; the start (the taiko, the horns' chord, a whoosh)
    queue: { wet: 1, make() { const x = buf(0.85); chime(x, 0, 81, 0.45, 0.8); chime(x, 0.1, 86, 0.7, 0.8); return norm(x, 0.135, 0.08); } },
    found: { wet: 1, make() { const x = buf(0.55); [86, 90, 93].forEach((n, i) => chime(x, i * 0.05, n, 0.4, 0.8, true)); return norm(x, 0.145, 0.06); } },
    tick3: { wet: 1, make() { const x = buf(0.45); keyDown(x, 0, SW.blue, 1.5, 0.45); chime(x, 0, 81, 0.4, 0.8, true); return norm(x, 0.19, 0.05); } },
    go: { wet: 1, make() {
        const x = buf(1.1);
        addBoom(x, 0, 1);
        [62, 66, 69, 74].forEach((n) => addBrass(x, 0, midi(n), 0.28, 0.3, 5));
        chime(x, 0, 86, 0.9, 0.4, true);
        swish(x, 0, 0.4, 500, 4500, 1.2, 0.3);
        addTamb(x, 0, 0.5);
        return norm(x, 0.37, 0.15);
    } },
    // a launch gantry opening: the winch's pawl clacking over its teeth (quicker as the portcullis lifts), the chain rattling up,
    // the iron grille grinding in its grooves, a heavy clunk as it locks up top, and the chimes climbing with it
    gate: { wet: 1, make() {
        const x = buf(1.5);
        for (let k = 0, at = 0; at < 0.9; k++, at += 0.11 * Math.pow(0.93, k)) { addNoise(x, at, 0.004, 0.45, dec(900), [['bp', 1700, 1.2]]); addPartial(x, at, 780, 0.12, 60, 0.0003); addPartial(x, at, 2300, 0.05, 110, 0.0002); }
        addChain(x, 0.02, 0.95, 0.4, 70);
        addNoise(x, 0, 1.0, 0.3, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)) * (0.7 + 0.3 * Math.sin(TAU * 11 * t)), [['lp', 260, 0.9]]);
        addThump(x, 0.95, 70, 0.6, 40, 0.3, 0.8, 16); addNoise(x, 0.95, 0.006, 0.5, dec(700), [['bp', 2200, 1]]);
        for (const [k, a, d] of CLANG) addPartial(x, 0.95, 520 * k, a * 0.18, d * 1.4, 0.0003);
        [74, 79, 83, 86, 91].forEach((n, i) => chime(x, 0.12 + i * 0.08, n, 0.75, 0.5, true));
        return norm(x, 0.135, 0.1);
    } },
    // the station monster landing behind you: a heavy thud of stone and wood, the keys rattling under it, then a low growl rumbling
    // up and away
    roar: { make() {
        const x = buf(1.25);
        addThump(x, 0, 46, 1.2, 28, 0.7, 1.4, 6);
        addNoise(x, 0, 0.12, 0.7, dec(30, 0.001), [['lp', 900, 0.8]]);
        addNoise(x, 0, 0.008, 0.45, dec(600), [['bp', 1800, 0.9]]);
        addPartial(x, 0, 180, 0.3, 25, 0.001);
        for (let k = 0; k < 5; k++) capClack(x, rnd(0.03, 0.22), rnd(0.12, 0.3), rnd(0.7, 1.1));
        addGrit(x, 0.01, 0.3, 30, 0.22, 1000, 6000);
        addGrowl(x, 0.18, 1.0, 62, 0.75);
        biquad(x, 'hp', 25, 0.7);
        return norm(x, 0.135, 0.12);
    } },
    // caught: CHOMP-chomp (the jaws slamming shut: the teeth clacking, a crunch, the thump of it), a gulp, a sorry "wah-waah" on a horn
    caught: { make() {
        const x = buf(1.35);
        for (const [at, a] of [[0, 1], [0.17, 0.75]]) {
            addNoise(x, at, 0.005, 0.8 * a, dec(900), [['bp', 2300, 1]]);
            addPartial(x, at, 1150, 0.25 * a, 90, 0.0002); addPartial(x, at, 2900, 0.12 * a, 140, 0.0002);
            addThump(x, at, 120, 0.8, 40, 0.18, 0.9 * a, 22);
            addGrit(x, at + 0.004, 0.06, 18, 0.3 * a, 1200, 6000);
        }
        addTone(x, 0.36, 0.13, (t) => 250 - 140 * Math.min(1, t / 0.13), 0.5, (t, l) => Math.sin(Math.PI * Math.min(1, t / l)));
        addBrass(x, 0.55, midi(64), 0.2, 0.32, 2.2, -0.02); addBrass(x, 0.8, midi(60), 0.4, 0.32, 2.2, -0.05);
        return norm(x, 0.24, 0.1);
    } },
    // zapped by a laser: a bright crackle, a buzzing hum falling away as it cuts out, a pop, then the same sorry horn
    zap: { make() {
        const x = buf(1.2);
        addNoise(x, 0, 0.004, 0.7, dec(1200), [['bp', 5200, 1]]);
        addGrit(x, 0, 0.22, 46, 0.45, 2500, 9000);
        addTone(x, 0, 0.28, (t) => 1800 * Math.pow(140 / 1800, t / 0.28) * (1 + 0.08 * Math.sign(Math.sin(TAU * 60 * t))), 0.45, (t, l) => Math.min(1, t / 0.004) * (1 - t / l));
        addTone(x, 0, 0.28, (t) => 900 * Math.pow(70 / 900, t / 0.28), 0.3, (t, l) => Math.min(1, t / 0.004) * (1 - t / l));
        addThump(x, 0.01, 120, 0.8, 40, 0.18, 0.6, 22);
        addBrass(x, 0.42, midi(64), 0.2, 0.3, 2.2, -0.02); addBrass(x, 0.66, midi(60), 0.4, 0.3, 2.2, -0.05);
        return norm(x, 0.24, 0.1);
    } },
    revive: { wet: 1, make() { const x = buf(0.95); addTone(x, 0, 0.35, (t) => 190 * Math.pow(560 / 190, t / 0.35) * (1 + 0.05 * Math.sin(TAU * 14 * t)), 0.4, (t, l) => Math.min(1, t / 0.02) * (1 - t / l)); [67, 74, 79, 83, 86, 91].forEach((n, i) => chime(x, i * 0.05, n, 0.6, 0.6, true)); addKeys(x, 0.15, 0.45); addSparkle(x, 0, 0.6, 0.12); return norm(x, 0.235, 0.08); } },
    // a stage escaped: a quick run up the harp, a whoosh, the bells (a Win Pad's fanfare lands on top of it)
    escape: { wet: 1, make() { const x = buf(0.75); [74, 78, 81, 86, 90, 93].forEach((n, i) => addHarp(x, i * 0.03, midi(n), 0.6, 0.45)); swish(x, 0, 0.25, 600, 4000, 1.4, 0.35); [79, 83, 86, 91].forEach((n, i) => chime(x, 0.05 + i * 0.045, n, 0.6, 0.5, true)); return norm(x, 0.17, 0.08); } },
};

// ----- the bank: made while loading (a few at a time, so the page stays responsive) -----
const bank = {}, fx = {};
// (on a weak device: one of each effect, so loading is quicker and the bank smaller)
let fewer = false;
const makeFx = (name) => { fx[name] = []; const n = FX[name].n || 1; for (let i = 0; i < (fewer ? Math.min(n, 1) : n); i++) fx[name].push(FX[name].make(i)); };
// low: a weak device (half the footsteps' variations, one of each effect: still several of each step, built behind the loading screen)
export async function buildAsmr(pause, low) {
    fewer = !!low;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let t0 = now();
    const breath = async () => { if (pause && now() - t0 > 8) { await pause(); t0 = now(); } };
    const out = (k, f, n) => { bank[k] = []; for (let i = 0; i < n; i++) bank[k].push(f(i)); };
    for (const kind of Object.keys(MAKE)) { const c = COUNT[kind] || 4; out(kind, (i) => MAKE[kind](i), low ? Math.max(2, Math.ceil(c / 2)) : c); await breath(); }
    out('jump', makeBoing, low ? 2 : 3);
    out('tick', makeTick, 1);
    // the effects too (the few nothing plays yet: when first asked for)
    for (const name of Object.keys(FX)) if (!FX[name].lazy && !fx[name]) { makeFx(name); await breath(); }
}
// The same bank all at once, with no pauses: what the worker (asmr-worker.js) runs, off the page's thread
export function synthAll(low) {
    fewer = !!low;
    const out = (k, f, n) => { bank[k] = []; for (let i = 0; i < n; i++) bank[k].push(f(i)); };
    for (const kind of Object.keys(MAKE)) { const c = COUNT[kind] || 4; out(kind, (i) => MAKE[kind](i), low ? Math.max(2, Math.ceil(c / 2)) : c); }
    out('jump', makeBoing, low ? 2 : 3);
    out('tick', makeTick, 1);
    for (const name of Object.keys(FX)) if (!FX[name].lazy && !fx[name]) makeFx(name);
    return { bank, fx };
}
// what the worker sent back, taken in (anything already made here stays)
export function adoptAsmr(res, low) {
    fewer = !!low;
    for (const k in res.bank) if (!bank[k] && !ready[k]) bank[k] = res.bank[k];
    for (const k in res.fx) if (!fx[k] && !fxReady[k]) fx[k] = res.fx[k];
}
// the AudioBuffers (made once the audio context exists; the samples then live only in them)
const toBuffer = (ctx, a) => { const b = ctx.createBuffer(1, a.length, SR); b.copyToChannel(a, 0); return b; };
const ready = {}, fxReady = {};
export function asmrBuffer(ctx, key) {
    let list = ready[key];
    if (!list) {
        const raw = bank[key];
        if (!raw) return null;
        list = ready[key] = raw.map((a) => toBuffer(ctx, a));
        bank[key] = null;
    }
    return list[Math.floor(Math.random() * list.length)];
}
export const asmrKinds = () => Object.keys(MAKE);
// an effect's buffer (one not made yet is made now)
export function fxBuffer(ctx, name) {
    let list = fxReady[name];
    if (!list) {
        if (!FX[name]) return null;
        if (!fx[name]) makeFx(name);
        list = fxReady[name] = fx[name].map((a) => toBuffer(ctx, a));
        fx[name] = null;
    }
    return list[Math.floor(Math.random() * list.length)];
}
// does it ring on into the room (the reverb)?
export const fxWet = (name) => !!(FX[name] && FX[name].wet);
export const fxKinds = () => Object.keys(FX);

// A world on the ground: the Starport at the south end and the Keyway going off to the north (-z), a long straight course cut
// into stages by great open gates (one at the start of each stage; passing the next one pays the stage's Wins), deadly things in
// the way between. Both sides build from these numbers: the client draws it and moves you on it, the server checks where you say you are.
import { WORLDS, WALLS_N, POSTS, JAWBREAKERS, stageV, rngFrom, CFG } from './config.js';
import { stageType, buildStage, STAGE_TYPES, SWEEP, inRect } from './stages.js';

export const W = {
    spawn: { x: 0, z: 92 },
    plaza: { x0: -74, x1: 74, z0: 44, z1: 118 },
    halfW: 17,                    // half the Rift's width
    gateH: 22,                    // a gate's height
    gateT: 3,                     // its thickness
    first: 30,                    // where the first gate stands (in the launch gantry's mouth)
    padBack: 16,                  // (the old Win Pad, this far before the next gate: unused)
    padR: 6.5,                    // its half size
    lockGap: 1.6,                 // (how close you got to a gate that's shut: they never shut now)
    archSlack: 4,                 // how far short of a gate the server still counts you through it (its last word is a moment old)
};
// ----- the stages: each as long as it takes someone at its Recommended Level about five seconds to run, and a bit -----
const LEN = [], GZ = [];
{
    let z = W.first;
    for (let k = 0; k <= WALLS_N; k++) { GZ.push(z); if (k < WALLS_N) { LEN.push(Math.round(70 + stageV(k) * 4.5)); z -= LEN[k]; } }
}
// the gate at the start of stage k (k = WALLS_N: the end of the last stage)
export const wallZ = (k) => GZ[Math.max(0, Math.min(WALLS_N, k))];
export const stageLen = (k) => LEN[k];
// which stage a point is in (-1: the plaza; WALLS_N: past the last)
export function stageAt(z) { if (z > GZ[0]) return -1; for (let k = 0; k < WALLS_N; k++) if (z > GZ[k + 1]) return k; return WALLS_N; }
// stage k's end gate (the start of stage k + 1): passing it pays the stage's Wins
export const archZ = (k) => wallZ(k + 1);
export const passedArch = (k, z, slack) => k >= 0 && k < WALLS_N && z <= archZ(k) + (slack || 0);
// (the old Win Pad at the end of stage k: gone from the game; kept so old callers still link)
export const padAt = (k) => ({ x: 0, z: wallZ(k + 1) + W.padBack });
export const onPad = (k, x, z) => { const p = padAt(k); return Math.abs(x - p.x) < W.padR + 0.6 && Math.abs(z - p.z) < W.padR + 0.6; };
// where a revive puts you in stage k (a checkpoint just inside its gate)
export const checkpoint = (k) => ({ x: 0, z: wallZ(Math.max(0, k)) - 6 });
export const northEnd = wallZ(WALLS_N) - 40;
// the gate at the far end: through it, the next world
export const endPortal = { x: 0, z: northEnd + 8, r: 9 };
// how far north the gates let you go: the south face of the first one shut (none ever is now: gateLock() is WALLS_N)
export const lockZOf = (next) => (next >= WALLS_N ? -1e9 : wallZ(next) + W.gateT / 2 + W.lockGap);
export const inGauntlet = (z) => z < W.plaza.z0;

// ----- what's in the way in each stage: the same for everyone, from the stage's seed -----
// pool (a rift: jump it, or you're out), hurdle (a low stone wall: hop it), pillars (stone pillars: go round), sweeper (a laser turning
// round its pylon: touch it and you're out), slider (a laser panel sliding from wall to wall: touch it and you're out), boost
// (chevrons: a burst of speed); lakes (rifts right across, with floating keys or bridges over them: plats). (blade, slit: old kinds)
export const BLADE = { len: 15, hit: 2.4, depth: 1.6 };
// a sliding laser panel: its size (across, along, up); where it is at server time t (seconds), its middle's x
export const SLIDER = { w: 8, d: 4.6, h: 6.4 };
export const sliderAt = (o, t, half) => Math.sin(((t % o.period) / o.period) * Math.PI * 2 + o.phase) * (half ?? (W.halfW - SLIDER.w / 2 - 0.6));
const planCache = new Map();
// a stage: its kind (shared/stages.js), what's in the way (list), its rift lakes, its platforms (keycap stones, spring keys), its golden
// keys (none now: candies is empty), its ice; the same for everyone, from its seed. Its hazards fill the stage from a little inside the
// gate you come in by to a little short of its end gate
export function stagePlan(w, k) {
    const key = w * 100 + k;
    if (planCache.has(key)) return planCache.get(key);
    const r = rngFrom(9001 + w * 977 + k * 131), type = stageType(w, k);
    // (d: how far into the sector, 0..1; a later sector's stages are that much denser from the start)
    const g = { w, k, a: wallZ(k) - 16, b: wallZ(k + 1) + 10, v: stageV(k), hw: W.halfW - 1, r, d: k === 0 ? 0 : Math.min(1, k / (WALLS_N - 1) * (1 + 0.1 * w) + 0.07 * w) };
    const plan = { w, k, type, ...buildStage(type, g) };
    planCache.set(key, plan);
    return plan;
}
export { stageType, STAGE_TYPES };
// a blade at server time t (seconds): where it is across the way, -1..1
export const bladeAt = (o, t) => Math.sin(((t % o.period) / o.period) * Math.PI * 2 + o.phase);
// the rift you'd be in, standing here on the floor (a pool or a lake: you're out; a platform over it is the client's to know: you're not on the floor)
export function inPool(w, k, x, z) {
    if (k < 0 || k >= WALLS_N) return false;
    const P = stagePlan(w, k);
    for (const o of P.list) if (o.kind === 'pool' && z > o.z0 && z < o.z1 && x > o.x0 && x < o.x1) return true;
    for (const o of P.lakes) if (inRect(o, x, z)) return true;
    return false;
}
// on ice here?
export function onIce(w, k, x, z) { if (k < 0 || k >= WALLS_N) return false; for (const o of stagePlan(w, k).icy) if (inRect(o, x, z)) return true; return false; }

// what stands in the Starport. From the spawn you look up the path to the launch gantry; the treadmills on your left, the Star Capsules
// on your right, booths either side of the gate. Every sign is clear of the others and of the HUD.
export const upgradeShed = { x: -44, z: 54, r: 14 };
export const tongueBar = { x: 44, z: 54, r: 14 };
export const worldsPortal = { x: -21, z: 52, r: 8 };
export const playGate = { x: 21, z: 52, r: 9 };
export const boards = [{ x: -72, z: 90 }, { x: 72, z: 90 }, { x: 0, z: 116 }];
const POST_SPOTS = [[-20, 74], [-33, 74], [-46, 74], [-59, 74], [-24, 102], [-36, 102], [-48, 102], [-60, 102], [-30, 113]];
export const postSpot = (i) => ({ x: POST_SPOTS[i][0], z: POST_SPOTS[i][1] });
export const POST_R = 3.6;       // the belt: stand here and you train on it
export const BELT = { w: 6.4, l: 10 };
// the treadmill whose belt you're on, or -1
export function postAt(x, z, r) { for (let i = 0; i < POSTS.length; i++) { const s = POST_SPOTS[i]; if (Math.abs(s[0] - x) < (r ?? BELT.w / 2 + 0.3) && Math.abs(s[1] - z) < BELT.l / 2 + 0.3) return i; } return -1; }
// are you near this treadmill? (not "which is nearest": near enough to two, you're still near the one you're on)
export const nearPost = (i, x, z, r) => { const s = POST_SPOTS[i]; return !!s && (s[0] - x) ** 2 + (s[1] - z) ** 2 < r * r; };
const JB_SPOTS = [[20, 74], [33, 74], [46, 74], [59, 74], [24, 102], [36, 102], [48, 102], [60, 102]];
export const jbSpot = (i) => ({ x: JB_SPOTS[i][0], z: JB_SPOTS[i][1] });
export const JB_R = 6.5;
void JAWBREAKERS;

// ----- a world's physics: flat ground, boxes for what stands on it, and how far the gates let you go -----
const cache = new Map();
export function hubFor(w) {
    if (cache.has(w)) return cache.get(w);
    const Wd = WORLDS[w] || WORLDS[0], solids = [];
    const box = (x, y0, y1, z, sx, sz, o) => solids.push({ min: [x - sx / 2, y0, z - sz / 2], max: [x + sx / 2, y1, z + sz / 2], ...(o || {}) });
    for (const q of [upgradeShed, tongueBar]) {
        box(q.x, 0, 10, q.z - 8, 24, 3);                                                  // the back
        box(q.x, 0, 4.4, q.z + 3, 21.6, 4.4);                                             // the counter
        for (const sx of [-1, 1]) { box(q.x + sx * 11.5, 0, 6, q.z - 3.2, 1.5, 9); box(q.x + sx * 11.5, 0, 10, q.z + 5.6, 1.5, 1.5); }
        box(q.x, 10, 16.5, q.z - 1.4, 25, 15);                                            // the roof
    }
    for (const s of [-1, 1]) box(worldsPortal.x + s * 8, 0, 18, worldsPortal.z, 2.4, 2.4);
    for (const s of [-1, 1]) box(playGate.x + s * 8, 0, 18, playGate.z, 2.4, 2.4);
    for (const b of boards) { if (b.x) box(b.x, 0, 14, b.z, 1.6, 24); else box(b.x, 0, 14, b.z, 24, 1.6); }
    // a treadmill: its console at the north end, the rails either side (the belt itself is open)
    for (let i = 0; i < POST_SPOTS.length; i++) { const s = POST_SPOTS[i]; box(s[0], 0, 5.2, s[1] - BELT.l / 2 - 0.9, BELT.w + 1, 1.4); }
    for (let i = 0; i < JB_SPOTS.length; i++) { const s = JB_SPOTS[i]; box(s[0], 0, 8, s[1], 3.4, 3.4); }
    // the Keyway: what's in the way, every stage (a laser is no wall: it ends you, on your screen)
    for (let k = 0; k < WALLS_N; k++) {
        for (const o of stagePlan(w, k).list) {
            if (o.kind === 'hurdle') box(0, 0, o.h, o.z, W.halfW * 2, o.d, { noStep: true });
            else if (o.kind === 'pillars') for (const p of o.list) box(p.x, 0, 14, p.z, p.s, p.s);
            else if (o.kind === 'sweeper') box(o.x, 0, 6, o.z, SWEEP.post * 2, SWEEP.post * 2);
            else if (o.kind === 'slit') {
                const l0 = -W.halfW, l1 = o.gx - o.gw / 2, r0 = o.gx + o.gw / 2, r1 = W.halfW;
                if (l1 > l0) box((l0 + l1) / 2, 0, o.h, o.z, l1 - l0, o.d);
                if (r1 > r0) box((r0 + r1) / 2, 0, o.h, o.z, r1 - r0, o.d);
            }
        }
    }
    // the stages' platforms: keycap stones, bridges and spring keys stand up out of the rift (a spring says so: it throws you up)
    for (let k = 0; k < WALLS_N; k++) for (const p of stagePlan(w, k).plats) box(p.x, 0, p.top, p.z, p.sx, p.sz, p.kind === 'tramp' ? { tramp: true } : { stone: true });
    const T = { w, Wd, solids };
    T.make = (lock) => ({ solids, floor: 0, clamp(b) { clampHub(b, lock); } });
    T.world = T.make(null);
    cache.set(w, T);
    return T;
}
function clampHub(b, lock) {
    const P = W.plaza, hw = W.halfW - 0.8;
    if (b.z >= P.z0) {
        if (b.x < P.x0 + 1) { b.x = P.x0 + 1; if (b.vx < 0) b.vx = 0; } else if (b.x > P.x1 - 1) { b.x = P.x1 - 1; if (b.vx > 0) b.vx = 0; }
        if (b.z > P.z1 - 1) { b.z = P.z1 - 1; if (b.vz > 0) b.vz = 0; }
    } else if (Math.abs(b.x) > hw) {
        // the square's north edge, either side of the course's mouth; further up, the course's sides
        if (b.z > P.z0 - 3) { b.z = P.z0 + 0.01; if (b.vz < 0) b.vz = 0; } else { b.x = Math.sign(b.x) * hw; b.vx = 0; }
    }
    if (b.z < northEnd + 1) { b.z = northEnd + 1; if (b.vz < 0) b.vz = 0; }
    // a gate that's shut: you can't walk or jump through it
    if (lock && b.z < lock.z) { b.z = lock.z; if (b.vz < 0) b.vz = 0; }
}
void CFG;

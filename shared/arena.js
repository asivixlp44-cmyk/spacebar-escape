// Black Hole Rush: one race's course, worked out from its seed on the server and on every player's screen. Six lanes side by side, the
// same things in every lane so it's fair: rifts to jump, stone bars to hop, swinging axes and sliding crates to time,
// stone pillars to weave round, boost chevrons. The black hole wakes behind the start line and comes on faster and faster: whoever it
// reaches is out. A portal at the end.
import { rngFrom, matchInfo, WORLDS, CFG } from './config.js';

export const ARENA = { laneW: 14, seg: 48, first: -16, hw: 6.2, finishBack: 22, startZ: 0, surgeZ0: 26 };
export const laneX = (spot) => (spot - (CFG.matchSpots - 1) / 2) * ARENA.laneW;
export const segZ = (i) => ARENA.first - i * ARENA.seg;
export const finishZ = (n) => segZ(n) - ARENA.finishBack;
export const startSpot = (spot) => ({ x: laneX(spot), z: ARENA.startZ, ry: Math.PI });
// a blade at server time t (seconds): how far across the lane it is, -1..1
export const caneAt = (c, t) => Math.sin(((t % c.period) / c.period) * Math.PI * 2 + c.phase);
// a sliding gift box in a lane: its size, and its middle's x from the lane's middle at server time t
export const LANE_BOX = { w: 4.4, d: 3.6, h: 5 };
export const laneBoxAt = (o, t) => Math.sin(((t % o.period) / o.period) * Math.PI * 2 + o.phase) * (ARENA.hw - LANE_BOX.w / 2 - 0.2);
// the dark: where its front is, secs after the gun (it waits, then comes on, faster and faster)
export function surgeAt(D, secs) {
    const t = Math.max(0, secs - D.surgeAt);
    return ARENA.surgeZ0 - (D.surgeV * t + 0.5 * D.surgeA * t * t);
}

export function arenaPlan(seed, lv) {
    const r = rngFrom(seed), D = matchInfo(lv), n = D.segs, obs = [];
    // what each stretch has: a pool or a bar to start with; blades and pillars further in at higher Levels; a boost now and then
    const kinds = [];
    for (let i = 0; i < n; i++) kinds.push(i === 0 ? 'boost' : r() < 0.5 ? 'pool' : 'hurdle');
    const later = [];
    for (let i = 2; i < n; i++) later.push(i);
    for (let i = later.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), q = later[i]; later[i] = later[j]; later[j] = q; }
    let at = 0;
    for (let i = 0; i < D.blades && at < later.length; i++) kinds[later[at++]] = 'blade';
    for (let i = 0; i < (D.sliders || 0) && at < later.length; i++) kinds[later[at++]] = 'slider';
    for (let i = 0; i < D.pillars && at < later.length; i++) kinds[later[at++]] = 'pillars';
    for (let i = 0; i < Math.floor(n / 4) && at < later.length; i++) kinds[later[at++]] = 'boost';
    for (let i = 0; i < n; i++) {
        const z = segZ(i) - ARENA.seg * (0.45 + r() * 0.15), k = kinds[i];
        if (k === 'pool') { const d = 7 + r() * 3; obs.push({ kind: k, seg: i, z0: z - d / 2, z1: z + d / 2 }); }
        else if (k === 'hurdle') obs.push({ kind: k, seg: i, z, h: 2.6, d: 1.4 });
        else if (k === 'blade') obs.push({ kind: k, seg: i, z, period: 2.1 + r() * 0.8, phase: r() * 6.283 });
        else if (k === 'slider') obs.push({ kind: k, seg: i, z, period: 2.2 + r() * 0.7, phase: r() * 6.283 });
        else if (k === 'pillars') { const a = (r() - 0.5) * 4; obs.push({ kind: k, seg: i, z, list: [{ x: a - 3.2, z: z + 4 }, { x: a + 3.4, z: z - 5 }] }); }
        else obs.push({ kind: 'boost', seg: i, z, x: (r() - 0.5) * 6 });
    }
    return { seed, lv, D, n, obs, secs: D.secs, finish: finishZ(n) };
}
// the pool you're in, in your own lane (x relative to the lane's middle)
export function poolAt(plan, x, z) { for (const o of plan.obs) if (o.kind === 'pool' && z > o.z0 && z < o.z1) return o; return null; }
// where you start again after a pool: the start of its stretch
export const segStart = (i) => segZ(i) + 4;
// a lane's physics: the lane's floor and rails, its bars and pillars
const physCache = new Map();
export function arenaPhysics(spot, plan) {
    const cx = laneX(spot), key = plan.seed + ':' + spot;
    let solids = physCache.get(key);
    if (!solids) {
        solids = [];
        const box = (x, y0, y1, z, sx, sz, o) => solids.push({ min: [x - sx / 2, y0, z - sz / 2], max: [x + sx / 2, y1, z + sz / 2], ...(o || {}) });
        for (const o of plan.obs) {
            if (o.kind === 'hurdle') box(cx, 0, o.h, o.z, ARENA.hw * 2 + 1, o.d, { noStep: true });
            else if (o.kind === 'pillars') for (const p of o.list) box(cx + p.x, 0, 9, p.z, 3.2, 3.2);
        }
        if (physCache.size > 20) physCache.clear();
        physCache.set(key, solids);
    }
    const finish = plan.finish;
    return {
        solids, floor: 0,
        clamp(b) {
            if (b.x < cx - ARENA.hw) { b.x = cx - ARENA.hw; if (b.vx < 0) b.vx = 0; } else if (b.x > cx + ARENA.hw) { b.x = cx + ARENA.hw; if (b.vx > 0) b.vx = 0; }
            if (b.z > 14) { b.z = 14; if (b.vz > 0) b.vz = 0; }
            if (b.z < finish - 8) { b.z = finish - 8; if (b.vz < 0) b.vz = 0; }
        },
    };
}
export { WORLDS };

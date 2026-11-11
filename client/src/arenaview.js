// Black Hole Rush on screen: six lanes side by side down a stretch of the Keyway, each lane railed in its racer's colour and floored
// with giant keycaps in keyboard rows, the same things in every lane (rifts, barriers, pylons with lamps, wrecking arms swinging
// across, cargo pods sliding across, boost chevrons), a warp gate with a portal of light at the end. Behind the start line the black
// hole: a wall of dark as wide as the course, a burning rim round it, arms of plasma winding into it, stardust streaming in, tongues
// of it reaching ahead along the floor, coming on faster and faster.
import { T, V3, scene } from './engine.js';
import { Kit, batchKits, rng } from './geo.js';
import { buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD } from './signs.js';
import { CU } from './clock.js';
import {
    horizon, hullMaterial, propMaterial, decalQuads, energyQuads, decal, energyQuad, halo, decalMaterial, energyMaterial,
    flameMesh, bladeGeo, bladeMaterial, railRun, styleOf, lookOf, floorQuad, shade, mixC, presentMesh, stack, CASE,
} from './world.js';
import { buildJelly } from './keycaps.js';
import { CFG } from '../../shared/config.js';
import { ARENA, laneX, caneAt, laneBoxAt, LANE_BOX } from '../../shared/arena.js';

const SPOTS = CFG.matchSpots;
// a wrecking arm over a lane: its pivot's height and the boom down to its head (the head's x is caneAt * ARENA.hw from the lane's middle)
export const LANE_BLADE = { pivot: 10.6, arm: 8.6 };
// a boost pad's half size (x across, z along), round its x in the lane
export const LANE_BOOST = { hw: 3, hd: 3.2 };
// the cargo pods' shells and their bands
const POD_C = [[0xd8dee8, 0xff7a3a], [0x3a6ad8, 0x7af0ff], [0xffc21e, 0xff5a1a], [0x8a1ab8, 0xff5ac0], [0x0a6a7a, 0x3affc8], [0x4a5578, 0xffe27a]];

// The black hole: a wall of dark the width of the course, all in its shader (unlit): nothing in its middle, a white-hot rim along its
// top and its foot, arms of violet and gold plasma winding in across it, stardust streaming in, tongues of it reaching out ahead
// along the floor. The dark goes on behind it.
const HOLE = { uDeep: 0x04010c, uViolet: 0x6a1ad8, uPink: 0xff3ac0, uGold: 0xffb43a, uWhite: 0xfff0ff, uDust: 0xcfe0ff };
function surgeMesh(Wd, width, low) {
    const g = new T.PlaneGeometry(width, 52, low ? 28 : 40, low ? 12 : 16).translate(0, 26, 0).rotateY(Math.PI);
    const uniforms = { uNow: CU.uNow, uW: { value: width } };
    for (const k in HOLE) uniforms[k] = { value: new T.Color(HOLE[k]) };
    const front = new T.Mesh(g, new T.ShaderMaterial({
        uniforms,
        vertexShader: `uniform float uNow; varying vec2 vP; varying float vReach;
            void main() {
                vec3 p = position; float t = uNow;
                float n = sin(p.x * 0.21 + t * 1.7) * sin(p.y * 0.15 - t * 1.4) + 0.6 * sin(p.x * 0.06 - t * 0.9 + p.y * 0.05);
                // tongues of dark reaching ahead low down, the rim at the top curling over toward you
                float low = 1.0 - smoothstep(0.0, 10.0, p.y);
                float reach = max(0.0, sin(p.x * 0.27 + sin(p.x * 0.1 + t * 1.1) * 2.0 + t * 2.8)) * low * 6.5 + smoothstep(30.0, 52.0, p.y) * 8.0 + n * 1.8;
                p.z -= reach;
                vReach = reach; vP = p.xy;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: `uniform float uNow; uniform float uW; uniform vec3 uDeep, uViolet, uPink, uGold, uWhite, uDust; varying vec2 vP; varying float vReach;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
                float t = uNow; vec2 P = vP;
                // its ragged top
                float top = 47.0 + 3.0 * sin(P.x * 0.15 + t * 0.9) + 2.0 * sin(P.x * 0.41 - t * 1.6);
                if (P.y > top) discard;
                // from the middle of the wall: how far out, which way round
                vec2 q = vec2(P.x / (uW * 0.5), (P.y - 22.0) / 26.0);
                float r = length(q * vec2(1.0, 1.15)), an = atan(q.y, q.x * 2.2);
                // arms of plasma winding in: bright toward the rim, gone in the middle
                float arms = 0.5 + 0.5 * sin(an * 5.0 + r * 9.0 - t * 2.6 + sin(r * 5.0 - t) * 1.2);
                float fine = 0.5 + 0.5 * sin(an * 13.0 - r * 17.0 + t * 4.0);
                float rim = smoothstep(0.25, 1.0, r);
                vec3 c = mix(uDeep, uViolet, rim * (0.25 + 0.75 * arms));
                c = mix(c, uPink, rim * rim * arms * fine * 0.8);
                c = mix(c, uGold, smoothstep(0.78, 1.0, r) * (0.35 + 0.5 * arms));
                // the burning rim: along the top, and along the floor where it eats the keys
                float edgeTop = smoothstep(top - 5.0, top - 0.6, P.y), foot = 1.0 - smoothstep(0.0, 4.5, P.y);
                c = mix(c, mix(uGold, uWhite, 0.6), max(edgeTop, foot * (0.6 + 0.4 * sin(P.x * 0.6 + t * 6.0))) * 0.9);
                // stardust streaming in toward the middle
                vec2 ec = vec2(an * 6.0, r * 9.0 + t * 2.2), ci = floor(ec);
                float eh = hash(ci);
                vec2 ef = fract(ec) - vec2(0.5, 0.5 + 0.3 * sin(eh * 40.0));
                c = mix(c, uDust, step(0.9, eh) * (1.0 - smoothstep(0.05, 0.16, length(ef * vec2(1.0, 0.45)))) * smoothstep(0.2, 0.5, r));
                // the tongues running out ahead along the floor, violet-hot
                c = mix(c, uPink, smoothstep(3.0, 6.0, vReach) * (1.0 - smoothstep(0.0, 8.0, P.y)) * 0.6);
                float a = 0.97 - 0.3 * smoothstep(top - 6.0, top, P.y) * (1.0 - edgeTop);
                // seen from inside (it has the camera, at the start line on a tall screen): a thin glowing veil, not a wall
                gl_FragColor = gl_FrontFacing ? vec4(c, a) : vec4(c, 0.2);
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false, side: T.DoubleSide,
    }));
    front.renderOrder = 4;
    const bodyG = new T.BoxGeometry(width, 42, 160).translate(0, 21, 88);
    const body = new T.Mesh(bodyG, new T.MeshBasicMaterial({ color: 0x04010c, fog: false }));
    const grp = new T.Group();
    grp.add(front, body);
    grp.userData.parts = [front, body];
    void Wd;
    return grp;
}

export function buildArena(plan, w, spotsCol, low, mySpot) {
    const Wd = lookOf(w), st = styleOf(Wd), R = rng(w * 53 + 3), group = new T.Group(), signs = new Signs(4, 448, 152), one = () => 0.5;
    const fl = [], lights = [], ctx = { Wd, st, R, low, fl, lights }, D = decalQuads(), E = energyQuads();
    const S0 = new Kit(), P0 = new Kit({ glow: true }), kits = [S0], propKits = [P0];
    const L2 = ARENA.laneW / 2, hwAll = SPOTS * L2, XA = hwAll + 0.6, back = 36, end = plan.finish - 16;
    // stretches of the course, each its own kit (culled on its own)
    const SEG = 120, stretches = [];
    for (let z = back; z > end; z -= SEG) { const S = new Kit(), P = new Kit({ glow: true }); stretches.push({ z1: z, z0: Math.max(end, z - SEG), S, P }); kits.push(S); propKits.push(P); }
    const at = (z) => stretches.find((s) => z <= s.z1 && z >= s.z0) || stretches[stretches.length - 1];
    const pools = plan.obs.filter((o) => o.kind === 'pool');
    // the floor: each lane's keyboard plate in its racer's colour (yours brighter), showing between the keys; bands of it; the rifts
    // cut out
    {
        const cuts = new Set([end, back]);
        for (const o of pools) { cuts.add(o.z0); cuts.add(o.z1); }
        for (let z = Math.ceil(end / 12) * 12; z < back; z += 12) cuts.add(z);
        for (const s of stretches) cuts.add(s.z0);
        const zz = [...cuts].filter((z) => z >= end && z <= back).sort((a, b) => a - b);
        for (let i = 0; i < zz.length - 1; i++) {
            const a = zz[i], b = zz[i + 1], m = (a + b) / 2;
            if (pools.some((o) => m > o.z0 && m < o.z1)) continue;
            const K = at(m).S;
            for (let s = 0; s < SPOTS; s++) {
                const cx = laneX(s), c0 = mixC(shade(Wd.floor, 0.62), spotsCol[s], s === mySpot ? 0.5 : 0.3), c = Math.floor(m / 12) & 1 ? c0 : shade(c0, 0.9);
                floorQuad(K, cx - L2, cx + L2, a, b, 0.02, c);
            }
        }
    }
    // the rifts: a wall of the case at each edge, a line of light along it
    for (const o of pools) {
        const K = at((o.z0 + o.z1) / 2), d = o.z1 - o.z0;
        for (const z of [o.z0 + 0.2, o.z1 - 0.2]) K.S.box(0, -0.8, z, hwAll * 2, 1.6, 0.4, shade(Wd.rim, 0.8), { tile: 8 });
        decal(D, 0, 0, -0.3, (o.z0 + o.z1) / 2, hwAll, d / 2, Wd.hazard, Wd.hazard2, 1, 0);
        for (const z of [o.z0, o.z1]) K.P.box(0, 0.08, z, hwAll * 2, 0.16, 0.5, Wd.hazard2, { glow: 1, shade: 0.8 });
    }
    // the rails between the lanes: low walls of hull lit along the top in the colours either side of them, a post now and then
    for (let s = 1; s < SPOTS; s++) {
        const x = -hwAll + s * ARENA.laneW;
        for (const S of stretches) {
            const zm = (S.z0 + S.z1) / 2, len = S.z1 - S.z0;
            S.S.box(x, 0.6, zm, 0.8, 1.2, len, Wd.wall2, { tile: 8 });
            S.P.box(x - 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s - 1], { glow: 1 });
            S.P.box(x + 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s], { glow: 1 });
            for (let z = S.z1 - 12; z > S.z0 + 2; z -= low ? 48 : 24) S.S.box(x, 1.1, z, 1.1, 2.2, 1.6, Wd.wall, { tile: 8 });
        }
    }
    // the course's edges (the Keyway's own rails), the case's ends
    for (const S of stretches) for (const sx of [-1, 1]) railRun(S.S, S.P, sx, XA, S.z0, S.z1, ctx, (z) => z > back - 4);
    for (const z of [back + 1.3, end - 1.3]) S0.box(0, -CASE / 2 + 0.3, z, (XA + 2.6) * 2, CASE + 0.6, 2.6, Wd.wall2, { tile: 8 });
    // the start: a line of light across, a little gate over each lane lit inside in its racer's colour; the race's name over it all
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s), z = ARENA.startZ - 2.2;
        P0.box(cx, 0.08, z, ARENA.laneW - 1.4, 0.08, 0.7, 0xffffff, { glow: 1 });
        for (const sx of [-1, 1]) {
            S0.box(cx + sx * (L2 - 0.9), 4, z, 1.1, 8, 1.1, Wd.wall2, { tile: 8 });
            P0.box(cx + sx * (L2 - 1.48), 4, z, 0.08, 7.4, 0.6, spotsCol[s], { glow: 1 });
        }
        P0.box(cx, 8.3, z, ARENA.laneW - 1.0, 0.8, 1.2, spotsCol[s], { glow: 1 });
        P0.box(cx, 9.3, z, 1.1, 1.1, 0.4, Wd.trim, { glow: 1, rz: Math.PI / 4 });
        P0.box(cx, 0.06, ARENA.startZ + 4, 3, 0.06, 3, spotsCol[s], { glow: 1, ry: Math.PI / 4 });
    }
    signs.add([big('BLACK HOLE RUSH', GOLD, 100, '#2a0a3a'), { t: 'outrun the black hole!', c: '#ffffff', s: '#2a0a3a', px: 40 }], 26, new V3(0, 17, ARENA.startZ - 6), false, 140);
    // what's in the way, in every lane
    const blades = [], boxes = [];
    for (const o of plan.obs) {
        const K = at(o.z ?? o.z0);
        for (let s = 0; s < SPOTS; s++) {
            const cx = laneX(s);
            if (o.kind === 'hurdle') {
                // a barrier across the lane: hull, a band of its racer's colour round it, a warning line along its top
                const wd = ARENA.hw * 2 + 1;
                K.S.box(cx, (o.h - 0.3) / 2, o.z, wd, o.h - 0.3, o.d, Wd.wall2, { tile: 8 });
                K.S.box(cx, o.h - 0.15, o.z, wd + 0.2, 0.3, o.d + 0.24, Wd.wall, { tile: 8 });
                K.P.box(cx, o.h * 0.45, o.z, wd + 0.04, 0.42, o.d + 0.06, spotsCol[s], { glow: 1 });
                K.P.box(cx, o.h + 0.04, o.z, wd, 0.08, o.d * 0.6, Wd.hazard2, { glow: 1 });
            } else if (o.kind === 'pillars') {
                // pylons to weave round, a lamp on each
                for (const p of o.list) {
                    const x = cx + p.x;
                    K.S.box(x, 0.5, p.z, 3.4, 1, 3.4, Wd.wall2, { tile: 8 });
                    K.S.box(x, 4.6, p.z, 2.8, 7.2, 2.8, Wd.wall, { tile: 8 });
                    K.P.box(x, 4.6, p.z, 2.9, 1.2, 2.9, spotsCol[s]);
                    K.S.box(x, 8.6, p.z, 3.4, 0.8, 3.4, Wd.wall2, { tile: 8 });
                    K.P.box(x, 9.5, p.z, 1.3, 1.0, 1.3, st.lamp, { glow: 1, soft: !low });
                    if (!low) lights.push([x, 9.5, p.z, 2.4, st.lamp]);
                }
            } else if (o.kind === 'blade') {
                // the arm's gantry: a beam of hull across the lane on two posts, its pivot, warning marks below
                const by = LANE_BLADE.pivot + 0.7;
                K.P.box(cx, by, o.z, ARENA.laneW, 1, 1.2, Wd.wall2, {});
                for (const bx of [-3.6, 3.6]) K.P.box(cx + bx, by, o.z, 0.5, 1.12, 1.32, st.metal, {});
                for (const sx of [-1, 1]) K.S.box(cx + sx * L2, by / 2, o.z, 1.2, by + 0.6, 1.6, Wd.wall, { tile: 8 });
                K.P.box(cx, by - 0.2, o.z, 1.6, 1.4, 1.6, st.accent, { soft: true });
                for (let x = -6; x <= 6; x += 3) K.P.box(cx + x, 0.05, o.z, 1.4, 0.04, 0.35, Wd.hazard2, { glow: 1, shade: 0.8 });
                blades.push({ o, x: cx });
            } else if (o.kind === 'slider') {
                // a cargo pod sliding from rail to rail: its track, warning stripes
                const tz = LANE_BOX.d / 2 + 0.6;
                floorQuad(K.S, cx - L2, cx + L2, o.z - tz, o.z + tz, 0.05, shade(Wd.rim, 0.85));
                for (const sz2 of [-1, 1]) K.P.box(cx, 0.07, o.z + sz2 * tz, ARENA.hw * 2, 0.05, 0.35, Wd.hazard2, { glow: 1, shade: 0.85 });
                const [c1, c2] = POD_C[(boxes.length + s) % POD_C.length];
                boxes.push({ o, x: cx, c1, c2 });
            } else if (o.kind === 'boost') {
                decal(D, 1, cx + o.x, 0.09, o.z, LANE_BOOST.hw, LANE_BOOST.hd, mixC(Wd.floor, 0x000000, 0.55), mixC(spotsCol[s], 0xffffff, 0.3), 1, 0);
                K.S.box(cx + o.x, 0.04, o.z, LANE_BOOST.hw * 2 + 0.6, 0.08, LANE_BOOST.hd * 2 + 0.6, Wd.rim, { tile: 8 });
            }
        }
    }
    // the finish: a chequered band across every lane, a great warp gate over the course (two pylons banded in the sector's accent,
    // a plasma beacon on each, a lintel with lights along it), a portal of light filling it
    {
        const K = at(plan.finish), z = plan.finish, zg = z - 6, tx = hwAll + 2.6;
        for (let s = 0; s < SPOTS; s++) { const cx = laneX(s); for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) K.P.box(cx - 6 + i * 2, 0.06, z + 1.2 - j * 2.4, 2, 0.06, 2.4, (i + j) % 2 ? 0x1a1030 : 0xffffff, { glow: (i + j) % 2 ? 0 : 1 }); }
        for (const sx of [-1, 1]) {
            const x = sx * tx;
            K.S.box(x, 10, zg, 5.2, 36, 6.4, Wd.wall, { tile: 8 });
            K.P.box(x, 17.5, zg, 5.6, 3, 6.8, Wd.banner);
            K.S.box(x, 28.4, zg, 6.2, 0.8, 7.4, Wd.wall2, { tile: 8 });
            K.P.box(x - sx * 2.66, 12, zg, 0.1, 22, 1.6, Wd.trim, { glow: 1 });
            for (let j = 0; j < 4; j++) for (const d of [-1, 1]) K.P.box(x + d * 0.7, 5 + j * 3, zg + 3.26, 1.7, 0.4, 0.1, Wd.trim, { glow: 1, rz: d * 0.62 });
            K.P.box(x, 29.5, zg, 2.2, 0.9, 2.2, st.metal, {});
            fl.push([x, 30.1, zg, 2.2, st.flame]);
        }
        K.S.box(0, 25, zg, hwAll * 2 + 0.4, 4, 5, Wd.wall2, { tile: 8 });
        K.P.box(0, 27.2, zg, hwAll * 2 + 1, 0.4, 5.4, st.cap, { soft: !low });
        for (let x = -hwAll + 2, i = 0; x <= hwAll - 2; x += 4, i++) K.P.box(x, 27.7, zg, 0.6, 0.5, 0.6, st.bulbs[i % st.bulbs.length], { glow: 1 });
        K.P.box(0, 22.9, zg + 2.55, hwAll * 2, 0.4, 0.1, Wd.trim, { glow: 1 });
        energyQuad(E, 3, 0, 0.2, zg, hwAll * 2, 22.6, Wd.trim, Wd.glow, 1, 22.6 / (hwAll * 2));
        signs.add([big('FINISH!', GOLD, 118, '#3a1a00')], 24, new V3(0, 31, z - 4), false, 400);
    }
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(w * 41 + 5), back + 260, end - 200, low);
    propKits.push(...farKits);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    for (const l of lights) halo(E, l[0], l[1], l[2], l[3], l[4], 0.5);
    // The keycap floor: keyboard rows down every lane, each row staggered on the one before like a real keyboard's (0, half, three
    // quarters, a quarter of a key along), a smaller key in the sector's third colour where a row leaves room at an edge; clear of
    // what's in the way, the start and the finish. Low quality: bigger keys, fewer of them
    const KP = low ? 5.2 : 4.3, kr = low ? 2.35 : 1.9, lim = ARENA.laneW / 2 - 0.55, kg = KP - 2 * kr;
    const rowsX = (low ? [0, 0.5] : [0, 0.5, 0.75, 0.25]).map((f) => {
        const out = [];
        let lo = Infinity, hi = -Infinity;
        for (let j = -3; j <= 3; j++) { const x = (f + j) * KP; if (Math.abs(x) + kr <= lim) { out.push([x, kr, 0]); lo = Math.min(lo, x - kr); hi = Math.max(hi, x + kr); } }
        for (const [a, b] of [[-lim, lo - kg], [hi + kg, lim]]) if (b - a >= 1.7) out.push([(a + b) / 2, (b - a) / 2, 1]);
        return out;
    });
    const clearAt = (x, z, r) => {
        if (z + r > ARENA.startZ - 4.5 || z - r < plan.finish + 3) return true;
        for (const o of plan.obs) {
            if (o.kind === 'pool') { if (z + r > o.z0 - 0.6 && z - r < o.z1 + 0.6) return true; }
            else if (o.kind === 'hurdle') { if (Math.abs(z - o.z) < o.d / 2 + r + 0.4) return true; }
            else if (o.kind === 'slider') { if (Math.abs(z - o.z) < LANE_BOX.d / 2 + r + 0.6) return true; }
            else if (o.kind === 'blade') { if (Math.abs(z - o.z) < r + 1.2) return true; }
            else if (o.kind === 'pillars') { for (const p of o.list) if (Math.abs(z - p.z) < 1.8 + r && Math.abs(x - p.x) < 1.8 + r) return true; }
            else if (o.kind === 'boost') { if (Math.abs(z - o.z) < LANE_BOOST.hd + r + 0.4 && Math.abs(x - o.x) < LANE_BOOST.hw + r + 0.4) return true; }
        }
        return false;
    };
    const keys = [];
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s);
        let row = 0;
        for (let z = ARENA.startZ - 4.6 - kr; z - kr > plan.finish + 3; z -= KP, row++) {
            for (const [x, r, edge] of rowsX[row % rowsX.length]) {
                if (clearAt(x, z, r)) continue;
                keys.push({ x: cx + x, z, r, c: edge ? Wd.keys[2] : Wd.keys[R() < 0.72 ? 0 : 1] });
            }
        }
    }
    const jelly = buildJelly(group, keys, { low });
    // (a pod's geometry is 2.04 wide and deep, 1.34 high)
    const BX_ = LANE_BOX.w / 2.04, BY_ = (LANE_BOX.h - 1) / 1.08, BZ_ = LANE_BOX.d / 2.04;
    const boxM = presentMesh(boxes.map((b) => ({ x: b.x, y: 0, z: b.o.z, sx: BX_, sy: BY_, sz: BZ_, c1: b.c1, c2: b.c2 })), low, group, false, Math.max(1, boxes.length));
    boxM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- build it -----
    buildBlobs(group, () => Math.random());
    const hullMesh = batchKits(kits, hullMaterial(), true);
    if (hullMesh) group.add(hullMesh);
    const propMesh = batchKits(propKits, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, st.flame2 ?? 0xfff0b0, group);
    const bladeG = bladeGeo(Wd, LANE_BLADE.arm, 0.72), bladeM = new T.InstancedMesh(bladeG, bladeMaterial(), Math.max(1, blades.length));
    bladeM.count = blades.length;
    bladeM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    bladeM.frustumCulled = false; bladeM.castShadow = !low; bladeM.receiveShadow = true;
    group.add(bladeM);
    const surge = surgeMesh(Wd, (XA + 6.4) * 2 + 4, low);
    surge.position.set(0, 0, ARENA.surgeZ0);
    group.add(surge);
    signs.build(group);
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    const bo = new T.Object3D();
    let lastZ = NaN;
    const bm = new T.Matrix4();
    const view = {
        group, surge, blades: bladeM, jelly,
        // t: the server's seconds (the clock caneAt counts by); surgeZ: where the black hole's front is (shared/arena.js surgeAt)
        update(t, surgeZ) {
            for (let i = 0; i < blades.length; i++) {
                const b = blades[i], s = Math.max(-1, Math.min(1, caneAt(b.o, t) * ARENA.hw / LANE_BLADE.arm));
                bo.position.set(b.x, LANE_BLADE.pivot, b.o.z); bo.rotation.set(0, 0, Math.asin(s)); bo.updateMatrix();
                bladeM.setMatrixAt(i, bo.matrix);
            }
            if (blades.length) bladeM.instanceMatrix.needsUpdate = true;
            for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; bm.makeScale(BX_, BY_, BZ_).setPosition(b.x + laneBoxAt(b.o, t), 0, b.o.z); boxM.setMatrixAt(i, bm); }
            if (boxes.length) boxM.instanceMatrix.needsUpdate = true;
            if (surgeZ !== undefined && surgeZ !== lastZ) { lastZ = surgeZ; surge.position.z = surgeZ; surge.updateMatrix(); }
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            if (hullMesh) (hullMesh.isBatchedMesh ? hullMesh.dispose() : hullMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            decalGeo.dispose(); decalMat.dispose(); energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            bladeG.dispose(); bladeM.dispose();
            jelly.dispose();
            boxM.geometry.dispose(); boxM.material.dispose(); boxM.dispose();
            for (const m of surge.userData.parts) { m.geometry.dispose(); m.material.dispose(); }
            scene.remove(group);
        },
    };
    view.update(CU.uNow.value, ARENA.surgeZ0);
    void stack; void one;
    return view;
}

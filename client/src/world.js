// A sector on screen (shared/world.js has where everything stands): the Starport, a station deck floating in space (the landing pad
// you spawn on and the FREE GIFT crate by it, its treadmills, the Star Capsules, the Upgrade Lab, the Rebirth Reactor, the Worlds
// ring, the Black Hole Rush gate and the holo leaderboards) between two station modules, a rocket on its pad and a great radar dish
// beyond them, the launch gantry in the middle; through the gantry the Keyway, a giant keyboard floating north through space
// (keycaps.js), cut into stages: a warp gate at the start of each with "STAGE N" on it (a "Recommended Level" holo before it), what's
// in the way (lasers, rifts of plasma with key bridges and floating keys), and by the gate at its end a golden trophy: passing that
// gate pays the stage's Wins.
// Static things are merged per stretch (the Starport, each stage) into two batches: hull (a texture of plating) and props (lit,
// glowing, floating). Everything that glows or moves is one draw for the whole sector: the rifts, boosts, plates and belts (decals),
// portals and halos (energy), the plasma beacons, the Star Capsules, the gates' lettering; the lasers are stagefx.js's.
import { T, V3, scene, matte, texFrom, fitFont, prompts, drawLines, linesHeight } from './engine.js';
import { Kit, glowVCMaterial, nearFade, batchKits, rng } from './geo.js';
import { buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD, LIME, WHITE, RED, AQUA, PINK } from './signs.js';
import { CU } from './clock.js';
import { buildJelly, keyRows, setKeyLegend } from './keycaps.js';
import { buildStageFx, laserColors } from './stagefx.js';
import * as SW from '../../shared/world.js';
import * as SG from '../../shared/stages.js';
import * as CF from '../../shared/config.js';
// (the shared data read through their namespaces: what the stages no longer use may lose its exports while they change)
const { W, tongueBar, upgradeShed, worldsPortal, playGate, boards, wallZ, postSpot, BELT, POST_R, jbSpot, JB_R, hubFor, northEnd, endPortal, stagePlan, bladeAt, SLIDER, STAGE_TYPES } = SW;
const { SWEEP, BALL, JWALL, inRect } = SG;
const { WORLDS, WALLS_N, POSTS, JAWBREAKERS, padWins, stageName, fmt } = CF;
// the Level a stage is laid out for (its "Recommended Level" holo)
const recLevel = (w, k) => (CF.recLevel ? CF.recLevel(w, k) : k + 1);

export const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
export const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const tc = new T.Color();
const col3 = (c) => { tc.set(c); return [tc.r, tc.g, tc.b]; };
export function floorQuad(kit, x0, x1, z0, z1, y, c) { kit.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, { uv: [x0 / 8, z1 / 8, x1 / 8, z0 / 8] }); }
// the Keyway's edge: its kerb's inner face, the kerb's width, the rail's height; how deep the keyboard's case goes
export const XIN = 17.6, WT = 2.6, WH = 3.2, CASE = 7.5;
// a wrecking arm: its pivot over the way, the boom down to the middle of its head (its x is bladeAt * (halfW - 3))
export const BLADE_PIVOT = 22.4, BLADE_ARM = 20.4;

// ----- each sector's look beyond its colours (shared/config.js WORLDS has those) -----
// metal / dark: struts, frames and their shadows; lamp: the light pylons and beacons; crystal: what glows and grows; accent /
// accent2: stripes and markings; rock / rock2: asteroids, lit side and under; glowRock: what glows in their cracks (0 none);
// bulbs: strings of little lights; cap: what tops things; flame / flame2: the plasma beacons, root and tip; panel: solar panels
const STYLES = {
    orbit: { metal: 0x3c466c, dark: 0x1c2444, lamp: 0x7ae8ff, crystal: 0x7ae8ff, accent: 0xff7a3a, accent2: 0xffd23a, rock: 0x8e98b0, rock2: 0x525c7c, glowRock: 0, bulbs: [0x3ae8ff, 0xff7a3a, 0xffd23a, 0x7dff6b, 0xffffff], cap: 0xffffff, flame: 0x3ad8ff, flame2: 0xeafdff, panel: 0x2a4ac8 },
    redshift: { metal: 0x40282a, dark: 0x1e1214, lamp: 0xffb04a, crystal: 0xff8a3a, accent: 0xffd23a, accent2: 0xff5a2a, rock: 0x8a4a36, rock2: 0x44221c, glowRock: 0xff6a1a, bulbs: [0xff7a1a, 0xffd23a, 0xff3a1a, 0xffb43a], cap: 0xffc890, flame: 0xff7a1a, flame2: 0xffe8a0, panel: 0x7a3a1a },
    frost: { metal: 0x4a6a98, dark: 0x1e3458, lamp: 0x9af0ff, crystal: 0x7ae8ff, accent: 0x3a8aff, accent2: 0xffffff, rock: 0xbcd8f0, rock2: 0x6a94c0, glowRock: 0x7ae8ff, bulbs: [0x7ae8ff, 0xffffff, 0x9a8aff, 0x3affd8], cap: 0xffffff, flame: 0x7ae8ff, flame2: 0xf4ffff, panel: 0x2a5ab8 },
    esc: { metal: 0x30245a, dark: 0x140c30, lamp: 0xff7ad8, crystal: 0xff7ad8, accent: 0xff5ac0, accent2: 0xffc23a, rock: 0x4a3a8a, rock2: 0x1e1444, glowRock: 0xffc23a, bulbs: [0xffd23a, 0xff7ad8, 0x7ae8ff, 0xffffff], cap: 0xffe08a, flame: 0xd87aff, flame2: 0xffe0fa, panel: 0x5a2ab8 },
};
export const styleOf = (Wd) => STYLES[Wd.id] || STYLES.orbit;
// a sector's colours as drawn (config.js WORLDS, with a few tuned here for the look)
const LOOK = {};
export const lookOf = (w) => { const Wd = WORLDS[w] || WORLDS[0]; return LOOK[Wd.id] ? { ...Wd, ...LOOK[Wd.id] } : Wd; };

// ----- hull plating: one material for every merged block of a sector (its colour is in the vertices), a texture of station
// panels: plates in offset rows, each a little uneven in tone, a dark seam round it, lit along its top edge and shaded along its
// foot, a rivet in each corner, a vent or a hazard flash on a few; one texture tile is 8 x 8 studs (the boxes use tile: 8) -----
let hullMat = null;
function paintHull() {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), R = rng(7717);
    x.fillStyle = 'rgb(118,122,134)'; x.fillRect(0, 0, N, N);
    // four rows of plates (128 px: 2 studs high), every row offset from the last
    for (let row = 0; row < 4; row++) {
        const y0 = row * 128, h = 128;
        let at = -Math.floor(R() * 180);
        while (at < N) {
            const w = 150 + Math.floor(R() * 150), g = 218 + Math.floor(R() * 26), tint = (R() - 0.5) * 8;
            for (const dx of [0, N, -N]) {
                const bx = at + dx;
                if (bx > N || bx + w < 0) continue;
                x.save(); x.beginPath(); x.rect(bx + 3, y0 + 3, w - 6, h - 6); x.clip();
                const gr = x.createLinearGradient(0, y0, 0, y0 + h);
                gr.addColorStop(0, `rgb(${g + 14 - tint | 0},${g + 14 | 0},${g + 16 + tint | 0})`); gr.addColorStop(1, `rgb(${g - 14 - tint | 0},${g - 13 | 0},${g - 9 + tint | 0})`);
                x.fillStyle = gr; x.fillRect(bx, y0, w, h);
                const r2 = rng(Math.floor(at * 13 + row * 977) + 5);
                // brushed streaks along the plate
                for (let i = 0; i < 14; i++) { const v = r2(); x.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.16})` : `rgba(0,0,0,${(0.5 - v) * 0.12})`; x.fillRect(bx + r2() * w, y0 + r2() * h, 30 + r2() * 80, 2 + r2() * 2); }
                // lit along the top and left, shaded along the foot and right
                x.lineWidth = 5; x.strokeStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.moveTo(bx + 5, y0 + h - 7); x.lineTo(bx + 5, y0 + 5); x.lineTo(bx + w - 7, y0 + 5); x.stroke();
                x.strokeStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.moveTo(bx + w - 5, y0 + 9); x.lineTo(bx + w - 5, y0 + h - 5); x.lineTo(bx + 9, y0 + h - 5); x.stroke();
                // a rivet in each corner
                for (const [cx, cy] of [[bx + 15, y0 + 15], [bx + w - 15, y0 + 15], [bx + 15, y0 + h - 15], [bx + w - 15, y0 + h - 15]]) {
                    x.fillStyle = 'rgba(40,46,66,0.5)'; x.beginPath(); x.arc(cx, cy + 1, 4.2, 0, Math.PI * 2); x.fill();
                    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.arc(cx - 0.8, cy - 0.8, 2.6, 0, Math.PI * 2); x.fill();
                }
                const pick = r2();
                if (pick < 0.22 && w > 190) {
                    // a vent: a dark slot with louvres
                    const vx = bx + w * 0.5 - 34, vy = y0 + 44;
                    x.fillStyle = 'rgba(30,36,56,0.62)'; x.beginPath(); x.roundRect(vx, vy, 68, 40, 6); x.fill();
                    x.fillStyle = 'rgba(255,255,255,0.3)'; for (let i = 0; i < 4; i++) x.fillRect(vx + 7, vy + 6 + i * 8.5, 54, 3);
                } else if (pick < 0.36 && w > 170) {
                    // a hazard flash: slanted bars
                    x.fillStyle = 'rgba(40,46,66,0.34)';
                    for (let i = 0; i < 5; i++) { x.beginPath(); const sx0 = bx + 34 + i * 20, sy0 = y0 + h - 30; x.moveTo(sx0, sy0); x.lineTo(sx0 + 10, sy0); x.lineTo(sx0 + 18, sy0 - 14); x.lineTo(sx0 + 8, sy0 - 14); x.closePath(); x.fill(); }
                }
                x.restore();
            }
            at += w;
        }
    }
    return c;
}
export function hullMaterial() {
    if (!hullMat) {
        const map = texFrom(paintHull(), true);
        map.anisotropy = 8;
        hullMat = matte({ color: 0xffffff, vertexColors: true, map });
    }
    return hullMat;
}

// ----- custom quads: meshes whose every vertex says what it is (a decal's kind and where in it the vertex is, its colours) -----
export class Quads {
    constructor(spec) { this.spec = spec; this.d = {}; for (const [k] of spec) this.d[k] = []; this.idx = []; this.n = 0; }
    vert(v) { for (const [k, s] of this.spec) { const a = v[k], arr = this.d[k]; for (let i = 0; i < s; i++) arr.push(a ? a[i] ?? 0 : 0); } return this.n++; }
    quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
    geometry() {
        const g = new T.BufferGeometry();
        for (const [k, s] of this.spec) g.setAttribute(k, new T.Float32BufferAttribute(this.d[k], s));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}
const DECAL = [['position', 3], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
const ENERGY = [['position', 3], ['aOff', 2], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
export const decalQuads = () => new Quads(DECAL);
export const energyQuads = () => new Quads(ENERGY);
// a flat decal (kind) over x/z, its local corners -1..1 (north is -1)
export function decal(Q, kind, cx, y, cz, hx, hz, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n;
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) Q.vert({ position: [cx + sx * hx, y, cz + sz * hz], aK: [kind, sx, sz, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] });
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a portal standing up, facing +z (and its back facing -z): an oval vortex w x h, its bottom at y0
export function portalDecal(Q, cx, y0, cz, w, h, c1, c2) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h;
    decalUp(Q, 6, [x0, y0, cz], [x1, y0, cz], [x1, y1, cz], [x0, y1, cz], c1, c2, 1, h / w);
    decalUp(Q, 6, [x1, y0, cz - 0.04], [x0, y0, cz - 0.04], [x0, y1, cz - 0.04], [x1, y1, cz - 0.04], c1, c2, 1, h / w);
}
// a decal standing up: corners a (bottom left), b (bottom right), c (top right), d (top left) as seen from its front
export function decalUp(Q, kind, a, b, c, d, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), i = Q.n;
    [[a, -1, 1], [b, 1, 1], [c, 1, -1], [d, -1, -1]].forEach(([p, u, v]) => Q.vert({ position: p, aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }));
    Q.quad(i, i + 1, i + 2, i + 3);
    return i;
}
// energy: a standing quad facing +z (or turned by ry), local 0..1 across and up
export function energyQuad(Q, kind, cx, y0, cz, w, h, c1, c2, on, aux, ry) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n, ca = Math.cos(ry || 0), sa = Math.sin(ry || 0);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const lx = (u - 0.5) * w; Q.vert({ position: [cx + lx * ca, y0 + v * h, cz - lx * sa], aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a halo: a soft glow turned to the camera (in the shader), r its size
export function halo(Q, x, y, z, r, c, k) {
    const C = col3(c), b = Q.n;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Q.vert({ position: [x, y, z], aOff: [u * r, v * r], aK: [4, u, v, k ?? 1], aC1: C, aC2: C, aOn: [1] });
    Q.quad(b, b + 1, b + 2, b + 3);
}
// a geometry's triangles into energy quads (beams, rings): its uv as the local coordinates
export function energyGeo(Q, g, kind, m4, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), p = g.attributes.position, uv = g.attributes.uv, b = Q.n, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m4); Q.vert({ position: [v.x, v.y, v.z], aK: [kind, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    if (g.index) for (let i = 0; i < g.index.count; i++) Q.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) Q.idx.push(b + i);
    return b;
}
const FOG_V = '#include <fog_pars_vertex>', FOG_F = '#include <fog_pars_fragment>';
// The floor's lights, unlit, in one draw: rifts (each world's own), boost chevrons, Win Pads, rune circles, treadmill belts
// and their screens. aK.x: the kind, aK.yz: where in it, aK.w: a spare number; aOn: on (a pad ready, a belt open)
export function decalMaterial(Wd, low) {
    const mode = { orbit: 0, redshift: 1, frost: 2, esc: 3 }[Wd.id] ?? 0;
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uMode: { value: mode }, uLow: { value: low ? 1 : 0 } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow; uniform float uMode; uniform float uLow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_F}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float rr(vec2 q, vec2 b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
            void main() {
                float k = vK.x, t = uNow; vec2 q = vK.yz; vec3 c = vec3(0.0);
                if (k < 0.5) {
                    // a rift: rift water, lava, icy water or the void, its edge lit
                    vec2 p = vW.xz;
                    float edge = smoothstep(0.86, 1.0, abs(q.y)) + smoothstep(0.97, 1.0, abs(q.x)) * vK.w;
                    // a slow swirl and bubbles rising and popping
                    float n = sin(p.x * 0.33 + t * 0.7 + sin(p.y * 0.29 + t * 0.4) * 2.0) * sin(p.y * 0.41 - t * 0.5 + sin(p.x * 0.23) * 1.5);
                    vec2 g = floor(p * 0.45), f = fract(p * 0.45) - 0.5; float h = hash(g), ph = fract(t * 0.45 + h);
                    float bub = (1.0 - smoothstep(0.05 + 0.22 * ph, 0.09 + 0.24 * ph, length(f - (vec2(hash(g + 1.3), hash(g + 2.7)) - 0.5) * 0.3))) * step(0.55, h);
                    // a glossy streak drifting over it (painted, not a reflection)
                    float gloss = smoothstep(0.86, 1.0, sin(p.x * 0.16 + p.y * 0.11 - t * 0.9 + sin(p.y * 0.07) * 2.0));
                    if (uMode < 0.5) {
                        // rift water: deep blue, light rippling over it (painted caustics), a little foam
                        float cs = abs(sin(p.x * 0.42 + t * 1.1 + sin(p.y * 0.37 + t * 0.7) * 1.8) * sin(p.y * 0.45 - t * 0.9 + sin(p.x * 0.31) * 1.6));
                        c = mix(vC1 * 0.6, vC1 * 1.0, smoothstep(-0.7, 0.9, n));
                        c += mix(vC2, vec3(1.0), 0.4) * smoothstep(0.55, 0.95, cs) * 0.4;
                        bub *= 0.0;
                    } else if (uMode < 1.5) {
                        // lava: a dark crust broken into plates, glowing orange-yellow in the cracks, a slow churn of brighter lava
                        vec2 lp = p * 0.16 + vec2(sin(t * 0.13 + p.y * 0.02), t * 0.05);
                        vec2 li = floor(lp), lf = fract(lp) - 0.5;
                        float plate = max(abs(lf.x), abs(lf.y)) + 0.12 * sin(li.x * 5.0 + li.y * 3.0 + lf.x * 4.0);
                        float crack = smoothstep(0.34, 0.47, plate);
                        vec3 hot = mix(vC1, vC2, smoothstep(-0.4, 0.9, n) * 0.8 + 0.2 * sin(t * 2.0 + p.x * 0.3));
                        c = mix(vec3(0.14, 0.06, 0.04) + vC1 * 0.12, hot * 1.25, max(crack, smoothstep(0.55, 0.95, n) * 0.55));
                    } else if (uMode < 2.5) {
                        // icy water: bright blue, slabs of ice drifting
                        float w = sin(p.x * 0.3 + t * 0.8) * sin(p.y * 0.25 - t * 0.6);
                        c = mix(vC1 * 0.75, vC1 * 1.2, 0.5 + 0.5 * w);
                        vec2 gi = p * 0.18 + vec2(0.0, t * 0.04); vec2 id = floor(gi), fi = fract(gi) - 0.5;
                        float ice = step(0.6, hash(id)) * (1.0 - smoothstep(0.26, 0.3, max(abs(fi.x), abs(fi.y)) + 0.08 * sin(id.x * 7.0 + fi.y * 9.0)));
                        c = mix(c, mix(vC2, vec3(1.0), 0.6), ice * 0.85);
                    } else {
                        // the void: a starry abyss, violet mist turning, stars twinkling far below
                        c = mix(vC1 * 0.9, vC2 * 0.55, smoothstep(0.1, 1.0, n) * 0.8);
                        vec2 gs = floor(p * 1.4); float st = step(0.965, hash(gs)) * (0.5 + 0.5 * sin(t * 3.0 + hash(gs + 4.0) * 30.0));
                        c += vec3(1.0, 0.9, 0.7) * st * 0.9;
                    }
                    c = mix(c, mix(vC2, vec3(1.0), 0.5), bub * (1.0 - ph) * 0.8);
                    c += vec3(1.0) * gloss * 0.22;
                    c = mix(c, mix(vC2, vec3(1.0), 0.35) * 1.15, clamp(edge, 0.0, 1.0) * 0.8);
                } else if (k < 1.5) {
                    // a boost pad: chevrons running north, a bright frame
                    float d = rr(q, vec2(1.0), 0.25);
                    if (d > 0.0) discard;
                    float f = fract((q.y + abs(q.x) * 0.55) * 1.4 + t * 1.8);
                    float chev = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.42, 0.5, f)) * step(abs(q.x), 0.78);
                    c = mix(vC1, vC2, chev);
                    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 0.04, -d - 0.08)) * 0.9);
                    c = mix(c, vC1 * 0.6, 1.0 - smoothstep(0.0, 0.03, -d));
                    c *= 1.0 + 0.15 * sin(t * 6.0);
                } else if (k < 2.5) {
                    // a Win Pad: a gold plate, rays turning under a pulse of light, a green rim (grey while it cools down)
                    vec2 vP = q;
                    float d = rr(vP, vec2(0.92), 0.2), r = length(vP), a = atan(vP.y, vP.x);
                    if (d > 0.0) discard;
                    c = mix(vec3(1.0, 0.36, 0.01), vec3(1.0, 0.62, 0.03), smoothstep(0.1, 0.9, r));
                    c = mix(c, vec3(1.0, 0.85, 0.22), smoothstep(0.6, 0.85, sin(a * 8.0 - t * 1.3)) * 0.5 * (1.0 - smoothstep(0.2, 0.92, r)));
                    c = mix(c, vec3(1.0, 0.95, 0.55), smoothstep(0.1, 0.0, abs(fract(r - t * 0.45) - 0.5)) * 0.42);
                    c = mix(c, vec3(0.08, 0.8, 0.1), smoothstep(-0.1, -0.08, d));
                    c = mix(c, vec3(1.0), smoothstep(-0.05, -0.03, d));
                    c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.62, c, vOn);
                } else if (k < 3.5) {
                    // a ring on the floor: two rings, a band of little keycaps turning between them; in the middle a compass rose (the
                    // spawn), nothing (aux + 2: a laser's danger ring, its band bold flashing dashes) or a keycap emblem (aux + 4: a chest's
                    // stand). aux & 1: the band turns the other way
                    float r = length(q);
                    if (r > 1.0) discard;
                    float vr = floor(vK.w * 0.5 + 0.01), dir = mod(vK.w, 2.0) > 0.5 ? -1.0 : 1.0;
                    float ring = smoothstep(0.035, 0.0, abs(r - 0.96)) + smoothstep(0.03, 0.0, abs(r - 0.72));
                    float ga = atan(q.y, q.x) + t * 0.15 * dir, seg = ga * 16.0 / 6.2832, f = fract(seg) - 0.5, band = step(0.75, r) * step(r, 0.93), mark;
                    if (vr > 0.5 && vr < 1.5) mark = step(0.8, r) * step(r, 0.89) * step(abs(f), 0.22) * (0.5 + 0.3 * sin(t * 6.0));
                    else { float kd = rr(vec2(f * 0.33, r - 0.84), vec2(0.105, 0.065), 0.03); mark = band * (smoothstep(0.016, 0.0, abs(kd)) + step(kd, -0.035) * 0.4); }
                    float rose = 0.0, side = 0.0, emb = 0.0;
                    if (vr < 0.5) {
                        // the compass rose: four long points (north, east, south, west), four short ones between, each lit on one side
                        for (int i = 0; i < 8; i++) {
                            float a0 = float(i) * 0.7854, L = mod(float(i), 2.0) < 0.5 ? 0.68 : 0.42;
                            vec2 d0 = vec2(cos(a0), sin(a0));
                            float u = dot(q, d0), v = dot(q, vec2(-d0.y, d0.x));
                            if (u > 0.0 && u < L && abs(v) < L * 0.2 * (1.0 - u / L) && (rose < 0.5 || L > 0.5)) { rose = 1.0; side = step(0.0, v); }
                        }
                        ring += smoothstep(0.025, 0.0, abs(r - 0.42)) * 0.7 + (1.0 - smoothstep(0.04, 0.06, r));
                    } else if (vr > 1.5) {
                        // a keycap emblem: a big rounded square, a smaller one filled inside it
                        emb = smoothstep(0.025, 0.0, abs(rr(q, vec2(0.36), 0.1))) + step(rr(q - vec2(0.0, 0.03), vec2(0.25), 0.08), 0.0) * 0.5;
                    }
                    float v = clamp(ring + mark + rose + emb, 0.0, 1.0);
                    if (v < 0.06) discard;
                    c = mix(vC1 * 0.7, mix(vC1, vec3(1.0), 0.45) * 1.2, v);
                    if (rose > 0.5) c = mix(vC1 * 0.8, mix(vC1, vec3(1.0), 0.7), side);
                    c *= 0.9 + 0.1 * sin(t * 2.0 + r * 6.0);
                } else if (k < 4.5) {
                    // a treadmill's belt: slats running back, the edges lit in its colour (a shut one: still, dark, its lights red)
                    float run = vOn, sl = fract(q.y * 7.0 - t * 1.6 * run);
                    c = mix(vec3(0.06, 0.065, 0.09), vec3(0.16, 0.17, 0.22), smoothstep(0.0, 0.06, sl) * (1.0 - smoothstep(0.85, 0.92, sl)));
                    float side = smoothstep(0.8, 0.86, abs(q.x));
                    float dash = step(0.5, fract(q.y * 4.0 - t * 1.6 * run));
                    vec3 acc = mix(vec3(1.0, 0.18, 0.12), vC2, run);
                    c = mix(c, acc * (0.7 + 0.5 * dash), side);
                    float chev = fract((q.y + abs(q.x) * 0.5) * 2.0 + t * 0.6 * run);
                    c += acc * 0.18 * smoothstep(0.0, 0.05, chev) * (1.0 - smoothstep(0.18, 0.25, chev)) * step(abs(q.x), 0.5);
                    c *= mix(0.55, 1.0, run);
                } else if (k > 6.5) {
                    // ice: pale blue, frosted, long streaks of shine sliding over it, sparkles, cracks
                    vec2 p = vW.xz;
                    float n = sin(p.x * 0.11 + sin(p.y * 0.07) * 2.0) * sin(p.y * 0.09 + p.x * 0.03);
                    c = mix(vec3(0.62, 0.82, 0.97), vec3(0.86, 0.95, 1.0), 0.5 + 0.5 * n);
                    float streak = smoothstep(0.9, 1.0, sin(p.x * 0.2 + p.y * 0.35 - t * 0.6));
                    c += vec3(1.0) * streak * 0.25;
                    vec2 cg = abs(fract(p * 0.08 + 0.3 * sin(p.yx * 0.05)) - 0.5);
                    c = mix(c, vec3(0.5, 0.7, 0.9), smoothstep(0.47, 0.5, max(cg.x, cg.y)) * 0.6);
                    vec2 sg = floor(p * 1.6); c += vec3(1.0) * step(0.985, hash(sg)) * (0.5 + 0.5 * sin(t * 4.0 + hash(sg + 3.0) * 20.0)) * 0.7;
                    c = mix(c, vec3(1.0), smoothstep(0.9, 1.0, abs(q.x)) * 0.5);
                } else if (k > 5.5) {
                    // a portal: a vortex of its two colours turning in an oval, a white-hot eye, a glowing rim (aux: its height over width)
                    vec2 d = vec2(q.x, -q.y);
                    float r = length(d);
                    if (r > 1.0) discard;
                    vec2 p = vec2(d.x, d.y * vK.w);
                    float pr = length(p), an = atan(p.y, p.x), tw = an + pr * 3.2 - t * 1.6;
                    float arms = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(tw * 3.0)), fine = 0.5 + 0.5 * sin(an * 7.0 - pr * 11.0 + t * 3.1);
                    float lip = smoothstep(0.35, 0.5, abs(fract(tw * 3.0 / 6.2832) - 0.5));
                    c = mix(vC1 * 0.28, vC1 * 1.05, arms);
                    c = mix(c, vC2, arms * fine * 0.5);
                    c = mix(c, mix(vC2, vec3(1.0), 0.4), (1.0 - lip) * arms * 0.5);
                    c = mix(c, vec3(1.0), smoothstep(0.55, 0.0, pr) * 0.8);
                    c = mix(c, vC2 * 1.25, smoothstep(0.82, 0.97, r));
                    c *= 0.92 + 0.12 * sin(t * 2.0 + pr * 4.0);
                } else {
                    // a treadmill's screen: bars bouncing to a beat, a frame (shut: a red cross)
                    vec2 p = vec2(q.x, -q.y) * 0.5 + 0.5;
                    float fr = step(0.92, max(abs(q.x), abs(q.y)));
                    float col = floor(p.x * 7.0), h = 0.25 + 0.6 * abs(sin(t * (2.0 + hash(vec2(col, vK.w)) * 3.0) + col * 1.7));
                    float bar = step(p.y * 1.1, h) * step(0.15, fract(p.x * 7.0)) * step(fract(p.x * 7.0), 0.85) * step(0.12, p.y);
                    c = mix(vec3(0.03, 0.04, 0.08), vC2 * mix(0.7, 1.25, p.y), bar * vOn);
                    float x1 = smoothstep(0.1, 0.0, abs(q.x - q.y)) + smoothstep(0.1, 0.0, abs(q.x + q.y));
                    c = mix(c, vec3(1.0, 0.2, 0.15), x1 * step(abs(q.x), 0.6) * (1.0 - vOn));
                    c = mix(c, vC1, fr);
                }
                gl_FragColor = vec4(c, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
}
// Light that's added on top, unlit, in one draw: gate barriers, the beams over Win Pads, the launch gantry's ring, portals and the halos
// round every flame. aOn 0: a barrier is gone, a beam dim
export function energyMaterial() {
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aOff; attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn; uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                if (aK.x < 0.5 && aOn < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                if (aK.x > 3.5) mvPosition.xy += aOff * (1.0 + 0.1 * sin(uNow * 9.0 + wp.x * 1.7 + wp.z * 0.9) * aK.w);
                vD = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_F}
            void main() {
                float k = vK.x, t = uNow, a = 0.0; vec2 q = vK.yz; vec3 c = vC1;
                if (k < 0.5) {
                    // a gate's barrier: a lattice of light flowing up, bright at its edges, a lock in the middle
                    vec2 p = vec2(q.x * vK.w, q.y * 22.0);
                    vec2 g = p * vec2(0.26, 0.3) + vec2(0.0, -t * 0.25); g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g) - 0.5;
                    float line = 1.0 - smoothstep(0.0, 0.035, abs(abs(f.x) + abs(f.y) - 0.5));
                    float flow = 0.5 + 0.5 * sin(p.y * 0.5 - t * 3.2 + sin(p.x * 0.35 + t) * 2.0);
                    float streak = pow(0.5 + 0.5 * sin(p.x * 1.1 + sin(p.y * 0.15 - t * 0.7) * 2.0), 10.0) * (0.5 + 0.5 * sin(p.y * 0.35 - t * 5.0));
                    float edge = smoothstep(0.9, 1.0, abs(q.x * 2.0 - 1.0)) + smoothstep(0.93, 1.0, q.y);
                    float foot = smoothstep(0.12, 0.0, q.y);
                    vec2 lc = vec2((q.x - 0.5) * vK.w, (q.y - 0.42) * 22.0); float lr = length(lc);
                    float lock = smoothstep(0.35, 0.0, abs(lr - 3.2)) + smoothstep(0.3, 0.0, abs(length(vec2(lc.x, max(0.0, lc.y - 2.2))) - 1.5)) * step(2.2, lc.y)
                        + (1.0 - smoothstep(0.5, 0.65, length(lc - vec2(0.0, 0.4)))) + step(abs(lc.x), 0.28) * step(-1.4, lc.y) * step(lc.y, 0.4);
                    lock = clamp(lock, 0.0, 1.0) * (0.7 + 0.3 * sin(t * 3.0));
                    c = mix(vC1, vC2, flow * 0.45 + line * 0.55 + edge * 0.5);
                    float near = smoothstep(0.55, 1.0, max(abs(q.x * 2.0 - 1.0), q.y)) + foot;
                    a = 0.04 + line * (0.07 + 0.1 * flow + 0.25 * near) + streak * 0.22 + edge * 0.65 + foot * 0.4 + lock * 0.85;
                    a *= 0.85 + 0.15 * sin(t * 2.3 + q.x * 9.0);
                } else if (k < 1.5) {
                    // a beam of light up from a Win Pad (dim while it cools down)
                    a = pow(1.0 - q.y, 1.3) * (0.7 + 0.2 * sin(t * 3.0 - q.y * 22.0)) * smoothstep(10.0, 34.0, vD) * (0.2 + 0.8 * vOn);
                    c = mix(vC1, vC2, q.y);
                } else if (k < 2.5) {
                    // the launch gantry's ring of energy, swirling round inside the stone
                    if (vW.y < 0.05) discard;
                    float sw = 0.5 + 0.5 * sin(q.x * 6.2832 * 7.0 + q.y * 6.0 - t * 2.4);
                    float sw2 = 0.5 + 0.5 * sin(q.x * 6.2832 * 13.0 - q.y * 4.0 + t * 3.6);
                    c = mix(vC1, vC2, sw * 0.6 + sw2 * 0.4);
                    a = smoothstep(0.0, 0.7, q.y) * (0.35 + 0.65 * sw * sw2 + 0.4 * smoothstep(0.82, 1.0, q.y));
                    a *= smoothstep(1.0, 0.94, q.y);
                } else if (k < 3.5) {
                    // a portal: a swirl round a bright middle
                    // (aux: its height over its width; a wide one is a curtain of light, a tall one an oval)
                    vec2 d = (q - 0.5) * 2.0, p = vec2(d.x, d.y * vK.w);
                    float r = vK.w < 0.6 ? max(abs(d.x) * 0.92, abs(d.y)) : length(d), pr = length(p) * (vK.w < 0.6 ? 1.0 : 1.3), an = atan(p.y, p.x);
                    float sw = sin(an * 4.0 + pr * 7.0 - t * 3.5) * 0.5 + 0.5, sw2 = sin(an * 7.0 - pr * 5.0 + t * 2.1) * 0.5 + 0.5;
                    if (vK.w < 0.6) { sw = 0.5 + 0.5 * sin(d.x * 9.0 + sin(d.y * 3.0 + t) * 2.0 - t * 2.5); sw2 = 0.5 + 0.5 * sin(d.y * 6.0 - t * 3.0 + d.x * 4.0); }
                    c = mix(vC1, vC2, sw * 0.7 + sw2 * 0.3);
                    c = mix(c, vec3(1.0), smoothstep(0.4, 0.0, pr) * 0.4);
                    a = (1.0 - smoothstep(0.82, 1.0, r)) * (0.3 + 0.35 * sw + 0.25 * smoothstep(0.6, 0.95, r));
                } else {
                    // a halo round a flame
                    float r = length(q);
                    a = pow(max(0.0, 1.0 - r), 2.2) * 0.42 * (0.85 + 0.15 * sin(t * 7.0 + vW.x * 3.0)) * smoothstep(3.0, 9.0, vD);
                }
                #ifdef USE_FOG
                a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
                #endif
                if (a < 0.004) discard;
                gl_FragColor = vec4(c * a, 1.0);
                #include <colorspace_fragment>
            }`,
        fog: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
}
// a portal on its own (a race's finish): a swirl in a w x h plane
export function portalMesh(w, h, c1, c2) {
    const Q = energyQuads();
    energyQuad(Q, 3, 0, -h / 2, 0, w, h, c1, c2, 1, h / w);
    const mesh = new T.Mesh(Q.geometry(), energyMaterial());
    mesh.renderOrder = 3;
    return mesh;
}

// ----- flames: every torch and brazier of a world, one draw. Three chunky tongues each, flickering in the shader -----
function flameGeo() {
    const pos = [], aP = [], parts = [[0, 0, 0, 0.55, 1.75, 0, 0.3], [0.16, 0.12, 0.08, 0.4, 1.25, 1, 1.1], [-0.15, 0.18, -0.1, 0.34, 1.05, 1, 2.1], [0, 0.3, 0, 0.2, 0.8, 2, 0.7]];
    for (const [ox, oy, oz, r, h, part, rot] of parts) {
        const ring = [];
        for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; ring.push([ox + Math.cos(a) * r, oy + h * 0.32, oz + Math.sin(a) * r]); }
        const bot = [ox, oy, oz], top = [ox, oy + h, oz];
        for (let i = 0; i < 4; i++) {
            const a = ring[i], b = ring[(i + 1) % 4];
            pos.push(...top, ...b, ...a, ...bot, ...a, ...b);
            aP.push(part, 1, part, 0.32, part, 0.32, part, 0, part, 0.32, part, 0.32);
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new T.Float32BufferAttribute(aP, 2));
    return g;
}
export function flameMesh(list, tip, parent) {
    if (!list.length) return null;
    const m = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uTip: { value: new T.Color(tip) } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aP; uniform float uNow; uniform vec3 uTip; varying vec3 vC;
            ${FOG_V}
            void main() {
                vec3 ip = instanceMatrix[3].xyz; float sd = ip.x * 1.7 + ip.z * 0.9 + ip.y;
                vec3 p = position;
                p.y *= 1.0 + 0.17 * sin(uNow * 11.0 + sd + aP.x * 2.1) + 0.08 * sin(uNow * 17.0 + sd * 1.3);
                p.x += sin(uNow * 6.0 + sd + aP.x) * 0.13 * p.y; p.z += cos(uNow * 5.0 + sd) * 0.09 * p.y;
                vC = mix(instanceColor * 0.95, uTip, clamp(pow(aP.y, 1.6) * 0.75 + aP.x * 0.22, 0.0, 1.0)) * 1.15;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `varying vec3 vC;
            ${FOG_F}
            void main() { gl_FragColor = vec4(vC, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, side: T.DoubleSide,
    });
    const g = flameGeo(), mesh = new T.InstancedMesh(g, m, list.length), o = new T.Object3D(), c = new T.Color();
    list.forEach((f, i) => { o.position.set(f[0], f[1], f[2]); o.rotation.set(0, (f[0] * 7 + f[2]) % 6.28, 0); o.scale.setScalar(f[3]); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c.set(f[4])); });
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
}

// ----- Star Capsules and cargo pods. One geometry each; aP says which part a vertex is (0 the shell, 1 the bands, 2 what glows),
// and each instance has its two colours (instanceColor the shell, aB the bands and the glow). The Star Capsules in the Starport turn
// slowly and bob over their stands (spin 1); the cargo pods sliding across a race's lanes don't (spin 0) -----
const SHELL = 0x00ff00, BAND = 0xff0000, GLOWP = 0x0000ff;
function partGeo(k) {
    const g = k.geometry(), col = g.attributes.color, n = col.count, part = new Float32Array(n);
    // which part: its strongest channel; then the colour is just its shading
    for (let i = 0; i < n; i++) { const r = col.getX(i), gg = col.getY(i), b = col.getZ(i); part[i] = b > r && b > gg ? 2 : r > gg ? 1 : 0; const sh = Math.max(r, gg, b); col.setXYZ(i, sh, sh, sh); }
    g.setAttribute('aP', new T.BufferAttribute(part, 1));
    return g;
}
// a capsule: an egg standing on a foot ring, a band round its belly and its shoulders, a glowing window, a cap with a little aerial
function capsuleGeo(low) {
    const k = new Kit(), n = low ? 7 : 10, one = () => 0.5;
    stack(k, 0, 0, [[0.5, 0, BAND], [0.66, 0.1, BAND], [0.9, 0.36, SHELL], [1.0, 0.8, SHELL], [0.95, 1.22, SHELL], [0.72, 1.6, SHELL], [0.4, 1.84, SHELL]], n, one);
    stack(k, 0, 0, [[1.04, 0.7, BAND], [1.04, 0.9, BAND]], n, one);
    stack(k, 0, 0, [[0.78, 1.5, BAND], [0.74, 1.62, BAND]], n, one);
    stack(k, 0, 0, [[0.42, 1.82, BAND], [0.3, 1.98, BAND]], n, one);
    k.box(0, 2.16, 0, 0.1, 0.4, 0.1, BAND); k.box(0, 2.42, 0, 0.22, 0.22, 0.22, GLOWP);
    // the window, front and back; a row of lights round the belly band
    for (const sz of [1, -1]) k.box(0, 1.14, sz * 0.9, 0.62, 0.5, 0.3, GLOWP, { soft: !low });
    if (!low) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; k.box(Math.cos(a) * 1.05, 0.8, Math.sin(a) * 1.05, 0.14, 0.12, 0.14, GLOWP, { ry: -a }); }
    return partGeo(k);
}
// a cargo pod: a ribbed container, a lit stripe round it (as wide and deep as 2.04, 1.34 high: a race scales it to its lane)
function crateGeo(low) {
    const k = new Kit();
    k.box(0, 0.67, 0, 1.9, 1.3, 1.9, SHELL, { soft: !low });
    for (const s of [-1, 1]) { k.box(s * 0.62, 0.67, 0, 0.2, 1.34, 2.0, BAND); k.box(0, 0.67, s * 0.62, 2.0, 1.34, 0.2, BAND); }
    k.box(0, 0.1, 0, 2.04, 0.2, 2.04, BAND); k.box(0, 1.26, 0, 2.04, 0.16, 2.04, BAND);
    k.box(0, 0.67, 0, 2.02, 0.14, 2.02, GLOWP);
    if (!low) for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 0.95, 0.67, sz * 0.95, 0.2, 1.36, 0.2, BAND);
    return partGeo(k);
}
function podMaterial(spin, key) {
    const m = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        const rot = spin ? 'float ca = cos(uNow * 0.55 + instanceMatrix[3].x), sa = sin(uNow * 0.55 + instanceMatrix[3].x); mat2 Rr = mat2(ca, -sa, sa, ca);' : '';
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aP; attribute vec3 aB; uniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <beginnormal_vertex>', spin ? `#include <beginnormal_vertex>\n{ ${rot} objectNormal.xz = Rr * objectNormal.xz; }` : '#include <beginnormal_vertex>')
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvP = aP; vB = aB; vLp = position; vSh = color.r; ${spin ? `{ ${rot} transformed.xz = Rr * transformed.xz; transformed.y += sin(uNow * 1.4 + instanceMatrix[3].x) * 0.12; }` : ''}`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <color_fragment>', `#include <color_fragment>
// the shell: the instance's colour, panel seams round it; the bands: their own colour, a sheen line across them (painted); the glow
float seam = smoothstep(0.9, 0.97, fract(vLp.y * 2.6 + 0.2)) * step(vP, 0.5);
vec3 shell = diffuseColor.rgb * (1.0 - 0.22 * seam);
vec3 band = vSh * vB * (1.0 + 0.35 * smoothstep(0.75, 1.0, sin(vLp.x * 7.0 + vLp.y * 5.0 + vLp.z * 7.0)));
float glw = step(1.5, vP);
diffuseColor.rgb = vP < 0.5 ? shell : glw > 0.5 ? mix(vB, vec3(1.0), 0.45) * (0.85 + 0.15 * sin(uNow * 3.0 + vLp.y * 4.0)) : band;
if (length(vViewPosition) < 10.0) { float dk = 1.0 - smoothstep(5.0, 10.0, length(vViewPosition)); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (0.14 + 0.2 * step(0.5, vP) + 0.75 * glw);`);
    };
    m.customProgramCacheKey = () => key;
    return m;
}
// a sector of them in one draw: list [{ x, y, z, s (size), c1 (shell), c2 (bands), ry }]; spin: Star Capsules (turning), else cargo
// pods; cap: room for more (moving ones)
export function presentMesh(list, low, parent, spin, cap) {
    const g = spin ? capsuleGeo(low) : crateGeo(low), n = Math.max(1, cap ?? list.length), B = new Float32Array(n * 3), c = new T.Color();
    g.setAttribute('aB', new T.InstancedBufferAttribute(B, 3));
    const mesh = new T.InstancedMesh(g, podMaterial(spin, spin ? 'sbe-capsule' : 'sbe-pod'), n), o = new T.Object3D();
    // (the instance colour has to be there before the program is built: the shader reads it)
    mesh.setColorAt(0, c.set(0xffffff));
    list.forEach((J, i) => {
        o.position.set(J.x, J.y, J.z); o.rotation.set(0, J.ry || 0, 0); o.scale.set(J.sx ?? J.s, J.sy ?? J.s, J.sz ?? J.s); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c.set(J.c1)); c.set(J.c2); B[i * 3] = c.r; B[i * 3 + 1] = c.g; B[i * 3 + 2] = c.b;
    });
    mesh.count = list.length;
    mesh.frustumCulled = false; mesh.castShadow = !low; mesh.receiveShadow = !low;
    parent.add(mesh);
    return mesh;
}
// ----- a wrecking arm: a boom of hull segments from its pivot (local 0, 0, 0), a heavy head swinging across x: a dark pod in a
// collar of the sector's accent, a wedge of hard light either side (the way it swings), a lamp in its face -----
export function bladeGeo(Wd, armLen, scale) {
    const k = new Kit({ glow: true }), L = armLen, s = scale || 1, st = styleOf(Wd);
    k.box(0, -0.4, 0, 1.8 * s, 1.4 * s, 1.8 * s, st.metal, { soft: true });
    const rl = L - 2.6 * s, segs = Math.max(4, Math.round(rl / 2.4)), sl = rl / segs;
    for (let i = 0; i < segs; i++) {
        const y = -1.1 - (i + 0.5) * sl, w = (i % 2 ? 0.46 : 0.7) * s;
        k.box(0, y, 0, w, sl + 0.04, w, i % 2 ? st.metal : Wd.wall2);
        if (i % 2 === 0) for (const sz of [1, -1]) k.box(0, y, sz * (w / 2 + 0.03), 0.22 * s, 0.22 * s, 0.06, Wd.trim, { glow: 1 });
    }
    k.box(0, -L, 0, 2.5 * s, 2.7 * s, 1.5 * s, st.dark, { soft: true });
    k.box(0, -L, 0, 2.9 * s, 0.9 * s, 1.7 * s, Wd.banner, { soft: true });
    for (const sx of [-1, 1]) {
        k.box(sx * 1.95 * s, -L, 0, 1.5 * s, 1.5 * s, 0.5 * s, 0xf4f8ff, { glow: 1, rz: Math.PI / 4 });
        k.box(sx * 2.55 * s, -L, 0, 0.8 * s, 0.8 * s, 0.34 * s, 0xffffff, { glow: 1, rz: Math.PI / 4 });
    }
    for (const sz of [1, -1]) k.box(0, -L, sz * 0.8 * s, 0.8 * s, 0.8 * s, 0.12 * s, Wd.trim, { glow: 1, rz: Math.PI / 4 });
    return k.geometry();
}
const propMats = new Map();
// the props' material of a scene (shared by the wrecking arms' instances: the same program as the batches)
export function propMaterial() { let m = propMats.get(0); if (!m) { m = glowVCMaterial(CU.uNow); propMats.set(0, m); } return m; }
// the arms: the props' material, dissolving in a fine checker as one swings close to the camera (in a lane it would fill the screen)
export function bladeMaterial() {
    let m = propMats.get(1);
    if (!m) { m = nearFade(glowVCMaterial(CU.uNow), 'sbe-arm', 6, 13); propMats.set(1, m); }
    return m;
}

// ----- leaderboards: three holo screens on one texture, one draw -----
function boardAtlas() {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 600;
    return { c, t: texFrom(c), keys: ['', '', ''] };
}
function drawBoard(A, i, title, rows, Wd) {
    const key = JSON.stringify(rows || []);
    if (key === A.keys[i]) return;
    A.keys[i] = key;
    const x = A.c.getContext('2d'), Wb = 768, H = 900, s = 512 / Wb;
    x.setTransform(s, 0, 0, 600 / H, i * 512, 0);
    const glow = '#' + new T.Color(Wd.glow).getHexString(), trim = '#' + new T.Color(Wd.trim).getHexString();
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16224e'); g.addColorStop(1, '#070b22');
    x.fillStyle = g; x.fillRect(0, 0, Wb, H);
    // scan lines, a frame of light with notched corners
    x.fillStyle = 'rgba(120,200,255,0.05)';
    for (let k = 0; k < H; k += 8) x.fillRect(0, k, Wb, 3);
    x.lineWidth = 12; x.strokeStyle = trim; x.strokeRect(8, 8, Wb - 16, H - 16);
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.7)'; x.strokeRect(20, 20, Wb - 40, H - 40);
    x.fillStyle = trim;
    for (const [cx, cy] of [[8, 8], [Wb - 8, 8], [8, H - 8], [Wb - 8, H - 8]]) { x.beginPath(); x.moveTo(cx, cy - 40 * Math.sign(cy - H / 2)); x.lineTo(cx - 40 * Math.sign(cx - Wb / 2), cy); x.lineTo(cx, cy); x.closePath(); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, title, Wb - 110, 70, 400, '"Russo One", Fredoka, sans-serif', 0.2);
    x.lineWidth = 12; x.strokeStyle = '#04081c'; x.strokeText(title, Wb / 2, 80); x.fillStyle = '#ffffff'; x.fillText(title, Wb / 2, 80);
    x.fillStyle = trim; x.fillRect(60, 126, Wb - 120, 5);
    (rows || []).slice(0, 9).forEach((r, k) => {
        const y = 182 + k * 78;
        x.fillStyle = k % 2 ? 'rgba(120,200,255,0.06)' : 'rgba(120,200,255,0.13)'; x.fillRect(38, y - 34, Wb - 76, 68);
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#04081c';
        const name = '#' + (k + 1) + ' ' + r.n;
        fitFont(x, name, Wb - 320, 42, 700, 'Fredoka, sans-serif', 0);
        x.fillStyle = k === 0 ? '#ffd23a' : k === 1 ? '#e8ecf4' : k === 2 ? '#ffa86a' : '#ffffff';
        x.strokeText(name, 54, y); x.fillText(name, 54, y);
        x.textAlign = 'right'; x.font = '700 42px Fredoka, sans-serif'; x.strokeText(fmt(r.v), Wb - 54, y); x.fillStyle = glow; x.fillText(fmt(r.v), Wb - 54, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#cfe4ff'; x.fillText('Be the first!', Wb / 2, 210); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    A.t.needsUpdate = true;
}

// ----- shapes -----
// rings from the bottom up, each [radius, height, colour], many-sided and a little uneven, flat-shaded; the top ring closes with a
// cap. A kit of these is part of the sector's one batch: more shapes, not more draws.
export function stack(kit, x, z, rings, sides, R, sq, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.86 + R() * 0.28); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k * (sq || 1)]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i + 1), at(r, i), at(r + 1, i), at(r + 1, i + 1), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const t = rings.length - 1, top = [x, rings[t][1] + rings[t][0] * 0.08, z];
    for (let i = 0; i < sides; i++) kit.quad(at(t, i + 1), at(t, i), top, top, rings[t][2], { glow: glow || 0 });
}
// the same, upside down (a hanging thing's underside): rings from the top down
function hang(kit, x, z, rings, sides, R, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.8 + R() * 0.4); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r + 1, i), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const top = [x, rings[0][1], z];
    for (let i = 0; i < sides; i++) kit.quad(at(0, i), top, top, at(0, i + 1), rings[0][2], { glow: glow || 0 });
}
// an asteroid: a lumpy ball (its middle at x, y, z; half sizes sx, sy, sz), lighter on top, dark under; glow: a Kit glow number
// (5.xx: it drifts up and down)
const LUMP = [-1, -0.58, -0.08, 0.46, 0.86];
export function lump(kit, x, y, z, sx, sy, sz, R, cTop, cBot, glow, sides) {
    const N = sides || 7, rings = LUMP.map((t) => { const r = Math.sqrt(1 - t * t * 0.9), w = []; for (let i = 0; i < N; i++) w.push(r * (0.76 + R() * 0.46)); return w; });
    const at = (l, i) => { const a = (i % N) / N * Math.PI * 2, r = rings[l][i % N]; return [x + Math.cos(a) * r * sx, y + LUMP[l] * sy, z + Math.sin(a) * r * sz]; };
    const cols = LUMP.map((t) => mixC(cBot, cTop, (t + 1) / 2)), L = LUMP.length - 1, g = glow || 0;
    for (let l = 0; l < L; l++) for (let i = 0; i < N; i++) kit.quad(at(l, i + 1), at(l, i), at(l + 1, i), at(l + 1, i + 1), cols[l], { c2: cols[l + 1], glow: g });
    const top = [x, y + sy, z], bot = [x, y - sy * 1.06, z];
    for (let i = 0; i < N; i++) { kit.quad(at(L, i + 1), at(L, i), top, top, cTop, { glow: g }); kit.quad(at(0, i), at(0, i + 1), bot, bot, cBot, { glow: g }); }
}
// a cluster of crystals leaning out of whatever they grow from
function crystals(P, x, y, z, s, c, R) {
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
        const a = R() * 6.28, h = s * (0.8 + R() * 1.2), w = s * (0.22 + R() * 0.14), lean = 0.15 + R() * 0.45;
        P.box(x + Math.cos(a) * s * 0.25, y + h * 0.42, z + Math.sin(a) * s * 0.25, w, h, w, i % 2 ? c : mixC(c, 0xffffff, 0.35), { glow: 1, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: a });
    }
}
// a round pylon (a tank, a pillar): an eight-sided column with a collar at its foot and its top, bands of colour c round it
function pylon(kit, x, z, h, r, body, c, y0, glow) {
    const y = y0 || 0, one = () => 0.5, g = glow || 0;
    stack(kit, x, z, [[r * 1.3, y, shade(body, 0.7)], [r * 1.3, y + r * 0.5, shade(body, 0.8)], [r, y + r * 0.7, body], [r, y + h - r * 0.6, shade(body, 1.06)], [r * 1.22, y + h - r * 0.4, shade(body, 0.85)], [r * 1.22, y + h, shade(body, 0.9)]], 8, one, 1, g);
    for (const f of [0.34, 0.66]) stack(kit, x, z, [[r * 1.05, y + h * f - r * 0.2, c], [r * 1.05, y + h * f + r * 0.2, c]], 8, one, 1, g);
}
// a light on a post: a foot, the post, a glowing lamp in a cage; its halo is added to lights
function lampPost(P, lights, x, z, h, st, Wd) {
    P.box(x, 0.25, z, 1.3, 0.5, 1.3, Wd.rim, { soft: true });
    P.box(x, h / 2, z, 0.36, h, 0.36, st.metal);
    P.box(x, h - 0.25, z, 1.0, 0.3, 1.0, st.metal);
    P.box(x, h + 0.45, z, 0.72, 0.9, 0.72, st.lamp, { glow: 1, soft: true });
    P.box(x, h + 1.05, z, 1.0, 0.24, 1.0, st.metal);
    lights.push([x, h + 0.45, z, 2.6, st.lamp]);
}
// a satellite: a foil-wrapped body, a solar wing either side (cells in two blues), a dish, a blinking light
function satellite(kit, x, y, z, s, R, st, Wd, glow) {
    const g = glow || 0, ry = R() * 3, ca = Math.cos(ry), sa = Math.sin(ry);
    kit.box(x, y, z, s * 1.6, s * 1.2, s * 1.2, Wd.wall, { ry, glow: g });
    kit.box(x, y, z, s * 0.5, s * 1.3, s * 1.3, st.accent, { ry, glow: g });
    for (const sd of [-1, 1]) {
        kit.box(x + ca * sd * s * 1.5, y, z - sa * sd * s * 1.5, s * 1.4, s * 0.12, s * 0.12, st.metal, { ry, glow: g });
        for (let i = 0; i < 3; i++) { const d = sd * s * (2.4 + i * 1.25); kit.box(x + ca * d, y, z - sa * d, s * 1.16, s * 0.08, s * 1.7, i % 2 ? st.panel : shade(st.panel, 1.35), { ry, glow: g }); }
    }
    stack(kit, x, z, [[s * 0.12, y + s * 0.6, st.metal], [s * 0.5, y + s * 0.82, Wd.wall], [s * 0.85, y + s * 1.2, Wd.wall]], 8, () => 0.5, 1, g);
    kit.box(x, y + s * 1.5, z, s * 0.12, s * 0.7, s * 0.12, st.metal, { glow: g });
    kit.box(x, y + s * 1.9, z, s * 0.26, s * 0.26, s * 0.26, st.lamp, { glow: g > 4.9 ? 6 + (g % 1) : 1 });
}
// what stands about a Starport: fuel tanks, cargo, a radar dish on a mast, an aerial, a parked hopper, a crystal garden
function prop(P, Dk, lights, kind, x, z, R, st, Wd, low) {
    if (kind === 'tank') {
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(), d = i ? 2.5 : 0, h = 5 + R() * 3; pylon(P, x + Math.cos(a) * d, z + Math.sin(a) * d, h, 1.5, i === 1 ? st.accent : Wd.wall, i === 1 ? Wd.wall : st.accent); }
        P.box(x, 0.5, z, 6.6, 0.4, 0.4, st.metal, { ry: R() * 3 });
        Dk.box(x + 1.6, 3, z + 1.3, 0.5, 1.4, 0.1, Wd.trim, { glow: 1 });
    } else if (kind === 'crates') {
        const n = low ? 3 : 5;
        for (let i = 0; i < n; i++) {
            const s = 1.9 + R() * 0.8, a = R() * 6.28, d = i ? 1.7 + R() * 1.8 : 0, up = i === n - 1 ? s : 0, px = x + Math.cos(a) * d * (up ? 0.2 : 1), pz = z + Math.sin(a) * d * (up ? 0.2 : 1), ry = R() * 0.7, c = i % 3 === 0 ? st.accent : i % 3 === 1 ? Wd.wall : st.metal;
            P.box(px, s / 2 + up, pz, s, s, s, c, { ry, soft: !low });
            P.box(px, s / 2 + up, pz, s * 1.03, s * 0.16, s * 1.03, shade(c, 0.6), { ry });
            if (i % 2 === 0) Dk.box(px, s * 0.78 + up, pz, s * 1.04, s * 0.07, s * 1.04, Wd.trim, { ry, glow: 1 });
        }
    } else if (kind === 'dish') {
        P.box(x, 0.4, z, 3, 0.8, 3, Wd.rim, { soft: true });
        P.box(x, 4.2, z, 0.7, 7.2, 0.7, st.metal);
        stack(P, x, z, [[0.4, 7.6, st.metal], [1.9, 8.3, Wd.wall], [3.2, 9.5, Wd.wall], [3.4, 9.7, st.accent]], 9, () => 0.5);
        P.box(x, 10.4, z, 0.16, 2.2, 0.16, st.metal);
        P.box(x, 11.6, z, 0.4, 0.4, 0.4, st.lamp, { glow: 1 });
        lights.push([x, 11.6, z, 1.6, st.lamp]);
    } else if (kind === 'mast') {
        const h = 16 + R() * 6;
        P.box(x, 0.4, z, 2.4, 0.8, 2.4, Wd.rim, { soft: true });
        P.box(x, h * 0.25, z, 0.9, h * 0.5, 0.9, Wd.wall2); P.box(x, h * 0.7, z, 0.5, h * 0.4, 0.5, st.metal); P.box(x, h * 0.98, z, 0.2, h * 0.2, 0.2, st.metal);
        for (const f of [0.5, 0.72]) { P.box(x, h * f, z, 3.4 - f * 2, 0.2, 0.2, st.metal); P.box(x, h * f, z, 0.2, 0.2, 3.4 - f * 2, st.metal); }
        P.box(x, h * 1.09, z, 0.5, 0.5, 0.5, 0xff3a4a, { glow: 2 });
        lights.push([x, h * 1.09, z, 1.8, 0xff3a4a]);
    } else if (kind === 'hopper') {
        // a little parked ship: a pod on three legs, a bubble of a cockpit, a fin, two thrusters
        const ry = R() * 6.28, ca = Math.cos(ry), sa = Math.sin(ry), at = (f, r, y) => [x + sa * f + ca * r, y, z + ca * f - sa * r];
        for (let i = 0; i < 3; i++) { const a = ry + i * 2.094; P.box(x + Math.cos(a) * 2.3, 1.1, z + Math.sin(a) * 2.3, 0.3, 2.4, 0.3, st.metal, { rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 }); }
        lump(P, x, 3.3, z, 3.4, 1.5, 3.4, () => 0.5, Wd.wall, shade(Wd.wall2, 0.9), 0, 9);
        { const p = at(1.5, 0, 4.3); lump(P, p[0], p[1], p[2], 1.5, 1.1, 1.5, () => 0.5, st.lamp, shade(st.lamp, 0.7), 1, 7); }
        { const p = at(-2.2, 0, 4.9); P.box(p[0], p[1], p[2], 0.3, 2.2, 1.8, st.accent, { ry }); }
        for (const sd of [-1, 1]) { const p = at(-2.6, sd * 1.7, 3.1); pylon(P, p[0], p[2], 1.3, 0.55, st.metal, st.accent, 2.5); }
        P.box(x, 3.3, z, 6.9, 0.3, 6.9, st.accent, { ry: ry + 0.39, soft: true });
    } else {
        P.box(x, 0.5, z, 4.4, 1, 4.4, Wd.rim, { soft: true });
        P.box(x, 1.1, z, 3.6, 0.3, 3.6, st.dark);
        crystals(P, x, 1.1, z, 2.6, st.crystal, R);
        lights.push([x, 3.2, z, 3, st.crystal]);
    }
}

// ----- far away: what drifts round the Keyway all along it. Asteroids (their cracks glowing in the sectors that glow), satellites
// and station modules round Home Row Orbit, mining rigs over Redshift Ridge, shards of ice in Frostbyte Rings, broken rings of
// gold round Esc Horizon. kits: a few along the way (each culled on its own); from z0 north to z1 -----
export function horizon(Wd, kits, R, z0, z1, low) {
    const n = kits.length, span = z0 - z1, step = low ? 250 : 170, st = styleOf(Wd), id = Wd.id;
    for (let z = z0; z > z1; z -= step) for (const sx of [-1, 1]) {
        const x = sx * (95 + R() * 300), zz = z - R() * step * 0.8, y = -70 + R() * 190, s = 16 + R() * 44, pick = R();
        const kit = kits[Math.min(n - 1, Math.max(0, Math.floor((z0 - zz) / span * n)))];
        if (pick < 0.55 || (low && pick < 0.8)) {
            lump(kit, x, y, zz, s * (0.9 + R() * 0.5), s * (0.55 + R() * 0.35), s * (0.8 + R() * 0.5), R, st.rock, st.rock2, 0, 8);
            if (st.glowRock && !low) for (let k = 0; k < 3; k++) { const a = R() * 6.28; kit.box(x + Math.cos(a) * s * 0.55, y + s * (0.2 + R() * 0.25), zz + Math.sin(a) * s * 0.5, s * 0.14, s * 0.5, s * 0.14, st.glowRock, { glow: 1, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6 }); }
            if (!low && R() < 0.5) lump(kit, x + s * 1.5, y + s * 0.6, zz + s * 0.4, s * 0.3, s * 0.24, s * 0.3, R, st.rock, st.rock2, 0, 6);
        } else if (id === 'orbit' || pick < 0.7) {
            if (R() < 0.5) satellite(kit, x, y + 40, zz, s * 0.32, R, st, Wd);
            else {
                // a station module: a drum of hull, a ring round it, lit windows, a docking arm
                const r = s * 0.42, yb = y + 30;
                stack(kit, x, zz, [[r * 0.5, yb, Wd.wall2], [r, yb + r * 0.4, Wd.wall], [r, yb + r * 2.2, Wd.wall], [r * 0.5, yb + r * 2.6, Wd.wall2]], 10, () => 0.5);
                stack(kit, x, zz, [[r * 1.7, yb + r * 1.1, st.metal], [r * 1.7, yb + r * 1.5, st.accent]], 10, () => 0.5);
                for (let k = 0; k < 6; k++) { const a = k * 1.047; kit.box(x + Math.cos(a) * r * 1.01, yb + r * 1.9, zz + Math.sin(a) * r * 1.01, r * 0.2, r * 0.28, r * 0.2, 0xfff2a0, { glow: 1, ry: -a }); }
                kit.box(x, yb + r * 3.2, zz, r * 0.14, r * 1.4, r * 0.14, st.metal); kit.box(x, yb + r * 4, zz, r * 0.3, r * 0.3, r * 0.3, st.lamp, { glow: 1 });
            }
        } else if (id === 'redshift') {
            // a mining rig on a rock: a derrick, a lit cabin, a hot drill under it
            lump(kit, x, y, zz, s, s * 0.5, s * 0.9, R, st.rock, st.rock2, 0, 8);
            kit.box(x, y + s * 0.9, zz, s * 0.16, s * 1.2, s * 0.16, st.metal); kit.box(x, y + s * 1.5, zz, s * 0.7, s * 0.1, s * 0.1, st.metal);
            kit.box(x + s * 0.3, y + s * 0.62, zz, s * 0.4, s * 0.3, s * 0.4, Wd.wall); kit.box(x + s * 0.3, y + s * 0.66, zz + s * 0.21, s * 0.24, s * 0.12, s * 0.02, 0xffd86a, { glow: 1 });
            kit.box(x, y - s * 0.7, zz, s * 0.12, s * 0.5, s * 0.12, st.glowRock, { glow: 1 });
        } else if (id === 'frost') {
            // a spray of ice shards
            for (let k = 0; k < 4; k++) { const a = R() * 6.28, l = s * (0.8 + R() * 1.2); kit.box(x + Math.cos(a) * s * 0.4, y + l * 0.3, zz + Math.sin(a) * s * 0.4, s * 0.22, l, s * 0.22, k % 2 ? 0xe8faff : st.crystal, { glow: k % 2 ? 0.6 : 1, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5, ry: a }); }
        } else {
            // a broken ring: an arc of dark segments, gold burning along its inside
            const r = s * 1.3, a0 = R() * 6.28, tilt = (R() - 0.5) * 1.2, N = 9;
            for (let k = 0; k < N; k++) {
                if (k === 3 || k === 6) continue;
                const a = a0 + k / N * 4.2, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
                kit.box(x + cx, y + 40 + cy * Math.cos(tilt), zz + cy * Math.sin(tilt), s * 0.24, r * 0.4, s * 0.3, st.rock2, { rz: a + Math.PI / 2 });
                kit.box(x + cx * 0.93, y + 40 + cy * 0.93 * Math.cos(tilt), zz + cy * 0.93 * Math.sin(tilt), s * 0.07, r * 0.32, s * 0.18, st.glowRock, { glow: 1, rz: a + Math.PI / 2 });
            }
        }
    }
}

// ----- the Keyway's edge: the keyboard's case down one side (sx -1 west, 1 east), its kerb's inner face at xIn, from z0 north up to
// z1: the case's side going down into the dark, a strip of underglow along its foot, a kerb at the runners' height, a low rail on
// posts with a line of light along it, a tall marker pylon now and then (a lamp at its tip), an outrigger with a thruster pod under
// the case now and then. skip(z): no pylon there (a gate's frame, a laser's dock) -----
export function railRun(S, P, sx, xIn, z0, z1, ctx, skip) {
    const { Wd, st, low } = ctx, len = z1 - z0, zm = (z0 + z1) / 2, Q = ctx.dk || P, xc = sx * (xIn + WT / 2);
    if (len <= 0.1) return;
    // the case's side and its kerb
    S.box(xc, -CASE / 2, zm, WT, CASE, len, Wd.wall2, { tile: 8 });
    S.box(xc, 0.3, zm, WT + 0.3, 0.6, len, Wd.wall, { tile: 8 });
    // underglow along the case's foot (outside), a line of light along the kerb (inside)
    P.box(sx * (xIn + WT + 0.06), -CASE + 0.7, zm, 0.12, 0.5, len, Wd.trim, { glow: 1 });
    P.box(sx * (xIn - 0.04), 0.3, zm, 0.08, 0.2, len, Wd.trim, { glow: 1 });
    // the rail: posts, a bar along their tops, a light strip on it
    const gap = low ? 14 : 9.5, n = Math.max(1, Math.round(len / gap)), sp = len / n, xr = sx * (xIn + WT - 0.6);
    for (let i = 0; i <= n; i++) P.box(xr, 0.6 + WH / 2, z0 + i * sp, 0.4, WH, 0.4, i % 2 ? st.metal : Wd.wall2);
    P.box(xr, 0.6 + WH, zm, 0.5, 0.3, len, Wd.wall);
    P.box(xr - sx * 0.27, 0.6 + WH, zm, 0.06, 0.16, len, Wd.banner, { glow: 0.8 });
    P.box(xr, 0.6 + WH * 0.5, zm, 0.16, 0.16, len, st.metal);
    // marker pylons: a fin of hull standing over the rail, chevrons of light up it, a lamp at its tip
    const pg = low ? 66 : 44, pn = Math.max(1, Math.floor(len / pg)), psp = len / pn;
    for (let i = 0; i < pn; i++) {
        const z = z0 + (i + 0.5) * psp;
        if (skip && skip(z)) continue;
        const h = 9 + (i % 2) * 3, x = sx * (xIn + WT - 0.2);
        S.box(x, h / 2, z, 1.5, h, 2.6, Wd.wall, { tile: 8 });
        P.box(x, h + 0.3, z, 1.9, 0.6, 3.0, Wd.wall2);
        P.box(x - sx * 0.78, h * 0.5, z, 0.08, h - 1.6, 0.5, Wd.trim, { glow: 1 });
        P.box(x, h + 1.1, z, 0.7, 1.0, 0.7, st.lamp, { glow: 1, soft: !low });
        if (ctx.lights && (!low || i % 2 === 0)) ctx.lights.push([x, h + 1.1, z, 2.2, st.lamp]);
        if (!low) for (let j = 0; j < 3; j++) Q.box(x - sx * 0.8, 2.6 + j * 1.5, z + 0.9, 0.08, 0.34, 0.9, Wd.banner, { glow: 1, rx: 0.6 });
    }
    // outriggers under the case: a strut out to a thruster pod, its nozzle glowing
    for (let z = z0 + 30; z < z1 - 20; z += low ? 150 : 96) {
        const x = sx * (xIn + WT + 3.4);
        P.box(sx * (xIn + WT + 1.6), -3.4, z, 3.6, 0.6, 1.2, st.metal);
        pylon(P, x, z, 3.6, 1.3, Wd.wall2, st.accent, -5.4);
        P.box(x, -5.7, z, 1.7, 0.5, 1.7, st.flame, { glow: 1, soft: true });
    }
}

// ----- lettering fixed to things (the gates' "STAGE N", the "Recommended Level" boards): one atlas, one draw, the leaderboards' own
// program (MeshBasicMaterial with a map). Each label is painted once into a cell (wide 4:1, else 2:1); its quads face +z (back: -z,
// still reading the right way round) -----
class Plaques {
    constructor(low, frame) { this.frame = frame || '#3ae8ff'; this.k = low ? 0.75 : 1; this.cells = []; this.byKey = new Map(); this.q = []; }
    // a label: lines (signs.js style), wide or not, its screen (0 a gate's plaque, 1 a holo board)
    cell(key, lines, wide, look) { let c = this.byKey.get(key); if (c === undefined) { c = this.cells.length; this.cells.push({ lines, wide, look }); this.byKey.set(key, c); } return c; }
    // label c on a w x h quad, its middle at x, y, z, facing +z (back: -z)
    quad(c, x, y, z, w, h, back) { this.q.push([c, x, y, z, w, h, back]); }
    build(parent) {
        if (!this.q.length) return null;
        const CW = Math.round(384 * this.k), CH = Math.round(96 * this.k), AW = CW * 4, at = [];
        let cx = 0, cy = 0;
        for (const c of this.cells) { const w = c.wide ? CW : CW / 2; if (cx + w > AW) { cx = 0; cy += CH; } at.push([cx, cy, w]); cx += w; }
        const AH = cy + CH, cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
        const x = cv.getContext('2d');
        this.cells.forEach((c, i) => {
            const [px, py, w] = at[i];
            x.save(); x.translate(px, py);
            const g = x.createLinearGradient(0, 0, 0, CH);
            if (c.look) { g.addColorStop(0, '#12306a'); g.addColorStop(1, '#07122e'); } else { g.addColorStop(0, '#1c2a66'); g.addColorStop(1, '#080c26'); }
            x.fillStyle = g; x.fillRect(0, 0, w, CH);
            const lw = Math.max(3, CH * 0.06);
            x.lineWidth = lw; x.strokeStyle = this.frame; x.strokeRect(lw / 2, lw / 2, w - lw, CH - lw);
            x.lineWidth = Math.max(1, lw * 0.35); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.strokeRect(lw * 1.6, lw * 1.6, w - lw * 3.2, CH - lw * 3.2);
            // the words, as big as fit, in the middle
            const W0 = c.wide ? 768 : 384, H0 = linesHeight(c.lines), s = Math.min((w - lw * 3) / W0, (CH - lw * 2) / H0);
            x.translate((w - W0 * s) / 2, (CH - H0 * s) / 2); x.scale(s, s);
            drawLines(x, c.lines, W0);
            x.restore();
        });
        const tex = texFrom(cv), pos = [], uv = [], idx = [];
        for (const [c, qx, qy, qz, w, h, back] of this.q) {
            const [px, py, cw] = at[c], u0 = px / AW, u1 = (px + cw) / AW, v1 = 1 - py / AH, v0 = 1 - (py + CH) / AH, b = pos.length / 3, sx = back ? -1 : 1;
            pos.push(qx - sx * w / 2, qy - h / 2, qz, qx + sx * w / 2, qy - h / 2, qz, qx + sx * w / 2, qy + h / 2, qz, qx - sx * w / 2, qy + h / 2, qz);
            uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
        g.computeBoundingSphere();
        const mesh = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        mesh.frustumCulled = false;
        parent.add(mesh);
        this.mesh = mesh; this.tex = tex;
        return mesh;
    }
    dispose() { if (!this.mesh) return; this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); }
}

// A stage's warp gate across the Keyway at z: a pylon either side standing on the case, a flat lintel between them on slanted
// haunches (always open), light running round its inside, a holo plaque with the stage's number on both faces (label: a Plaques
// cell), a plasma beacon and an aerial on each pylon; a glowing line across the floor under it. GATE: the lintel's underside, its
// depth, the pylons' tops
export const GATE = { under: 19.4, beam: 4.6, top: 27.5 };
export const ARCH = { spring: 11, crown: GATE.under, ring: 2.6, top: GATE.top };
function stageGate(S, P, z, ctx, label) {
    const { Wd, st, fl, low, PL } = ctx, hw = W.halfW, U = GATE.under, TOP = GATE.top, Q = ctx.dk || P;
    for (const sx of [-1, 1]) {
        const tx = sx * (hw + 3.2);
        // the pylon: a foot down into the case, a shaft of hull, a collar of the sector's accent, a cap
        S.box(tx, -CASE / 2 + 0.6, z, 7.4, CASE + 1.2, 6.6, Wd.wall2, { tile: 8 });
        S.box(tx, 1.2 + (TOP - 1.2) / 2, z, 5.4, TOP - 1.2, 4.8, Wd.wall, { tile: 8 });
        P.box(tx, TOP * 0.56, z, 5.8, 2.6, 5.2, Wd.banner);
        for (const dy of [-1.7, 1.7]) P.box(tx, TOP * 0.56 + dy, z, 5.9, 0.3, 5.3, st.dark);
        S.box(tx, TOP + 0.4, z, 6.4, 0.8, 5.8, Wd.wall2, { tile: 8 });
        // light up its inner face, chevrons up the faces the runners see
        P.box(sx * (hw + 0.46), U / 2 + 0.6, z, 0.1, U - 1.2, 1.6, Wd.trim, { glow: 1 });
        for (const sz of [1, -1]) for (let j = 0; j < (low ? 2 : 4); j++) for (const d of [-1, 1]) P.box(tx + d * 0.62, 3.4 + j * 2.4, z + sz * 2.44, 1.5, 0.36, 0.1, Wd.trim, { glow: 1, rz: d * 0.62 });
        // on top: a plasma beacon in a cup, an aerial with a blinking tip
        P.box(tx, TOP + 1.3, z, 2.0, 1.0, 2.0, st.metal, { soft: !low });
        fl.push([tx, TOP + 1.7, z, 1.9, st.flame]);
        P.box(tx + sx * 2.3, TOP + 3.4, z, 0.22, 5.2, 0.22, st.metal);
        P.box(tx + sx * 2.3, TOP + 6.2, z, 0.5, 0.5, 0.5, 0xff3a4a, { glow: 2 });
        // the haunch: a slanted brace from the pylon up to the lintel, light along its underside
        S.box(sx * (hw - 2.6), U - 2.2, z, 2.0, 8.6, 4.0, Wd.wall, { tile: 8, rz: sx * Math.PI / 4 });
        P.box(sx * (hw - 3.5), U - 3.1, z, 0.14, 7.6, 1.6, Wd.trim, { glow: 1, rz: sx * Math.PI / 4 });
    }
    // the lintel: a beam of dark hull, a cap, a line of light along its underside, little lights along its top
    S.box(0, U + GATE.beam / 2, z, hw * 2 + 1, GATE.beam, 4.4, Wd.wall2, { tile: 8 });
    P.box(0, U + GATE.beam + 0.2, z, hw * 2 + 1.6, 0.4, 5.0, st.cap, { soft: !low });
    P.box(0, U - 0.06, z, hw * 2 - 11, 0.12, 1.6, Wd.trim, { glow: 1 });
    if (!low) for (let x = -hw + 1.5, i = 0; x < hw; x += 3.3, i++) Q.box(x, U + GATE.beam + 0.6, z, 0.5, 0.4, 0.5, st.bulbs[i % st.bulbs.length], { glow: 1 });
    // the plaque, a dark frame round it, both faces
    const ph = 3.5, pw = ph * 4, py = U + GATE.beam / 2;
    for (const sz of [1, -1]) { P.box(0, py, z + sz * 2.25, pw + 0.7, ph + 0.5, 0.3, st.dark); PL.quad(label, 0, py, z + sz * 2.42, pw, ph, sz < 0); }
    // the line across the floor
    P.box(0, 0.04, z, hw * 2, 0.08, 1.2, Wd.trim, { glow: 1, shade: 0.7 });
}
// a golden trophy hovering over a holo plinth (beside the gate that pays a stage's Wins): a cup on a stem, two handles, a gem on
// its front, a star over it
function trophy(S, P, x, z, ctx) {
    const { Wd, st, low } = ctx, G = 0xffc21e, G2 = 0xffe27a, y = 3.0, k = 1.45, cy = (v) => y + 0.24 + (v - 0.24) * k;
    pylon(P, x, z, y, 1.5, Wd.wall2, Wd.trim);
    P.box(x, y + 0.12, z, 3.3, 0.24, 3.3, Wd.trim, { glow: 1, soft: !low });
    P.box(x, cy(0.45), z, 1.8 * k, 0.42 * k, 1.8 * k, st.dark, { soft: !low });
    P.box(x, cy(0.82), z, 1.2 * k, 0.32 * k, 1.2 * k, G);
    P.box(x, cy(1.3), z, 0.46 * k, 0.9 * k, 0.46 * k, G2);
    stack(P, x, z, [[0.42 * k, cy(1.72), G], [1.0 * k, cy(2.2), G], [1.28 * k, cy(3.2), G2], [1.42 * k, cy(3.5), 0xfff2a0]], low ? 6 : 8, () => 0.5, 1, 0);
    for (const sx of [-1, 1]) {
        P.box(x + sx * 1.62 * k, cy(2.7), z, 0.3 * k, 1.2 * k, 0.32 * k, G);
        for (const hy of [2.2, 3.2]) P.box(x + sx * 1.38 * k, cy(hy), z, 0.6 * k, 0.26 * k, 0.32 * k, G);
    }
    P.box(x, cy(2.55), z + 1.15 * k, 0.62 * k, 0.62 * k, 0.16, Wd.trim, { glow: 1, rz: Math.PI / 4 });
    P.box(x, cy(3.62), z, 0.9 * k, 0.12, 0.9 * k, 0xfff6c0, { glow: 1 });
    P.box(x, cy(4.5), z, 0.85 * k, 0.85 * k, 0.24, G2, { glow: 2, rz: Math.PI / 4 }); P.box(x, cy(4.5), z, 0.24, 0.85 * k, 0.85 * k, G2, { glow: 2, rx: Math.PI / 4 });
}
// a "Recommended Level" holo on a post at the side of the way, facing the runners coming (label: a Plaques cell)
function recBoard(P, x, z, ctx, label) {
    const { st, Wd, PL } = ctx;
    P.box(x, 0.3, z, 1.4, 0.6, 1.4, Wd.rim, { soft: true });
    P.box(x, 2.6, z, 0.34, 4.6, 0.34, st.metal);
    P.box(x, 6.1, z, 5.0, 2.8, 0.3, st.dark);
    P.box(x, 7.62, z, 5.2, 0.16, 0.44, Wd.trim, { glow: 1 }); P.box(x, 4.58, z, 5.2, 0.16, 0.44, Wd.trim, { glow: 1 });
    PL.quad(label, x, 6.1, z + 0.17, 4.6, 2.3, false);
}
// the FREE GIFT crate by the spawn: a supply crate (front facing ry), its lid thrown back, light pouring out of it, a ribbon in the
// sector's accent round it, stars and gems spilled at its foot
function giftCrate(P, D, x, z, ry, low, Wd, st) {
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry), at = (f, r, y) => [x + fx * f + rx * r, y, z + fz * f + rz * r];
    const k = 1.3, W2 = 3.2 * k, D2 = 2.2 * k, H2 = 1.8 * k, body = Wd.wall, band = st.metal, rib = st.accent, bx = (p, sx, sy, sz, c, o) => P.box(p[0], p[1], p[2], sx, sy, sz, c, { ry, ...(o || {}) });
    bx(at(0, 0, H2 / 2), W2, H2, D2, body, { soft: !low });
    for (const r of [-1.0, 1.0]) bx(at(0, r * k, H2 / 2), 0.34 * k, H2 + 0.06, D2 + 0.06, band);
    bx(at(0, 0, 0.12 * k), W2 + 0.06, 0.24 * k, D2 + 0.06, band);
    bx(at(0, 0, H2 - 0.02), W2 - 0.36, 0.34 * k, D2 - 0.36, 0xfff2a0, { glow: 1 });
    bx(at(D2 / 2 + 0.03, 0, H2 / 2), 0.5 * k, H2 + 0.04, 0.08, rib);
    bx(at(D2 / 2 + 0.08, 0, H2 - 0.45 * k), 0.62 * k, 0.62 * k, 0.1, Wd.trim, { glow: 1, rz: Math.PI / 4 });
    // the lid, open on its hinge along the back: tipped back past upright
    const ph = 1.9, lt = 0.5 * k, hf = -D2 / 2, lf = (D2 / 2) * Math.cos(ph) - (lt / 2) * Math.sin(ph), ly = (D2 / 2) * Math.sin(ph) + (lt / 2) * Math.cos(ph), lid = { rx: -ph, ry, order: 'YXZ' };
    P.box(...at(hf + lf, 0, H2 + ly), W2 + 0.04, lt, D2, body, { ...lid, soft: !low });
    for (const r of [-1.0, 1.0]) P.box(...at(hf + lf, r * k, H2 + ly), 0.34 * k, lt + 0.06, D2 + 0.04, band, lid);
    P.box(...at(hf + lf, 0, H2 + ly), 0.5 * k, lt + 0.08, D2 + 0.06, rib, lid);
    // a bow on the front of the ribbon
    for (const s of [-1, 1]) bx(at(D2 / 2 + 0.12, s * 0.42 * k, H2 + 0.05), 0.7 * k, 0.42 * k, 0.14, rib, { rz: s * 0.5 });
    // stars and gems spilled round its foot
    const C = [0xffd23a, 0x7ae8ff, 0xff5ac0, 0x7dff6b, 0xffffff];
    for (let i = 0; i < (low ? 4 : 9); i++) { const a = i * 0.83 + 0.4, d = (2.0 + (i % 3) * 0.45) * k, p = at(Math.cos(a) * d * 0.8 + 0.6, Math.sin(a) * d, 0.3); D.box(p[0], p[1], p[2], 0.5, 0.5, 0.16, C[i % 5], { glow: 2, ry: a, rz: Math.PI / 4 }); }
}
// the Starport's keyboard beds (x0, x1, z0, z1): your first steps clack
export const JELLY_BEDS = [[8.5, 16.5, 94.5, 110], [-16.5, -8.5, 94.5, 110], [8.5, 15, 67, 81], [-15, -8.5, 67, 81]];
export const onJellyBed = (x, z) => JELLY_BEDS.some((b) => x > b[0] - 1 && x < b[1] + 1 && z > b[2] - 1 && z < b[3] + 1);
// the keys of a stage (or a bed): keyboard rows across in the sector's colourway, unless something in the way or a pad wants the
// room. clear(x, z) says where not
function jellyRows(out, Wd, R, low, x0, x1, z0, z1, clear, o) { keyRows(out, Wd.keys, R, low, x0, x1, z0, z1, clear, o); }

export function buildHub(wi, opts) {
    const Tw = hubFor(wi), Wd = lookOf(wi), st = styleOf(Wd), R = rng(wi * 97 + 11), low = !!opts.low, id = Wd.id, one = () => 0.5;
    setKeyLegend(Wd.legend, Wd.legendGlow, Wd.rgb, Wd.trim);
    const group = new T.Group(), signs = low ? new Signs(6, 352, 120) : new Signs(6, 448, 152), fl = [], lights = [], ctx = { Wd, st, R, low, fl, lights };
    const D = decalQuads(), E = energyQuads(), domes = [];
    // a kit per stretch: the Starport, then each stage of the Keyway
    const S0 = new Kit(), P0 = new Kit({ glow: true }), stretchS = [S0], stretchP = [P0];
    // the detail kits (small things), drawn only close up: the Starport's, then one per stage
    const D0 = new Kit({ glow: true }), detail = [D0], NEAR_D = low ? 120 : 175;
    D0.far = low ? 150 : 230;
    // ----- the Starport's deck: plates in two tones, lanes of darker plate with chevrons of light, a landing pad round the spawn -----
    const P = W.plaza, tile = 12;
    for (let x = P.x0; x < P.x1; x += tile) for (let z = P.z0; z < P.z1; z += tile) {
        const x1 = Math.min(P.x1, x + tile), z1 = Math.min(P.z1, z + tile);
        floorQuad(S0, x, x1, z, z1, 0, (Math.floor(x / tile) + Math.floor(z / tile)) & 1 ? Wd.floor : Wd.floor2);
    }
    // a lane: darker plate, a kerb line of light either side, chevrons along it pointing the way (dir: 1 north, 2 east-west)
    const lane = (x0, x1, z0, z1) => {
        floorQuad(S0, x0, x1, z0, z1, 0.05, Wd.path);
        const along = z1 - z0 > x1 - x0;
        for (const [a, b, c, d] of along ? [[x0, x0 + 0.35, z0, z1], [x1 - 0.35, x1, z0, z1]] : [[x0, x1, z0, z0 + 0.35], [x0, x1, z1 - 0.35, z1]]) P0.box((a + b) / 2, 0.07, (c + d) / 2, b - a, 0.04, d - c, Wd.trim, { glow: 1, shade: 0.85 });
        if (along) for (let z = z0 + 3; z < z1 - 2; z += low ? 9 : 6) for (const d of [-1, 1]) D0.box((x0 + x1) / 2 + d * 1.5, 0.08, z, 3.2, 0.05, 0.5, shade(Wd.floor, 1.1), { ry: d * 0.5 });
        else for (let x = x0 + 3; x < x1 - 2; x += low ? 9 : 6) D0.box(x, 0.08, (z0 + z1) / 2, 0.5, 0.05, z1 - z0 - 1.6, shade(Wd.floor, 1.1));
    };
    lane(-7, 7, 44, 100);
    lane(-66, -7, 85, 91); lane(7, 66, 85, 91);
    lane(-34, -7, 60, 65); lane(7, 34, 60, 65);
    // the spawn: a round landing pad of dark hull, a ring of light inlaid round its edge, studs of light round it, a star on it
    {
        const n = low ? 12 : 20, R0 = 10.4, y1 = 0.12, cx = W.spawn.x, cz = W.spawn.z, pt = (i, r, y) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; };
        for (let i = 0; i < n; i++) {
            const am = (i + 0.5) / n * Math.PI * 2;
            P0.faceTo(pt(i, R0, -0.2), pt(i + 1, R0, -0.2), pt(i + 1, R0, y1), pt(i, R0, y1), [Math.cos(am), 0, Math.sin(am)], shade(Wd.rim, 0.85));
            P0.faceTo(pt(i, R0, y1), pt(i + 1, R0, y1), [cx, y1, cz], [cx, y1, cz], [0, 1, 0], Wd.rim);
            P0.faceTo(pt(i, R0 - 1.0, y1 + 0.02), pt(i + 1, R0 - 1.0, y1 + 0.02), pt(i + 1, R0 - 0.45, y1 + 0.02), pt(i, R0 - 0.45, y1 + 0.02), [0, 1, 0], Wd.trim, { glow: 1 });
        }
        for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2; D0.box(cx + Math.cos(a) * (R0 + 0.55), 0.12, cz + Math.sin(a) * (R0 + 0.55), 0.5, 0.24, 0.5, st.bulbs[i % st.bulbs.length], { glow: 1, ry: a }); }
        decal(D, 3, cx, y1 + 0.05, cz, 8.9, 8.9, Wd.trim, 0, 1, 0);
    }
    // the FREE GIFT crate by the spawn, turned to face the runners there, its light glowing (a halo over it)
    const GIFT = { x: -11.6, z: 83.2 };
    giftCrate(P0, D0, GIFT.x, GIFT.z, 0.95, low, Wd, st);
    halo(E, GIFT.x, 3.2, GIFT.z, 5, 0xffd23a, 0.6);
    signs.add([big('FREE GIFT', GOLD, 104, '#3a1a00')], 7.5, new V3(GIFT.x, 7.6, GIFT.z), true, 90);
    // deck marks: little lights set in the plates, hazard flashes
    {
        const Rd = rng(wi * 29 + 3), N = low ? 14 : 30;
        for (let n = 0, tries = 0; n < N && tries < 400; tries++) {
            const x = (Rd() - 0.5) * 140, z = 48 + Rd() * 68, ax = Math.abs(x);
            if (ax < 10 || (z > 82 && z < 94) || onJellyBed(x, z)) continue;
            let clear = true;
            for (let i = 0; i < POSTS.length && clear; i++) { const s = postSpot(i); if (Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 8) clear = false; }
            for (let i = 0; i < JAWBREAKERS.length && clear; i++) { const s = jbSpot(i); if ((s.x - x) ** 2 + (s.z - z) ** 2 < 36) clear = false; }
            if (!clear || (z < 62 && ax > 30 && ax < 58)) continue;
            n++;
            if (n % 3 === 0) { for (let k = 0; k < 4; k++) D0.box(x + k * 0.9, 0.04, z, 0.5, 0.05, 1.6, k % 2 ? st.accent : st.dark, { ry: 0.5 }); }
            else D0.box(x, 0.05, z, 0.7, 0.08, 0.7, st.bulbs[n % st.bulbs.length], { glow: 1, ry: Math.PI / 4 });
        }
    }
    // the Starport's keyboard beds: a dark plate, low keys on it, a frame of hull round each with lit corners
    for (const b of JELLY_BEDS) {
        jellyRows(domes, Wd, R, low, b[0] + 0.9, b[1] - 0.9, b[2] + 0.9, b[3] - 0.9, null, { pitch: 3.6, h: 0.3 });
        floorQuad(S0, b[0], b[1], b[2], b[3], 0.03, shade(Wd.keys[1], 0.3));
        for (const [a, c, d, e] of [[b[0], b[1], b[2], b[2] + 0.7], [b[0], b[1], b[3] - 0.7, b[3]], [b[0], b[0] + 0.7, b[2], b[3]], [b[1] - 0.7, b[1], b[2], b[3]]]) P0.box((a + c) / 2, 0.3, (d + e) / 2, c - a, 0.6, e - d, Wd.wall2);
        for (const [cx, cz] of [[b[0], b[2]], [b[1], b[2]], [b[0], b[3]], [b[1], b[3]]]) P0.box(cx, 0.45, cz, 1.0, 0.9, 1.0, Wd.trim, { glow: 1, soft: !low });
    }
    // the deck's edge: a kerb with a line of light, a rail on posts, the station's hull going down into the dark under it all (a
    // strip of underglow round its foot)
    const mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, Wd2 = P.x1 - P.x0, D2 = P.z1 - P.z0;
    const edge = (x, z, sx, sz) => {
        S0.box(x, 0.3, z, sx, 1.4, sz, Wd.wall, { tile: 8 });
        const ax = sx > sz;
        P0.box(x, 3.4, z, ax ? sx : 0.4, 0.3, ax ? 0.4 : sz, Wd.wall);
        P0.box(x, 2.2, z, ax ? sx : 0.14, 0.14, ax ? 0.14 : sz, st.metal);
        P0.box(x, 1.03, z, ax ? sx : 0.5, 0.1, ax ? 0.5 : sz, Wd.trim, { glow: 1 });
    };
    edge(mx, P.z1 + 1.2, Wd2 + 4.8, 2.4); edge(P.x0 - 1.2, mz, 2.4, D2); edge(P.x1 + 1.2, mz, 2.4, D2);
    for (let x = P.x0; x <= P.x1; x += 12) D0.box(x, 2.2, P.z1 + 1.2, 0.4, 2.4, 0.4, st.metal);
    for (let z = P.z0 + 12; z <= P.z1; z += 12) for (const sx of [-1, 1]) D0.box(sx * (P.x1 + 1.2), 2.2, z, 0.4, 2.4, 0.4, st.metal);
    S0.box(0, -8.2, mz + 1.4, Wd2 + 4.8, 16, D2 + 4.4, Wd.wall2, { tile: 8 });
    // (the footing either side of the Keyway's mouth, under the gantry's towers)
    for (const sx of [-1, 1]) S0.box(sx * 22.4, -3.6, 40, 10.2, 8.4, 9, Wd.wall2, { tile: 8 });
    S0.box(0, -17.5, mz + 1.4, Wd2 - 16, 3, D2 - 14, Wd.rim, { tile: 8 });
    for (const [x, z, sx, sz] of [[0, P.z1 + 3.65, Wd2 + 4.8, 0.14], [P.x0 - 2.45, mz + 1.4, 0.14, D2 + 4.4], [P.x1 + 2.45, mz + 1.4, 0.14, D2 + 4.4]]) P0.box(x, -15.4, z, sx, 0.7, sz, Wd.trim, { glow: 1 });
    // great thrusters under the corners, their nozzles glowing
    for (const sx of [-1, 1]) for (const z of [P.z0 + 14, P.z1 - 12]) { pylon(P0, sx * (P.x1 - 14), z, 5, 5, Wd.wall2, st.accent, -21); P0.box(sx * (P.x1 - 14), -21.4, z, 7, 0.8, 7, st.flame, { glow: 1, soft: true }); }
    // light posts by the lanes and round the edge
    for (const [x, z] of [[P.x0 + 2, P.z1 - 2], [P.x1 - 2, P.z1 - 2], [P.x0 + 2, 70], [P.x1 - 2, 70], [-13, 96], [13, 96]]) lampPost(P0, lights, x, z, 7.5, st, Wd);
    for (const sx of [-1, 1]) for (const z of [52, 68, 78, 102]) lampPost(P0, lights, sx * 9.5, z, 6, st, Wd);

    // ----- the north side: a station module either side, the launch gantry between them over the way onto the Keyway, a ring of
    // warp light standing in it; beyond the modules a rocket on its pad (west) and a great radar dish (east) -----
    const ring = { z: 40, cy: 13.5, rIn: 14.2, rOut: 17.4 }, GX = 23, GH = 46;
    for (const sx of [-1, 1]) {
        const x0 = 28, x1 = P.x1 + 3, wz = 40, xm = sx * (x0 + x1) / 2, len = x1 - x0;
        // the module: white hull on a dark foot, a stripe of the sector's accent, a row of lit ports, a roof of plant
        S0.box(xm, 7, wz, len, 14, 8, Wd.wall, { tile: 8 });
        S0.box(xm, 1.1, wz + 0.2, len, 2.2, 8.6, Wd.wall2, { tile: 8 });
        P0.box(xm, 10.6, wz + 4.04, len, 1.5, 0.1, Wd.banner);
        P0.box(xm, 14.2, wz, len + 0.6, 0.5, 8.8, st.cap, { soft: true });
        for (let x = x0 + 4; x < x1 - 3; x += 7) {
            P0.box(sx * x, 6.4, wz + 4.06, 3.2, 2.2, 0.14, st.dark, { soft: !low });
            P0.box(sx * x, 6.4, wz + 4.16, 2.5, 1.5, 0.1, 0xfff2a0, { glow: 1 });
        }
        P0.box(xm, 2.5, wz + 4.34, len, 0.2, 0.1, Wd.trim, { glow: 1 });
        // on the roof: tanks, a duct, a little dish
        for (const [dx, r, h, c] of [[8, 2.0, 5, Wd.wall], [13, 1.5, 3.6, st.accent], [30, 2.4, 6, Wd.wall2]]) pylon(P0, sx * (x0 + dx), wz, h, r, c, st.metal, 14.4);
        P0.box(sx * (x0 + 21), 15.4, wz, 9, 1.6, 2.4, st.metal, { soft: !low });
        stack(P0, sx * (x0 + 40), wz, [[0.3, 16.2, st.metal], [1.6, 16.9, Wd.wall], [2.8, 18, Wd.wall]], 8, one);
        P0.box(sx * (x0 + 40), 15.3, wz, 0.5, 1.8, 0.5, st.metal);
        // a tower at the corner: a drum with a domed top, an aerial
        const tx = sx * (P.x1 + 1), tw = 5.2, th = 26;
        pylon(S0, tx, wz, th, tw, Wd.wall2, Wd.banner);
        stack(P0, tx, wz, [[tw * 1.1, th, Wd.wall], [tw * 0.8, th + 3, Wd.wall], [tw * 0.3, th + 4.6, st.accent]], 8, one);
        P0.box(tx, th + 8, wz, 0.3, 7, 0.3, st.metal);
        P0.box(tx, th + 11.8, wz, 0.6, 0.6, 0.6, 0xff3a4a, { glow: 2 });
        lights.push([tx, th + 11.8, wz, 2.4, 0xff3a4a]);
        for (const wy of [th * 0.45, th * 0.72]) P0.box(tx, wy, wz + tw + 0.1, 2.2, 1.6, 0.14, 0xfff2a0, { glow: 1 });
        if (!low) prop(D0, D0, lights, 'crates', sx * 33, wz + 7.5, R, st, Wd, low);
        // the gantry's tower: a core of hull in a cage of struts, platforms every so often, a plasma beacon on top
        const gx = sx * GX;
        S0.box(gx, GH / 2 - 4, wz, 5.2, GH + 8, 5.2, Wd.wall, { tile: 8 });
        for (const ex of [-1, 1]) for (const ez of [-1, 1]) P0.box(gx + ex * 3.6, GH / 2, wz + ez * 3.6, 0.6, GH, 0.6, st.metal);
        for (let y = 6; y < GH; y += 8) {
            P0.box(gx, y, wz, 8.2, 0.5, 8.2, Wd.wall2);
            for (const ez of [-1, 1]) P0.box(gx, y + 4, wz + ez * 3.6, 9.4, 0.36, 0.36, st.metal, { rz: ez * 0.82 * sx });
            P0.box(gx - sx * 2.66, y + 4, wz, 0.1, 5.4, 1.4, Wd.trim, { glow: 1 });
        }
        P0.box(gx, GH + 0.5, wz, 9, 1, 9, Wd.wall2, { soft: !low });
        P0.box(gx, GH + 1.6, wz, 2.6, 1.2, 2.6, st.metal, { soft: !low });
        fl.push([gx, GH + 2.1, wz, 2.6, st.flame]);
        P0.box(gx, 6, wz + 2.7, 4.4, 9, 0.12, Wd.banner);
        P0.box(gx, 6, wz + 2.8, 2.4, 2.4, 0.3, Wd.keys[0], { soft: !low }); P0.box(gx, 6, wz + 3.0, 1.6, 1.6, 0.1, Wd.trim, { glow: 1 });
    }
    // the gantry's bridge: a truss between the towers, lamps under it, the Keyway's name over it; the ring of warp light in its frame
    {
        const by = 35, bz = ring.z, w = GX * 2 - 5;
        P0.box(0, by + 2.4, bz, w, 0.8, 4, Wd.wall2); P0.box(0, by - 2.4, bz, w, 0.8, 4, Wd.wall2);
        for (let x = -w / 2 + 2.5, i = 0; x < w / 2; x += 5, i++) {
            for (const ez of [-1, 1]) P0.box(x, by, bz + ez * 1.8, 0.4, 4.4, 0.4, st.metal);
            for (const ez of [-1, 1]) P0.box(x + 2.5, by, bz + ez * 1.8, 0.34, 6.6, 0.34, st.metal, { rz: i % 2 ? 0.84 : -0.84 });
            P0.box(x, by - 3.1, bz, 1.0, 0.7, 1.0, st.lamp, { glow: 1, soft: !low });
        }
        P0.box(0, by - 2.9, bz + 2.06, w, 0.3, 0.1, Wd.trim, { glow: 1 });
        const rg = new T.RingGeometry(ring.rIn, ring.rOut, 72, 1), pp = rg.attributes.position, uv = rg.attributes.uv;
        for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); uv.setXY(i, (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1, (Math.hypot(x, y) - ring.rIn) / (ring.rOut - ring.rIn)); }
        energyGeo(E, rg, 2, new T.Matrix4().makeTranslation(0, ring.cy, ring.z), shade(Wd.glow, 0.55), shade(Wd.trim, 0.8), 1);
        rg.dispose();
        signs.add([big('THE KEYWAY', AQUA, 112, '#06142a'), { t: 'every step is +1 Speed: clack your way out!', c: '#ffffff', s: '#06142a', px: 40 }], 30, new V3(0, by + 9.5, bz + 3), false, 320);
    }
    // the rocket on its pad (north-west): boosters either side, fins, lit ports, a gantry arm to it
    {
        const rx = -54, rz = 18, r = 5, H = 44, body = Wd.wall, c2 = Wd.banner;
        S0.box(rx, -5, rz + 2, 30, 10, 30, Wd.wall2, { tile: 8 });
        P0.box(rx, 0.3, rz + 2, 31, 0.6, 31, Wd.rim, { soft: true });
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; D0.box(rx + Math.cos(a) * 13, 0.66, rz + 2 + Math.sin(a) * 13, 1.2, 0.14, 1.2, st.accent, { glow: 1, ry: a }); }
        stack(P0, rx, rz, [[r * 0.7, 2.4, st.dark], [r * 0.96, 4.4, st.metal], [r, 5.4, body], [r, H * 0.42, body], [r, H * 0.42 + 0.01, c2], [r, H * 0.5, c2], [r, H * 0.5 + 0.01, body], [r, H * 0.72, body], [r * 0.86, H * 0.82, body], [r * 0.52, H * 0.93, c2], [r * 0.12, H, c2]], 10, one);
        stack(P0, rx, rz, [[r * 0.55, 0.9, st.flame], [r * 0.7, 2.4, st.dark]], 10, one, 1, 0);
        P0.box(rx, H + 2, rz, 0.3, 4.4, 0.3, st.metal); P0.box(rx, H + 4.4, rz, 0.6, 0.6, 0.6, 0xff3a4a, { glow: 2 });
        for (const a of [0.6, 2.2, 3.8, 5.4]) {
            const cx = Math.cos(a), cz = Math.sin(a);
            // a fin, and a port up the side between the fins
            P0.box(rx + cx * (r + 1.9), 6.5, rz + cz * (r + 1.9), 4.4, 9, 0.5, c2, { ry: -a, rz: -0.24 });
            P0.box(rx + Math.cos(a + 0.8) * (r * 0.97), H * 0.62, rz + Math.sin(a + 0.8) * (r * 0.97), 1.7, 1.7, 0.3, 0x9aeaff, { glow: 1, ry: -(a + 0.8) + Math.PI / 2, soft: !low });
        }
        for (const sd of [-1, 1]) {
            const bx = rx + sd * (r + 2.3), br = 2.1, bh = 26;
            stack(P0, bx, rz, [[br * 0.7, 1.8, st.dark], [br, 3.6, body], [br, bh * 0.7, body], [br, bh * 0.7 + 0.01, c2], [br, bh * 0.8, c2], [br * 0.6, bh * 0.94, body], [br * 0.1, bh, body]], 8, one);
            P0.box(bx, 1.5, rz, br * 1.2, 0.5, br * 1.2, st.flame, { glow: 1, soft: true });
        }
        // the service tower beside it, an arm across to the rocket, a lift of lights up it
        S0.box(rx + 14, 17, rz + 2, 3.4, 40, 3.4, st.metal, { tile: 8 });
        for (let y = 6; y < 36; y += 6) P0.box(rx + 14, y, rz + 2, 4.6, 0.4, 4.6, Wd.wall2);
        P0.box(rx + 9, 27, rz + 1, 8.4, 1, 2, Wd.wall2); P0.box(rx + 9, 14, rz + 1, 8.4, 0.7, 1.6, Wd.wall2);
        for (let y = 4; y < 36; y += 4) D0.box(rx + 12.24, y, rz + 2, 0.1, 1.4, 0.7, y % 8 ? Wd.trim : st.accent, { glow: 1 });
        lights.push([rx, 8, rz, 9, st.flame]);
    }
    // the radar dish (north-east): a tower, a great bowl turned to the sky, its feed's tip glowing
    {
        const dx = 54, dz = 20, h = 22;
        S0.box(dx, -5, dz, 20, 10, 20, Wd.wall2, { tile: 8 });
        P0.box(dx, 0.3, dz, 21, 0.6, 21, Wd.rim, { soft: true });
        pylon(P0, dx, dz, h, 3.2, Wd.wall, Wd.banner);
        for (const a of [0.4, 2.5, 4.6]) P0.box(dx + Math.cos(a) * 5, 5.2, dz + Math.sin(a) * 5, 0.7, 12, 0.7, st.metal, { rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 });
        stack(P0, dx, dz, [[1.6, h, st.metal], [6.5, h + 2.2, Wd.wall], [11.5, h + 6, Wd.wall], [12.2, h + 6.6, Wd.banner]], 12, one);
        stack(P0, dx, dz, [[11.4, h + 6.3, shade(Wd.wall, 0.8)], [6.4, h + 2.6, shade(Wd.wall, 0.7)], [1.4, h + 0.9, st.dark]], 12, one);
        for (const a of [0, 2.094, 4.189]) P0.box(dx + Math.cos(a) * 4.6, h + 8.6, dz + Math.sin(a) * 4.6, 0.3, 12, 0.3, st.metal, { rz: Math.cos(a) * 0.72, rx: -Math.sin(a) * 0.72 });
        P0.box(dx, h + 13.6, dz, 1.3, 1.3, 1.3, st.lamp, { glow: 1, soft: !low });
        lights.push([dx, h + 13.6, dz, 3.4, st.lamp]);
    }

    // ----- the Keyway -----
    const hw = W.halfW, pads = [], blades = [], gates = [], PL = new Plaques(low, '#' + new T.Color(Wd.trim).getHexString()), LC = laserColors(Wd);
    ctx.PL = PL;
    for (let k = 0; k < WALLS_N; k++) {
        const Sk = new Kit(), Pk = new Kit({ glow: true }), Dk = new Kit({ glow: true }), zs = k === 0 ? P.z0 : wallZ(k), zn = k === WALLS_N - 1 ? northEnd - 6 : wallZ(k + 1), plan = stagePlan(wi, k);
        // ze: the gate at this stage's end (the one that pays it; the last stage's is its finish gate, short of the far end)
        const ze = wallZ(k + 1), lakes = plan.lakes || [], plats = plan.plats || [], icy = plan.icy || [], list = plan.list || [];
        stretchS.push(Sk); stretchP.push(Pk);
        Dk.far = NEAR_D; detail.push(Dk); ctx.dk = Dk;
        const pools = list.filter((o) => o.kind === 'pool').concat(lakes.map((l) => ({ kind: 'pool', x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, lake: true })));
        // the floor: the keyboard's plate, dark and deep under the keys (they stand proud of it like a real board's), and a walkway of
        // hull at the runners' height wherever there are no keys: the stage's edges, round its gates, under what's in the way
        floorQuad(Sk, -hw - 0.5, hw + 0.5, zn, zs, -1.15, shade(Wd.keys[1], 0.28));
        const slabC = Wd.floor;
        const slab = (x0, x1, z0, z1) => { x0 = Math.max(-hw - 0.5, x0); x1 = Math.min(hw + 0.5, x1); z0 = Math.max(zn, z0); z1 = Math.min(zs, z1); if (x1 - x0 > 0.05 && z1 - z0 > 0.05) Sk.box((x0 + x1) / 2, -0.565, (z0 + z1) / 2, x1 - x0, 1.17, z1 - z0, slabC, { tile: 8 }); };
        // a rift's margin: the slab round it but not over it
        const ring4 = (o, m) => { slab(o.x0 - m, o.x1 + m, o.z1, o.z1 + m); slab(o.x0 - m, o.x1 + m, o.z0 - m, o.z0); slab(o.x0 - m, o.x0, o.z0, o.z1); slab(o.x1, o.x1 + m, o.z0, o.z1); };
        // the walkways down both sides, broken wherever a rift runs up to the kerb
        for (const sx of [-1, 1]) {
            const x0 = sx < 0 ? -hw - 0.5 : hw - 2.4, x1 = sx < 0 ? -hw + 2.4 : hw + 0.5;
            const cuts = pools.filter((o) => (sx < 0 ? o.x0 < x1 : o.x1 > x0)).map((o) => [o.z0, o.z1]).sort((a, b) => b[1] - a[1]);
            let top = zs;
            for (const [a, b] of cuts) { if (b < top) slab(x0, x1, b, top); top = Math.min(top, a); }
            slab(x0, x1, zn, top);
        }
        slab(-hw, hw, zs - 7, zs); slab(-hw, hw, zn, zn + 6.5);
        // (the first gate stands in the gantry's mouth, short of the Starport's edge)
        if (k === 0) slab(-hw, hw, wallZ(0) - 6.5, wallZ(0) + 6.5);
        if (k === WALLS_N - 1) slab(-hw, hw, ze - 6.5, ze + 7);
        for (const o of lakes) { slab(-hw, hw, o.z1, o.z1 + 2.6); slab(-hw, hw, o.z0 - 2.6, o.z0); }
        for (const o of icy) slab(o.x0, o.x1, o.z0, o.z1);
        for (const o of list) {
            if (o.kind === 'pool') ring4(o, 2.6);
            else if (o.kind === 'sweeper') slab(-hw, hw, o.z - SWEEP.r - 1.5, o.z + SWEEP.r + 1.5);
            else if (o.kind === 'boulders') for (const lx of o.lanes) slab(lx - BALL.r - 1.4, lx + BALL.r + 1.4, o.z0 - 14, o.z1 + 4);
            else if (o.kind === 'gumballs') slab(-hw, hw, o.z0 - 1, o.z1 + 1);
            else if (o.kind === 'jwall') slab(-hw, hw, o.z - JWALL.d / 2 - 2, o.z + JWALL.d / 2 + 2);
            else if (o.kind === 'hurdle' || o.kind === 'slit') slab(-hw, hw, o.z - (o.d || 2) / 2 - 2.4, o.z + (o.d || 2) / 2 + 2.4);
            else if (o.kind === 'slider') slab(-hw, hw, o.z - SLIDER.d / 2 - 2.6, o.z + SLIDER.d / 2 + 2.6);
            else if (o.kind === 'blade') slab(-hw, hw, o.z - 3.4, o.z + 3.4);
            else if (o.kind === 'boost') slab(o.x - o.hw - 1.6, o.x + o.hw + 1.6, o.z - o.hd - 1.6, o.z + o.hd + 1.6);
            else if (o.kind === 'pillars') for (const p of o.list) { const m = p.s * 0.7 + 2.3; slab(p.x - m, p.x + m, p.z - m, p.z + m); }
        }
        // the rifts: their walls, what's in them (a decal: plasma, magma, cryo, dark matter), a lip of light
        for (const o of pools) {
            const full = o.x1 - o.x0 > hw * 1.9, cx = (o.x0 + o.x1) / 2, w = o.x1 - o.x0, d = o.z1 - o.z0;
            for (const zz2 of [o.z0 + 0.2, o.z1 - 0.2]) Sk.box(cx, -0.9, zz2, w, 1.8, 0.4, shade(Wd.rim, 0.8), { tile: 8 });
            if (!full) { if (o.x1 < hw - 0.5) Sk.box(o.x1 - 0.2, -0.9, (o.z0 + o.z1) / 2, 0.4, 1.8, d, shade(Wd.rim, 0.8), { tile: 8 }); if (o.x0 > -hw + 0.5) Sk.box(o.x0 + 0.2, -0.9, (o.z0 + o.z1) / 2, 0.4, 1.8, d, shade(Wd.rim, 0.8), { tile: 8 }); }
            decal(D, 0, cx, -0.35, (o.z0 + o.z1) / 2, w / 2, d / 2, Wd.hazard, Wd.hazard2, 1, full ? 0 : 1);
            for (const zz2 of [o.z0, o.z1]) Pk.box(cx, 0.08, zz2, w, 0.16, 0.5, Wd.hazard2, { glow: 1, shade: 0.8 });
            if (!full) { if (o.x1 < hw - 0.5) Pk.box(o.x1, 0.08, (o.z0 + o.z1) / 2, 0.5, 0.16, d, Wd.hazard2, { glow: 1, shade: 0.8 }); if (o.x0 > -hw + 0.5) Pk.box(o.x0, 0.08, (o.z0 + o.z1) / 2, 0.5, 0.16, d, Wd.hazard2, { glow: 1, shade: 0.8 }); }
        }
        // the gate at this stage's start, "STAGE k+1" on it (and the last stage's finish gate); the rails' pylons clear of them
        const gz = wallZ(k), blz = list.filter((o) => o.kind === 'blade' || o.kind === 'slider').map((o) => o.z);
        const skip = (z) => Math.abs(z - gz) < 9 || Math.abs(z - ze) < 9 || blz.some((b) => Math.abs(z - b) < 3.6) || (k === 0 && z > 34);
        for (const sx of [-1, 1]) railRun(Sk, Pk, sx, XIN, zn, k === 0 ? 36 : zs, ctx, skip);
        stageGate(Sk, Pk, gz, ctx, PL.cell('s' + (k + 1), [big('STAGE ' + (k + 1), AQUA, 120, '#04122a')], true, 0));
        if (k === WALLS_N - 1) stageGate(Sk, Pk, ze, ctx, PL.cell('fin', [big('FINISH!', LIME, 120, '#062a06')], true, 0));
        // before it, when it's laid out for more than a beginner, a "Recommended Level" holo on the left
        const rl = recLevel(wi, k);
        if (rl > 1) recBoard(Pk, -hw + 1.7, gz + 7.5, ctx, PL.cell('r' + rl, [{ t: 'RECOMMENDED', c: '#9aeaff', s: '#04122a', px: 46 }, big('LEVEL ' + rl, WHITE, 96, '#04122a')], false, 1));
        // the stage's name over its gate
        const ty = STAGE_TYPES && STAGE_TYPES[plan.type];
        const nameSign = signs.add([{ t: (ty ? ty.title : 'The Keyway').toUpperCase(), c: '#ffe24a', s: '#0a1238', px: 38 }, big(stageName(wi, k), WHITE, 84, '#0a1238')], 15, new V3(0, GATE.under + GATE.beam + 4.8, gz + 3.5), false, 150);
        gates.push({ k, z: gz, nameSign });
        // by the gate at its end, on the right: a golden trophy on a plinth, the Wins passing that gate pays over it, a gold plate
        // under it (grey while it cools down)
        const tx = hw - 1.5, tz = ze + 4.8;
        trophy(Sk, Pk, tx, tz, ctx);
        const padSign = signs.add([big('+' + fmt(padWins(wi, k)) + ' WINS', GOLD, 96, '#3a1a00', 'crown')], 8.5, new V3(tx - 3.4, 13, tz), true, 110);
        pads.push({ k, sign: padSign, x: tx, z: tz, di: decal(D, 2, tx - 0.4, 0.12, tz, 2.5, 2.5, 0, 0, 1, 0) });
        // drifting by the stage: a few little asteroids either side (close up only), a buoy with a light at its start
        {
            // (the first stage's keep clear of the rocket's pad and the radar dish)
            const Rk = rng(wi * 131 + k * 17 + 9), nA = low ? 2 : 5, zt = k === 0 ? -8 : zs, L = zt - zn;
            for (let i = 0; i < nA; i++) {
                const sx = i % 2 ? 1 : -1, s = 1.6 + Rk() * 3.2;
                lump(Dk, sx * (27 + Rk() * 24), -4 + Rk() * 16, zn + (i + 0.5) / nA * L, s * (0.9 + Rk() * 0.5), s * 0.7, s, Rk, st.rock, st.rock2, 5 + Rk() * 0.98, 6);
            }
        }
        ctx.dk = null;
        // what's in the way
        for (const o of list) {
            if (o.kind === 'hurdle') {
                // a barrier across the way: blocks of hull in two tones, a bar of light along its top
                const nb = 12, bw = hw * 2 / nb;
                for (let j = 0; j < nb; j++) Sk.box(-hw + (j + 0.5) * bw, o.h / 2, o.z, bw + 0.02, o.h, o.d, j % 2 ? Wd.wall : st.accent, { tile: 8 });
                Pk.box(0, o.h + 0.08, o.z, hw * 2, 0.16, o.d * 0.6, Wd.hazard2, { glow: 1 });
                for (const sx of [-1, 1]) Sk.box(sx * (hw - 0.6), o.h / 2 + 0.6, o.z, 1.6, o.h + 1.2, o.d + 0.6, Wd.wall2, { tile: 8 });
            } else if (o.kind === 'pillars') {
                // pylons to weave round: a drum of hull banded in the accent, a lamp on top
                for (const p of o.list) {
                    Sk.box(p.x, 0.4, p.z, p.s + 1, 0.8, p.s + 1, Wd.wall2, { tile: 8 });
                    pylon(Pk, p.x, p.z, 12.4, p.s * 0.46, Wd.wall, Wd.banner, 0.8);
                    Pk.box(p.x, 13.7, p.z, 1.1, 1.0, 1.1, st.lamp, { glow: 1, soft: !low });
                    if (!low) lights.push([p.x, 13.7, p.z, 2.2, st.lamp]);
                }
            } else if (o.kind === 'slit') {
                // a bulkhead across the way with one airlock open in it
                const l0 = -hw, l1 = o.gx - o.gw / 2, r0 = o.gx + o.gw / 2, r1 = hw;
                for (const [a, b] of [[l0, l1], [r0, r1]]) {
                    if (b - a < 0.05) continue;
                    Sk.box((a + b) / 2, o.h / 2, o.z, b - a, o.h, o.d, Wd.wall, { tile: 8 });
                    Sk.box((a + b) / 2, 0.6, o.z, b - a + 0.3, 1.2, o.d + 0.3, Wd.wall2, { tile: 8 });
                    Pk.box((a + b) / 2, o.h + 0.2, o.z, b - a, 0.4, o.d + 0.3, st.cap);
                }
                Pk.box(o.gx, o.h - 0.1, o.z, o.gw, 0.5, o.d + 0.2, Wd.wall2);
                for (const ex of [l1, r0]) if (ex > -hw + 0.1 && ex < hw - 0.1) { Pk.box(ex, o.h / 2, o.z + o.d / 2 + 0.15, 0.4, o.h, 0.12, Wd.trim, { glow: 1 }); Pk.box(ex, o.h / 2, o.z - o.d / 2 - 0.15, 0.4, o.h, 0.12, Wd.trim, { glow: 1 }); }
                Pk.box(o.gx, o.h + 2.2, o.z, 1.2, 2.2, 0.3, Wd.trim, { glow: 1 });
                Pk.box(o.gx - 0.7, o.h + 1.1, o.z, 0.5, 1.8, 0.3, Wd.trim, { glow: 1, rz: 0.8 }); Pk.box(o.gx + 0.7, o.h + 1.1, o.z, 0.5, 1.8, 0.3, Wd.trim, { glow: 1, rz: -0.8 });
            } else if (o.kind === 'boost') {
                decal(D, 1, o.x, 0.09, o.z, o.hw, o.hd, mixC(Wd.keys[1], 0x000000, 0.55), mixC(Wd.glow, 0xffffff, 0.35), 1, 0);
                Sk.box(o.x, 0.04, o.z, o.hw * 2 + 0.8, 0.08, o.hd * 2 + 0.8, Wd.rim, { tile: 8 });
            } else if (o.kind === 'blade') {
                // the beam a wrecking arm hangs from, rail to rail
                const by = BLADE_PIVOT + 0.8, nb = 10, bw = (XIN + 2) * 2 / nb;
                Pk.box(0, by, o.z, (XIN + 2) * 2, 1.5, 1.5, Wd.wall2);
                for (let j = 0; j <= nb; j++) Pk.box(-(XIN + 2) + j * bw, by, o.z, 0.4, 1.7, 1.7, st.metal);
                for (const sx of [-1, 1]) Pk.box(sx * (XIN + 1.3), by / 2, o.z, 1.6, by, 2.4, Wd.wall);
                Pk.box(0, by - 0.2, o.z, 2.4, 2, 2.4, st.accent, { soft: true });
                for (let x = -14; x <= 14; x += 4) Dk.box(x, 0.05, o.z, 2, 0.04, 0.4, Wd.hazard2, { glow: 1, shade: 0.8 });
                blades.push({ o, z: o.z, i: blades.length });
            } else if (o.kind === 'slider') {
                // a sliding force gate (stagefx.js draws it): its track across the floor in warning stripes, a dock at each rail with a
                // lamp in the laser's colour
                const tz = SLIDER.d / 2 + 0.7;
                floorQuad(Sk, -hw, hw, o.z - tz, o.z + tz, 0.05, shade(Wd.rim, 0.85));
                for (const sz2 of [-1, 1]) for (let x = -hw + 1; x < hw - 1; x += 3) Dk.box(x + 0.75, 0.07, o.z + sz2 * tz, 1.5, 0.05, 0.4, x % 6 < 3 ? LC.c : 0xffffff, { glow: 1, shade: 0.85 });
                for (const sx of [-1, 1]) { for (let j = 0; j < 4; j++) Pk.box(sx * (hw - 0.4), 0.8 + j * 1.6, o.z, 0.8, 1.6, SLIDER.d + 1, j % 2 ? st.metal : Wd.wall2); Pk.box(sx * (hw - 0.4), 6.75, o.z, 0.7, 0.5, 0.7, LC.c, { glow: 1 }); }
            } else if (o.kind === 'sweeper') {
                // the laser's emitter: a foot, a column banded in the laser's colour, a lamp on top (its turning head is the beam's,
                // stagefx.js); a danger ring on the floor round it as far as the beam reaches
                const pr = SWEEP.post, yb = Math.max(0.2, SWEEP.y - SWEEP.t / 2), yt = SWEEP.y + SWEEP.t / 2;
                Pk.box(o.x, yb / 2, o.z, pr * 2 + 0.8, yb, pr * 2 + 0.8, Wd.wall2, { soft: !low });
                Pk.box(o.x, (yt + 5.4) / 2, o.z, pr * 2, 5.4 - yt, pr * 2, st.metal);
                for (const y of [yt + 0.9, 4.4]) Pk.box(o.x, y, o.z, pr * 2 + 0.12, 0.26, pr * 2 + 0.12, LC.c, { glow: 1 });
                Pk.box(o.x, 5.65, o.z, pr * 2 + 0.5, 0.5, pr * 2 + 0.5, st.dark, { soft: !low });
                Pk.box(o.x, 6.15, o.z, 1.1, 0.5, 1.1, LC.c, { glow: 1 });
                decal(D, 3, o.x, 0.11, o.z, SWEEP.r + 1.2, SWEEP.r + 1.2, LC.c, 0, 1, (o.dir > 0 ? 0 : 1) + 2);
            } else if (o.kind === 'boulders') {
                for (const lx of o.lanes) {
                    floorQuad(Sk, lx - BALL.r - 0.6, lx + BALL.r + 0.6, o.z0 - 12, o.z1 + 2, 0.05, shade(Wd.floor2, 0.86));
                    for (let z = o.z1; z > o.z0; z -= 9) Dk.box(lx, 0.09, z, 1.4, 0.04, 2.8, Wd.hazard2, { glow: 1, shade: 0.8 });
                }
            } else if (o.kind === 'gumballs') {
                for (let z = o.z1; z > o.z0; z -= 6) for (let x = -hw + 3; x < hw - 2; x += 6) floorQuad(Sk, x - 2.9, x + 2.9, z - 5.9, z - 0.1, 0.04, ((x + z) / 6 | 0) & 1 ? mixC(Wd.floor, Wd.keys[2], 0.25) : mixC(Wd.floor2, Wd.keys[0], 0.15));
            } else if (o.kind === 'jwall') {
                for (const sz2 of [-1, 1]) Dk.box(0, 0.08, o.z + sz2 * (JWALL.d / 2 + 0.8), hw * 2, 0.04, 0.5, Wd.hazard2, { glow: 1, shade: 0.85 });
                for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) Pk.box(sx * (hw - 0.3), 1.5 + j * 3, o.z, 1.2, 3.02, JWALL.d + 1, j % 2 ? st.metal : Wd.wall2);
            }
        }
        // the platforms: thruster columns rising out of the rift, giant keycaps on top (a long one a bridge of them, a key a step);
        // jump pads (an anti-grav coil under a giant spacebar)
        for (const p of plats) {
            if (p.kind === 'stone') {
                Sk.box(p.x, (p.top - 0.9 - 2.4) / 2, p.z, p.sx * 0.86, p.top - 0.9 + 2.4, p.sz * 0.86, Wd.wall2, { tile: 8 });
                const along = p.sz >= p.sx, lng = along ? p.sz : p.sx, sht = along ? p.sx : p.sz, n = Math.max(1, Math.round(lng / Math.max(3.8, sht * 1.05))), gap = n > 1 ? 0.96 : 1;
                for (let i = 0; i < n; i++) {
                    const o2 = (i + 0.5) / n * lng - lng / 2, hl = lng / n / 2 * gap, hs = sht / 2 * (n > 1 ? 0.98 : 1);
                    const kx = p.x + (along ? 0 : o2), kz = p.z + (along ? o2 : 0), hx = along ? hs : hl, hz = along ? hl : hs;
                    domes.push({ x: kx, z: kz, y: p.top + 0.12, r: hz, sx: hx, h: 1.1, c: Wd.keys[Math.abs(Math.round(kx * 3 + kz)) % 3], L: hx > hz * 1.3 ? -1 : undefined });
                }
            } else {
                const r = p.sx / 2;
                stack(Pk, p.x, p.z, [[r * 0.8, -1.4, shade(Wd.wall2, 0.8)], [r * 0.8, -0.6, Wd.wall2]], 8, one);
                for (let j = 0; j < 4; j++) stack(Pk, p.x, p.z, [[r * 0.42, -0.6 + j * 0.34, Wd.trim], [r * 0.46, -0.45 + j * 0.34, 0xffffff], [r * 0.42, -0.3 + j * 0.34, Wd.trim]], 8, one, 1, j % 2 ? 1 : 0);
                domes.push({ x: p.x, z: p.z, y: p.top + 0.1, r: r * 0.62, sx: r * 0.98, h: 0.7, c: Wd.keys[2], L: -1 });
            }
        }
        // ice: a frozen walkway
        for (const o of icy) decal(D, 7, 0, 0.06, (o.z0 + o.z1) / 2, hw, (o.z1 - o.z0) / 2, 0xffffff, 0, 1, 0);
        // the keys: keyboard rows across the whole stage, clear of what's in the way and the gates
        jellyRows(domes, Wd, R, low, -hw + 2.4, hw - 2.4, zn + 6, zs - 7, (x, z) => {
            if (Math.abs(z - gz) < 6.5 || Math.abs(z - ze) < 6.5) return true;
            for (const o of lakes) if (z > o.z0 - 2.6 && z < o.z1 + 2.6) return true;
            for (const o of icy) if (inRect(o, x, z)) return true;
            for (const o of list) {
                if (o.kind === 'pool') { if (z > o.z0 - 2.6 && z < o.z1 + 2.6 && x > o.x0 - 2.6 && x < o.x1 + 2.6) return true; }
                else if (o.kind === 'sweeper') { if (Math.abs(z - o.z) < SWEEP.r + 1.5) return true; }
                else if (o.kind === 'boulders') { if (z > o.z0 - 14 && z < o.z1 + 4 && o.lanes.some((lx) => Math.abs(x - lx) < BALL.r + 1.4)) return true; }
                else if (o.kind === 'gumballs') { if (z > o.z0 - 1 && z < o.z1 + 1) return true; }
                else if (o.kind === 'jwall') { if (Math.abs(z - o.z) < JWALL.d / 2 + 2) return true; }
                else if (o.kind === 'hurdle' || o.kind === 'slit') { if (Math.abs(z - o.z) < (o.d || 2) / 2 + 2.4) return true; }
                else if (o.kind === 'slider') { if (Math.abs(z - o.z) < SLIDER.d / 2 + 2.6) return true; }
                else if (o.kind === 'blade') { if (Math.abs(z - o.z) < 3.4) return true; }
                else if (o.kind === 'boost') { if (Math.abs(x - o.x) < o.hw + 1.6 && Math.abs(z - o.z) < o.hd + 1.6) return true; }
                else if (o.kind === 'pillars') { for (const p of o.list) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.s * 0.7 + 2.3) ** 2) return true; }
            }
            return false;
        });
    }
    // the far end: the case's end, a warp ring between two pylons, and through it the next sector
    {
        const P9 = stretchP[stretchP.length - 1], S9 = stretchS[stretchS.length - 1], z = endPortal.z, nextW = WORLDS[wi + 1];
        S9.box(0, -CASE / 2 + 0.3, northEnd - 6 - WT / 2, (XIN + WT) * 2, CASE + 0.6, WT, Wd.wall2, { tile: 8 });
        P9.box(0, 2.2, northEnd - 6 - WT / 2 + 0.6, (XIN + WT) * 2, 0.3, 0.5, Wd.wall);
        for (const sx of [-1, 1]) { pylon(P9, sx * 11, z, 22, 1.7, Wd.wall, Wd.banner); P9.box(sx * 11, 22.8, z, 2.2, 1.2, 2.2, st.metal, { soft: !low }); fl.push([sx * 11, 23.2, z, 2, st.flame]); }
        S9.box(0, 23, z, 26, 3, 3.6, Wd.wall2, { tile: 8 });
        P9.box(0, 24.8, z, 26.4, 0.5, 4, st.cap, { soft: true });
        P9.box(0, 21.4, z + 1.85, 18, 0.3, 0.1, Wd.trim, { glow: 1 });
        portalDecal(D, 0, 0.2, z, 18.6, 21.6, Wd.glow, nextW ? nextW.glow : 0xffffff);
        signs.add([big(nextW ? 'ON TO ' + nextW.name.toUpperCase() + '!' : 'ALL SECTORS CLEARED!', GOLD, 92, '#3a1a00')], 22, new V3(0, 29, z + 2), false, 160);
    }

    // ----- the Upgrade Lab and the Rebirth Reactor: station kiosks. A back wall of hull with lit screens, a counter under a curved
    // canopy on two pillars, a sign of light on the roof -----
    const kiosk = (q, hullC, canopyC, canopy2) => {
        const x = q.x, z = q.z, w = 24, hw2 = w / 2, zf = z + 5.6, zb = z - 8.4;
        S0.box(x, 0.15, z - 1.4, w + 2, 0.3, 17, Wd.rim, { tile: 8 });
        // the back wall, a dark foot, screens along it
        S0.box(x, 5, zb + 1.5, w, 10, 3, hullC, { tile: 8 });
        S0.box(x, 0.9, zb + 1.6, w + 0.2, 1.8, 3.2, Wd.wall2, { tile: 8 });
        for (let i = 0; i < 4; i++) {
            P0.box(x - 7.5 + i * 5, 6.6, zb + 3.06, 3.6, 2.6, 0.14, st.dark, { soft: !low });
            P0.box(x - 7.5 + i * 5, 6.6, zb + 3.16, 3.0, 2.0, 0.1, i % 2 ? Wd.trim : canopyC, { glow: 1 });
        }
        // the side walls and the two pillars at the front: drums of hull, a ring of light round each
        for (const sx of [-1, 1]) {
            S0.box(x + sx * (hw2 - 0.5), 3, z - 3.2, 1.5, 6, 9, hullC, { tile: 8 });
            pylon(P0, x + sx * (hw2 - 0.5), zf, 10, 0.72, Wd.wall, canopyC);
            lights.push([x + sx * (hw2 + 0.6), 8, zf + 0.6, 2.2, st.lamp]);
            P0.box(x + sx * (hw2 + 0.5), 8, zf + 0.6, 0.8, 0.9, 0.8, st.lamp, { glow: 1, soft: !low });
        }
        // the canopy: an arc of slats, the two colours in turn, light along its front edge
        const N = 7, R1 = hw2 + 1.2, RY = 6.3;
        for (let i = 0; i < N; i++) {
            const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N), ax0 = Math.cos(a0) * R1, ay0 = Math.sin(a0) * RY, ax1 = Math.cos(a1) * R1, ay1 = Math.sin(a1) * RY;
            P0.box(x + (ax0 + ax1) / 2, 10 + (ay0 + ay1) / 2, z - 1.4, Math.hypot(ax1 - ax0, ay1 - ay0) + 0.24, 0.6, 15, i % 2 ? canopyC : canopy2, { rz: Math.atan2(ay1 - ay0, ax1 - ax0), soft: !low });
        }
        P0.box(x, 10.2, zf + 0.7, w + 2.6, 0.7, 1.0, Wd.wall2);
        P0.box(x, 10.2, zf + 1.24, w + 2.2, 0.26, 0.1, Wd.trim, { glow: 1 });
        for (let i = 0; i < 9; i++) D0.box(x - (w - 4) / 2 + i * (w - 4) / 8, 9.5, zf + 0.9, 0.45, 0.5, 0.45, st.bulbs[i % st.bulbs.length], { glow: 1 });
        // the counter
        S0.box(x, 2.1, z + 3, w - 2.4, 4.2, 4.4, hullC, { tile: 8 });
        P0.box(x, 4.35, z + 3, w - 1.6, 0.5, 4.8, st.dark, { soft: !low });
        P0.box(x, 3.2, z + 5.25, w - 3, 0.2, 0.1, canopyC, { glow: 1 });
    };
    {
        const q = tongueBar, x = q.x, z = q.z;
        kiosk(q, Wd.wall, st.accent, Wd.wall);
        // the Upgrade Lab: what each upgrade is on the counter (a thruster sole, an ion cell, a star chart, a moon boot, lucky stars,
        // a pet pod)
        P0.box(x - 8, 4.95, z + 3, 2.4, 0.5, 1.2, 0xffffff, { soft: !low }); P0.box(x - 8, 4.74, z + 3, 2.5, 0.18, 1.3, Wd.trim, { glow: 1 });
        for (const [dx, dy, rz] of [[0.25, 0.75, -0.5], [0, 0, 0.6], [-0.25, -0.75, -0.5]]) P0.box(x - 4.2 + dx, 5.6 + dy, z + 3, 0.5, 1.2, 0.4, 0xffd23a, { glow: 1, rz });
        P0.box(x - 0.6, 4.9, z + 3, 2.2, 0.16, 1.7, 0x2a3a7a); for (let j = 0; j < 4; j++) P0.box(x - 1.3 + j * 0.46, 5.02, z + 3 + (j % 2 ? 0.3 : -0.3), 0.2, 0.1, 0.2, 0xfff2a0, { glow: 1, ry: 0.78 });
        lump(P0, x + 3, 5.3, z + 3, 0.9, 0.7, 0.9, one, 0xf4f4ff, 0xc8cce0, 0, 7); P0.box(x + 3, 4.72, z + 3, 1.5, 0.24, 1.9, st.metal, { soft: !low });
        for (let j = 0; j < 3; j++) P0.box(x + 6 + j * 0.5, 5.0 + j * 0.3, z + 3, 0.7, 0.7, 0.2, 0xffd23a, { glow: 2, rz: Math.PI / 4 });
        lump(P0, x + 9.2, 5.2, z + 3, 0.9, 0.6, 0.9, one, Wd.banner, shade(Wd.banner, 0.6), 0, 7); P0.box(x + 9.2, 5.8, z + 3, 0.5, 0.4, 0.5, st.lamp, { glow: 1 });
        // on the roof: a great glowing arrow pointing up, a little dish beside it
        const ay = 19.4;
        P0.box(x, ay - 1, z - 1, 2, 4, 1.4, st.accent, { glow: 1 });
        P0.box(x - 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.accent, { glow: 1, rz: -0.8 }); P0.box(x + 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.accent, { glow: 1, rz: 0.8 });
        signs.add([big('UPGRADES', GOLD, 118, '#3a1a00'), { t: 'more Speed, XP and Wins, for good', c: '#ffffff', s: '#3a1a00', px: 40 }], 14, new V3(x, 26, z + 4), false, 150);
    }
    {
        // the Rebirth Reactor (when the game has its panel to open: opts.rebirth), else more upgrades
        const q = upgradeShed, x = q.x, z = q.z, reb = !!opts.rebirth, cc = st.crystal;
        kiosk(q, Wd.wall, cc, Wd.wall2);
        // cells of reactor light on the counter, each a different colour
        for (let i = 0; i < 5; i++) { const c = [0x7ae8ff, 0xff5ac0, 0xffd23a, 0x7dff6b, 0xffffff][i]; pylon(P0, x - 8 + i * 4, z + 3, 1.5, 0.52, st.metal, c, 4.6, 0); P0.box(x - 8 + i * 4, 5.5, z + 3, 0.7, 1.0, 0.7, c, { glow: 1, soft: !low }); }
        // on the roof: the reactor's core, a crystal on its point turning in a ring of gems (born again, stronger)
        const cy = 20;
        P0.box(x, cy, z - 1, 2.8, 2.8, 2.8, cc, { glow: 2, rx: Math.PI / 4, rz: Math.PI / 4 });
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P0.box(x + Math.cos(a) * 3.3, cy + Math.sin(a) * 3.3, z - 1, 0.7, 0.7, 0.7, st.bulbs[i % st.bulbs.length], { glow: 1, rz: a + Math.PI / 4 }); }
        lights.push([x, cy, z - 1, 6, cc]);
        signs.add(reb ? [big('REBIRTH', PINK, 118, '#2a0a24'), { t: 'start again stronger: a bigger multiplier, for good', c: '#ffffff', s: '#2a0a24', px: 40 }] : [big('THE LAB', AQUA, 118, '#06142a'), { t: 'upgrades: more Speed, XP and Wins', c: '#ffffff', s: '#06142a', px: 40 }], 12.5, new V3(x, 26.4, z + 4), false, 150);
    }
    // ----- the treadmills: a belt between two rails, a console with a holo screen at the front (north), each in its planet's colours -----
    const lockText = (c) => (c.gems ? c.gems + ' GEMS' : fmt(c.need) + ' WINS');
    const postSigns = POSTS.map((c, i) => {
        const s = postSpot(i), bw = BELT.w, bl = BELT.l, cz = s.z - bl / 2 - 0.9;
        // the deck, the frame along both sides, rollers at either end
        S0.box(s.x, 0.06, s.z, bw + 2.4, 0.12, bl + 1.2, Wd.rim, { tile: 8 });
        for (const sx of [-1, 1]) {
            P0.box(s.x + sx * (bw / 2 + 0.45), 0.32, s.z, 0.9, 0.64, bl + 0.4, c.c, { soft: true });
            P0.box(s.x + sx * (bw / 2 + 0.45), 0.66, s.z, 0.3, 0.06, bl - 0.6, c.c2, { glow: 1 });
            // the handrails from the console back along the belt
            for (let j = 0; j < 4; j++) P0.box(s.x + sx * (bw / 2 + 0.3), 4.2, cz + 0.95 + j * 0.85, 0.42, 0.42, 0.86, j % 2 ? st.metal : c.c);
            P0.box(s.x + sx * (bw / 2 + 0.3), 4.2, cz + 4.15, 0.6, 0.6, 0.3, c.c2, { glow: 1 });
        }
        for (const ez of [s.z - bl / 2, s.z + bl / 2]) P0.box(s.x, 0.2, ez, bw + 0.2, 0.4, 0.6, shade(c.c, 0.7), { soft: true });
        decal(D, 4, s.x, 0.14, s.z, bw / 2, bl / 2, c.c, c.c2, 1, i);
        // the console: a column, a slanted panel with the screen, a bar of light along its top
        P0.box(s.x, 0.95, cz + 0.15, bw + 1.4, 1.9, 1.9, shade(c.c, 0.75), { soft: true });
        P0.box(s.x, 1.5, cz + 1.12, bw + 0.2, 0.16, 0.1, c.c2, { glow: 1 });
        for (const sx of [-1, 1]) P0.box(s.x + sx * (bw / 2 + 0.2), 3.5, cz + 0.45, 0.9, 3.6, 0.9, shade(c.c, 0.9), { soft: true, rx: -0.16 });
        const ca = -0.62, cy = 5.7, czc = cz + 0.75, ny = -Math.sin(ca), nz = Math.cos(ca), uy = Math.cos(ca), uz = Math.sin(ca);
        P0.box(s.x, cy, czc, bw + 1.8, 2.2, 0.9, c.c, { soft: true, rx: ca });
        P0.box(s.x, cy + uy * 1.15, czc + uz * 1.15, bw + 2, 0.3, 1, c.c2, { glow: 1, rx: ca });
        P0.box(s.x, cy + uy * 1.15 + 0.3, czc + uz * 1.15 - 0.2, bw + 2.2, 0.35, 1.2, shade(c.c, 1.25), { soft: true });
        const sw = 2.9, sh = 0.78, fy = cy + ny * 0.47, fz = czc + nz * 0.47;
        const sidx = decalUp(D, 5, [s.x - sw, fy - uy * sh, fz - uz * sh], [s.x + sw, fy - uy * sh, fz - uz * sh], [s.x + sw, fy + uy * sh, fz + uz * sh], [s.x - sw, fy + uy * sh, fz + uz * sh], shade(c.c, 0.6), c.c2, 1, i);
        const name = signs.add([big('x' + c.mult + ' SPEED', i < 7 ? LIME : PINK, 76, '#10300a', 'bolt'), { t: c.name, c: '#ffffff', s: '#1a1030', px: 38 }], 8.5, new V3(s.x, 9.6, cz), false, 92);
        const lock = signs.add([big(lockText(c), RED, 72)], 7, new V3(s.x, 3.4, s.z + 2), false, 70);
        return { name, lock, i, open: null, bIdx: -1, sIdx: sidx };
    });
    // (each belt's 4 vertices come straight after its frame's, in order: find them by kind)
    {
        const kinds = D.d.aK;
        let b = 0;
        for (let v = 0; v < D.n; v += 4) if (kinds[v * 4] === 4) postSigns[b++].bIdx = v;
    }
    // ----- the Star Capsules: each a capsule turning over a stand of light, its name and price over it -----
    const giftList = JAWBREAKERS.map((J, i) => {
        const s = jbSpot(i), r = 2.1 + i * 0.06;
        stack(S0, s.x, s.z, [[3.4, 0, Wd.rim], [3.2, 0.8, Wd.rim], [2.4, 1.2, Wd.wall2], [1.8, 3, Wd.wall], [2.3, 3.6, Wd.wall2], [2.2, 4.1, Wd.wall2]], 8, one);
        P0.box(s.x, 4.2, s.z, 4.2, 0.3, 4.2, J.c2, { glow: 1, soft: true });
        for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3; D0.box(s.x + Math.cos(a) * 3.3, 1.0, s.z + Math.sin(a) * 3.3, 0.5, 0.5, 0.5, st.bulbs[k % st.bulbs.length], { glow: 1 }); }
        decal(D, 3, s.x, 0.08, s.z, 5.4, 5.4, J.c2, 0, 1, (i % 2) + 4);
        signs.add([big(J.name, WHITE, 72, '#1a1030'), big(fmt(J.wins) + ' WINS', GOLD, 64, '#3a1a00', 'crown')], 8.2, new V3(s.x, 4.4 + r * 2.8 + 2.6, s.z), false, 82);
        return { x: s.x, y: 4.6, z: s.z, s: r * 1.2, c1: J.c1, c2: J.c2 };
    });
    const cores = presentMesh(giftList, low, group, true);
    // ----- the Worlds ring and the Black Hole Rush gate: two pylons, a lintel of light, a swirl of warp in each -----
    const arch = (p, c1, c2, title, sub, g1) => {
        for (const sx of [-1, 1]) {
            pylon(P0, p.x + sx * 8, p.z, 19.6, 1.15, Wd.wall, c1);
            S0.box(p.x + sx * 8, 0.8, p.z, 3.4, 1.6, 3.4, Wd.wall2, { tile: 8 });
            for (let j = 0; j < 4; j++) P0.box(p.x + sx * 8, 3.6 + j * 4, p.z + 1.2, 0.9, 0.9, 0.1, c1, { glow: 1, rz: Math.PI / 4 });
            P0.box(p.x + sx * 8, 20.4, p.z, 2.0, 1.0, 2.0, st.metal, { soft: true });
            fl.push([p.x + sx * 8, 20.8, p.z, 1.4, g1]);
        }
        S0.box(p.x, 19.2, p.z, 19.6, 2.4, 2.8, Wd.wall2, { tile: 8 });
        P0.box(p.x, 20.6, p.z, 20, 0.5, 3.2, st.cap, { soft: true });
        P0.box(p.x, 17.9, p.z + 1.45, 14, 0.3, 0.1, c1, { glow: 1 }); P0.box(p.x, 17.9, p.z - 1.45, 14, 0.3, 0.1, c1, { glow: 1 });
        portalDecal(D, p.x, 0.3, p.z, 13.6, 17.6, c1, c2);
        signs.add(sub ? [big(title, GOLD, 104, '#3a1a00'), { t: sub, c: '#ffffff', s: '#3a1a00', px: 40 }] : [big(title, AQUA, 118, '#06142a')], 13, new V3(p.x, 24.8, p.z), false, 170);
    };
    arch(worldsPortal, 0x3ab4ff, 0xc8f4ff, 'WORLDS', null, 0x7ae8ff);
    arch(playGate, 0xb44aff, 0xffb43a, 'BLACK HOLE RUSH', 'walk in, or press RACE', 0xd87aff);
    // ----- the leaderboards: holo screens between two posts -----
    const BA = boardAtlas(), boardG = [];
    const TITLES = ['MOST WINS', 'FASTEST', 'RACES WON'];
    boards.forEach((bd, i) => {
        const side = bd.x !== 0;
        S0.box(bd.x, 7.5, bd.z, side ? 1.2 : 25, 14, side ? 25 : 1.2, st.dark, { tile: 8 });
        P0.box(bd.x, 14.8, bd.z, side ? 1.8 : 26, 0.5, side ? 26 : 1.8, Wd.wall2);
        for (const s of [-1, 1]) pylon(P0, bd.x + (side ? 0 : s * 13.4), bd.z + (side ? s * 13.4 : 0), 16, 0.8, Wd.wall, Wd.trim);
        const dir = side ? (bd.x < 0 ? 1 : -1) : -1;
        P0.box(bd.x + (side ? dir * 0.66 : 0), 14.3, bd.z + (side ? 0 : dir * 0.66), side ? 0.1 : 23.6, 0.3, side ? 23.6 : 0.1, Wd.trim, { glow: 1 });
        const g = new T.PlaneGeometry(23, 13), uv = g.attributes.uv;
        for (let v = 0; v < uv.count; v++) uv.setX(v, (uv.getX(v) + i) / 3);
        g.rotateY(side ? (bd.x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI);
        g.translate(bd.x + (side ? dir * 0.66 : 0), 7.4, bd.z + (side ? 0 : dir * 0.66));
        boardG.push(g);
        drawBoard(BA, i, TITLES[i], [], Wd);
    });
    const boardMesh = new T.Mesh(mergeG(boardG), new T.MeshBasicMaterial({ map: BA.t, toneMapped: false }));
    for (const g of boardG) g.dispose();
    group.add(boardMesh);
    // ----- what stands about the Starport: tanks, cargo, dishes, aerials, a parked hopper, crystal gardens -----
    const spots = [[-68, 50, 'mast'], [68, 50, 'tank'], [-67, 64, 'crates'], [67, 64, 'dish'], [-66, 113, 'hopper'], [66, 113, 'garden'], [-14, 113, 'crates'], [14, 113, 'tank'], [-46, 113, 'dish'], [44, 113, 'hopper'], [-68, 80, 'garden'], [68, 80, 'mast']];
    for (const [x, z, kind] of spots) prop(P0, D0, lights, kind, x, z, R, st, Wd, low);
    if (!low) { prop(D0, D0, lights, 'garden', -24, 92, R, st, Wd, low); prop(D0, D0, lights, 'crates', 24, 93, R, st, Wd, low); }
    // little rocks adrift over the deck's edges
    for (let i = 0; i < (low ? 6 : 14); i++) { const a = R() * 6.28, d = 90 + R() * 40, s = 2 + R() * 4; lump(D0, Math.cos(a) * d, 6 + R() * 26, 81 + Math.sin(a) * d * 0.62, s, s * 0.7, s * 0.9, R, st.rock, st.rock2, 5 + R() * 0.98, 6); }
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(wi * 41 + 5), 260, northEnd - 200, low);
    stretchP.push(...farKits);
    // ----- build it -----
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    for (const l of lights) halo(E, l[0], l[1], l[2], l[3], l[4], 0.5);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, st.flame2, group);
    const bladeG = bladeGeo(Wd, BLADE_ARM), bladeM = new T.InstancedMesh(bladeG, bladeMaterial(), Math.max(1, blades.length));
    {
        const o = new T.Object3D();
        blades.forEach((b, i) => { o.position.set(0, BLADE_PIVOT, b.z); o.rotation.set(0, 0, 0); o.updateMatrix(); bladeM.setMatrixAt(i, o.matrix); });
        bladeM.count = blades.length;
        bladeM.instanceMatrix.setUsage(T.DynamicDrawUsage);
        bladeM.frustumCulled = false; bladeM.castShadow = !low; bladeM.receiveShadow = true;
        group.add(bladeM);
    }
    const jelly = buildJelly(group, domes, { low });
    // (the lasers, the sliding force gates and the rest that moves in the stages)
    const stageFx = buildStageFx(group, wi, Wd, st, low);
    buildBlobs(group, () => Math.random());
    const hullMesh = batchKits(stretchS, hullMaterial(), true);
    if (hullMesh) group.add(hullMesh);
    const propMesh = batchKits(stretchP, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    // (the little things throw no shadow worth drawing twice)
    const detailMesh = batchKits(detail, propMaterial(), false);
    if (detailMesh) group.add(detailMesh);
    signs.build(group);
    PL.build(group);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the Upgrade Lab, the Rebirth Reactor, the Worlds ring, the race gate, a Star Capsule, a treadmill with a price,
    // the FREE GIFT crate (when the game has its panel to open: opts.gift) -----
    const PR = [];
    PR.push({ pos: new V3(tongueBar.x, 0, tongueBar.z + 4), r: tongueBar.r, label: () => 'Upgrades', act: () => opts.shed(), zone: 'world' });
    PR.push({ pos: new V3(upgradeShed.x, 0, upgradeShed.z + 4), r: upgradeShed.r, label: () => (opts.rebirth ? 'Rebirth' : 'Upgrades'), act: () => (opts.rebirth ? opts.rebirth() : opts.shed()), zone: 'world' });
    PR.push({ pos: new V3(worldsPortal.x, 0, worldsPortal.z), r: worldsPortal.r, label: () => 'Worlds', act: () => opts.worlds(), zone: 'world' });
    PR.push({ pos: new V3(playGate.x, 0, playGate.z), r: playGate.r, label: () => 'Black Hole Rush', act: () => opts.play(), zone: 'world' });
    JAWBREAKERS.forEach((J, i) => { const s = jbSpot(i); PR.push({ pos: new V3(s.x, 0, s.z), r: JB_R + 2.2, label: () => J.name, act: () => opts.jaw(i), zone: 'world' }); });
    for (const v of postSigns) { const s = postSpot(v.i); if (POSTS[v.i].gems) PR.push({ pos: new V3(s.x, 0, s.z), r: POST_R + 1, label: () => 'Open the ' + POSTS[v.i].name, act: () => opts.post(v.i), zone: 'world', on: () => !v.open }); }
    if (opts.gift) PR.push({ pos: new V3(GIFT.x, 0, GIFT.z), r: 4.5, label: () => 'Free Gifts', act: () => opts.gift(), zone: 'world' });
    prompts.length = 0; prompts.push(...PR);
    // ----- what changes -----
    const dOn = decalGeo.attributes.aOn, padK = new Float32Array(WALLS_N).fill(1);
    const setOn = (attr, from, n, v) => { for (let i = 0; i < n; i++) attr.setX(from + i, v); attr.addUpdateRange(from, n); attr.needsUpdate = true; };
    const bo = new T.Object3D(), bm = new T.Matrix4();
    const view = {
        T: Tw, w: wi, group, sea: null, pads, signs, gates, blades: bladeM, cores, jelly, sliders: stageFx.sliders, slideM: stageFx.slideMesh, stageFx, plaques: PL,
        setBoards(m) { drawBoard(BA, 0, TITLES[0], m.wins, Wd); drawBoard(BA, 1, TITLES[1], m.speed, Wd); drawBoard(BA, 2, TITLES[2], m.race, Wd); },
        // what you've got: which treadmills are open (a shut one's belt stands still, its lights red, its price showing)
        setProgress(p, postOpenFn) {
            for (const v of postSigns) {
                const open = !!postOpenFn(p, v.i);
                if (open === v.open) continue;
                v.open = open;
                signs.show(v.lock, !open);
                setOn(dOn, v.bIdx, 4, open ? 1 : 0); setOn(dOn, v.sIdx, 4, open ? 1 : 0);
            }
        },
        // stage k's gate cooling down (it paid a moment ago): the gold plate under its trophy goes grey
        setPad(k, on) {
            const v = on ? 1 : 0, P2 = pads[k];
            if (!P2 || padK[k] === v) return;
            padK[k] = v;
            setOn(dOn, P2.di, 4, v);
        },
        // (the gates never shut: kept for old callers)
        setGates() {},
        // every frame: the lasers and arms near the camera move (the rest stay as they are)
        update(t, camX, camZ, lt) {
            stageFx.update(t, lt ?? t, camZ ?? 0);
            let any = false;
            for (const b of blades) {
                if (Math.abs(b.z - camZ) > 250) continue;
                const s = Math.max(-1, Math.min(1, bladeAt(b.o, t) * (W.halfW - 3) / BLADE_ARM));
                bo.position.set(0, BLADE_PIVOT, b.z); bo.rotation.set(0, 0, Math.asin(s)); bo.updateMatrix();
                bladeM.setMatrixAt(b.i, bm.copy(bo.matrix));
                any = true;
            }
            if (any) bladeM.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            PL.dispose();
            jelly.dispose();
            stageFx.dispose();
            cores.geometry.dispose(); cores.material.dispose(); cores.dispose();
            decalGeo.dispose(); decalMat.dispose();
            energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            bladeG.dispose(); bladeM.dispose();
            if (hullMesh) (hullMesh.isBatchedMesh ? hullMesh.dispose() : hullMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            if (detailMesh) (detailMesh.isBatchedMesh ? detailMesh.dispose() : detailMesh.geometry.dispose());
            BA.t.dispose(); boardMesh.geometry.dispose(); boardMesh.material.dispose();
            scene.remove(group);
        },
    };
    return view;
}
function mergeG(list) {
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); for (let i = 0; i < g.index.count; i++) idx.push(o + g.index.getX(i)); o += g.attributes.position.count; }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}

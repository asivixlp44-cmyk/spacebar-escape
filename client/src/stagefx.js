// What moves in the stages' own challenges (shared/stages.js), one draw a kind for a whole world: the laser sweepers (a deadly beam
// turning round its emitter pylon), the sliding laser gates (a curtain of beams between two emitter posts, sliding wall to wall), the
// iron cannonballs, the catapult boulders, the keycap walls, the crumbling keys sinking and dropping under you. (Golden Keys are gone:
// the list is kept, nothing is drawn.)
// Where each thing is comes from the server's clock (the same on every screen); the walls you've smashed and the keys you've broken
// are yours alone (the server doesn't judge them). Lambert and unlit only; everything near the camera is cheap to move. The lasers are
// unlit: an opaque core (white-hot down the middle) and, above Low, a soft additive glow round it (one more draw a kind).
import { T } from './engine.js';
import { CU } from './clock.js';
import { Kit, glowVCMaterial, nearFade } from './geo.js';
import * as SW from '../../shared/world.js';
import * as SG from '../../shared/stages.js';
import { WALLS_N } from '../../shared/config.js';
import * as FX from './fx.js';
// (the keycap floor: its letter atlas, read through the namespace so a renamed export can't break the build)
import * as KEYS from './keycaps.js';
// (the shared stage data read through their namespaces: the kinds the stages no longer use may lose their exports)
const { stagePlan, sliderAt, SLIDER } = SW, { SWEEP, sweeperAngle, BALL, ballZ, GUM, gumballsAt, JWALL, TILE } = SG;

const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(), e3 = new T.Euler(), tc = new T.Color();
const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// ----- the keycaps' legends: the keycap floor's letter atlas when it has one (the same letters as the floor's keys), else a little
// font of its own: letters of 3 x 5 cells (rows top to bottom), then arrows for the wide keys. In a key's uv a letter is 0..35 (a
// letter or a digit, turned by where the instance is), an arrow 100 + 0 up, 1 left, 2 right -----
const GLYPHS = [
    ['#.#', '#.#', '##.', '#.#', '#.#'], ['###', '#..', '##.', '#..', '###'], ['#.#', '#.#', '.#.', '.#.', '.#.'], ['.#.', '#.#', '###', '#.#', '#.#'],
    ['.##', '#..', '.#.', '..#', '##.'], ['##.', '#.#', '#.#', '#.#', '##.'], ['#.#', '#.#', '#.#', '###', '#.#'], ['.#.', '#.#', '#.#', '##.', '.##'],
    ['##.', '#.#', '##.', '#.#', '#.#'], ['###', '#..', '##.', '#..', '#..'], ['.##', '#..', '#.#', '#.#', '.##'], ['#.#', '#.#', '###', '#.#', '#.#'],
    ['.#.', '###', '.#.', '.#.', '.#.'], ['..#', '.##', '###', '.##', '..#'], ['#..', '##.', '###', '##.', '#..'],
];
const G_LEFT = 101, G_RIGHT = 102;
const KG = GLYPHS.map((g) => parseInt(g.join('').replace(/#/g, '1').replace(/\./g, '0'), 2));
// the floor's atlas (8 x 8 cells, the letter in the red channel), if it's there yet: { u (its uniform), arrows [up, left, right] }
function glyphAtlas() {
    const U = KEYS.jellyU && KEYS.jellyU.uGlyphs, G = KEYS.GLYPHS || [];
    if (!U || !U.value) return null;
    const at = (ch, fb) => { const i = G.indexOf(ch); return i >= 0 ? i : fb; };
    return { u: U, arrows: [at('↑', 49), at('←', 48), at('→', 50)] };
}
// the legend's GLSL: keyLegend(p: studs from the top's middle, gi: the glyph, cs: the legend's box in studs) 0..1
const legendGLSL = (A) => (A ? `
uniform sampler2D uGlyphs;
float keyLegend(vec2 p, float gi, float cs) {
    vec2 gu = p / cs + 0.5;
    if (gu.x < 0.0 || gu.x > 1.0 || gu.y < 0.0 || gu.y > 1.0) return 0.0;
    return texture2D(uGlyphs, (vec2(mod(gi, 8.0), 7.0 - floor(gi / 8.0)) + clamp(gu, 0.02, 0.98)) / 8.0).r;
}` : `
const int KG[${KG.length}] = int[${KG.length}](${KG.join(', ')});
float keyLegend(vec2 p, float gi, float cs) {
    vec2 q = p / (cs * 0.125 * vec2(3.0, 5.0)) + 0.5;
    if (q.x < 0.0 || q.x >= 1.0 || q.y < 0.0 || q.y >= 1.0) return 0.0;
    // (top left cell the highest bit: bit = row from the bottom * 3 + column from the right)
    int bit = int(q.y * 5.0) * 3 + 2 - int(q.x * 3.0);
    return float((KG[int(gi + 0.5)] >> bit) & 1);
}`);
// a keycap's top in a Kit, as uv: x the glyph * 16 + studs across the top from its middle, y studs up it; every other face -99
const NO_UV = [-99, -99, -99, -99];
const topUV = (gi, w, h) => [gi * 16 - w / 2, -h / 2, gi * 16 + w / 2, h / 2];

// The keycaps' material (the walls', the crumbling keys'): matte plastic, a little self-lit, the legend painted on every top in the
// world's legend colour (glowing in the worlds whose legends glow), a letter picked by where the instance is. cell: the legend's box in
// studs. wall: the wall's flight when it's smashed (aK: each key's middle and its seed; aBurst: when its wall was smashed)
const FLY = 1.25;
function keycapMaterial(Wd, key, cell, wall) {
    const m = new T.MeshLambertMaterial({ vertexColors: true }), A = glyphAtlas();
    const U = { uLeg: { value: new T.Color(Wd.legend ?? 0x222222) }, uLegK: { value: Wd.legendGlow || 0 }, uCell: { value: cell } };
    if (A) U.uGlyphs = A.u;
    // (how many letters to turn through, and where the arrows are, in the atlas or the little font)
    const NA = A ? '36.0' : '12.0', AR = (A ? A.arrows : [12, 13, 14]).map((v) => v.toFixed(1));
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow; Object.assign(sh.uniforms, U);
        let vs = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uNow; varying vec3 vKu;${wall ? '\nattribute vec4 aK; attribute float aBurst;' : ''}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float gi = floor((uv.x + 8.0) / 16.0), ak = gi - 100.0; vec3 ip = instanceMatrix[3].xyz; float off = floor(fract(sin(dot(ip.xz, vec2(0.1731, 0.0937))) * 4375.85) * 36.0);
  vKu = vec3(uv.x - gi * 16.0, uv.y, ak < -0.5 ? mod(gi + off, ${NA}) : ak < 0.5 ? ${AR[0]} : ak < 1.5 ? ${AR[1]} : ${AR[2]}); }`);
        if (wall) {
            // smashed: every key tumbles off ahead and up, falls to the floor and shrinks away; the plate behind them goes at once.
            // Then nothing until the wall grows back (its matrix, main side); a key flying at the lens shrinks out of the way
            vs = vs.replace('#include <color_vertex>', `vColor = vec4(color * mix(instanceColor, vec3(1.0), step(1.5, aK.w) + step(aK.w, -0.5)), 1.0);`)
                .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float kAge = uNow - aBurst, kFly = step(0.0, kAge) * step(kAge, ${FLY.toFixed(2)}), kGone = step(${FLY.toFixed(2)}, kAge) * step(kAge, 5.9);
float kS = fract(abs(aK.w)), kA = kAge * (4.0 + kS * 6.0) * kFly, kB = kAge * (2.5 + fract(kS * 7.31) * 5.0) * kFly;
float kca = cos(kA), ksa = sin(kA), kcb = cos(kB), ksb = sin(kB);
mat3 kR = mat3(1.0, 0.0, 0.0, 0.0, kca, ksa, 0.0, -ksa, kca) * mat3(kcb, ksb, 0.0, -ksb, kcb, 0.0, 0.0, 0.0, 1.0);
objectNormal = kR * objectNormal;`)
                .replace('#include <begin_vertex>', `#include <begin_vertex>
if (kFly > 0.5) {
    if (aK.w < -0.5) transformed = aK.xyz;
    else {
        vec3 kv = vec3(aK.x * 0.42 + (kS - 0.5) * 9.0, 6.0 + kS * 8.0 + aK.y * 0.5, -(10.0 + fract(kS * 3.7) * 12.0));
        vec3 kc = vec3(aK.x + kv.x * kAge, max(0.8, aK.y + kv.y * kAge - 18.0 * kAge * kAge), aK.z + kv.z * kAge);
        float kd = -(modelViewMatrix * instanceMatrix * vec4(kc, 1.0)).z;
        float sc = (1.0 - smoothstep(${(FLY - 0.4).toFixed(2)}, ${FLY.toFixed(2)}, kAge)) * smoothstep(3.0, 8.0, kd);
        transformed = kc + kR * (transformed - aK.xyz) * sc;
    }
} else if (kGone > 0.5) transformed = aK.xyz;`);
        }
        sh.vertexShader = vs;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uLeg; uniform float uLegK; uniform float uCell; varying vec3 vKu;${legendGLSL(A)}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float kLg = vKu.y > -50.0 ? keyLegend(vKu.xy, vKu.z, uCell) * (1.0 - smoothstep(80.0, 130.0, length(vViewPosition))) : 0.0;
diffuseColor.rgb = mix(diffuseColor.rgb, uLeg * (1.0 - uLegK), kLg);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.24 + uLeg * kLg * uLegK * 1.25;`);
    };
    m.customProgramCacheKey = () => key + (A ? '-a' : '-f');
    return m;
}
// a keycap's raised top on one face of a Kit: the rim (x0..x1, y0..y1 at depth z0) sloping in by e to the top at depth z1 (the
// keycap's face is +z when z1 > z0, -z when z1 < z0); its colour c (sides a shade darker), the legend gi on it
function capFace(k, x0, x1, y0, y1, z0, z1, e, c, gi) {
    const s = Math.sign(z1 - z0), a0 = x0 + e, a1 = x1 - e, b0 = y0 + e, b1 = y1 - e;
    // the top: wound to face out, its uv reading the right way round from that side
    if (s > 0) k.quad([a0, b0, z1], [a1, b0, z1], [a1, b1, z1], [a0, b1, z1], c, { uv: topUV(gi, a1 - a0, b1 - b0) });
    else k.quad([a1, b0, z1], [a0, b0, z1], [a0, b1, z1], [a1, b1, z1], c, { uv: topUV(gi, a1 - a0, b1 - b0) });
    k.faceTo([x0, y1, z0], [x1, y1, z0], [a1, b1, z1], [a0, b1, z1], [0, 1, s], c, { uv: NO_UV, shade: 0.96 });
    k.faceTo([x0, y0, z0], [x1, y0, z0], [a1, b0, z1], [a0, b0, z1], [0, -1, s], c, { uv: NO_UV, shade: 0.74 });
    k.faceTo([x0, y0, z0], [x0, y1, z0], [a0, b1, z1], [a0, b0, z1], [-1, 0, s], c, { uv: NO_UV, shade: 0.86 });
    k.faceTo([x1, y0, z0], [x1, y1, z0], [a1, b1, z1], [a1, b0, z1], [1, 0, s], c, { uv: NO_UV, shade: 0.86 });
}
// A keycap wall: rows of giant keys across the way (staggered, a wide modifier key at the rows' ends in the world's third colour, the
// rest tinted by the wall's instance colour), a dark plate behind them. Each key is a cap on both faces (low: fewer, bigger keys, the
// front, a flat back), so a smashed one tumbles as a solid key. Built at its real size (x across, y up from the floor, z its
// thickness); aK on every vertex says which key it's part of (its middle; w: -1 the plate, 0..1 a key's seed, + 2 a modifier)
function wallGeo(Wd, low) {
    const k = new Kit(), W = 34.6, H = JWALL.h, D = JWALL.d, ks = [];
    const rows = low ? [[1.5, 1.5, 1.5, 1.5, 1.5], [2, 1.75, 1.75, 2], [1.75, 2, 2, 1.75]] : [[1.25, 1, 1, 1, 1, 1, 1.25], [1.5, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1.5]];
    const u = W / 7.5, rh = H / rows.length, g = 0.12, e = 0.48, mod = Wd.keys[2];
    let n = 0;
    // the plate: the keys sit in it (the gaps between them show it)
    k.box(0, H / 2, 0, W - 0.3, H - 0.3, 1.0, mixC(mod, 0x000000, 0.55), { uv: NO_UV });
    ks.push([0, k.count, 0, H / 2, 0, -1]);
    rows.forEach((row, ri) => {
        let x = -W / 2;
        const y0 = ri * rh + g, y1 = (ri + 1) * rh - g;
        row.forEach((w, j) => {
            // (a wide key at either end of a row is a modifier: the third colour, an arrow on it)
            const x0 = x + g, x1 = x + w * u - g, end = j === 0 || j === row.length - 1, wide = w > 1.01 && end, v0 = k.count, c = wide ? mod : 0xffffff;
            const gi = wide ? (j === 0 ? G_RIGHT : G_LEFT) : (n * 5 + ri * 3) % 36;
            capFace(k, x0, x1, y0, y1, 0, D / 2, e, c, gi);
            if (low) k.quad([x1, y0, 0], [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], c, { uv: NO_UV, shade: 0.8 });
            else capFace(k, x0, x1, y0, y1, 0, -D / 2, e, c, gi);
            ks.push([v0, k.count, (x0 + x1) / 2, (y0 + y1) / 2, 0, (wide ? 2 : 0) + hash2(n * 3.1, ri * 7.7) * 0.98]);
            x += w * u; n++;
        });
    });
    const geo = k.geometry(), aK = new Float32Array(geo.attributes.position.count * 4);
    for (const [v0, v1, x, y, z, w] of ks) for (let v = v0; v < v1; v++) aK.set([x, y, z, w], v * 4);
    geo.setAttribute('aK', new T.Float32BufferAttribute(aK, 4));
    return geo;
}
// a crumbling key: a keycap the size of a tile, its top at the floor (y 0), a skirt under it (seen as it drops)
function tileGeo() {
    const k = new Kit(), h = TILE.s / 2 - 0.1;
    capFace(k, -h, h, -h, h, 0, 0.42, 0.44, 0xffffff, 0);
    k.box(0, 0, -0.32, h * 2, h * 2, 0.64, 0xffffff, { uv: NO_UV, shade: 0.72 });
    // (built facing +z: laid down, its top facing up)
    return k.geometry().rotateX(-Math.PI / 2).translate(0, -0.37, 0);
}

// the shadow of a falling boulder (unlit, see-through, darker and bigger as it comes)
function shadowMaterial() {
    return new T.ShaderMaterial({
        vertexShader: 'attribute float aK; varying vec2 vP; varying float vK; void main() { vP = position.xz; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vP; varying float vK; void main() { float r = length(vP); if (r > 1.0) discard; float a = (1.0 - smoothstep(0.55, 1.0, r)) * (0.18 + 0.5 * vK) + smoothstep(0.86, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 0.55 * vK; gl_FragColor = vec4(mix(vec3(0.1, 0.03, 0.02), vec3(1.0, 0.32, 0.12), smoothstep(0.86, 0.95, r) * vK), a); }',
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
}
// ----- the lasers: red beams (in Redshift Ridge a hot yellow-orange: red would vanish in the lava light) -----
export const laserColors = (Wd) => (Wd && Wd.id === 'redshift' ? { c: 0xffa41a, core: 0xfff8c8 } : Wd && Wd.id === 'esc' ? { c: 0xff2ad0, core: 0xffe0f8 } : { c: 0xff1a2c, core: 0xffd8dc });
// A laser sweeper's beam, right across (local x along it, its middle at the pylon, y at SWEEP.y): a thin bar of light SWEEP.r each
// way (the hit test's length), the emitter head turning with it round the pylon (an iron collar, a lens where the beam leaves it each
// side), a burning spark at each tip. aGlow 1: light (painted in its shader); 0: iron, shaded by a fixed light
function beamGeo(Wd, low) {
    const k = new Kit({ glow: true }), L = SWEEP.r, C = laserColors(Wd), bt = SWEEP.t * (low ? 0.6 : 0.42), pr = SWEEP.post;
    k.box(0, 0, 0, L * 2, bt, bt, C.c, { glow: 1 });
    k.box(0, 0, 0, pr * 2 + 0.7, SWEEP.t, pr * 2 + 0.7, 0x2c3038, {});
    k.box(0, SWEEP.t / 2 + 0.06, 0, pr * 2 + 0.3, 0.12, pr * 2 + 0.3, 0x50565f, {});
    for (const sx of [-1, 1]) {
        k.box(sx * (pr + 0.4), 0, 0, 0.3, SWEEP.t * 0.8, SWEEP.t * 0.8, C.c, { glow: 1 });
        k.box(sx * L, 0, 0, 0.62, 0.62, 0.62, C.core, { glow: 1, rx: Math.PI / 4, ry: Math.PI / 4 });
    }
    return k.geometry();
}
// A sliding laser gate, its real size (SLIDER: w across, h up, d along the way; x its middle, y up from the floor): an iron emitter post
// at each end (a lamp on its cap, a lit slot down its inner face), rows of beams between them on both faces (the box the hit test uses
// is all deadly: the beams show its faces)
const PANEL_TOP = SLIDER.h - 0.6, PANEL_PW = 0.9;
const panelRows = (low) => { const n = low ? 4 : 5, y0 = 0.8, y1 = PANEL_TOP - 0.5; return { n, y0, dy: (y1 - y0) / (n - 1) }; };
function panelGeo(Wd, low) {
    const k = new Kit({ glow: true }), C = laserColors(Wd), w = SLIDER.w, h = PANEL_TOP, d = SLIDER.d, pw = PANEL_PW, iron = 0x3a3e48, dark = 0x23262d;
    for (const sx of [-1, 1]) {
        const px = sx * (w / 2 - pw / 2);
        k.box(px, h / 2, 0, pw, h, d, iron);
        k.box(px, 0.2, 0, pw + 0.3, 0.4, d + 0.3, dark);
        k.box(px, h + 0.2, 0, pw + 0.3, 0.4, d + 0.3, dark);
        k.box(px, h + 0.62, 0, 0.62, 0.44, 0.62, C.c, { glow: 1 });
        k.box(px - sx * (pw / 2 + 0.02), h / 2, 0, 0.08, h - 0.9, d - 0.9, C.c, { glow: 1 });
        // yellow warning bands round the post
        if (!low) for (const y of [1.6, h - 1.6]) k.box(px, y, 0, pw + 0.06, 0.34, d + 0.06, 0xffc21e);
    }
    const R = panelRows(low), bt = low ? 0.36 : 0.26, zf = SLIDER.d / 2 - 0.3;
    for (let i = 0; i < R.n; i++) for (const z of [zf, -zf]) k.box(0, R.y0 + i * R.dy, z, w - 2 * pw + 0.1, bt, bt, C.c, { glow: 1 });
    return k.geometry();
}
// unlit: a beam white-hot down its middle and its colour at its edges, light racing along it, a fast flicker; the iron parts their
// own colours under a fixed light. It dissolves in a fine checker right at the lens
function laserMaterial(Wd) {
    const C = laserColors(Wd), u = T.UniformsUtils.merge([T.UniformsLib.fog, { uC: { value: new T.Color(C.c) }, uCore: { value: new T.Color(C.core) } }]);
    u.uNow = CU.uNow;
    return new T.ShaderMaterial({
        uniforms: u, fog: true,
        vertexShader: `attribute vec3 color; attribute float aGlow; varying vec3 vC; varying vec2 vUv; varying float vX; varying vec3 vN; varying float vG; varying float vD;
            #include <fog_pars_vertex>
            void main() {
                vC = color; vUv = uv; vX = position.x; vN = normal; vG = aGlow;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                vD = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow; uniform vec3 uC; uniform vec3 uCore; varying vec3 vC; varying vec2 vUv; varying float vX; varying vec3 vN; varying float vG; varying float vD;
            #include <fog_pars_fragment>
            void main() {
                if (vD < 6.0) { float dk = 1.0 - smoothstep(2.5, 6.0, vD); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }
                vec3 c;
                if (vG > 0.5) {
                    float v = abs(vUv.y - 0.5) * 2.0, run = 0.5 + 0.5 * sin(vX * 1.7 - uNow * 19.0), fl = 0.92 + 0.08 * sin(uNow * 53.0 + vX * 0.7);
                    c = mix(uC * 1.2, uCore * 1.1, (1.0 - smoothstep(0.05, 0.85, v)) * (0.6 + 0.4 * run)) * fl;
                } else c = vC * (0.78 + 0.42 * max(dot(normalize(vN), vec3(-0.33, 0.85, 0.41)), 0.0));
                gl_FragColor = vec4(c, 1.0);
                #include <colorspace_fragment>
                #include <fog_fragment>
            }`,
    });
}
// The glow round a laser (not on Low): quads added on top, unlit; aQ says what each is: z 0 a band along a beam (x -1..1 across it,
// y studs along it), 1 a flare (xy -1..1 from its middle), 2 a curtain of beams (x: rows, a beam on every whole number; y studs across)
function glowQuads() {
    const G = { p: [], q: [], i: [] };
    G.quad = (cs, qs) => { const b = G.p.length / 3; for (let j = 0; j < 4; j++) { G.p.push(...cs[j]); G.q.push(...qs[j]); } G.i.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    return G;
}
function glowGeoOf(G) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(G.p, 3)); g.setAttribute('aQ', new T.Float32BufferAttribute(G.q, 3)); g.setIndex(G.i); g.computeBoundingSphere(); return g; }
function beamGlowGeo() {
    const G = glowQuads(), L = SWEEP.r, gw = SWEEP.t * 1.4, gh = SWEEP.t * 1.05, F = 1.7, fq = [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const band = [[-1, -L, 0], [-1, L, 0], [1, L, 0], [1, -L, 0]];
    // a flat band and an upright one (one of them faces the camera however the beam lies), a flare at each tip
    G.quad([[-L, 0, -gw], [L, 0, -gw], [L, 0, gw], [-L, 0, gw]], band);
    G.quad([[-L, -gh, 0], [L, -gh, 0], [L, gh, 0], [-L, gh, 0]], band);
    for (const x of [-L, L]) { G.quad([[x - F, -F, 0], [x + F, -F, 0], [x + F, F, 0], [x - F, F, 0]], fq); G.quad([[x, -F, -F], [x, -F, F], [x, F, F], [x, F, -F]], fq); }
    return glowGeoOf(G);
}
function panelGlowGeo(low) {
    const G = glowQuads(), R = panelRows(low), x0 = -SLIDER.w / 2 + PANEL_PW, x1 = -x0, zf = SLIDER.d / 2 - 0.3, ya = R.y0 - R.dy / 2, yb = R.y0 + (R.n - 0.5) * R.dy;
    for (const z of [zf, -zf]) G.quad([[x0, ya, z], [x1, ya, z], [x1, yb, z], [x0, yb, z]], [[-0.5, x0, 2], [-0.5, x1, 2], [R.n - 0.5, x1, 2], [R.n - 0.5, x0, 2]]);
    return glowGeoOf(G);
}
function laserGlowMaterial(Wd) {
    const C = laserColors(Wd), u = T.UniformsUtils.merge([T.UniformsLib.fog, { uC: { value: new T.Color(C.c) }, uCore: { value: new T.Color(C.core) } }]);
    u.uNow = CU.uNow;
    return new T.ShaderMaterial({
        uniforms: u, fog: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        vertexShader: `attribute vec3 aQ; varying vec3 vQ; varying float vD;
            #include <fog_pars_vertex>
            void main() {
                vQ = aQ;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                vD = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow; uniform vec3 uC; uniform vec3 uCore; varying vec3 vQ; varying float vD;
            #include <fog_pars_fragment>
            void main() {
                float a, h;
                if (vQ.z < 0.5) { h = 1.0 - abs(vQ.x); a = pow(h, 2.6) * (0.55 + 0.15 * sin(vQ.y * 1.7 - uNow * 19.0)); }
                else if (vQ.z < 1.5) { h = max(0.0, 1.0 - length(vQ.xy)); a = pow(h, 2.2) * (0.9 + 0.2 * sin(uNow * 31.0 + vQ.x)); }
                else { h = max(0.0, 1.0 - abs(fract(vQ.x + 0.5) - 0.5) * 3.2); a = pow(h, 2.4) * 0.5 + 0.06 + 0.16 * smoothstep(0.92, 1.0, sin(vQ.x * 1.3 - uNow * 5.0)); }
                a *= smoothstep(1.5, 5.0, vD);
                #ifdef USE_FOG
                a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
                #endif
                if (a < 0.004) discard;
                gl_FragColor = vec4(mix(uC, uCore, h * h * 0.55) * a, 1.0);
                #include <colorspace_fragment>
            }`,
    });
}
// An iron cannonball: hammered dark iron, a riveted band round it (it shows the ball rolling); the band glows in the hot and the royal
// worlds. A sphere turned on a lathe (its rings at the band's edges), its poles along z so the band goes round the way it rolls; a
// colour a face, its normals round
function ballGeo(Wd, low) {
    const R = BALL.r, lat = low ? [-90, -45, -11, 11, 45, 90] : [-90, -62, -34, -11, 11, 34, 62, 90], segs = low ? 8 : 12, nb = lat.length - 1;
    const g0 = new T.LatheGeometry(lat.map((a) => new T.Vector2(Math.cos(a * Math.PI / 180) * R, Math.sin(a * Math.PI / 180) * R)), segs).rotateX(Math.PI / 2), g = g0.toNonIndexed();
    g0.dispose();
    const p = g.attributes.position, nr = g.attributes.normal, n = p.count, col = new Float32Array(n * 3), glow = new Float32Array(n);
    const L = { orbit: [0x3c466c, 0x9aa6c8, 0], redshift: [0x2a2426, 0xff7a1a, 1], frost: [0x46566a, 0xdcf2ff, 0], esc: [0x2c2452, 0xffc23a, 1] }[Wd.id] || [0x3c466c, 0x9aa6c8, 0];
    const c0 = new T.Color(L[0]), c1 = new T.Color(L[1]), rv = c1.clone().lerp(new T.Color(0xffffff), 0.3);
    for (let f = 0; f < n; f += 3) {
        // (the lathe's faces: a segment round, then its rings from pole to pole, two triangles each)
        const t = f / 3, seg = Math.floor(t / (nb * 2)), ring = Math.floor((t % (nb * 2)) / 2), band = lat[ring] === -11, h = hash2(seg * 3.1 + ring, ring * 7.3 - seg);
        if (band) tc.copy(seg % 2 && !L[2] ? rv : c1); else tc.copy(c0).multiplyScalar(0.88 + h * 0.24);
        for (let v = f; v < f + 3; v++) { col[v * 3] = tc.r; col[v * 3 + 1] = tc.g; col[v * 3 + 2] = tc.b; glow[v] = band && L[2] ? 1 : 0; }
    }
    for (let v = 0; v < n; v++) { v3.fromBufferAttribute(p, v).normalize(); nr.setXYZ(v, v3.x, v3.y, v3.z); }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new T.BufferAttribute(glow, 1));
    return g;
}
// a catapult boulder: a chunky faceted stone, its corners pushed in and out (the same push where faces share a corner), a shade a face
function boulderGeo(low) {
    const g = new T.IcosahedronGeometry(GUM.r, low ? 0 : 1), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { const x = p.getX(v), y = p.getY(v), z = p.getZ(v), k = 1 + (hash2(Math.round(x * 50) + z * 0.37, Math.round(y * 50) - z) - 0.5) * 0.34; p.setXYZ(v, x * k, y * k * 0.92, z * k); }
    g.computeVertexNormals();
    for (let f = 0; f < n; f += 3) { const s = 0.8 + hash2(f * 0.71, f * 1.37) * 0.3; for (let v = f; v < f + 3; v++) col.fill(s, v * 3, v * 3 + 3); }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
}
// A list of things along the course, in order down it (z falling), drawn only near the camera: the ones within R of it go in the
// mesh's first slots and nothing else is drawn (an instanced mesh over the whole course is never culled: 15 stages of keys three
// thousand studs off, under the fog, cost as much as everything else on screen). slide() says if the window moved
function windowOf(list, zOf) { list.sort((a, b) => zOf(b) - zOf(a)); return { list, zOf, lo: 0, hi: 0 }; }
function slide(w, camZ, R) {
    const L = w.list;
    let lo = L.length, hi = L.length;
    for (let i = 0; i < L.length; i++) if (w.zOf(L[i]) < camZ + R) { lo = i; break; }
    for (let i = lo; i < L.length; i++) if (w.zOf(L[i]) <= camZ - R) { hi = i; break; }
    const moved = lo !== w.lo || hi !== w.hi;
    w.lo = lo; w.hi = hi;
    return moved;
}

// wi: the world; Wd/st: its look (world.js); low: Low quality. Returns what main.js reads and drives each frame
export function buildStageFx(group, wi, Wd, st, low) {
    const sweepers = [], sliders = [], balls = [], gumZones = [], walls = [], tiles = [], candies = [];
    for (let k = 0; k < WALLS_N; k++) {
        const P = stagePlan(wi, k);
        for (const o of P.list) {
            if (o.kind === 'sweeper') for (let j = 0; j < (o.bars || 1); j++) sweepers.push({ k, o, off: j * Math.PI / 2 });
            else if (o.kind === 'slider') sliders.push({ k, o, i: sliders.length });
            else if (o.kind === 'boulders') o.lanes.forEach((x, i) => balls.push({ k, o, i, x }));
            else if (o.kind === 'gumballs') gumZones.push({ k, o, list: [] });
            else if (o.kind === 'jwall') walls.push({ k, o, i: o.i, burstAt: -99, wobT: -99, fxAt: -99 });
            else if (o.kind === 'crumble') o.tiles.forEach((t, i) => tiles.push({ k, i, x: t.x, z: t.z, hitAt: -99, state: 0, ci: 0 }));
        }
        // (Golden Keys: kept in the list for whoever reads it, never drawn)
        (P.candies || []).forEach((c, i) => candies.push({ k, i, x: c.x, y: c.y, z: c.z, got: false }));
    }
    // (in order down the course, each drawn only near the camera). A wall's keys are the world's first or second colour in turn;
    // a crumbling key mostly the first, now and then the others
    const KC = Wd.keys.map((c) => new T.Color(c));
    walls.forEach((w, i) => { w.c = KC[i % 2]; });
    tiles.forEach((ti) => { const h = hash2(ti.x, ti.z); ti.ci = h < 0.55 ? 0 : h < 0.85 ? 1 : 2; });
    const wBars = windowOf(sweepers, (x) => x.o.z), wSlides = windowOf(sliders, (x) => x.o.z), wBalls = windowOf(balls, (x) => x.o.z), wWalls = windowOf(walls, (x) => x.o.z);
    const wTiles = windowOf(tiles, (x) => x.z);
    walls.forEach((w, i) => { w.idx = i; });
    const R_BARS = 300, R_SLIDES = 280, R_BALLS = 480, R_WALLS = 320, R_TILES = 460;
    const mats = [], geos = [], meshes = [];
    const own = (mesh) => { mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; group.add(mesh); meshes.push(mesh); return mesh; };
    const inst = (g, m, n) => { geos.push(g); if (!mats.includes(m)) mats.push(m); const me = own(new T.InstancedMesh(g, m, Math.max(1, n))); me.count = 0; me.castShadow = false; me.instanceMatrix.setUsage(T.DynamicDrawUsage); return me; };
    // ----- the lasers: the sweepers' beams and the sliding laser gates, an opaque core each and (not on Low) the glow round it.
    // (Always built, even with none in this world: their programs are compiled behind the loading screen)
    const lasM = laserMaterial(Wd), glowM = low ? null : laserGlowMaterial(Wd);
    const bars = inst(beamGeo(Wd, low), lasM, sweepers.length), barGlow = glowM ? inst(beamGlowGeo(), glowM, sweepers.length) : null;
    const slideMesh = inst(panelGeo(Wd, low), lasM, sliders.length), slideGlow = glowM ? inst(panelGlowGeo(low), glowM, sliders.length) : null;
    if (barGlow) barGlow.renderOrder = 3;
    if (slideGlow) slideGlow.renderOrder = 3;
    // ----- iron cannonballs, catapult boulders, keycap walls: only built in a world that has them -----
    const ballMesh = balls.length ? inst(ballGeo(Wd, low), nearFade(glowVCMaterial(CU.uNow), 'sbe-ball', 5, 11), balls.length) : null;
    // (a boulder's stone: the world's station stone, a shade darker or lighter)
    const GUM_MAX = 40;
    let gumMesh = null, shMesh = null, shG = null, shK = null, STONE = null;
    if (gumZones.length) {
        const gumM = new T.MeshLambertMaterial({ vertexColors: true });
        gumM.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.16;'); };
        gumM.customProgramCacheKey = () => 'sbe-boulder';
        STONE = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new T.Color(mixC(mixC(Wd.wall2, Wd.wall, 0.2 + (i % 4) * 0.12), Wd.rim, i % 2 ? 0.15 : 0)));
        gumMesh = inst(boulderGeo(low), gumM, GUM_MAX);
        gumMesh.setColorAt(0, tc.set(0xffffff));
        shG = new T.CircleGeometry(1, 20).rotateX(-Math.PI / 2); shK = new Float32Array(GUM_MAX);
        shG.setAttribute('aK', new T.InstancedBufferAttribute(shK, 1));
        shMesh = inst(shG, shadowMaterial(), GUM_MAX);
        shMesh.renderOrder = 2;
    }
    // (aBurst: when the wall in each slot was smashed, on the shaders' clock)
    let wallMesh = null, aB = null, aBA = null;
    if (walls.length) {
        const wallG = wallGeo(Wd, low);
        aB = new Float32Array(walls.length).fill(-99); aBA = new T.InstancedBufferAttribute(aB, 1);
        aBA.setUsage(T.DynamicDrawUsage); wallG.setAttribute('aBurst', aBA);
        wallMesh = inst(wallG, keycapMaterial(Wd, 'sbe-kwall', 2.6, true), walls.length);
        wallMesh.setColorAt(0, tc.set(0xffffff));
    }
    const dustC = mixC(Wd.wall, 0xffffff, 0.5);
    // ----- crumbling keys -----
    const tileK = keycapMaterial(Wd, 'sbe-ktile', 3.0, false), tileMesh = inst(tileGeo(), nearFade(tileK, tileK.customProgramCacheKey(), 3, 6), tiles.length);
    tileMesh.setColorAt(0, tc.set(0xffffff));
    tileMesh.receiveShadow = !low;
    const tileAt = (ti, lt) => {
        // a key: still, or pressed down and rattling, dropping and tumbling, coming back up
        const u = lt - ti.hitAt;
        let y = 0.2, rx = 0, rz = 0, s = 1;
        if (ti.state !== 0) {
            if (u < TILE.shake) { y = 0.2 - 0.2 * Math.min(1, u / 0.08); rx = Math.sin(u * 60) * 0.05; rz = Math.cos(u * 47) * 0.05; }
            else if (u < TILE.shake + 1.2) { const f = u - TILE.shake; y = 0 - f * f * 30; rx = f * 2.2; rz = f * 1.3; s = Math.max(0, 1 - f * 0.6); }
            else if (u < TILE.shake + TILE.back) s = 0;
            else if (u < TILE.shake + TILE.back + 0.4) { const f = (u - TILE.shake - TILE.back) / 0.4; y = -2 + f * 2.2; s = f; }
            q4.setFromEuler(e3.set(rx, 0, rz));
        } else q4.identity();
        return m4.compose(v3.set(ti.x, y, ti.z), q4, s3.set(s, s, s));
    };
    const setN = (m, n) => { if (!m) return; m.count = n; if (n) m.instanceMatrix.needsUpdate = true; };

    const near = (z, camZ, d) => Math.abs(z - camZ) < d;
    let warm = false;
    const fx = {
        sweepers, sliders, balls, gumZones, walls, tiles, candies, slideMesh,
        // the walls you've smashed, the keys you've broken: yours alone; t: your clock (seconds)
        wallUp: (w, t) => t - w.burstAt > 6,
        burst(w, t) {
            w.burstAt = t; w.fxAt = CU.uNow.value;
            if (aB && w.idx >= wWalls.lo && w.idx < wWalls.hi) { aB[w.idx - wWalls.lo] = w.fxAt; aBA.needsUpdate = true; }
            v3.set(0, 3, w.o.z);
            for (let i = 0; i < 4; i++) { v3.x = (i - 1.5) * 8; FX.dust(v3, low ? 2 : 4, 1.6, dustC); FX.splash(v3, Wd.keys[(w.i + i) % 3], low ? 2 : 4, 1.2); }
            v3.set(0, 5, w.o.z); FX.popSpark(v3, Wd.trim);
        },
        bonk(w, t) { w.wobT = t; },
        // a key under you starts to give (it drops TILE.shake later and comes back TILE.back after that)
        touch(ti, t) { if (ti.state === 0) { ti.state = 1; ti.hitAt = t; } },
        tileSolid: (ti, t) => ti.state === 0 || (ti.state === 1 && t - ti.hitAt < TILE.shake),
        // which Golden Keys you've found (kept for old callers: nothing is drawn)
        setCandies(bits) { for (const c of candies) c.got = !!(bits && ((bits[c.k] | 0) & (1 << c.i))); },
        take(c) { if (c) c.got = true; },
        // every frame: t the server's seconds, lt your own clock's, camZ where the camera is along the course
        update(t, lt, camZ) {
            // laser sweepers: each beam turned round its pylon by the server's clock (the hit test in main.js reads the same angle)
            slide(wBars, camZ, R_BARS);
            for (let i = wBars.lo; i < wBars.hi; i++) {
                const s = sweepers[i], a = sweeperAngle(s.o, t) + s.off;
                q4.setFromAxisAngle(T.Object3D.DEFAULT_UP, a);
                m4.compose(v3.set(s.o.x, SWEEP.y, s.o.z), q4, s3.set(1, 1, 1));
                bars.setMatrixAt(i - wBars.lo, m4);
                if (barGlow) barGlow.setMatrixAt(i - wBars.lo, m4);
            }
            setN(bars, wBars.hi - wBars.lo); setN(barGlow, wBars.hi - wBars.lo);
            // sliding laser gates: wall to wall on the server's clock (sliderAt: the same as the hit test)
            slide(wSlides, camZ, R_SLIDES);
            for (let i = wSlides.lo; i < wSlides.hi; i++) {
                const s = sliders[i];
                m4.makeTranslation(sliderAt(s.o, t), 0, s.o.z);
                slideMesh.setMatrixAt(i - wSlides.lo, m4);
                if (slideGlow) slideGlow.setMatrixAt(i - wSlides.lo, m4);
            }
            setN(slideMesh, wSlides.hi - wSlides.lo); setN(slideGlow, wSlides.hi - wSlides.lo);
            if (ballMesh) {
                slide(wBalls, camZ, R_BALLS);
                for (let i = wBalls.lo; i < wBalls.hi; i++) {
                    const b = balls[i], z = ballZ(b.o, b.i, t), roll = z / BALL.r;
                    q4.setFromEuler(e3.set(roll, 0, 0));
                    // a cannonball rolls up out of the floor at the far end to full size where it can hit you;
                    // out past the near end it sinks away into the floor
                    const grow = Math.max(0.12, Math.min(1, (z - b.o.z0 + 12) / 10)), sink = Math.max(0, z - b.o.z1) * 0.6;
                    m4.compose(v3.set(b.x, BALL.r * grow - Math.min(BALL.r * 2.2, sink), z), q4, s3.set(grow, grow, grow));
                    ballMesh.setMatrixAt(i - wBalls.lo, m4);
                }
                setN(ballMesh, wBalls.hi - wBalls.lo);
            }
            // boulders: falling from high up once their shadow has grown, tumbling; a thud, a little hop, then down into the floor
            if (gumMesh) {
                let n = 0;
                for (const zn of gumZones) {
                    if (!near(zn.o.z, camZ, 220)) continue;
                    gumballsAt(zn.o, t, zn.list);
                    for (const d of zn.list) {
                        if (n >= GUM_MAX) break;
                        const u = t - d.t0, land = GUM.warn + GUM.fall, ur = Math.min(u, land) - GUM.warn;
                        let y;
                        if (u < GUM.warn) y = 60; else if (u < land) { const f = (u - GUM.warn) / GUM.fall; y = GUM.r + (1 - f * f) * 56; } else { const f = u - land; y = GUM.r * 0.86 + Math.abs(Math.sin(f * 9)) * 1.2 * Math.exp(-f * 6) - Math.max(0, f - 0.35) * 9; }
                        const vis = u >= GUM.warn - 0.25 && u < land + 0.65 ? 1 : 0;
                        q4.setFromEuler(e3.set(ur * 5 + (d.s % 7), ur * 3, (d.s % 5) * 0.7));
                        m4.compose(v3.set(d.x, y, d.z), q4, s3.set(vis, vis, vis));
                        gumMesh.setMatrixAt(n, m4); gumMesh.setColorAt(n, STONE[d.c]);
                        const k = u < land ? Math.min(1, u / land) : Math.max(0, 1 - (u - land) * 2.5), r = GUM.hit * (0.55 + 0.45 * Math.min(1, u / land));
                        m4.makeScale(r, 1, r).setPosition(d.x, 0.08, d.z);
                        shMesh.setMatrixAt(n, m4); shK[n] = k;
                        n++;
                    }
                }
                gumMesh.count = n; shMesh.count = n;
                if (n) { gumMesh.instanceMatrix.needsUpdate = true; gumMesh.instanceColor.needsUpdate = true; shMesh.instanceMatrix.needsUpdate = true; shG.attributes.aK.needsUpdate = true; }
            }
            // keycap walls: standing (rattling just after you bounce off), smashed (its keys flying, in the shader), gone, growing back
            if (wallMesh) {
                if (slide(wWalls, camZ, R_WALLS)) {
                    for (let i = wWalls.lo; i < wWalls.hi; i++) { wallMesh.setColorAt(i - wWalls.lo, walls[i].c); aB[i - wWalls.lo] = walls[i].fxAt; }
                    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
                    aBA.needsUpdate = true;
                }
                for (let i = wWalls.lo; i < wWalls.hi; i++) {
                    const w = walls[i], since = lt - w.burstAt, up = since > 6, back = Math.min(1, Math.max(0, (since - 6) * 3)), wob = Math.max(0, 1 - (lt - w.wobT) * 1.5);
                    // (with the camera in it, it's not drawn: no see-through dither in its shader, so the nearest wall hides the ones
                    // behind it before they're shaded; while its keys fly it's drawn whole, the shader moving them)
                    const k = since >= 0 && since < FLY + 0.1 ? 1 : up && Math.abs(w.o.z - camZ) > JWALL.d / 2 + 3 ? (w.burstAt > 0 ? back : 1) : 0, sq = 1 + Math.sin(lt * 24) * 0.05 * wob;
                    m4.compose(v3.set(Math.sin(lt * 31) * 0.25 * wob, 0, w.o.z), q4.identity(), s3.set(k, k * sq, k));
                    wallMesh.setMatrixAt(i - wWalls.lo, m4);
                }
                setN(wallMesh, wWalls.hi - wWalls.lo);
            }
            // crumbling keys: a broken one comes back after a while (wherever the camera is); the ones near it drawn, still or moving
            for (const ti of tiles) if (ti.state !== 0 && lt - ti.hitAt >= TILE.shake + TILE.back + 0.4) ti.state = 0;
            const tMoved = slide(wTiles, camZ, R_TILES);
            let tAny = tMoved;
            if (tMoved) { for (let i = wTiles.lo; i < wTiles.hi; i++) tileMesh.setColorAt(i - wTiles.lo, KC[tiles[i].ci]); if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true; }
            for (let i = wTiles.lo; i < wTiles.hi; i++) {
                const ti = tiles[i];
                if (!tMoved && ti.state === 0 && !ti.moved) continue;
                tileMesh.setMatrixAt(i - wTiles.lo, tileAt(ti, lt)); tAny = true;
                ti.moved = ti.state !== 0;
            }
            tileMesh.count = wTiles.hi - wTiles.lo;
            if (tAny && tileMesh.count) tileMesh.instanceMatrix.needsUpdate = true;
            for (const m of meshes) m.visible = warm || m.count > 0;
        },
        showAll(on) { warm = !!on; for (const m of meshes) m.visible = warm || m.count > 0; },
        dispose() { for (const m of meshes) { group.remove(m); m.dispose(); } for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
    };
    fx.update(CU.uNow.value, 0, 0);
    return fx;
}
// where the rolling cannonballs of a stage are now (for the keycap floor: they press the keys down as they go): calls fn(x, z) for each
export function eachBall(fx, t, k, fn) { for (const b of fx.balls) if (b.k === k) fn(b.x, ballZ(b.o, b.i, t)); }

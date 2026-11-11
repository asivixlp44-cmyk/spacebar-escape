// The keycap floor: the giant mechanical-keyboard keys floored all along the Keyway (and the keyboard beds in the Starport, and the
// race's lanes). Every key is an instance of one of two shapes: a sculpted keycap close up (chamfered corners, a tapered skirt, a dished
// top with its letter on it) and a plain tapered block further off. The keys are kept in chunks along the course; each frame the chunks
// the camera sees are picked (near ones sculpted, far ones plain, the rest none) and only when that choice changes are their instances
// copied into the two meshes: two draws for every key in view.
// The typing is all in the vertex shader: a key clacks down under whoever stands on it (uPress: up to 8 feet or monsters) and every
// footstep sends a ripple out that sets the keys round it bobbing like a fast typist's (uHit: the last 16 steps, each a time and a
// strength). Lit (Lambert), the skirt shaded darker towards its foot; the letters come from one glyph atlas, and glow in the worlds
// whose legends glow (unlit colour added, no bloom).
import { T } from './engine.js';
import { CU } from './clock.js';

const PRESS_N = 8, HIT_N = 16;
// how high a key's top stands over the floor the runners walk on, and how far a press pushes it down (so a pressed key's top sits
// just under your foot and the keys round it stand a little proud)
export const KEY_TOP = 0.22, KEY_TRAVEL = 0.3;
// shared by every keycap mesh (the world's and a race's): set by main.js every frame; the legends by the world being shown
export const jellyU = {
    uPress: { value: Array.from({ length: PRESS_N }, () => new T.Vector4(0, 0, 1, 0)) },
    uHit: { value: Array.from({ length: HIT_N }, () => new T.Vector4(0, 0, -99, 0)) },
    uLegend: { value: new T.Color(0x1e3a24) },
    uGlow: { value: 0 },
    // how much of an RGB wave runs through the glowing legends (0 none, 1 all of it)
    uRgb: { value: 0 },
    // the light a key gives off while it's pressed (the sector's)
    uFlash: { value: new T.Color(0x3ae8ff) },
    uGlyphs: { value: null },
};
export const keysU = jellyU;
let hitAt = 0, pressN = 0;
// a footstep (or a landing, or a monster coming down) at x, z: amp 1 a step, more for a landing
export function jellyHit(x, z, amp) { const h = jellyU.uHit.value[hitAt]; h.set(x, z, CU.uNow.value, amp ?? 1); hitAt = (hitAt + 1) % HIT_N; }
// who's standing on the keys this frame: begin, then press(x, z, radius, strength 0..1) for each (at most 8)
export function jellyPressBegin() { pressN = 0; }
export function jellyPress(x, z, r, k) { if (pressN >= PRESS_N) return; jellyU.uPress.value[pressN++].set(x, z, r, k); }
export function jellyPressEnd() { for (let i = pressN; i < PRESS_N; i++) jellyU.uPress.value[i].w = 0; }
// the world's legends: their colour and how much they glow (0 printed, 1 backlit)
export function setKeyLegend(color, glow, rgb, flash) { jellyU.uLegend.value.set(color); jellyU.uGlow.value = glow || 0; jellyU.uRgb.value = rgb || 0; if (flash !== undefined) jellyU.uFlash.value.set(flash); }

// ----- the letters: one atlas, 8 x 8 cells, white on black (the red channel is how much of the letter) -----
export const GLYPHS = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890!?#$%&*+=<>/←↑→↓★♥♪✦'.split('');
let glyphTex = null;
function glyphAtlas() {
    if (glyphTex) return glyphTex;
    const N = 512, C = 64, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    GLYPHS.forEach((g, i) => {
        const cx = (i % 8) * C + C / 2, cy = Math.floor(i / 8) * C + C / 2;
        x.font = (g.length > 1 ? '900 22px' : '900 40px') + ' "Arial Black", "Segoe UI", Arial, sans-serif';
        x.fillText(g, cx, cy + 2);
    });
    glyphTex = new T.CanvasTexture(c);
    glyphTex.colorSpace = T.NoColorSpace;
    glyphTex.generateMipmaps = true;
    glyphTex.minFilter = T.LinearMipmapLinearFilter;
    glyphTex.magFilter = T.LinearFilter;
    glyphTex.anisotropy = 4;
    jellyU.uGlyphs.value = glyphTex;
    return glyphTex;
}

// ----- the shapes: a key of half width 1, its top at y 0 and its foot at y -1 (each instance is scaled: x/z its half width, y how deep
// its skirt goes). aY: how far up (0 the foot, 1 the top face); aUv: where on the top face (-1..1), for the letter -----
function keyGeo(sculpted) {
    const pos = [], ay = [], uv = [];
    // a ring of 8 (a square with its corners cut) at height y, half size h, corner cut c
    const ring = (h, c, y) => [[-h + c, y, -h], [h - c, y, -h], [h, y, -h + c], [h, y, h - c], [h - c, y, h], [-h + c, y, h], [-h, y, h - c], [-h, y, -h + c]];
    const quad = (a, b, c, d, ya, yb) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); ay.push(ya, ya, yb, ya, yb, yb); for (let i = 0; i < 6; i++) uv.push(-1, -1); };
    const rings = sculpted ? [[ring(1.0, 0.16, -1), 0], [ring(0.9, 0.16, -0.16), 0.86], [ring(0.8, 0.14, 0), 1]] : [[ring(1.0, 0.0, -1), 0], [ring(0.8, 0.0, 0), 1]];
    // the skirt: from the foot up, each band a little narrower (the sides lean in)
    for (let r = 0; r < rings.length - 1; r++) {
        const [A, ya] = rings[r], [B, yb] = rings[r + 1];
        for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; if (!sculpted && (i & 1)) continue; quad(A[j], A[i], B[i], B[j], ya, yb); }
    }
    // the top face: dished a little (its middle lower), the letter's uv across it
    const top = rings[rings.length - 1][0], dish = sculpted ? -0.05 : 0, half = 0.8;
    for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8, a = top[i], b = top[j];
        if (!sculpted && (i & 1)) continue;
        pos.push(0, dish, 0, ...b, ...a);
        ay.push(1, 1, 1);
        uv.push(0, 0, b[0] / half, b[2] / half, a[0] / half, a[2] / half);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aY', new T.Float32BufferAttribute(ay, 1));
    g.setAttribute('aUv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
}

const TYPE = `
vec3 jIp = instanceMatrix[3].xyz;
float jPress = 0.0;
for (int i = 0; i < ${PRESS_N}; i++) { vec4 P = uPress[i]; if (P.w > 0.0) { float d = length(jIp.xz - P.xy); jPress = max(jPress, P.w * (1.0 - smoothstep(P.z * 0.4, P.z, d))); } }
float jWob = 0.0;
for (int i = 0; i < ${HIT_N}; i++) {
    vec4 H = uHit[i]; float age = uNow - H.z;
    if (age > 0.0 && age < 1.2) {
        float d = length(jIp.xz - H.xy), a2 = age - d * 0.03;
        if (a2 > 0.0) jWob += H.w * (1.0 - smoothstep(1.5, 5.0 + age * 6.0, d)) * exp(-a2 * 5.5) * sin(a2 * 30.0);
    }
}
jWob = clamp(jWob, -1.2, 1.2);
// down under a foot (a key bottoms out with a touch of overshoot), bobbing with the ripples of the footsteps round it
float jDy = -${KEY_TRAVEL.toFixed(2)} * jPress - 0.1 * jWob;
`;
const mats = new Map();
function keyMaterial(key, low, legend) {
    let m = mats.get(key);
    if (m) return m;
    glyphAtlas();
    m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow; sh.uniforms.uPress = jellyU.uPress; sh.uniforms.uHit = jellyU.uHit;
        sh.uniforms.uLegend = jellyU.uLegend; sh.uniforms.uGlow = jellyU.uGlow; sh.uniforms.uGlyphs = jellyU.uGlyphs; sh.uniforms.uRgb = jellyU.uRgb; sh.uniforms.uFlash = jellyU.uFlash;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aY; attribute vec2 aUv; attribute float aL; uniform float uNow; uniform vec4 uPress[${PRESS_N}]; uniform vec4 uHit[${HIT_N}];
varying float vY; varying vec2 vUv; varying float vL; varying float vPress; varying float vHue;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
${TYPE}
transformed.y += jDy / max(0.2, instanceMatrix[1].y);
vY = aY; vUv = aUv; vL = aL; vPress = jPress; vHue = jIp.z * 0.011 + jIp.x * 0.017 - uNow * 0.22;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uLegend; uniform float uGlow; uniform float uRgb; uniform vec3 uFlash; uniform sampler2D uGlyphs; varying float vY; varying vec2 vUv; varying float vL; varying float vPress; varying float vHue;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
// the skirt darker towards its foot, the top face a touch lighter
diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(0.0, 0.9, vY) + 0.08 * step(0.99, vY);
// the legends' light: the sector's colour, or an RGB wave rolling down the board
vec3 jLc = uRgb > 0.01 ? mix(uLegend, 0.55 + 0.45 * cos(6.2832 * (vHue + vec3(0.0, 0.33, 0.67))), uRgb) : uLegend;
${legend ? `float jLeg = 0.0;
if (vY > 0.99 && vL >= 0.0) {
    vec2 cell = vec2(mod(vL, 8.0), 7.0 - floor(vL / 8.0));
    vec2 gu = clamp(vUv * 0.5 + 0.5, 0.02, 0.98);
    jLeg = texture2D(uGlyphs, (cell + vec2(gu.x, 1.0 - gu.y)) / 8.0).r;
    diffuseColor.rgb = mix(diffuseColor.rgb, jLc, jLeg * (1.0 - 0.6 * uGlow));
}` : 'float jLeg = 0.0;'}
${low ? '' : 'if (length(vViewPosition) < 7.0) { float dk = 1.0 - smoothstep(3.0, 7.0, length(vViewPosition)); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }'}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// a little of its own colour (bright keycap plastic), the letters backlit where the world's legends glow, a pressed key's flash
totalEmissiveRadiance += diffuseColor.rgb * (0.16 + 0.12 * vPress) + jLc * jLeg * uGlow * 1.25 + (uRgb > 0.01 ? jLc : uFlash) * vPress * 0.5 * smoothstep(0.55, 1.0, vY);`);
    };
    m.customProgramCacheKey = () => 'sbe-key-' + key;
    mats.set(key, m);
    return m;
}

const tc = new T.Color(), mm = new T.Matrix4(), fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere(new T.Vector3(), 1);
// list: [{ x, z, r (half width), c (colour), sx? (half width across x for a wide key), y? (its top), h? (how deep its skirt goes),
// L? (its letter: an index into GLYPHS, -1 none; picked from x and z when missing) }]
// o: { low, chunk (studs along z), near (studs: sculpted inside this), far (studs: none beyond this), y (the tops) }
export function buildJelly(parent, list, o) {
    o = o || {};
    const low = !!o.low, C = o.chunk || 36, NEAR = o.near ?? (low ? 110 : 170), FAR = o.far ?? (low ? 240 : 380), y0 = o.y ?? KEY_TOP;
    const nearG = keyGeo(true), farG = keyGeo(false);
    // the chunks: by z (and x for the Starport's beds), each its instances' matrices, colours and letters ready to copy
    const byKey = new Map();
    for (const d of list) {
        const key = Math.floor(d.z / C) * 1000 + Math.floor((d.x + 500) / (o.chunkX || 1000));
        let ch = byKey.get(key);
        if (!ch) { ch = { items: [], x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; byKey.set(key, ch); }
        ch.items.push(d);
        const rx = d.sx ?? d.r;
        ch.x0 = Math.min(ch.x0, d.x - rx); ch.x1 = Math.max(ch.x1, d.x + rx); ch.z0 = Math.min(ch.z0, d.z - d.r); ch.z1 = Math.max(ch.z1, d.z + d.r);
    }
    const chunks = [...byKey.values()].map((ch) => {
        const n = ch.items.length, M = new Float32Array(n * 16), Cc = new Float32Array(n * 3), Lc = new Float32Array(n);
        ch.items.forEach((d, i) => {
            mm.makeScale(d.sx ?? d.r, d.h ?? 1.5, d.r).setPosition(d.x, d.y ?? y0, d.z);
            mm.toArray(M, i * 16);
            tc.set(d.c); Cc[i * 3] = tc.r; Cc[i * 3 + 1] = tc.g; Cc[i * 3 + 2] = tc.b;
            Lc[i] = d.L ?? (d.sx && d.sx > d.r * 1.3 ? -1 : Math.abs(Math.floor(d.x * 7.13 + d.z * 3.71)) % 36);
        });
        const cx = (ch.x0 + ch.x1) / 2, cz = (ch.z0 + ch.z1) / 2;
        return { n, M, C: Cc, L: Lc, c: new T.Vector3(cx, 1, cz), rad: Math.hypot(ch.x1 - ch.x0, ch.z1 - ch.z0) / 2 + 2, state: 0 };
    });
    const total = Math.max(1, list.length);
    const mk = (g, key, legend) => {
        g.setAttribute('aL', new T.InstancedBufferAttribute(new Float32Array(total), 1).setUsage(T.DynamicDrawUsage));
        const mesh = new T.InstancedMesh(g, keyMaterial(key, low, legend), total);
        mesh.setColorAt(0, tc.set(0xffffff));
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.instanceColor.setUsage(T.DynamicDrawUsage);
        mesh.count = 0; mesh.visible = false;
        mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = !low;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        return mesh;
    };
    const nearM = mk(nearG, low ? 'nl' : 'n', true), farM = mk(farG, low ? 'fl' : 'f', false);
    let sig = -1;
    const fill = (mesh, want) => {
        let at = 0;
        const La = mesh.geometry.attributes.aL;
        for (const ch of chunks) if (ch.state === want) { mesh.instanceMatrix.array.set(ch.M, at * 16); mesh.instanceColor.array.set(ch.C, at * 3); La.array.set(ch.L, at); at += ch.n; }
        mesh.count = at; mesh.visible = at > 0;
        if (at) {
            mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, at * 16); mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, at * 3); mesh.instanceColor.needsUpdate = true;
            La.clearUpdateRanges(); La.addUpdateRange(0, at); La.needsUpdate = true;
        }
    };
    const J = {
        meshes: [nearM, farM], count: list.length,
        // every frame: which chunks the camera sees, and how close; the meshes are refilled only when that changes
        update(camera, force) {
            camera.updateMatrixWorld();
            fr.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            const cp = camera.position;
            let changed = !!force || sig < 0;
            for (let i = 0; i < chunks.length; i++) {
                const ch = chunks[i], d = ch.c.distanceTo(cp) - ch.rad;
                sph.center.copy(ch.c); sph.radius = ch.rad;
                const st = d > FAR || !fr.intersectsSphere(sph) ? 0 : d < NEAR ? 1 : 2;
                if (st !== ch.state) { ch.state = st; changed = true; }
            }
            if (!changed) return;
            sig = 1;
            fill(nearM, 1); fill(farM, 2);
        },
        // everything near in view (the warm-up: every program drawn once)
        showAll() { for (const ch of chunks) ch.state = 0; if (chunks[0]) chunks[0].state = 1; if (chunks[1]) chunks[1].state = 2; fill(nearM, 1); fill(farM, 2); sig = -1; },
        dispose() {
            for (const m of [nearM, farM]) { if (m.parent) m.parent.remove(m); m.dispose(); }
            nearG.dispose(); farG.dispose();
        },
    };
    return J;
}
export const buildKeys = buildJelly;

// ----- rows of keys like a real keyboard: a regular pitch, each row staggered from the last, the world's colourway (mostly the
// main colour, some of the second, an accent now and then, a wide key every so often). clear(x, z) says where not -----
export function keyRows(out, colours, R, low, x0, x1, z0, z1, clear, o) {
    o = o || {};
    const pitch = o.pitch || (low ? 4.9 : 4.3), r0 = pitch * 0.45, stag = [0, 0.25, 0.5, 0.75];
    let row = 0;
    for (let z = z1 - r0; z > z0 + r0 * 0.5; z -= pitch, row++) {
        let x = x0 + r0 + stag[row % 4] * pitch * 0.5;
        while (x <= x1 - r0 + 0.01) {
            const wide = !low && R() < 0.06 && x + pitch * 1.5 <= x1 - r0 + 0.01;
            const span = wide ? 2 : 1, cx = x + (span - 1) * pitch / 2;
            if (!(clear && clear(cx, z))) {
                const pick = R(), c = wide ? colours[2] : colours[pick < 0.62 ? 0 : pick < 0.9 ? 1 : 2];
                out.push({ x: cx, z, r: r0, sx: wide ? r0 + pitch / 2 : undefined, c, h: o.h ?? 1.5, y: o.y });
            }
            x += pitch * span;
        }
    }
}

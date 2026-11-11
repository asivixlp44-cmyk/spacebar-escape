// The pets hopping after everyone: little space critters (moon bunnies, rocket pups, aliens, comet wolves, star unicorns, wyverns,
// griffins, phoenixes...). One model with every part on it (ears three ways, a unicorn's spiral horn, a stag's antlers or swept-back dragon and
// ram horns, a puff or a long tail with a tuft or a dragon's spade, a row of spines down the back, a beak, little flapping wings, a gold
// crown), and each instance says which of them it has and in what colours. One draw for the whole crowd, the list rewritten once a
// frame (only the nearest characters get theirs). A soft plush body (deeper underneath, lighter on top), rosy cheeks, and painted eyes
// that glow (unlit) in their accent colour, a bright spark in each.
import { T, scene, selfLit } from './engine.js';
import { CU } from './clock.js';
import { merge } from './geo.js';
import { PALS, palById } from '../../shared/config.js';
import { getQuality } from './fx.js';
import { palLook } from './icons.js';

const m4 = new T.Matrix4(), q = new T.Quaternion(), vP = new T.Vector3(), vS = new T.Vector3(), UP = new T.Vector3(0, 1, 0), tc = new T.Color();
let mesh = null, aC2 = null, aShape = null, cap = 0, n = 0;
// what each part is (EAR1X / EAR3X: the pointed ears standing out sideways, the long ones swept back, under antlers; HORNB: swept-back
// horns, a dragon's or a ram's, in place of antlers; TIP / SPADE: the long tail's end, a tuft or a dragon's spade)
const P = { BODY: 0, BELLY: 1, EYE: 2, DARK: 3, SPARK: 4, EAR1: 5, EAR2: 6, EAR3: 7, HORN1: 8, ANTLER: 9, TAIL1: 10, TAIL2: 11, SPIKE: 12, FOOT: 13, BEAK: 14, TIP: 15, BLUSH: 16, EAR1X: 17, EAR3X: 18, HORNB: 19, SPADE: 20, WING: 21, CROWN: 22, MOUTH: 23, ANT: 24, ANTB: 25 };
// each pet's parts, packed once (icons.js says who has a beak, wings, a crown): ear (+0.5 a beak), horn (+0.5 a crown),
// tail (+0.25 spines, +0.5 wings), and a phase (its eyes' pulse, its tail's wag, its wings' beat)
const SHAPE = new Map(PALS.map((a) => { const l = palLook(a); return [a.id, [a.ear + (l.beak ? 0.5 : 0), a.horn + (l.crown ? 0.5 : 0), a.tail + (a.spike ? 0.25 : 0) + (l.wing ? 0.5 : 0), a.tier * 1.3 + a.jb + (a.ant ? 100 : 0)]]; }));

// ----- the model (made once) -----
// the body: a ball this size round its middle
const BR = [1, 0.96, 0.95], BC = [0, 1, 0];
// a part's vertices: what they are, and the point they turn about
function tag(g, kind, piv) {
    if (g.index) g = g.toNonIndexed();
    const c = g.attributes.position.count, k = new Float32Array(c).fill(kind), pv = new Float32Array(c * 3);
    for (let i = 0; i < c; i++) { pv[i * 3] = piv[0]; pv[i * 3 + 1] = piv[1]; pv[i * 3 + 2] = piv[2]; }
    g.setAttribute('aK', new T.BufferAttribute(k, 1));
    g.setAttribute('aPiv', new T.BufferAttribute(pv, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
}
// a smooth ball (detail >= 0) or a five-sided cone (detail < 0), scaled s, tipped rot (about x, then z), at `at` (turning about piv)
function part(kind, detail, s, at, rot, piv) {
    const g = detail < 0 ? new T.ConeGeometry(1, 2, 5, 1).toNonIndexed() : new T.IcosahedronGeometry(1, detail);
    if (detail >= 0) { const a = g.attributes.position, nn = g.attributes.normal; for (let i = 0; i < a.count; i++) { const l = Math.hypot(a.getX(i), a.getY(i), a.getZ(i)) || 1; nn.setXYZ(i, a.getX(i) / l, a.getY(i) / l, a.getZ(i) / l); } }
    g.scale(s[0], s[1], s[2]);
    if (rot) g.rotateX(rot[0] || 0).rotateZ(rot[1] || 0);
    g.translate(at[0], at[1], at[2]);
    return tag(g, kind, piv || at);
}
// a tapered rod (r0 at a to r1 at b; open, its ends hidden in what it grows from and what grows from it) or, r1 0, a cone pointing
// from a to b (its base hidden in what it grows from)
function limb(kind, a, b, r0, r1) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), h = d.length();
    const g = r1 > 0 ? new T.CylinderGeometry(r1, r0, h, 5, 1, true) : new T.ConeGeometry(r0, h, 5, 1, true);
    g.translate(0, h / 2, 0).applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize())).translate(a[0], a[1], a[2]);
    return tag(g, kind, a);
}
// a tapering tube along a curve (a quadratic through three points), r0 thick at its root to r1 at its end, open at both (the root in
// the body, the end in its tip)
function tube(kind, pts, r0, r1, piv) {
    const c = new T.QuadraticBezierCurve3(...pts.map((p) => new T.Vector3(p[0], p[1], p[2]))), S = 4, R = 5;
    const g = new T.TubeGeometry(c, S, 1, R, false), a = g.attributes.position, nr = g.attributes.normal, o = new T.Vector3();
    for (let i = 0; i <= S; i++) {
        c.getPointAt(i / S, o);
        const r = r0 + (r1 - r0) * i / S;
        for (let j = 0; j <= R; j++) { const v = i * (R + 1) + j; a.setXYZ(v, o.x + nr.getX(v) * r, o.y + nr.getY(v) * r, o.z + nr.getZ(v) * r); }
    }
    return tag(g, kind, piv);
}
// a flat, pointed diamond (a feather, a tail's spade) growing from `base` along `dir`: len long, wid wide, th thick, its face turned
// to whoever is behind and above (the camera, nearly always); it turns about piv
const TOWARD = new T.Vector3(0, 0.5, -0.87);
function blade(kind, base, dir, len, wid, th, piv) {
    const a = new T.Vector3(dir[0], dir[1], dir[2]).normalize();
    const f = TOWARD.clone().addScaledVector(a, -TOWARD.dot(a)).normalize(), w = new T.Vector3().crossVectors(a, f);
    const g = new T.OctahedronGeometry(1, 0).scale(wid / 2, len / 2, th).translate(0, len / 2, 0);
    g.applyMatrix4(new T.Matrix4().makeBasis(w, a, f).setPosition(base[0], base[1], base[2]));
    return tag(g, kind, piv || base);
}
// a little crown round the top of the head: a band (r0 at its foot, r1 at its rim, h high) with `pts` points hp higher, a wall
// outside and one in (the inside's darker: the shader knows it by its normal)
function crown(at, r0, r1, h, hp, pts) {
    const N = pts * 2, pos = [], nor = [], ring = (i, top, k) => {
        const a = i / N * 6.2832 + 1.5708, r = (top ? r1 : r0) * k;
        return [at[0] + Math.cos(a) * r, at[1] + (top ? h + (i % 2 ? 0 : hp) : 0), at[2] + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
    };
    for (let i = 0; i < N; i++) {
        for (const k of [1, 0.88]) {
            const b0 = ring(i, 0, k), b1 = ring(i + 1, 0, k), t0 = ring(i, 1, k), t1 = ring(i + 1, 1, k), s = k < 1 ? -1 : 1;
            for (const v of k < 1 ? [b0, t1, t0, b0, b1, t1] : [b0, t0, t1, b0, t1, b1]) { pos.push(v[0], v[1], v[2]); nor.push(v[3] * s, s * 0.2, v[4] * s); }
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return tag(g, P.CROWN, at);
}
// where the body's surface is in direction d from its middle, and which way it faces there
function onBody(d) {
    const v = new T.Vector3(d[0], d[1], d[2]).normalize();
    return { p: [v.x * BR[0] + BC[0], v.y * BR[1] + BC[1], v.z * BR[2] + BC[2]], n: [v.x / BR[0], v.y / BR[1], v.z / BR[2]] };
}
// a flat disc painted on a surface (an eye, a cheek, the mouth): w x h, `segs` sides, lifted off it a little, turned `spin` in its
// own plane and nudged (ox, oy) along it; lit like the ball under it
function decal(kind, at, w, h, segs, lift, spin, ox, oy) {
    const nn = new T.Vector3(at.n[0], at.n[1], at.n[2]).normalize(), x = new T.Vector3().crossVectors(UP, nn).normalize(), y = new T.Vector3().crossVectors(nn, x);
    const g = new T.CircleGeometry(1, segs).scale(w, h, 1).rotateZ(spin || 0).translate(ox || 0, oy || 0, 0);
    const o = new T.Vector3(at.p[0], at.p[1], at.p[2]).addScaledVector(nn, lift);
    g.applyMatrix4(new T.Matrix4().makeBasis(x, y, nn).setPosition(o));
    const a = g.attributes.position, nr = g.attributes.normal;
    for (let i = 0; i < a.count; i++) { const dx = a.getX(i) - BC[0], dy = a.getY(i) - BC[1], dz = a.getZ(i) - BC[2], l = Math.hypot(dx, dy, dz) || 1; nr.setXYZ(i, dx / l, dy / l, dz / l); }
    return tag(g, kind, at.p);
}
// the point on the body straight up its back at angle `phi` from the top, sunk in a little, and the way out of the body there
function onBack(phi) {
    const c = Math.cos(phi), s = Math.sin(phi), nl = Math.hypot(c / BR[1], s / BR[2]);
    return [[0, BC[1] + c * BR[1] - 0.05 * c / BR[1] / nl, -s * BR[2] + 0.05 * s / BR[2] / nl], [0, c / BR[1] / nl, -s / BR[2] / nl]];
}
function palGeo(low) {
    // the long tail: from low on the rump, back and curling up behind (seen side on from the camera behind); its tip turns with it
    const TB = [0, 0.62, -0.72];
    const L = [
        part(P.BODY, low ? 1 : 2, BR, BC),
        part(P.BELLY, 1, [0.62, 0.56, 0.4], [0, 0.7, 0.6]),
        part(P.FOOT, 0, [0.34, 0.2, 0.42], [-0.48, 0.14, 0.34]), part(P.FOOT, 0, [0.34, 0.2, 0.42], [0.48, 0.14, 0.34]),
        // a little mouth on the belly, or a beak over it
        decal(P.MOUTH, { p: [0, 0.88, 0.979], n: [0, 0.235, 0.972] }, 0.085, 0.055, 8, 0.01),
        limb(P.BEAK, [0, 1.0, 0.84], [0, 0.8, 1.27], 0.16, 0),
        // a unicorn's spiral horn
        part(P.HORN1, -1, [0.15, 0.5, 0.15], [0, 2.36, 0.2], [0.24, 0]),
        part(P.TAIL1, 0, [0.28, 0.28, 0.28], [0, 0.84, -1]),
        tube(P.TAIL2, [TB, [0, 0.7, -1.62], [0, 1.62, -1.42]], 0.17, 0.11, TB),
        part(P.TIP, 0, [0.2, 0.24, 0.2], [0, 1.68, -1.41], null, TB),
        blade(P.SPADE, [0, 1.52, -1.44], [0, 0.977, 0.212], 0.62, 0.52, 0.07, TB),
        crown([0, 1.86, 0.1], 0.25, 0.3, 0.24, 0.17, 5),
    ];
    // antennae: a stalk either side of the top of the head, leaning out, a ball of light at its tip (they sway: the shader)
    for (const sx of [-1, 1]) { const A0 = [sx * 0.3, 1.86, 0.06], A1 = [sx * 0.62, 2.62, 0.0]; L.push(limb(P.ANT, A0, A1, 0.07, 0.05), part(P.ANTB, 0, [0.17, 0.17, 0.17], A1, null, A0)); }
    for (const sx of [-1, 1]) {
        // eyes: dark, lit in the accent colour low down, a spark up to one side and a little one below (the same side on both)
        const e = onBody([sx * 0.37, 0.14, 0.92]);
        L.push(decal(P.DARK, e, 0.2, 0.235, 12, 0.016), decal(P.EYE, e, 0.13, 0.12, 12, 0.024, 0, 0, -0.075),
            decal(P.SPARK, e, 0.068, 0.068, 6, 0.032, 0, 0.055, 0.07), decal(P.SPARK, e, 0.034, 0.034, 6, 0.032, 0, -0.065, -0.085),
            decal(P.BLUSH, onBody([sx * 0.62, -0.06, 0.78]), 0.15, 0.085, 8, 0.012));
        // ears: pointed (an owl's tufts too), floppy, long; under antlers the pointed ones stand out sideways and the long ones sweep back
        L.push(part(P.EAR1, -1, [0.28, 0.32, 0.18], [sx * 0.62, 1.84, 0], [0, -sx * 0.32]),
            part(P.EAR1X, -1, [0.22, 0.28, 0.13], [sx * 0.98, 1.6, 0.02], [0, -sx * 1.15]),
            part(P.EAR2, 0, [0.28, 0.5, 0.22], [sx * 0.98, 1.3, 0], [0, sx * 0.3]),
            part(P.EAR3, 0, [0.2, 0.68, 0.16], [sx * 0.42, 2.34, -0.06], [0, -sx * 0.14]),
            part(P.EAR3X, 0, [0.18, 0.62, 0.14], [sx * 0.52, 2.02, -0.52], [-1, -sx * 0.5]));
        // a stag's antlers: a beam up and out from the top of the head, a tine forward from low on it, two at the top
        const X = (p) => [sx * p[0], p[1], p[2]], A = X([0.28, 1.8, -0.06]), B = X([0.64, 2.62, -0.26]);
        L.push(limb(P.ANTLER, A, B, 0.085, 0.062), limb(P.ANTLER, X([0.41, 2.1, -0.13]), X([0.46, 2.42, 0.13]), 0.055, 0),
            limb(P.ANTLER, B, X([0.6, 2.98, -0.15]), 0.058, 0), limb(P.ANTLER, B, X([0.95, 2.8, -0.3]), 0.058, 0));
        // or swept-back horns (a dragon's, a ram's): up and out, then back to a point
        const H1 = X([0.56, 2.2, -0.12]);
        L.push(limb(P.HORNB, X([0.36, 1.8, 0.08]), H1, 0.12, 0.085), limb(P.HORNB, H1, X([0.66, 2.36, -0.6]), 0.088, 0));
        // little wings from the shoulders: three feathers fanned up and out, beating about the shoulder (the shader)
        const S = onBody([sx * 0.6, 0.5, -0.62]), b = [S.p[0] - S.n[0] * 0.06, S.p[1] - S.n[1] * 0.06, S.p[2] - S.n[2] * 0.06];
        L.push(blade(P.WING, b, [sx * 0.9, 0.62, -0.2], 0.95, 0.36, 0.05, S.p), blade(P.WING, b, [sx * 0.98, 0.18, -0.3], 0.78, 0.32, 0.05, S.p),
            blade(P.WING, b, [sx * 0.85, -0.25, -0.4], 0.58, 0.28, 0.05, S.p));
    }
    // spines down the back, biggest at the top, standing up more than out (side on to the camera behind, not pointing at it)
    [[0.36, 0.5, 0.135], [0.8, 0.44, 0.13], [1.2, 0.36, 0.115], [1.52, 0.27, 0.1]].forEach(([phi, len, r]) => {
        const [at, nn] = onBack(phi), d = new T.Vector3(nn[0] * 0.45, nn[1] * 0.45 + 0.55, nn[2] * 0.45).normalize();
        L.push(limb(P.SPIKE, at, [at[0] + d.x * len, at[1] + d.y * len, at[2] + d.z * len], r, 0));
    });
    return merge(L);
}
function palMaterial() {
    const m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aK; attribute vec3 aPiv; attribute vec3 aC2; attribute vec4 aShape; uniform float uNow; varying vec3 vPC; varying float vGl; varying float vSt;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    // what this one has (the numbers addPal packs)
    float k = aK, on = 1.0, ex = aShape.x + 0.01, hy = aShape.y + 0.01, tz = aShape.z + 0.01, ph = aShape.w;
    float ant = step(50.0, ph); ph = mod(ph, 100.0);
    float ear = floor(ex), beak = step(0.25, fract(ex)), horn = floor(hy), crown = step(0.25, fract(hy)), tail = floor(tz);
    float spk = step(0.2, mod(fract(tz), 0.5)), wing = step(0.45, fract(tz)), antl = step(1.5, horn), tl2 = step(1.5, tail);
    // a pair of horns is antlers, or swept-back horns on the spiny (dragons) and the floppy-eared (rams, goats)
    float hb = antl * max(spk, step(1.5, ear) * step(ear, 2.5));
    vec3 c = instanceColor;
    vGl = 0.0; vSt = -1.0;
    // its parts. The body's soft and plush: deeper underneath, lighter on top
    if (k < 0.5) { c *= 0.8 + 0.2 * smoothstep(0.1, 1.2, position.y); c = mix(c, vec3(1.0), 0.08 * smoothstep(1.2, 1.96, position.y)); }
    else if (k < 1.5) c = mix(aC2, vec3(1.0), 0.12);
    else if (k < 2.5) { c = mix(aC2, vec3(1.0), 0.2) * (0.9 + 0.15 * sin(uNow * 3.0 + ph)); vGl = 1.0; }
    else if (k < 3.5) { c = vec3(0.012, 0.01, 0.03); vGl = 1.0; }
    else if (k < 4.5) { c = vec3(1.0); vGl = 1.0; }
    else if (k < 5.5) { on = step(0.5, ear) * step(ear, 1.5) * (1.0 - antl); c = mix(c, aC2, 0.75 * smoothstep(0.3, 0.85, objectNormal.z)); }
    else if (k < 6.5) { on = step(1.5, ear) * step(ear, 2.5); c = aC2; }
    else if (k < 7.5) { on = step(2.5, ear) * (1.0 - antl); c = mix(c, aC2, 0.7 * smoothstep(0.4, 0.9, objectNormal.z)); }
    else if (k < 8.5) { on = step(0.5, horn) * (1.0 - antl); c = mix(aC2, vec3(1.0), 0.45); vSt = position.y * 8.0 + position.x * 4.0; }
    else if (k < 9.5) { on = antl * (1.0 - hb); c = aC2 * (0.78 + 0.22 * smoothstep(1.8, 2.9, position.y)); }
    else if (k < 10.5) { on = step(0.5, tail) * (1.0 - tl2); c = aC2; }
    else if (k < 11.5) { on = tl2; c *= 0.86; }
    else if (k < 12.5) { on = spk; c = aC2 * (0.78 + 0.4 * smoothstep(0.05, 0.4, distance(position, aPiv))); }
    else if (k < 13.5) c = instanceColor * 0.72;
    else if (k < 14.5) { on = beak; c = vec3(1.0, 0.64, 0.14); }
    else if (k < 15.5) { on = tl2 * max(1.0 - spk, beak); c = mix(aC2, vec3(1.0), 0.15); }
    else if (k < 16.5) c = mix(instanceColor, vec3(1.0, 0.25, 0.4), 0.55);
    else if (k < 17.5) { on = step(0.5, ear) * step(ear, 1.5) * antl; c = mix(c, aC2, 0.75 * smoothstep(0.3, 0.85, objectNormal.z)); }
    else if (k < 18.5) { on = step(2.5, ear) * antl * (1.0 - hb); c = mix(c, aC2, 0.6 * smoothstep(0.3, 0.9, objectNormal.y)); }
    else if (k < 19.5) { on = hb; c = aC2 * (0.72 + 0.4 * smoothstep(1.8, 2.4, position.y)); }
    else if (k < 20.5) { on = tl2 * spk * (1.0 - beak); c = aC2; }
    else if (k < 21.5) {
        // the wings beat about the shoulder (up and down round the body's long axis), body-coloured at the root, the accent at the tips
        on = wing;
        float an = sign(aPiv.x) * (0.22 + 0.34 * sin(uNow * 9.0 + ph)), ca = cos(an), sa = sin(an);
        vec2 d = transformed.xy - aPiv.xy;
        transformed.xy = aPiv.xy + vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
        c = mix(c, aC2, smoothstep(0.15, 0.85, distance(position, aPiv)));
    }
    else if (k < 22.5) { on = crown; c = mix(vec3(1.0, 0.68, 0.1), vec3(1.0, 0.92, 0.5), smoothstep(1.92, 2.26, position.y)) * (dot(objectNormal.xz, position.xz - aPiv.xz) < 0.0 ? 0.6 : 1.0); vGl = 0.25; }
    else if (k < 23.5) { on = 1.0 - beak; c = vec3(0.012, 0.01, 0.03); vGl = 1.0; }
    else if (k < 24.5) { on = ant; c = instanceColor * 0.7; }
    else { on = ant; c = mix(aC2, vec3(1.0), 0.3) * (0.85 + 0.25 * sin(uNow * 4.0 + ph)); vGl = 1.0; }
    // the antennae sway about their roots
    if (k > 23.5) transformed.x += sin(uNow * 3.4 + ph) * 0.16 * distance(position, aPiv) * (k > 24.5 ? 1.0 : 1.0);
    // the long tail wags, its tip with it
    if ((k > 10.5 && k < 11.5) || (k > 14.5 && k < 15.5) || (k > 19.5 && k < 20.5)) transformed.x += sin(uNow * 6.0 + ph) * 0.24 * distance(position, aPiv);
    if (on < 0.5) transformed = vec3(0.0, -4000.0, 0.0);
    vPC = c;
}`);
        // (a unicorn horn's spiral groove, drawn per pixel)
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPC; varying float vGl; varying float vSt;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vSt > 0.0 ? mix(vPC, vPC * 0.62, step(0.62, fract(vSt))) : vPC;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vPC * vGl * 1.1; diffuseColor.rgb *= 1.0 - vGl;');
    };
    m.customProgramCacheKey = () => 'sbe-pal';
    return selfLit(m);
}
function build() {
    if (mesh) return;
    const low = getQuality() === 'low';
    cap = low ? 16 : 34;
    const g = palGeo(low);
    aC2 = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(T.DynamicDrawUsage);
    aShape = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(T.DynamicDrawUsage);
    g.setAttribute('aC2', aC2); g.setAttribute('aShape', aShape);
    mesh = new T.InstancedMesh(g, palMaterial(), cap);
    mesh.setColorAt(0, tc.set(0xffffff));
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0;
    scene.add(mesh);
}
export function beginPals() { build(); n = 0; }
// a pet at (x, y, z), facing ry, squashed s (1 is round), size k
export function addPal(id, x, y, z, ry, s, k) {
    const a = palById[id];
    if (!a || n >= cap) return;
    const sz = (k || 1) * (0.72 + a.tier * 0.05), sp = SHAPE.get(id);
    q.setFromAxisAngle(UP, ry);
    mesh.setMatrixAt(n, m4.compose(vP.set(x, y, z), q, vS.set(sz * (2 - s), sz * s, sz * (2 - s))));
    mesh.setColorAt(n, tc.set(a.c1));
    tc.set(a.c2); aC2.setXYZ(n, tc.r, tc.g, tc.b);
    aShape.setXYZW(n, sp[0], sp[1], sp[2], sp[3]);
    n++;
}
export function endPals() {
    if (!mesh) return;
    mesh.count = n; mesh.visible = n > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; aC2.needsUpdate = true; aShape.needsUpdate = true; }
}
export function palsWarm() { build(); n = 0; mesh.count = 1; mesh.setMatrixAt(0, m4.makeTranslation(0, -80, 0)); mesh.setColorAt(0, tc.set(0xffffff)); mesh.visible = true; mesh.instanceMatrix.needsUpdate = true; }

// A team following its owner: a state per pet, hopping along behind in a line
export class Team {
    constructor() { this.ids = []; this.key = ''; this.st = []; }
    set(csv) {
        if (csv === this.key) return;
        this.key = csv;
        this.ids = csv ? csv.split(',').filter((id) => palById[id]).slice(0, 6) : [];
        while (this.st.length < this.ids.length) this.st.push({ x: 1e9, z: 0, h: 0, vy: 0, ry: 0, s: 1, sv: 0, p: Math.random() * 6, lick: 0 });
    }
    get size() { return this.ids.length; }
    // lick (anything truthy: a step landed, a MEGA CLACK): they get excited, a hop on the spot
    update(dt, t, x, y, z, ry, lick) {
        const ids = this.ids;
        for (let i = 0; i < ids.length; i++) {
            const S = this.st[i], side = i % 2 ? 1 : -1, back = 3.8 + Math.floor(i / 2) * 2.4;
            const tx = x - Math.sin(ry) * back + Math.cos(ry) * side * 2.3, tz = z - Math.cos(ry) * back - Math.sin(ry) * side * 2.3;
            if (S.x > 1e8 || (S.x - tx) ** 2 + (S.z - tz) ** 2 > 3600) { S.x = tx; S.z = tz; S.h = 0; S.vy = 0; }
            const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz), moving = d > 1.2, sp = Math.min(46, d * 7);
            if (moving) { S.x += dx / d * sp * dt; S.z += dz / d * sp * dt; S.ry = Math.atan2(dx, dz); } else {
                // standing still: facing the same way as you
                let dr = (ry - S.ry) % 6.2832; if (dr > 3.1416) dr -= 6.2832; if (dr < -3.1416) dr += 6.2832;
                S.ry += dr * Math.min(1, dt * 3);
            }
            // hopping along when there's ground to cover, a little bounce on the spot now and then, and when they're excited
            S.vy -= 70 * dt; S.h += S.vy * dt;
            if (S.h <= 0) { if (S.vy < -3) S.sv = -3.4; S.h = 0; S.vy = moving ? 15 : (lick || Math.sin(t * 0.8 + S.p) > 0.985) ? 9 : 0; }
            S.sv += (((1 - S.s) * 120) - S.sv * 11) * dt; S.s = Math.max(0.65, Math.min(1.3, S.s + S.sv * dt));
            addPal(ids[i], S.x, y + S.h + 0.05, S.z, S.ry, S.s);
        }
    }
}

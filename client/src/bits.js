// The bits: crumbs and sweet flecks flying on the graphics card (a burst is a small upload and no work after that).
import { T, scene } from './engine.js';
import { CU } from './clock.js';
import { getQuality } from './fx.js';

const CHIP_MED = 700, CHIP_LOW = 240, LIFE = 0.85;
let chips = null, chipN = 0, chipCap = 0, aP = null, aV = null, aT = null, aColor = null, chipsUntil = 0;
function buildChips() {
    if (chips) return;
    chipCap = getQuality() === 'low' ? CHIP_LOW : CHIP_MED;
    const g = new T.InstancedBufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([-0.5, -0.4, 0, 0.5, -0.3, 0, 0, 0.55, 0], 3));
    aP = new T.InstancedBufferAttribute(new Float32Array(chipCap * 3).fill(-9999), 3).setUsage(T.DynamicDrawUsage);
    aV = new T.InstancedBufferAttribute(new Float32Array(chipCap * 3), 3).setUsage(T.DynamicDrawUsage);
    aT = new T.InstancedBufferAttribute(new Float32Array(chipCap * 2).fill(-99), 2).setUsage(T.DynamicDrawUsage);
    aColor = new T.InstancedBufferAttribute(new Float32Array(chipCap * 3), 3).setUsage(T.DynamicDrawUsage);
    g.setAttribute('aP', aP); g.setAttribute('aV', aV); g.setAttribute('aT', aT); g.setAttribute('aColor', aColor);
    g.instanceCount = chipCap;
    const m = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, uLife: { value: LIFE } },
        vertexShader: `attribute vec3 aP; attribute vec3 aV; attribute vec2 aT; attribute vec3 aColor; uniform float uNow; uniform float uLife; varying vec3 vC; varying float vA;
            void main() {
                float t = uNow - aT.x;
                if (t < 0.0 || t > uLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = aColor; vA = 0.0; return; }
                vec3 p = aP + aV * t; p.y -= 42.0 * t * t;
                float k = 1.0 - t / uLife, s = aT.y * (0.35 + 0.65 * k), a = t * (9.0 + aP.x * 3.0) + aP.z, c = cos(a), n = sin(a);
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                mv.xy += vec2(c * position.x - n * position.y, n * position.x + c * position.y) * s;
                gl_Position = projectionMatrix * mv;
                vC = aColor; vA = 1.0;
            }`,
        fragmentShader: 'varying vec3 vC; varying float vA; void main() { if (vA < 0.5) discard; gl_FragColor = vec4(vC, 1.0);\n#include <colorspace_fragment>\n}',
    });
    chips = new T.Mesh(g, m);
    chips.frustumCulled = false; chips.renderOrder = 1;
    scene.add(chips);
}
const cc = new T.Color();
// n bits from (x, y, z), colour c (and sometimes c2), thrown up and out; k: which way along z they favour
export function chipBurst(x, y, z, c, c2, n, power, kz) {
    buildChips();
    const now = CU.uNow.value, pw = power || 1, i0 = chipN;
    chipsUntil = now + LIFE + 0.05; chips.visible = true;
    for (let k = 0; k < n; k++) {
        const i = chipN;
        chipN = (chipN + 1) % chipCap;
        const a = Math.random() * 6.283, sp = (4 + Math.random() * 11) * pw;
        aP.setXYZ(i, x + (Math.random() - 0.5) * 0.8, y + Math.random() * 1.4, z + (Math.random() - 0.5) * 0.8);
        aV.setXYZ(i, Math.cos(a) * sp, (9 + Math.random() * 13) * pw, Math.sin(a) * sp + (kz || 0) * sp);
        aT.setXY(i, now, 0.4 + Math.random() * 0.45);
        cc.set(k % 3 === 2 && c2 !== undefined ? c2 : c);
        aColor.setXYZ(i, cc.r, cc.g, cc.b);
    }
    // only what changed goes up (a wrap-around sends two pieces)
    const end = i0 + n;
    for (const [at, s] of [[aP, 3], [aV, 3], [aT, 2], [aColor, 3]]) {
        if (end <= chipCap) at.addUpdateRange(i0 * s, n * s); else { at.addUpdateRange(i0 * s, (chipCap - i0) * s); at.addUpdateRange(0, (end - chipCap) * s); }
        at.needsUpdate = true;
    }
}
export function chipsWarm() { buildChips(); chipBurst(0, -80, 0, 0xffffff, 0xffffff, 3); }
export function chipsTick() { if (chips && chips.visible && CU.uNow.value > chipsUntil) chips.visible = false; }

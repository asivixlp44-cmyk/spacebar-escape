// Every floating sign of a scene in one draw: one texture, one mesh, each quad turned to face the camera in the vertex
// shader (a sign with bob: 1 floats up and down). A sign's words change only when they're written again.
import { T, texFrom, drawLines, linesHeight, renderer } from './engine.js';
import { CU } from './clock.js';

// the signs' lettering: chunky, outlined, with a sheen
export const GOLD = ['#fff6a0', '#ffc21e'], LIME = ['#eaffc8', '#3ee03a'], WHITE = ['#ffffff', '#d8e4ff'], RED = ['#ff9a8a', '#ff2a3a'], AQUA = ['#d8fbff', '#3ad8ff'], GREY = ['#e8ecf4', '#a8b0c0'], PINK = ['#ffd8f0', '#ff5ac0'];
export const big = (t, g, px, s, ic) => ({ t, c: g[1], g, s: s || '#1a1030', px, f: 'chunky', ic });

export class Signs {
    constructor(cols, CW, CH) { this.list = []; this.cols = cols || 4; this.CW = CW || 448; this.CH = CH || 152; }
    // far: how far off it can still be read (past that it's faded out, so signs in a row don't pile up on each other)
    add(lines, worldW, pos, bob, far) { const s = { lines, worldW, pos: pos.clone(), bob: bob ? 1 : 0, far: far || 280, on: true, i: this.list.length, h: 0 }; this.list.push(s); return s; }
    build(parent) {
        const n = this.list.length, { cols, CW, CH } = this;
        this.rows = Math.ceil(n / cols);
        this.c = document.createElement('canvas'); this.c.width = cols * CW; this.c.height = this.rows * CH;
        this.x = this.c.getContext('2d');
        this.tex = texFrom(this.c);
        const g = new T.BufferGeometry(), idx = [];
        this.pos = new Float32Array(n * 12); this.off = new Float32Array(n * 8); this.uv = new Float32Array(n * 8);
        const bob = new Float32Array(n * 4), farA = new Float32Array(n * 4);
        for (const s of this.list) {
            for (let k = 0; k < 4; k++) { this.pos.set([s.pos.x, s.pos.y, s.pos.z], s.i * 12 + k * 3); bob[s.i * 4 + k] = s.bob; farA[s.i * 4 + k] = s.far; }
            const b = s.i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
            this.paint(s);
        }
        g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
        g.setAttribute('aOff', new T.BufferAttribute(this.off, 2));
        g.setAttribute('uv', new T.BufferAttribute(this.uv, 2));
        g.setAttribute('aBob', new T.BufferAttribute(bob, 1));
        g.setAttribute('aFar', new T.BufferAttribute(farA, 1));
        g.setIndex(idx);
        g.computeBoundingSphere();
        g.boundingSphere.radius += 14;
        const m = new T.ShaderMaterial({
            uniforms: { map: { value: this.tex }, uNow: CU.uNow },
            vertexShader: `attribute vec2 aOff; attribute float aBob; attribute float aFar; uniform float uNow; varying vec2 vUv; varying float vFade;
                void main() {
                    vUv = uv;
                    vec3 c = position; c.y += aBob * sin(uNow * 2.0 + position.z * 0.07) * 0.4;
                    vec4 mv = modelViewMatrix * vec4(c, 1.0);
                    float d = -mv.z;
                    vFade = smoothstep(14.0 + length(aOff), 20.0 + length(aOff) * 1.2, d) * (1.0 - smoothstep(aFar * 0.78, aFar, d));
                    mv.xy += aOff;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vFade;
                void main() {
                    vec4 t = texture2D(map, vUv);
                    t.a *= vFade;
                    if (t.a < 0.02) discard;
                    gl_FragColor = t;
                    #include <colorspace_fragment>
                }`,
            transparent: true, depthWrite: false,
        });
        this.mesh = new T.Mesh(g, m);
        this.mesh.renderOrder = 2;
        this.mesh.frustumCulled = n < 3;
        parent.add(this.mesh);
    }
    // a sign's words into its cell, its quad sized to them
    paint(s) {
        // (drawn straight into its cell, scaled: no canvas of its own made and copied in for each sign)
        const W0 = Math.round(this.CW * 768 / 448), k = this.CW / W0, H0 = linesHeight(s.lines), h = Math.min(this.CH, Math.ceil(H0 * k));
        const cx = (s.i % this.cols) * this.CW, cy = Math.floor(s.i / this.cols) * this.CH, x = this.x;
        x.save();
        x.beginPath(); x.rect(cx, cy, this.CW, this.CH); x.clip();
        x.clearRect(cx, cy, this.CW, this.CH);
        x.translate(cx, cy); x.scale(k, k * Math.min(1, this.CH / (H0 * k)));
        drawLines(x, s.lines, W0);
        x.restore();
        s.h = h;
        const W2 = this.c.width, H2 = this.c.height, u0 = cx / W2, u1 = (cx + this.CW) / W2, v1 = 1 - cy / H2, v0 = 1 - (cy + h) / H2;
        this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], s.i * 8);
        this.quad(s);
    }
    quad(s) {
        const hw = s.on ? s.worldW / 2 : 0, hh = s.on ? s.worldW * s.h / this.CW / 2 : 0;
        this.off.set([-hw, -hh, hw, -hh, hw, hh, -hw, hh], s.i * 8);
    }
    // new words: only when they differ
    set(s, lines) {
        const key = JSON.stringify(lines);
        if (s.key === key) return;
        s.key = key; s.lines = lines;
        this.paint(s);
        if (!this.upCell(s)) this.tex.needsUpdate = true;
        this.dirty();
    }
    upCell(s) {
        const p = renderer.properties.get(this.tex);
        if (!p.__webglTexture || this.tex.version !== p.__version) return false;
        if (!this.cell) { this.cell = document.createElement('canvas'); this.cell.width = this.CW; this.cell.height = this.CH; this.cellX = this.cell.getContext('2d'); this.cellTex = new T.CanvasTexture(this.cell); this.cellPos = new T.Vector2(); }
        const cx = (s.i % this.cols) * this.CW, cy = Math.floor(s.i / this.cols) * this.CH;
        this.cellX.clearRect(0, 0, this.CW, this.CH);
        this.cellX.drawImage(this.c, cx, cy, this.CW, this.CH, 0, 0, this.CW, this.CH);
        // (the atlas is uploaded flipped: its rows count up from the canvas's bottom)
        this.cellPos.set(cx, this.c.height - cy - this.CH);
        try { renderer.copyTextureToTexture(this.cellTex, this.tex, null, this.cellPos); } catch (e) { return false; }
        return true;
    }
    show(s, on) { if (s.on === on) return; s.on = on; this.quad(s); this.dirty(); }
    dirty() { if (!this.mesh) return; const g = this.mesh.geometry; g.attributes.aOff.needsUpdate = true; g.attributes.uv.needsUpdate = true; }
    dispose() { if (!this.mesh) return; this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); if (this.cellTex) this.cellTex.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}

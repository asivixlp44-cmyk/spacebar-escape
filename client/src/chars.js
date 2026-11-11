// A character on screen: you, someone else in your world, a rival in a race. The Bloxity avatar (the top games' run / jump / land
// animation), squash and stretch on every jump and landing, the name tag and title, their trail behind them as they run and their aura,
// the running shoes they've bought (setShoe), knocked flat when a Wobbler catches them (pose 'down'). Their pets are in pals.js.
import { T, V3, scene, billboard, buildRig, animRig, airPose, lerpAngle } from './engine.js';
import { createAvatar, unpackAvatar, shoeGeo, shoeMaterial } from './avatar.js';
import * as FX from './fx.js';
import { TRAILS, AURAS, SHOES } from '../../shared/config.js';

const PIVOT = 2.6;
const KIT = { shirt: 0x2a8aff, shorts: 0x26263e, socks: 0xffffff, hair: 0x3a2618, skin: 0xf2c9a0 };
export const nameLines = (name, lv, title, color) => [{ t: (title ? title + ' · ' : '') + 'Lv. ' + (lv || 1), c: '#ffe24a', s: '#3a2400', px: 36 }, { t: name || ' ', c: color || '#ffffff', s: '#10203a', px: 52 }];

// Avatars are built one a frame at most (a whole match's worth at once was a long frame on a slow laptop);
// main.js pumps the queue every frame, and waits for it behind the fade into a match
const avQueue = [];
let avBusy = false;
export function pumpAvatars() {
    if (avBusy || !avQueue.length) return;
    const job = avQueue.shift();
    if (job.char.dead) return;
    avBusy = true;
    createAvatar(job.data).then((a) => { avBusy = false; job.done(a); }, () => { avBusy = false; job.done(null); });
}
export const avatarsPending = () => avQueue.length + (avBusy ? 1 : 0);

// (read straight away by whoever's updated: one will do for everyone)
const BLOX_ST = { moving: false, air: false, vy: 0, speed: 0, hspeed: 0, jump: false, airJump: false, t: 0, sprint: false, pose: null, lick: 0 };
export class Char {
    // o: { name, lv, tr, local, color (the name's), noLabel }
    constructor(o) {
        o = o || {};
        this.root = new T.Group();
        this.sq = new T.Group();                        // squash and stretch round the feet
        this.root.add(this.sq);
        const pivot = new T.Group(); pivot.position.y = PIVOT; this.sq.add(pivot);
        const body = buildRig(o.kit || KIT); body.position.y = -PIVOT; pivot.add(body);
        this.body = body; this.pivot = pivot;
        scene.add(this.root);
        this.blox = null; this.av = null; this.loading = false; this.dead = false;
        this.labelKey = '';
        this.labelW = o.labelW || 6; this.labelK = 1;
        this.label = o.noLabel ? null : billboard(nameLines(o.name, o.lv, o.tr, o.color), this.labelW, 512, new V3(0, 8.6, 0), this.root);
        if (this.label) this.label.renderOrder = 9;
        this.trail = null; this.trailIdx = -1; this.aura = 0;
        this.squashV = 0; this.squashX = 0; this.phase = 0;
        this.feet = new V3();
        this.shoeIdx = -1; this.rigShoes = null; this.downK = 0;
    }
    // the running shoes they wear (config SHOES index): on the avatar's feet, or on the blocky stand-in's until the avatar's in
    setShoe(i) {
        i = Math.max(0, Math.min(SHOES.length - 1, i | 0));
        if (i === this.shoeIdx) return;
        this.shoeIdx = i;
        if (this.blox) this.blox.setShoe(i);
        const legs = this.body.userData.legs;
        if (this.rigShoes) for (const m of this.rigShoes) m.parent && m.parent.remove(m);
        this.rigShoes = null;
        if (!this.blox && legs) {
            const g = shoeGeo(i);
            if (g) this.rigShoes = legs.map((leg) => { const m = new T.Mesh(g, shoeMaterial()); m.position.set(0, -2.06, 0.06); m.scale.setScalar(1.02); leg.add(m); return m; });
        }
    }
    setLabel(name, lv, tr, color) {
        if (!this.label) return;
        const k = name + '|' + lv + '|' + (tr || '') + '|' + (color || '');
        if (k === this.labelKey) return;
        this.labelKey = k;
        this.label.userData.set(nameLines(name, lv, tr, color));
        this.labelK = 1;
        const im = this.label.material.map.image;
        this.label.scale.set(this.labelW, this.labelW * im.height / im.width, 1);
    }
    // d: how far from the camera. Close up, a tag keeps to the size it has at 30 studs (a name the size of the screen hides everything)
    fitLabel(d) {
        const k = d < 30 ? Math.max(0.3, d / 30) : 1;
        if (!this.label || Math.abs(k - this.labelK) < 0.03) return;
        this.labelK = k;
        const im = this.label.material.map.image, w = this.labelW * k;
        this.label.scale.set(w, w * im.height / im.width, 1);
    }
    // a packed avatar (someone else's), or an avatar object made already (yours)
    setAvatar(packed) {
        if (packed === this.av && (this.blox || this.loading)) return;
        this.av = packed;
        const data = packed ? unpackAvatar(packed) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        avQueue.push({ char: this, data, done: (a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.wear(a);
            if (this.av !== packed) this.setAvatar(this.av);
        } });
    }
    wear(a) {
        if (this.blox && this.blox !== a) this.blox.dispose();
        this.blox = a;
        // the blocky stand-in body goes for good (its parts share their geometry and colours: nothing to free)
        for (const c of [...this.body.children]) if (c !== a.root) this.body.remove(c);
        this.body.add(a.root);
        this.rigShoes = null;
        if (this.shoeIdx >= 0) a.setShoe(this.shoeIdx);
    }
    setTrail(i) {
        if (i === this.trailIdx) return;
        this.trailIdx = i;
        const T0 = TRAILS[i];
        if (!T0 || T0.id === 'none') { if (this.trail) { this.trail.dispose(); this.trail = null; } return; }
        if (!this.trail) this.trail = FX.makeTrail(T0.c1);
        this.trail.setColor(T0.c1, !!T0.rainbow);
        this.trail.width = 0.55;
    }
    setAura(i) { this.aura = AURAS[i] && AURAS[i].id !== 'none' ? i : 0; }
    // the jump: a stretch up; a landing: a squash (k 0..1.5)
    stretch(k) { this.squashV = -0.22 * Math.min(1, k); this.squashX = 0; }
    squash(k) { this.squashV = 0.32 * Math.min(1.5, k); this.squashX = 0; }
    // st: { x, y, z, ry, air, moving, speed, vy, jump, airJump, sprint, far (simpler: no trail, animated every other frame) }
    update(dt, t, st) {
        const r = this.root, q = BLOX_ST;
        r.position.set(st.x, st.y, st.z);
        if (st.ry !== undefined) r.rotation.y = st.snapRy ? st.ry : lerpAngle(r.rotation.y, st.ry, 1 - Math.exp(-dt * 14));
        // squash and stretch: a spring back to round
        this.squashX += (-this.squashV * 180 - this.squashX * 16) * dt;
        this.squashV += this.squashX * dt;
        const s = Math.max(-0.35, Math.min(0.45, this.squashV));
        this.sq.scale.set(1 + s * 0.55, 1 - s, 1 + s * 0.55);
        this.sq.rotation.x = st.tilt || 0;
        // knocked flat ('down'): laid on its back on the ground, twitching a little; up again when the pose goes
        const dk = this.downK + ((st.pose === 'down' ? 1 : 0) - this.downK) * Math.min(1, dt * 9);
        if (dk > 0.001 || this.downK > 0.001) {
            this.pivot.rotation.set(-Math.PI / 2 * dk, 0, Math.sin(t * 7.3) * 0.04 * dk);
            this.pivot.position.y = PIVOT - (PIVOT - 0.75) * dk;
        }
        this.downK = dk < 0.001 ? 0 : dk;
        this.phase += dt * (st.moving && !st.air ? Math.min(18, 4 + (st.speed || 0) * 0.3) : 0);
        this.skip = st.far ? !this.skip : false;
        this.animDt = (this.animDt || 0) + dt;
        if (this.blox) { this.blox.setFar(!!st.far); if (!this.skip) { q.moving = st.moving && !st.air; q.air = st.air; q.vy = st.vy; q.speed = st.speed; q.hspeed = st.speed; q.jump = st.jump; q.airJump = st.airJump; q.t = t; q.sprint = st.sprint; q.pose = st.pose; q.lick = st.lick; this.blox.update(this.animDt, q); this.animDt = 0; } }
        else if (st.pose === 'down') downPose(this.body, t); else if (st.air) airPose(this.body); else if (st.moving) animRig(this.body, this.phase, 0.85); else animRig(this.body, 0, 0);
        if (this.rigShoes && !this.blox) for (const m of this.rigShoes) m.visible = !st.far;
        this.feet.set(st.x, st.y, st.z);
        if (this.trail) { FX.tmpV.set(st.x, st.y + 2.6, st.z); this.trail.update(FX.tmpV, (!!st.air || (st.moving && (st.speed || 0) > 8)) && !st.far, dt, t); }
        if (this.aura && !st.far) { const A = AURAS[this.aura]; FX.auraColor(this.feet, A.c1, !!A.rainbow, dt); }
    }
    // hidden (far off, another world): out of the scene too, so its bones and parts aren't worked out every frame
    setVisible(on) {
        if (on === this.shown) return;
        this.shown = on;
        this.root.visible = on;
        if (on && !this.root.parent && !this.dead) scene.add(this.root); else if (!on && this.root.parent) scene.remove(this.root);
        if (this.trail && !on) this.trail.reset();
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        scene.remove(this.root);
        if (this.label && this.label.userData.ownTex) this.label.material.map.dispose();
        if (this.rigShoes) for (const m of this.rigShoes) m.parent && m.parent.remove(m);
        if (this.trail) this.trail.dispose();
    }
}
// the blocky stand-in knocked flat: arms and legs flung out, kicking a little
function downPose(g, t) {
    const u = g.userData, k = Math.sin(t * 11) * 0.15;
    u.legs[0].rotation.set(-0.2 + k, 0, -0.35); u.legs[1].rotation.set(-0.1 - k, 0, 0.35);
    u.arms[0].rotation.set(-0.4 - k, 0, -1.3); u.arms[1].rotation.set(-0.6 + k, 0, 1.3);
}

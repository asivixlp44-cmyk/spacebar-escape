// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the
// network as real clients do. Run: npm --prefix tests run server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { CFG, X20, WALLS_N, WORLDS, SHOES, TRAILS, AURAS, POSTS, UPGRADES, JAWBREAKERS, upgradeCost, xpNeed, xpGain, maxWalk, rebirthLv, rebirthMult, padWins, FIRST_PAD, stepGain, CODES, QUESTS, GIFTS, DAILY, matchInfo, strideOf } from '../shared/config.js';
import { W, wallZ, postSpot, checkpoint } from '../shared/world.js';
import { arenaPlan, startSpot, laneX, surgeAt } from '../shared/arena.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3058, URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }

class Bot {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = W.spawn.z; this.y = 0; this.seq = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('run', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'padok', 'warped', 'reborn', 'warp', 'spun', 'bought', 'taskdone', 'questdone', 'hatched', 'died', 'revived', 'caught', 'escaped', 'mQueue', 'mStart', 'mGo', 'mScore', 'mDone', 'mOut', 'mTime', 'mEnd', 'mBack', 'mJoined', 'mLeft', 'mSync', 'mNone', 'authed', 'emote', 'chat', 'candy', 'saved']) R.onMessage(t, (m) => { (this.msgs[t] = this.msgs[t] || []).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); this.profiles = (this.profiles || 0) + 1; });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const me = R.state.players.get(R.sessionId);
        this.x = me.x; this.z = me.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, ts, a, post, v) { this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: a ?? 1, ts: ts ?? Date.now(), post, v }); }
    // a QA teleport: next move is checked from there (and a new life starts there)
    async tp(x, y, z) { this.send('qa', { tp: [x, y, z] }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, y, z); await sleep(60); }
    // run in a straight line to (x, z) at v studs a second, a move every 100 ms
    async run(x, z, v, extra) {
        const sx = this.x, sz = this.z, d = Math.hypot(x - sx, z - sz), n = Math.max(1, Math.ceil(d / ((v || 30) * 0.1)));
        for (let i = 1; i <= n; i++) { this.move(sx + (x - sx) * i / n, 0, sz + (z - sz) * i / n, undefined, 1, undefined, extra); await sleep(100); }
    }
    step(n, post) { this.send('step', { n, post: post ?? -1, s: ++this.seq }); }
    // n steps on a treadmill at a rate the bucket allows
    async tread(n, post) { for (let i = 0; i < n; i += 3) { this.step(Math.min(3, n - i), post); await sleep(330); } await sleep(300); }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir, NO_BOTS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => { if (!/SAVE_SECRET/.test(String(d))) process.stderr.write(d); });
for (let i = 0; i < 60; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(150); }

try {
    console.log('--- a new player');
    const a = await new Bot('alice').join();
    ok(a.p.lv === 1 && a.p.speed === 0 && a.p.wins === 0 && a.p.rebirths === 0 && a.p.xp === 0, 'starts at Level 1 with nothing');
    ok(a.got('boards') === 1, 'told the leaderboards');
    a.send('ping', { c: 123 });
    await a.wait(() => a.last('pong'));
    ok(a.last('pong').c === 123 && Math.abs(a.last('pong').s - Date.now()) < 2000, 'ping answers with the server\'s clock');
    let bots = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.bots - 1, 'a bot goes home for each real player (' + bots + ' left)');

    console.log('--- the bots run the Keyway at their Level\'s walk speed');
    {
        a.send('qa', { botsRun: true });
        let inRun = 0, tooFast = 0, maxRatio = 0;
        const t0 = Date.now();
        while (Date.now() - t0 < 9000) {
            a.room.state.players.forEach((p) => {
                if (!p.bot || p.match) return;
                if (p.z < wallZ(0) - 4) inRun++;
                if (p.anim === 1 && p.spd > 0) { maxRatio = Math.max(maxRatio, p.spd / maxWalk({ lv: p.lv })); if (p.spd > maxWalk({ lv: p.lv }) + 0.05) tooFast++; }
            });
            if (inRun > 20 && Date.now() - t0 > 3000) break;
            await sleep(100);
        }
        ok(inRun > 0, 'they go up the course (' + inRun + ' looks at one in it)');
        ok(tooFast === 0 && maxRatio > 0.5, 'never faster than their Level walks (at most x' + maxRatio.toFixed(2) + ' of it)');
    }

    console.log('--- steps on the ground: +1 Speed and +1 XP');
    a.step(3);
    await sleep(300);
    ok(a.p.steps === 0, 'steps standing still count for nothing (' + a.p.steps + ')');
    await a.run(a.x, a.z - 30, 14);
    a.step(4);
    await a.wait(() => a.p.steps >= 4);
    await sleep(100);
    ok(a.p.steps === 4 && a.p.speed === 4 * X20, 'steps after running 30 studs: +' + X20 + ' Speed each (' + a.p.speed + ')');
    // XP: 20 at Level 1, a little more each Level after (32 XP to Level 2, 60 to Level 3)
    { let lv = 1, xp = 0; for (let i = 0; i < 4; i++) { xp += xpGain({ lv }); while (xp >= xpNeed(lv)) { xp -= xpNeed(lv); lv++; } } ok(a.p.lv === lv && Math.abs(a.p.xp - xp) < 0.2 && a.got('levelup') >= 1, 'and +' + X20 + ' XP each, a little more every Level: Level ' + a.p.lv + ', ' + a.p.xp + ' / ' + a.p.need + ' XP'); }
    ok(a.last('levelup') && a.last('levelup').need === xpNeed(a.p.lv) && a.p.need === xpNeed(a.p.lv), 'told what the next Level needs (' + a.p.need + ')');
    ok(a.p.ack >= 2, 'the answer says which steps it has heard');
    const st0 = a.p.steps;
    a.step(30);
    await sleep(400);
    ok(a.p.steps - st0 <= Math.ceil(30 / (strideOf(CFG.walk) * 0.7)), 'no more steps than the strides run (' + (a.p.steps - st0) + ')');
    a.send('step', { n: 9999, post: -1, s: ++a.seq });
    await sleep(300);
    ok(a.p.steps < 45, 'a batch is cut down to 30 steps at most');

    console.log('--- treadmills');
    const t0 = postSpot(0), t1 = postSpot(1);
    await a.tp(t0.x, 0, t0.z + 1);
    a.move(t0.x, 0, t0.z + 1, Date.now(), 3, 0);
    await sleep(80);
    const sp0 = a.p.speed, x0 = a.p.xp, lv0 = a.p.lv, n0 = a.p.steps;
    await a.tread(9, 0);
    ok(a.p.speed - sp0 >= 8 * X20 && Math.abs((a.p.speed - sp0) - (a.p.steps - n0) * X20) < 1e-6, 'on the ' + POSTS[0].name + ': +' + X20 + ' Speed a step (' + (a.p.speed - sp0) + ')');
    ok(a.p.lv > lv0 || a.p.xp > x0, 'and XP (Level ' + a.p.lv + ')');
    ok(a.p.tread >= 8, 'treadmill steps counted (' + a.p.tread + ')');
    ok(a.me().post === 0 && a.me().anim === 3, 'everyone sees you on it');
    const sp1 = a.p.speed;
    await a.tread(6, 1);
    ok(a.p.speed - sp1 <= X20, 'the ' + POSTS[1].name + ' is shut until you have earned its Wins (' + (a.p.speed - sp1) + ')');
    await a.tp(t1.x, 0, t1.z + 1);
    const sp2 = a.p.speed;
    await a.tread(6, 0);
    ok(a.p.speed - sp2 <= X20, 'a treadmill counts only standing on it');
    // the bucket: 60 at once is not 60
    await a.tp(t0.x, 0, t0.z + 1);
    const sp3 = a.p.steps;
    for (let i = 0; i < 6; i++) a.step(10, 0);
    await sleep(400);
    ok(a.p.steps - sp3 <= 16, 'a treadmill\'s steps are capped by the clock (' + (a.p.steps - sp3) + ' of 60)');
    ok(a.got('caught') === 0 && a.got('escaped') === 0, 'nothing chases you');

    console.log('--- your Level is your top walk speed (the move guard)');
    a.send('qa', { lv: 1 });
    await a.wait(() => a.p.lv === 1);
    await a.tp(0, 0, W.spawn.z);
    const sn0 = a.snaps;
    await a.run(0, W.spawn.z - 200, 80, 500);
    await sleep(200);
    ok(a.snaps > sn0, 'Level 1 (walk ' + maxWalk({ lv: 1 }) + '): running at 80 studs a second is sent back, whatever speed the screen says');
    a.send('qa', { lv: 30 });
    await a.wait(() => a.p.lv === 30);
    await a.tp(0, 0, W.spawn.z);
    const sn1 = a.snaps;
    await a.run(0, W.spawn.z - 200, 80);
    await sleep(200);
    ok(a.snaps === sn1, 'Level 30 (walk ' + maxWalk({ lv: 30 }).toFixed(1) + '): the same run is fine');
    ok(maxWalk({ lv: 20 }) > maxWalk({ lv: 10 }) + 20 && Math.abs(maxWalk({ lv: 20 }) - 57.8) < 0.01, 'a Level is +2.2 walk speed (Level 20: ' + maxWalk({ lv: 20 }).toFixed(1) + ')');
    const sn2 = a.snaps;
    a.move(0, 0, a.z - 300);
    await sleep(150);
    ok(a.snaps > sn2, 'too far in one go: sent back');
    await sleep(250);
    a.move(0, 40, a.z);
    await sleep(150);
    ok(a.snaps > sn2 + 1, 'too high: sent back');

    console.log('--- the arches: passing one pays its Wins');
    a.send('qa', { lv: 12 });
    await a.wait(() => a.p.lv === 12);
    await a.tp(0, 0, wallZ(0) + 6);
    await a.run(0, wallZ(1) + 12, 30);
    a.send('pad', { k: 0 });
    await sleep(250);
    ok(a.got('padok') === 0, 'short of the arch: nothing');
    await a.run(0, wallZ(1) - 3, 30);
    a.send('pad', { k: 0 });
    await a.wait(() => a.got('padok'));
    const pk = a.last('padok');
    ok(pk && pk.k === 0 && pk.first && pk.wins === padWins(0, 0) * FIRST_PAD && a.p.wins >= pk.wins, 'through it: the first time each rebirth x' + FIRST_PAD + ' (' + (pk && pk.wins) + ' Wins)');
    ok(a.p.bests[0] === 1 && a.p.cleared === 1 && a.p.pads === 1, 'Stage 1 passed');
    a.send('pad', { k: 0 });
    await sleep(250);
    ok(a.got('padok') === 1, 'not again straight away (' + CFG.padCool + ' s)');
    a.send('pad', { k: 3 });
    await sleep(200);
    ok(a.got('padok') === 1, 'an arch you haven\'t reached: nothing');
    await a.run(0, wallZ(2) - 3, 34);
    a.send('pad', { k: 1 });
    await a.wait(() => a.got('padok') === 2);
    ok(a.got('padok') === 2 && a.last('padok').k === 1 && a.p.bests[0] === 2, 'run on through Stage 2: its arch pays too');
    // straight to the far side of a gate, never in its stage this life
    await a.tp(0, 0, wallZ(5) - 4);
    a.send('pad', { k: 4 });
    await sleep(250);
    ok(a.got('padok') === 2, 'past an arch without having come through its stage: nothing');

    console.log('--- dying and reviving');
    const c = await new Bot('carol').join();
    c.send('qa', { lv: 12 });
    await c.wait(() => c.p.lv === 12);
    await c.tp(0, 0, wallZ(0) + 4);
    await c.run(0, wallZ(1) - 8, 30);
    c.send('fell', { k: 9, why: 'laser' });
    await c.wait(() => c.got('died'));
    const d1 = c.last('died');
    ok(d1 && d1.k === 1 && d1.why === 'laser', 'a death further on than you\'ve been is counted where you were (stage ' + (d1 && d1.k + 1) + ')');
    ok(d1 && d1.free === true && d1.cost === 0 && d1.until > Date.now() + (CFG.reviveOffer - 2) * 1000, 'the first revive is FREE, on offer for ' + CFG.reviveOffer + ' s');
    await c.wait(() => c.p.deaths === 1);
    ok(Math.abs(c.me().z - W.spawn.z) < 0.5 && Math.abs(c.me().x - W.spawn.x) < 0.5 && c.p.deaths === 1, 'back at the spawn');
    // the screen's own moves from the spawn: fine (the guard starts afresh)
    const sn3 = c.snaps;
    c.x = W.spawn.x + 1.5; c.z = W.spawn.z;
    await c.run(W.spawn.x + 1.5, W.spawn.z - 6, 14);
    await sleep(150);
    ok(c.snaps === sn3, 'moving off from the spawn: no snap back');
    c.send('pad', { k: 0 });
    await sleep(200);
    ok(c.got('padok') === 0, 'at the spawn: no arch pays');
    c.send('revive');
    await c.wait(() => c.got('revived'));
    const rv = c.last('revived'), cp1 = checkpoint(1);
    ok(rv && rv.k === 1 && rv.z === cp1.z && rv.x === cp1.x && rv.free, 'revived into Stage 2, just inside its arch, free');
    c.x = cp1.x; c.z = cp1.z;
    const sn4 = c.snaps;
    await c.run(0, cp1.z - 20, 30);
    await sleep(150);
    ok(c.snaps === sn4, 'and on from there');
    c.send('revive');
    await sleep(250);
    ok(c.got('revived') === 1, 'no offer open: no revive');
    // a second death within the free revive's cool-down: it costs Gems
    c.send('fell', { k: 1, why: 'pit' });
    await c.wait(() => c.got('died') === 2);
    c.send('fell', { k: 1, why: 'pit' });
    await sleep(150);
    ok(c.got('died') === 2, 'one death at a time');
    ok(c.last('died').free === false && c.last('died').cost === CFG.reviveGems, 'the next within ' + CFG.reviveFreeSecs / 60 + ' minutes costs ' + CFG.reviveGems + ' Gems');
    c.send('revive');
    await c.wait(() => c.got('broke'));
    ok(c.got('broke') === 1 && c.got('revived') === 1, 'no Gems: no revive (broke)');
    const cg = c.p.gems;
    c.send('qa', { gems: 20 });
    await c.wait(() => c.p.gems === cg + 20);
    c.send('revive');
    await c.wait(() => c.got('revived') === 2);
    await c.wait(() => c.p.revives === 2);
    ok(c.got('revived') === 2 && c.p.gems === cg + 20 - CFG.reviveGems && c.p.revives === 2, 'with them: revived for ' + CFG.reviveGems + ' Gems');
    // dying in the Starport side of the first gate: Stage 1 at most; turning the offer down: you stay at the spawn
    await c.tp(0, 0, W.spawn.z);
    await sleep(400);
    c.send('fell', { k: 6 });
    await c.wait(() => c.got('died') === 3);
    ok(c.last('died').k === 0, 'never in a stage this life: the offer is Stage 1 at most');
    c.send('respawn');
    await c.wait(() => c.got('warped'));
    ok(c.last('warped').why === 'back' && Math.abs(c.last('warped').z - W.spawn.z) < 0.5, 'no thanks: you stay at the spawn');
    c.send('revive');
    await sleep(250);
    ok(c.got('revived') === 2, 'and the offer is gone');
    // the free revive comes round again
    c.send('qa', { reviveAt: Date.now() - 1000 });
    await sleep(100);
    await c.tp(0, 0, wallZ(0) + 4);
    await c.run(0, wallZ(1) + 20, 30);
    c.send('fell', { k: 0 });
    await c.wait(() => c.got('died') === 4);
    ok(c.last('died').free === true, 'every ' + CFG.reviveFreeSecs / 60 + ' minutes it\'s free again');
    // dead, the offer still open, no revive: run back up from the spawn through Stage 1's gate: it pays
    c.x = W.spawn.x; c.z = W.spawn.z;
    await c.run(0, wallZ(1) - 3, 34);
    c.send('pad', { k: 0 });
    await c.wait(() => c.got('padok'));
    ok(c.got('padok') === 1 && c.last('padok').k === 0 && c.last('padok').wins === padWins(0, 0) * FIRST_PAD && c.last('padok').n === c.last('padok').wins, 'died, ran back through Stage 1\'s arch without reviving: paid (' + (c.last('padok') && c.last('padok').wins) + ' Wins)');

    console.log('--- spending');
    a.send('shoe');
    await sleep(200);
    ok(a.p.shoe === 0, 'no footwear to buy');
    a.send('qa', { wins: 100000, gems: 2000 });
    await a.wait(() => a.p.wins >= 100000);
    ok(stepGain({ ...a.p, shoe: 6 }, false, 0) === stepGain({ ...a.p, shoe: 0 }, false, 0), 'a step\'s Speed doesn\'t look at footwear');
    for (const u of UPGRADES.slice(0, 3)) { a.send('upgrade', { id: u.id }); }
    await sleep(300);
    ok(UPGRADES.slice(0, 3).every((u) => a.p.ups[u.id] === 1), 'upgrades for Wins (' + UPGRADES.slice(0, 3).map((u) => u.name).join(', ') + ')');
    ok(maxWalk(a.p) > maxWalk({ lv: a.p.lv }) && xpGain(a.p) > xpGain({ lv: a.p.lv }), 'Turbo Switches walk faster, Scholar Keys learn faster');
    await sleep(200);
    const g0 = a.p.gems, wt = a.p.wins;
    a.send('trail', { i: 1 }); a.send('aura', { i: 1 });
    await sleep(300);
    ok(a.p.trail === 1 && a.p.aura === 1 && a.p.gems <= g0 - AURAS[1].gems + 10 && a.p.wins <= wt - TRAILS[1].wins + 10, 'a trail for Wins, an aura for Gems');
    const gp = POSTS.findIndex((x) => x.gems);
    a.send('post', { i: gp });
    await sleep(200);
    ok(a.p.posts[POSTS[gp].id] === 1, 'the ' + POSTS[gp].name + ' for Gems');
    a.send('hatch', { j: 0, n: 3 });
    await a.wait(() => a.got('hatched'));
    ok(a.last('hatched').got.length === 3 && a.p.hatched === 3 && a.p.team.length === 3, 'three Star Capsules: three pets, on the team by themselves');
    a.send('hatch', { j: 99 });
    await sleep(150);
    ok(a.p.hatched === 3, 'a Star Capsule that isn\'t there: nothing');

    console.log('--- rewards');
    a.send('daily');
    await a.wait(() => a.got('reward'));
    ok(a.p.daily.streak === 1, 'the daily reward, day 1');
    a.send('daily');
    await sleep(200);
    ok(a.p.daily.streak === 1, 'once a day');
    a.send('gift', { i: 0 });
    await sleep(200);
    ok(!a.p.gifts[0], 'a gift before its time: nothing');
    a.send('qa', { playSecs: GIFTS[0].min * 60 });
    await sleep(100);
    a.send('gift', { i: 0 });
    await a.wait(() => a.p.gifts && a.p.gifts[0]);
    ok(a.p.gifts[0], 'a gift at ' + GIFTS[0].min + ' minutes');
    const code = Object.keys(CODES)[0];
    a.send('code', { code: code.toLowerCase() });
    await a.wait(() => a.got('code'));
    ok(a.last('code').ok, 'the code ' + code + ' works');
    a.send('code', { code });
    await a.wait(() => a.got('code') === 2);
    ok(!a.last('code').ok, 'once');
    a.send('qa', { spins: 1 });
    await sleep(100);
    a.send('spin');
    await a.wait(() => a.got('spun'));
    ok(a.got('spun') === 1 && a.p.spinsUsed === 1, 'the wheel spins');
    ok(a.p.qi >= 2 && a.got('questdone') >= 2, 'quests pay as they\'re done (' + a.p.qi + ' done)');

    console.log('--- rebirth and the worlds');
    a.send('qa', { lv: rebirthLv(0) - 1 });
    await a.wait(() => a.p.lv === rebirthLv(0) - 1);
    a.send('rebirth');
    await sleep(200);
    ok(a.p.rebirths === 0, 'below Level ' + rebirthLv(0) + ': no rebirth');
    a.send('qa', { lv: rebirthLv(0), speed: 999 });
    await a.wait(() => a.p.lv === rebirthLv(0));
    const wr = a.p.wins, gr = a.p.gems;
    a.send('rebirth');
    await a.wait(() => a.got('reborn'));
    ok(a.p.rebirths === 1 && a.p.lv === 1 && a.p.speed === 0 && a.p.xp === 0 && a.p.wins === wr && a.p.gems === gr, 'rebirth at Level ' + rebirthLv(0) + ': back to Level 1 and 0 Speed, and it costs nothing');
    ok(a.last('reborn').next === rebirthLv(1), 'the next one wants Level ' + rebirthLv(1));
    ok(a.p.ups.soles === 1 && a.p.hatched === 3 && a.p.trail === 1, 'upgrades, pets, trails kept');
    ok(stepGain(a.p, false, 0) > stepGain({ ...a.p, rebirths: 0 }, false, 0) && xpGain(a.p) > xpGain({ ...a.p, rebirths: 0 }), 'every step x' + rebirthMult(1) + ' Speed and XP');
    a.send('qa', { lv: rebirthLv(1) - 1 });
    await a.wait(() => a.p.lv === rebirthLv(1) - 1);
    a.send('rebirth');
    await sleep(200);
    ok(a.p.rebirths === 1, 'the second wants Level ' + rebirthLv(1));
    a.send('world', { w: 1 });
    await sleep(200);
    ok(a.p.world === 0, 'the next world is shut until the last stage is passed');
    a.send('qa', { best: WALLS_N });
    await sleep(100);
    a.send('world', { w: 1 });
    await a.wait(() => a.got('warp'));
    await sleep(150);
    ok(a.p.world === 1 && a.me().world === 1, 'then it opens: ' + WORLDS[1].name);
    a.send('world', { w: 0 });
    await a.wait(() => a.got('warp') === 2);

    console.log('--- warps');
    await a.tp(0, 0, checkpoint(3).z - 4);
    await sleep(100);
    a.send('warp', { to: 'stage', k: 9 });
    await a.wait(() => a.last('warped') && a.last('warped').k === 3);
    ok(a.last('warped').z === checkpoint(3).z, 'TO STAGE goes no further than you\'ve been this rebirth (stage 4)');
    await sleep(800);
    a.send('warp', { to: 'post' });
    await a.wait(() => a.last('warped').z > 60);
    ok(Math.abs(a.last('warped').x - postSpot(POSTS.findIndex((x) => x.gems)).x) < 1, 'TO TREADMILLS goes to your best one');

    console.log('--- someone else');
    const b = await new Bot('bob').join();
    await sleep(200);
    let seesA = false;
    b.room.state.players.forEach((p) => { if (p.name === 'alice') seesA = true; });
    ok(seesA, 'a second player sees the first');

    console.log('--- Black Hole Rush: the queue, a late player, the race');
    a.send('qa', { lv: 5 });
    a.send('play', { map: 2 });
    await a.wait(() => a.last('mQueue'));
    ok(a.last('mQueue').found === 1 && a.last('mQueue').spots === CFG.matchSpots, 'the queue: 1 / ' + CFG.matchSpots + ' found');
    b.send('play');
    await b.wait(() => b.last('mQueue'));
    await a.wait(() => a.last('mQueue').found === 2);
    ok(a.last('mQueue').found === 2 && b.last('mQueue').found === 2, 'pressing PLAY about the same time: the same queue (2 found)');
    await a.wait(() => a.got('mStart'), 15000);
    await b.wait(() => b.got('mStart'), 3000);
    const ms = a.last('mStart'), plan = arenaPlan(ms.seed, ms.lv);
    ok(ms && b.got('mStart') && ms.id === b.last('mStart').id, 'one race for both');
    ok(ms.names.length === CFG.matchSpots, 'bots fill the empty places');
    // a late PLAY before the gun takes a bot's place
    c.send('play');
    await c.wait(() => c.got('mStart'), 3000);
    ok(c.got('mStart') && c.last('mStart').id === ms.id && a.got('mJoined') === 1, 'a late PLAY takes a bot\'s place on the line');
    // moving on the line before the gun
    const sa = startSpot(ms.spot);
    a.x = sa.x; a.z = sa.z;
    const sn5 = a.snaps;
    await a.run(sa.x, -20, 20);
    await sleep(200);
    ok(a.snaps > sn5, 'nobody runs before the gun');
    await a.wait(() => a.got('mGo'), 9000);
    ok(a.got('mGo') === 1, 'the gun');
    // carol leaves: a bot takes her place, under her name
    c.leave();
    await a.wait(() => a.got('mLeft'), 3000);
    ok(a.got('mLeft') === 1, 'carol left: everyone is told');
    // out of your lane
    a.x = sa.x; a.z = sa.z;
    const sn6 = a.snaps;
    a.move(sa.x + 30, 0, sa.z);
    await sleep(150);
    ok(a.snaps > sn6, 'out of your lane: sent back');
    // run the race: alice runs; bob stands still and the black hole takes him
    const t0r = Date.now();
    a.x = sa.x; a.z = sa.z;
    const fin = plan.finish;
    while (a.z > fin + 1 && Date.now() - t0r < 40000) { a.move(laneX(ms.spot), 0, Math.max(fin, a.z - 3.6)); await sleep(100); }
    a.send('mFinish');
    await a.wait(() => a.got('mDone'), 3000);
    ok(a.last('mDone') && a.last('mDone').spot === ms.spot, 'over the line: finished (' + ((Date.now() - t0r) / 1000).toFixed(1) + ' s)');
    await b.wait(() => (b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 20000);
    ok((b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 'standing still, the black hole takes you');
    const D = matchInfo(ms.lv);
    ok(surgeAt(D, 0) > 0 && surgeAt(D, 20) < surgeAt(D, 10), 'the black hole comes on faster and faster');
    await a.wait(() => a.got('mEnd'), 30000);
    const me_ = a.last('mEnd');
    ok(me_ && me_.place === 0, 'first out wins (' + (me_ && me_.placeName) + ')');
    ok(me_ && me_.prize.wins > 0 && me_.prize.gems > 0 && me_.prize.speed > 0, 'a prize: ' + (me_ && me_.prize.wins) + ' Wins, ' + (me_ && me_.prize.gems) + ' Gems, ' + (me_ && me_.prize.speed) + ' Speed and XP');
    // (the profile follows the result in its own message)
    await a.wait(() => a.p.matches === 1 && a.p.matchWins === 1, 1500);
    ok(a.p.matches === 1 && a.p.matchWins === 1, 'counted: 1 race, 1 win');
    const bE = await b.wait(() => b.last('mEnd'), 3000);
    ok(bE && bE.place > 0 && me_.rows.length === CFG.matchSpots, 'everyone placed, ' + me_.rows.length + ' rows');
    ok(me_.rows.some((r) => r.n === 'carol' && r.bot), 'carol\'s place was taken by a bot under her name');

    console.log('--- nonsense');
    for (const t of ['step', 'move', 'pad', 'warp', 'hatch', 'team', 'world', 'upgrade', 'code', 'mItem', 'mFell', 'revive', 'fell', 'respawn', 'candy', 'shoe', 'rebirth']) a.send(t, { n: 'x', x: 'NaN', k: {}, id: [1], w: 'a', code: 5, i: -1, why: 7 });
    a.send('move', { x: Infinity, y: 0, z: 0 });
    a.send('pad', { k: 1e9 }); a.send('fell', { k: -5 });
    await sleep(300);
    ok(a.me() && a.room.connection.isOpen, 'nonsense messages are ignored, the room carries on');

    console.log('--- saved');
    const wSaved = a.p.wins, rbSaved = a.p.rebirths, upSaved = a.p.ups.feet, hSaved = a.p.hatched;
    await a.leave();
    await sleep(400);
    const a2 = await new Bot('alice').join();
    ok(a2.p.wins === wSaved && a2.p.rebirths === rbSaved && a2.p.ups.feet === upSaved && a2.p.hatched === hSaved, 'rejoining: everything as it was' + (process.env.VERBOSE ? JSON.stringify([wSaved, a2.p.wins, rbSaved, a2.p.rebirths, upSaved, a2.p.ups, a2.p.hatched]) : ''));
    void QUESTS; void DAILY; void JAWBREAKERS; void upgradeCost; void SHOES;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack));
}
console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
process.exit(fail ? 1 : 0);

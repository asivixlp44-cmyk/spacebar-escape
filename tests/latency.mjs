// Far from the server: everything through a relay that adds 175 ms each way (a 350 ms round trip), two real browser players.
// Running: Speed never jumps back and no step is lost; a gate passed on your screen pays on the server; a death and a revive land you
// where the server puts you (no snap). The clock:
// corrected for the round trip. Others: smooth on the server's clock. Both PLAYs land in one race, each sees the other, nobody snapped back.
// Run: node tests/latency.mjs
import net from 'node:net';
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';

const ONE_WAY = Number(process.env.ONE_WAY) || 175;
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
// the relay: TEST_PORT (where the dev client looks) to the server on TEST_PORT + 1, every chunk held back ONE_WAY ms, in order
const relay = net.createServer((a) => {
    const b = net.connect(TEST_PORT + 1, '127.0.0.1');
    const pipe = (from, to) => { from.on('data', (d) => { setTimeout(() => { if (!to.destroyed) to.write(d); }, ONE_WAY); }); from.on('close', () => setTimeout(() => to.destroy(), ONE_WAY)); from.on('error', () => {}); };
    pipe(a, b); pipe(b, a);
}).listen(TEST_PORT);

await startServer(TEST_PORT + 1, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const A = await open(browser, 'http://localhost:5621/', { w: 960, h: 540, q: 'low', uid: 'latA' + Date.now() });
    const B = await open(browser, 'http://localhost:5621/', { w: 960, h: 540, q: 'low', uid: 'latB' + Date.now() });
    for (const p of [A, B]) await qa(p, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(5000);
    const rtt = await qa(A, () => window.__qa.net.rtt);
    check(rtt > ONE_WAY * 1.8 && rtt < ONE_WAY * 3, 'the round trip measured: ' + rtt + ' ms');
    const clk = await qa(A, async () => { const q = window.__qa, r = q.net.room; return q.net.now() - r.state.now; });
    check(Math.abs(clk) < rtt, 'the client\'s server clock against the last state it got: ' + Math.round(clk) + ' ms ahead (a one-way trip or so)');
    // sprinting on a treadmill with a long way to the server: Speed never goes backwards, and every step gets there
    await qa(A, () => { window.__qa.teleport(-20, 0, 75, Math.PI); });
    await sleep(900);
    const sp = await qa(A, async () => {
        const q = window.__qa, out = [], t0 = performance.now();
        q.P.holdDash = true;
        await new Promise((res) => { const f = () => { out.push(q.S.powerShown); if (performance.now() - t0 < 10000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        q.P.holdDash = false;
        let back = 0, worst = 0;
        for (let i = 1; i < out.length; i++) { const d = out[i] - out[i - 1]; if (d < -1e-6) { back++; worst = Math.min(worst, d); } }
        return { back, worst, last: out[out.length - 1] };
    });
    check(sp.last > 40, 'sprinting over a round trip that long: Speed ' + Math.floor(sp.last));
    check(sp.back === 0 || sp.worst > -sp.last * 0.05, 'Speed doesn\'t jump back: ' + sp.back + ' dips, worst ' + sp.worst.toFixed(2));
    // off the belt (it would keep running by itself), then everything sent has had its answer
    await qa(A, () => window.__qa.key('KeyS', true));
    await sleep(400);
    await qa(A, () => window.__qa.key('KeyS', false));
    await sleep(1800);
    const srv = await qa(A, () => { const q = window.__qa; return { shown: q.S.powerShown, server: q.S.speed, pend: q.S.pendXp }; });
    check(Math.abs(srv.shown - srv.server) < 1 && !srv.pend, 'every step got there: ' + Math.floor(srv.shown) + ' on screen, ' + Math.floor(srv.server) + ' on the server');
    // stage 1's end gate: straight through it, the server (a moment behind) pays it, no snap
    await qa(A, () => { window.__qa.give({ lv: 10 }); });
    await sleep(800);
    await qa(A, () => { const q = window.__qa; q.teleport(-12, 0, q.wallZ(1) + 16, Math.PI); });
    await sleep(800);
    const wA = (await qa(A, () => window.__qa.state())).wins;
    await qa(A, () => window.__qa.key('KeyW', true));
    await sleep(1500);
    await qa(A, () => window.__qa.key('KeyW', false));
    await sleep(1200);
    const g2 = await qa(A, () => ({ ...window.__qa.state(), arch: window.__qa.wallZ(1) }));
    check(g2.z < g2.arch - 6 && g2.snaps === 0, 'through the arch of stage 1: no snap (z ' + g2.z + ', the arch ' + g2.arch + ')');
    check(g2.wins > wA, 'the server saw it too and paid: +' + (g2.wins - wA) + ' Wins');
    // a laser: the spawn, the offer over the long round trip, the revive back into the stage, no snap
    await qa(A, () => window.__qa.die(1, 'laser'));
    const off = await A.waitForFunction(() => window.__qa.state().revive, { timeout: 6000 }).then(() => true, () => false);
    const d1 = await qa(A, () => window.__qa.state());
    check(off && d1.z > 60 && d1.shield, 'a laser: back at the spawn in a bubble, the revive offer up (z ' + Math.round(d1.z) + ')');
    await qa(A, () => window.__qa.actions.revive());
    const rv = await A.waitForFunction(() => window.__qa.state().revives >= 1 && window.__qa.state().stage === 1, { timeout: 6000 }).then(() => true, () => false);
    await sleep(1500);
    const r1 = await qa(A, () => window.__qa.state());
    check(rv && r1.stage === 1 && r1.snaps === 0, 'revived into Stage 2, no snap (z ' + Math.round(r1.z) + ', snaps ' + r1.snaps + ')');
    await qa(A, () => window.__qa.send('warp', { to: 'spawn' }));
    await sleep(1200);
    // others, smooth
    // (a bot on its feet, not standing on a treadmill: a few windows till one is seen moving; a bot that dies on the course and is
    // back at the spawn in one frame is a respawn, not a stutter)
    const smooth = await qa(B, async () => {
        const q = window.__qa, room = q.net.room;
        let res1 = null;
        for (let w = 0; w < 4; w++) {
            const ids = [...room.state.players.keys()].filter((k) => room.state.players.get(k).bot);
            if (!ids.length) return res1 || { none: true, players: room.state.players.size };
            const id = ids.find((k) => room.state.players.get(k).anim === 1) || ids[0];
            const r = q.remotes().get(id), out = []; let last2 = null; const t0 = performance.now();
            if (!r) { await new Promise((res) => setTimeout(res, 500)); continue; }
            await new Promise((res) => { let tl = performance.now(); const f = (n) => { const dt = (n - tl) / 1000; tl = n; if (r.x !== undefined) { if (last2) out.push({ d: Math.hypot(r.x - last2.x, r.z - last2.z), dt }); last2 = { x: r.x, z: r.z }; } if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
            const walk = out.filter((o) => o.d < 25), step = walk.map((o) => o.d).sort((a, b) => a - b), secs = walk.reduce((a, o) => a + o.dt, 0), dist = walk.reduce((a, o) => a + o.d, 0);
            const top = Math.max(30, room.state.players.get(id) ? room.state.players.get(id).spd * 1.2 : 30);
            const pop = Math.max(...walk.map((o) => o.d - top * o.dt)), longest = Math.max(...out.map((o) => o.dt));
            res1 = { frames: walk.length, speed: dist / secs, p99: step[Math.floor(step.length * 0.99)], max: step[step.length - 1], pop, longest, delay: r.track.delay, respawns: out.length - walk.length };
            if (res1.speed > 3) break;
        }
        return res1;
    });
    if (smooth && smooth.none) console.log('      (no bot in the room: ' + smooth.players + ' players)');
    check(smooth && !smooth.none && smooth.speed > 3 && smooth.pop < 1.5, 'a bot seen from far away moves smoothly: ' + (smooth && smooth.speed !== undefined ? smooth.speed.toFixed(1) + ' studs/s, a frame\'s step p99 ' + smooth.p99.toFixed(2) + ', most ' + smooth.max.toFixed(2) + ' (longest frame ' + Math.round(smooth.longest * 1000) + ' ms), drawn ' + Math.round(smooth.delay) + ' ms in the past' + (smooth.respawns ? ', ' + smooth.respawns + ' respawn' : '') : 'no bot'));
    // two PLAYs at about the same time: one queue, one race
    await qa(A, () => window.__qa.play({ map: 0, lv: 2 }));
    await sleep(600);
    const qb = await qa(B, () => { window.__qa.play({}); return true; });
    await sleep(1500);
    const found = await A.$eval('#qFound', (e) => e.textContent);
    check(qb && /2 \/ 6/.test(found), 'both PLAYs in one queue: ' + found);
    await A.waitForFunction(() => window.__qa.state().match, { timeout: 25000 });
    await B.waitForFunction(() => window.__qa.state().match, { timeout: 25000 });
    const mA = await qa(A, () => window.__qa.match().id), mB = await qa(B, () => window.__qa.match().id);
    check(mA === mB, 'one race for both');
    await A.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 15000 });
    await qa(A, () => window.__qa.auto(true));
    await qa(B, () => window.__qa.auto(true));
    await sleep(6000);
    const seen = await qa(B, () => { const q = window.__qa, room = q.net.room; let other = null; room.state.players.forEach((p, id) => { if (id !== room.sessionId && !p.bot) other = id; }); if (!other) return null; const r = q.remotes().get(other); return { here: r && r.here, z: r && r.z, serverZ: room.state.players.get(other).z }; });
    check(seen && seen.here && Math.abs(seen.z - seen.serverZ) < 30, 'each sees the other in the race: ' + JSON.stringify(seen));
    const sa = await qa(A, () => window.__qa.state()), sb = await qa(B, () => window.__qa.state());
    check(sa.z < -60 && sb.z < -60, 'both running up their lanes: ' + Math.round(-sa.z) + ' and ' + Math.round(-sb.z) + ' studs');
    const inB = sb.match && sb.match.scores.find((r) => r[0] === sa.match.spot);
    check(inB && (Math.abs(inB[1] - sa.z) < 45 || inB[2] >= 0), 'one\'s run shows on the other\'s board: ' + (inB && inB[1]) + ' against ' + sa.z);
    const sF = await qa(A, () => window.__qa.state()), sG = await qa(B, () => window.__qa.state());
    check(sF.snaps === 0 && sG.snaps === 0, 'nobody snapped back: ' + sF.snaps + ', ' + sG.snaps);
    const errs = [...A.errors, ...B.errors, ...(await qa(A, () => window.__qa.errors())), ...(await qa(B, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); relay.close(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);

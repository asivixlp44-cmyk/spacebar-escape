// Every stage of every world, passable: the autopilot starts at a stage's start (its checkpoint, just inside its gate) at the stage's
// Recommended Level (that Level's walk speed, no upgrades) and has to pass the stage's end gate, paid by the server. A laser or a rift
// sends it back to the spawn; it takes the revive offer back into the stage (its Level put back to the Recommended one) and goes again.
// The deaths it took on each stage are printed: they say which stages are too hard. Run: node tests/passable.mjs [world]
// (ONLY=k,k to pick stages, counted from 0; TRIES=n deaths before a stage counts as not passed, default 10)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
import { WORLDS, WALLS_N, QUESTS, recLevel, maxWalk } from '../shared/config.js';
import { stageType, jumpDist, TILE } from '../shared/stages.js';
import { stagePlan } from '../shared/world.js';
const worlds = process.argv[2] !== undefined ? [+process.argv[2]] : [0, 1, 2, 3];
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const TRIES = +(process.env.TRIES || 10), SECS = 150;
// the layout on its own (no runner): over each rift, the widest jump on the best way across (shore, keycaps, crumbling keys, shore),
// against how far a jump goes at the Recommended Level's walking speed. (Spring keys throw you: not counted.)
function widestJump(plan) {
    let worst = 0;
    const tiles = plan.list.filter((o) => o.kind === 'crumble').flatMap((o) => o.tiles || []).map((t) => ({ x: t.x, z: t.z, sx: TILE.s, sz: TILE.s }));
    for (const L of plan.lakes) {
        const R = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
        const nodes = [R(-99, 99, L.z1, L.z1 + 99), R(-99, 99, L.z0 - 99, L.z0)];
        for (const p of [...plan.plats.filter((q) => q.kind !== 'tramp'), ...tiles]) if (p.z + p.sz / 2 > L.z0 && p.z - p.sz / 2 < L.z1) nodes.push(R(p.x - p.sx / 2, p.x + p.sx / 2, p.z - p.sz / 2, p.z + p.sz / 2));
        const gap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
        const best = nodes.map((_, i) => (i ? Infinity : 0)), done = new Set();
        for (;;) {
            let i = -1;
            for (let j = 0; j < nodes.length; j++) if (!done.has(j) && (i < 0 || best[j] < best[i])) i = j;
            if (i < 0 || best[i] === Infinity) break;
            done.add(i);
            for (let j = 0; j < nodes.length; j++) if (!done.has(j)) best[j] = Math.min(best[j], Math.max(best[i], gap(nodes[i], nodes[j])));
        }
        worst = Math.max(worst, best[1]);
    }
    return worst;
}
console.log('the layout: the widest jump over a pit on the best way across / a jump at the Recommended Level\'s walk (% of it)');
for (const w of worlds) {
    const cells = [];
    for (let k = 0; k < WALLS_N; k++) {
        const p = stagePlan(w, k);
        if (!p.lakes.length || p.type === 'bounce') continue;
        const g = widestJump(p), r = jumpDist(maxWalk({ lv: recLevel(w, k) }));
        cells.push((k + 1) + ' ' + p.type + ' ' + g.toFixed(0) + '/' + r.toFixed(0) + ' (' + Math.round(g / r * 100) + '%)' + (g > r ? ' TOO WIDE' : ''));
    }
    console.log('  ' + WORLDS[w].name + ': ' + cells.join(', '));
}
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5621/', { w: 960, h: 540, q: 'low', uid: 'pass' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
let fails = 0;
const table = [];
await sleep(800);
await ev((qn) => { const q = window.__qa; q.close(); q.noWatch(true); q.give({ openWorlds: true, qi: qn }); }, QUESTS.length);
for (const w of worlds) {
    await ev((ww) => { const q = window.__qa; q.auto(false); q.close(); q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    const row = [];
    for (let k = 0; k < WALLS_N; k++) {
        if (only && !only.includes(k)) continue;
        // the Recommended Level; rebirths enough that the autopilot never rebirths at the spawn (that would start it at Level 1)
        const lv = recLevel(w, k), reb = Math.max(0, Math.ceil((lv + 8 - 10) / 5)), type = stageType(w, k);
        const set = { lv, rebirths: reb, best: k, gems: 1e5, reviveAt: 0, ups: { feet: 0, reach: 0, spring: 0 } };
        await ev((s) => { const q = window.__qa; q.auto(false); q.close(); q.give(s); }, set);
        await sleep(500);
        await ev((kk) => { const q = window.__qa, cp = q.checkpoint(kk); q.teleport(cp.x, 0, cp.z, Math.PI); q.look(0, 0.2, 22); }, k);
        await sleep(700);
        const s0 = await ev(() => window.__qa.state());
        const t0 = Date.now();
        await ev(() => window.__qa.auto(true));
        let ok = false, paid = false, deaths = 0, lastDeaths = s0.deaths, revives0 = s0.revives, why = '', top = 0;
        while (Date.now() - t0 < SECS * 1000) {
            await sleep(300);
            // (a panel or a question would stop the autopilot's feet: it says no thanks)
            const s = await ev(() => { const q = window.__qa; q.close(); return q.state(); });
            top = Math.max(top, s.walk);
            if (s.deaths > lastDeaths) {
                deaths += s.deaths - lastDeaths; lastDeaths = s.deaths;
                // back to the Recommended Level for the next go (the steps of the last one levelled it up a little)
                await ev((st) => window.__qa.give({ lv: st.lv, reviveAt: 0 }), set);
                if (deaths > TRIES) { why = 'more than ' + TRIES + ' deaths'; break; }
            }
            if (!s.dead && s.stage > k && s.stage <= k + 2 && !s.match) { ok = true; paid = s.wins > s0.wins; break; }
        }
        // (the server's word on it: a moment behind)
        if (ok && !paid) for (let i = 0; i < 10 && !paid; i++) { await sleep(200); paid = (await ev(() => window.__qa.state().wins)) > s0.wins; }
        const revives = (await ev(() => window.__qa.state().revives)) - revives0;
        await ev(() => window.__qa.auto(false));
        if (!ok && !why) why = 'not through in ' + SECS + ' s';
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const good = ok && paid;
        console.log((good ? '  ok  ' : 'FAIL  ') + WORLDS[w].name + ' stage ' + (k + 1) + ' ' + type + ' (Level ' + lv + ', walk ' + maxWalk({ lv }).toFixed(1) + '): ' + (ok ? 'through in ' + secs + ' s' + (paid ? '' : ' but the server never paid') : why) + ', ' + deaths + ' death' + (deaths === 1 ? '' : 's') + (revives ? ', ' + revives + ' revive' + (revives === 1 ? '' : 's') : '') + (top > maxWalk({ lv }) + 0.5 ? ' (up to ' + top + ' studs/s)' : ''));
        row.push({ k, type, deaths, ok: good });
        if (!good) { fails++; await shot(page, 'pass-w' + w + '-k' + k + '-' + type); }
        // (the next stage's start: no revive offer left over from this one)
        await ev(() => { const q = window.__qa; if (q.state().revive) q.ui.reviveHide(); });
    }
    table.push({ w, row });
}
console.log('\ndeaths per stage (x: not passed)');
for (const { w, row } of table) console.log('  ' + WORLDS[w].name.padEnd(16) + row.map((r) => (r.ok ? String(r.deaths) : 'x' + r.deaths).padStart(4)).join(''));
const all = table.flatMap((t) => t.row.map((r) => ({ ...r, w: t.w }))).sort((a, b) => b.deaths - a.deaths).slice(0, 6).filter((r) => r.deaths > 0);
if (all.length) console.log('hardest: ' + all.map((r) => WORLDS[r.w].name + ' ' + (r.k + 1) + ' ' + r.type + ' ' + r.deaths).join(', '));
console.log('errors', page.errors);
console.log(fails ? fails + ' stages not passed' : 'every stage passed');
await b.close(); stopAll();
process.exit(fails ? 1 : 0);

// Browser runs with the autopilot, on the dev client (it has the QA hooks): the whole loop of the remake (every step +1 Speed and XP,
// up the Keyway through the gates for Wins, a laser or a rift sends you back to the spawn in a bubble, the revive offer back to the
// stage, a treadmill, your Custom Speed) and full races on a few maps, then a run in each other world. Prints what happened; screenshots
// go to OUT_DIR. Run: node tests/autopilot.mjs [quick]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, OUT, TEST_PORT } from './lib.mjs';

const quick = process.argv[2] === 'quick';
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const st = (page) => qa(page, () => window.__qa.state());
async function until(page, fn, secs, arg) {
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
        const v = await page.evaluate(fn, arg);
        if (v) return v;
        // (a pop-up offering the daily reward would stop the pilot's feet: it says no thanks)
        await page.evaluate(() => window.__qa.close());
        await sleep(250);
    }
    return null;
}

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { w: 1280, h: 720, q: 'medium', uid: 'pilot' + Date.now() });
    console.log('load', page.loadSecs, 's;', await qa(page, () => window.__qa.gpu()));
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    // ----- one press, one jump -----
    {
        await sleep(1000);
        await qa(page, () => window.__qa.close());
        const jumps = async () => page.evaluate(async () => {
            let n = 0, was = window.__qa.state().onGround, t0 = performance.now();
            while (performance.now() - t0 < 3000) {
                const g = window.__qa.state().onGround;
                if (was && !g) n++;
                was = g;
                await new Promise((r) => requestAnimationFrame(r));
            }
            return n;
        });
        const run = jumps();
        await page.keyboard.press('Space');
        const one = await run;
        check(one === 1, 'one press of SPACE, one jump: ' + one + ' in 3 s');
        const run2 = jumps();
        await page.keyboard.down('Space'); await sleep(1500); await page.keyboard.up('Space');
        const held = await run2;
        check(held >= 2 && held <= 6, 'holding it keeps jumping, and it stops when let go: ' + held + ' in 3 s (held 1.5 s)');
    }
    // ----- the HUD's numbers -----
    {
        const h = await page.evaluate(() => ({ speed: document.querySelector('#powerLine').textContent, lv: document.querySelector('#lvTxt').textContent, xp: document.querySelector('#lvNum').textContent, max: document.querySelector('#csMax').textContent, x20: document.querySelector('#x20Badge').textContent, reb: document.querySelector('#rebPct').textContent }));
        check(/SPEED$/.test(h.speed) && /^LEVEL \d+$/.test(h.lv) && / XP$/.test(h.xp) && /^WALK · MAX \d+$/.test(h.max) && /^\+[\d.]+ \/ STEP$/.test(h.x20) && /%$/.test(h.reb), 'the HUD: "' + h.speed + '", "' + h.lv + '", "' + h.xp + '", "' + h.max + '", "' + h.x20 + '", rebirth ' + h.reb);
    }
    // ----- the loop -----
    console.log('\n--- the loop on the autopilot: steps, up the Keyway, through the gates');
    await qa(page, () => window.__qa.auto(true));
    const t0 = Date.now();
    const secs = () => Math.round((Date.now() - t0) / 1000);
    const s0 = await st(page);
    const tr = await until(page, (n) => window.__qa.state().steps >= n + 10 && window.__qa.state(), 40, s0.steps || 0);
    check(!!tr && tr.speed - s0.speed >= 10 * 0.95, 'stepping: ' + (tr && tr.steps) + ' steps after ' + secs() + ' s, Speed ' + (tr && Math.floor(tr.speed)) + ' (about +1 a step)');
    const in1 = await until(page, () => window.__qa.state().stage >= 0 && window.__qa.state(), 60);
    check(!!in1, 'into the Keyway after ' + secs() + ' s at ' + (in1 && in1.v) + ' studs/s (top ' + (in1 && in1.maxWalk) + ')');
    await sleep(2500);
    await shot(page, 'pilot-run');
    const w0 = (await st(page)).wins;
    const arch = await until(page, (w) => window.__qa.state().wins > w && window.__qa.state(), 90, w0);
    check(!!arch, 'through a gate: ' + (arch && arch.wins - w0) + ' Wins after ' + secs() + ' s (best stage ' + JSON.stringify(arch && arch.bests) + ')');
    await shot(page, 'pilot-arch');
    // ----- dying: a laser or a rift, the spawn in a bubble, the revive offer, back to the stage -----
    console.log('\n--- a death and a revive');
    let dead = await until(page, () => window.__qa.state().deaths >= 1 && window.__qa.state(), quick ? 30 : 60);
    if (!dead) {
        // (the autopilot ran clean: into the nearest rift, then)
        console.log('      (no death on its own: stepping into a pit)');
        await qa(page, () => {
            const q = window.__qa;
            // a point in a stage's lake with no keycap stone over it
            for (let k = 0; k < 15; k++) {
                const pl = q.stagePlan(k), l = pl.lakes && pl.lakes[0];
                if (!l) continue;
                for (let z = l.z1 - 3; z > l.z0 + 3; z -= 2) for (const x of [-13, 13, -7, 7, 0]) {
                    if (pl.plats.some((p) => Math.abs(x - p.x) < p.sx / 2 + 2 && Math.abs(z - p.z) < p.sz / 2 + 2)) continue;
                    q.teleport(x, 0, z, Math.PI); return;
                }
            }
        });
        dead = await until(page, () => window.__qa.state().deaths >= 1 && window.__qa.state(), 10);
    }
    check(!!dead, 'died (a laser or a rift) after ' + secs() + ' s');
    const sh = await until(page, () => { const s = window.__qa.state(); return s.shield && s.z > 60 && s; }, 3);
    check(!!sh, 'back at the spawn in a bubble: z ' + (sh && Math.round(sh.z)));
    await shot(page, 'pilot-dead');
    const offer = await until(page, () => window.__qa.state().revive || window.__qa.state().revives > 0, 6);
    check(!!offer, 'the revive offer came up');
    const rv = await until(page, () => { const s = window.__qa.state(); return s.revives >= 1 && s.stage >= 0 && s; }, 12);
    check(!!rv, 'revived into Stage ' + (rv && rv.stage + 1) + ' (' + (rv && rv.revives) + ' revive' + (rv && rv.revives > 1 ? 's' : '') + ', ' + (rv && rv.deaths) + ' deaths)');
    await shot(page, 'pilot-revived');
    // ----- the Treadmill button: there, onto the belt, training -----
    console.log('\n--- a treadmill, your Custom Speed');
    await qa(page, () => { window.__qa.auto(false); window.__qa.close(); window.__qa.actions.toTread(); });
    const tm = await until(page, () => window.__qa.state().tread >= 0 && window.__qa.state(), 12);
    check(!!tm, 'the Treadmill button: on a belt (' + (tm && tm.tread) + ')');
    if (tm) {
        const a = (await st(page)).steps;
        await sleep(2500);
        const b = (await st(page)).steps;
        check(b - a >= 6, 'training on it: ' + (b - a) + ' steps in 2.5 s');
        await shot(page, 'pilot-tread');
    }
    // the Custom Speed box: typed into (the runner stays put), slower than the top, then back to the top
    {
        await qa(page, () => window.__qa.teleport(0, 0, 92, Math.PI));
        await sleep(400);
        // (the daily reward offers itself a moment after a gate pays, once you're back on the Starport: shut it if it just did)
        await qa(page, () => window.__qa.close());
        await sleep(150);
        const z0 = (await st(page)).z;
        await page.click('#csIn', { clickCount: 3 });
        await page.keyboard.type('10');
        await page.keyboard.down('KeyD'); await sleep(300); await page.keyboard.up('KeyD');
        await page.keyboard.press('Enter');
        await sleep(200);
        const s1 = await st(page);
        await shot(page, 'pilot-walkbox');
        check(s1.walk === 10 && Math.abs(s1.z - z0) < 0.3,'Custom Speed 10: walking ' + s1.walk + ' (top ' + s1.maxWalk + '), typing didn\'t move the runner');
        await qa(page, () => window.__qa.key('KeyW', true));
        await sleep(700);
        const v = (await st(page)).v;
        await qa(page, () => window.__qa.key('KeyW', false));
        check(v <= 10.5 && v >= 8, 'and it walks at it: ' + v + ' studs/s');
        await page.click('#csIn', { clickCount: 3 });
        await page.keyboard.type('999');
        await page.keyboard.press('Enter');
        await sleep(200);
        const s2 = await st(page);
        check(s2.cs === 0 && s2.walk === s2.maxWalk, '999 is your top speed: ' + s2.walk);
    }
    if (!quick) {
        // further up the run on the autopilot (dying, reviving, more gates)
        await qa(page, () => window.__qa.auto(true));
        const b2 = await until(page, () => (window.__qa.state().bests[0] || 0) >= 3 && window.__qa.state(), 240);
        check(!!b2, 'Stage 3 passed after ' + secs() + ' s, Level ' + (b2 && b2.lv) + ', ' + (b2 && b2.wins) + ' Wins, ' + (b2 && b2.deaths) + ' deaths, ' + (b2 && b2.revives) + ' revives');
        await shot(page, 'pilot-stage3');
    }
    const s1 = await st(page);
    check(s1.snaps === 0, 'no snaps on the run: ' + s1.snaps);
    // ----- every map: a full race at a few Levels -----
    for (const [w, lv] of (quick ? [[0, 2]] : [[0, 2], [1, 9], [2, 20], [3, 40]])) {
        console.log('\n--- map ' + w + ', Level ' + lv + ': a full race');
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
        await until(page, () => !window.__qa.state().dead, 10);
        await qa(page, (a) => window.__qa.play({ map: a.w, lv: a.lv, now: true }), { w, lv });
        const inM = await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'wait' && m; }, 20);
        check(!!inM && inM.w === w, 'into the race: map ' + (inM && inM.w) + ', ' + (inM && inM.n) + ' stretches, ' + (inM && inM.secs) + ' s');
        await sleep(1200);
        await shot(page, 'race' + w + '-line');
        await qa(page, () => window.__qa.auto(true));
        const go = await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'play' && m; }, 12);
        check(!!go, 'the gun');
        await sleep(5000);
        await qa(page, () => window.__qa.close());
        await shot(page, 'race' + w + '-mid');
        const mid = await st(page);
        check(mid.match && mid.z < -60, 'running: ' + (mid.match && Math.round(-mid.z)) + ' studs, scores ' + JSON.stringify(mid.match && mid.match.scores));
        const fin = await until(page, () => { const m = window.__qa.state().match; return (!m || m.done || m.out) && (m || window.__qa.state()); }, 120);
        check(!!fin && !fin.out, 'the autopilot gets to the portal' + (fin && fin.out ? ' (the black hole got it)' : ''));
        await shot(page, 'race' + w + '-fin');
        const end = await until(page, (n) => !window.__qa.state().match && window.__qa.S.matches > n && window.__qa.state(), 170, mid.matches);
        const s2 = await st(page);
        check(!!end, 'the race ends and pays: ' + s2.matches + ' raced, ' + s2.wins + ' Wins, snaps ' + s2.snaps);
        await sleep(1400);
        await shot(page, 'race' + w + '-end');
        const rows = await page.$$eval('#modal .row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
        console.log('      result: ' + rows.join(' | '));
        await qa(page, () => window.__qa.close());
        await qa(page, () => window.__qa.auto(false));
        await sleep(600);
    }
    // ----- each world: a run up its first stages -----
    if (!quick) {
        await qa(page, () => window.__qa.give({ openWorlds: true, rebirths: 12, lv: 40 }));
        for (const w of [1, 2, 3]) {
            console.log('\n--- World ' + w);
            // (every sector open again: the run before reset this one's best stage)
            await qa(page, () => window.__qa.give({ openWorlds: true }));
            await sleep(400);
            await qa(page, (ww) => { window.__qa.auto(false); window.__qa.close(); window.__qa.send('world', { w: ww }); }, w);
            await until(page, (ww) => window.__qa.state().world === ww, 15, w);
            await sleep(1800);
            await qa(page, () => { window.__qa.look(0, 0.2, 22); });
            await shot(page, 'world' + w + '-a');
            await qa(page, () => window.__qa.give({ best: 0 }));
            await sleep(400);
            await qa(page, () => window.__qa.auto(true));
            const wn = (await st(page)).wins;
            const s = await until(page, (ww) => { const z = window.__qa.state(); return z.world === ww && (z.bests[ww] || 0) >= 1 && z; }, 70, w);
            check(!!s, 'World ' + w + ': through a gate on the run (+' + (s && s.wins - wn) + ' Wins, best ' + JSON.stringify(s && s.bests) + ')');
            await shot(page, 'world' + w + '-b');
        }
        await qa(page, () => { window.__qa.auto(false); window.__qa.send('world', { w: 0 }); });
        await until(page, () => window.__qa.state().world === 0, 15);
        await sleep(1500);
    }
    const e1 = await qa(page, () => window.__qa.errors());
    const sf = await st(page);
    check(sf.snaps <= 1, 'no snaps all the way: ' + sf.snaps);
    check(page.errors.length === 0 && e1.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 5)) + JSON.stringify(e1.slice(0, 5)));
    console.log('\nfinal', JSON.stringify(sf));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good', '; shots in', OUT);
process.exit(fails ? 1 : 0);

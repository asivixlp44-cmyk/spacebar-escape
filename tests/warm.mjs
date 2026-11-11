// Is everything really warmed up behind the loading screen? Counts the shaders right after loading, then does everything a player can do
// (a treadmill, the Keyway, a gate passed, a laser and a rift, the spawn's bubble, the revive offer, a revive, a dash, every kind of
// stage, shopping, a trail, an aura, a chest, a race, every world) and lists any shader compiled in play.
// Run: node tests/warm.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const programs = (page) => page.evaluate(() => window.__qa.renderer().info.programs.map((p) => p.cacheKey));
try {
    for (const q of ['medium', 'low']) {
        console.log('--- ' + q);
        const page = await open(browser, 'http://localhost:5621/', { w: 1280, h: 720, q, uid: 'warm' + q + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(1200);
        const before = new Set(await programs(page));
        console.log('  after loading: ' + before.size + ' shaders');
        // a race and a new world are built behind a fade: what compiles there can't be seen. Anything else in the list is a hitch in play
        // (keep: the revive offer stays up, for the step that takes it)
        const step = async (name, fn, wait, behindFade, arg, keep) => {
            await qa(page, fn, arg);
            await sleep(wait || 700);
            if (!keep) await qa(page, () => window.__qa.close());
            const now = await programs(page), fresh = now.filter((p) => !before.has(p));
            if (fresh.length) { console.log('  ' + (behindFade ? 'behind the fade, ' : 'IN PLAY, ') + name + ': ' + fresh.length + ' compiled'); for (const p of fresh) before.add(p); if (!behindFade) fails += fresh.length; } else console.log('  ' + name + ': nothing new');
        };
        await step('a treadmill', () => { const q2 = window.__qa; q2.teleport(-20, 0, 75, Math.PI); });
        await step('sprinting', () => { window.__qa.P.holdDash = true; }, 2200);
        await step('into the Keyway', () => { const q2 = window.__qa; q2.P.holdDash = false; q2.teleport(0, 0, 20, Math.PI); q2.key('KeyW', true); }, 1500);
        // the end gate of stage 1 (its trophy, "+N Wins", the coins flying to the counter)
        const w0 = await qa(page, () => window.__qa.state().wins);
        await step('through a gate', () => { const q2 = window.__qa; q2.teleport(-12, 0, q2.wallZ(1) + 6, Math.PI); q2.key('KeyW', true); }, 1600);
        check((await qa(page, () => window.__qa.state().wins)) > w0, 'the arch paid');
        await step('a dash and a jump', () => { const q2 = window.__qa; q2.dash(); q2.jump(); }, 1500);
        // a laser: the flash, back at the spawn in a bubble, the revive offer up
        await step('a laser', () => { const q2 = window.__qa; q2.key('KeyW', false); q2.die(2, 'laser'); }, 1400, false, undefined, true);
        check(await qa(page, () => window.__qa.state().revive), 'the revive offer is up');
        await step('the revive', () => { window.__qa.actions.revive(); }, 1800);
        check((await qa(page, () => window.__qa.state().revives)) >= 1, 'revived');
        // a rift: into the rift of stage 2, off its bridges (once the revive's bubble has gone)
        await step('a pit', () => { const q2 = window.__qa, l = q2.stagePlan(1).lakes[0]; q2.teleport(-16, 0, l.z1 - 4, Math.PI); }, 4200);
        check((await qa(page, () => window.__qa.state().deaths)) >= 2, 'the pit killed');
        await step('far up the Keyway', () => { const q2 = window.__qa; q2.give({ lv: 40 }); q2.teleport(0, 0, q2.checkpoint(12).z, Math.PI); q2.key('KeyW', true); }, 2500);
        // every kind of stage: its lasers (sweeping, sliding), floating keys, crumbling keys, spring keys, bridges, rifts
        for (let k = 1; k < 15; k++) {
            const kind = await qa(page, (kk) => window.__qa.stageType(kk), k);
            await step('stage ' + (k + 1) + ' (' + kind + ')', (kk) => { const q2 = window.__qa; q2.key('KeyW', true); q2.teleport(0, 0, q2.checkpoint(kk).z - 2, Math.PI); }, 900, false, k);
        }
        await step('shopping', () => { const q2 = window.__qa; q2.key('KeyW', false); q2.give({ wins: 5e8, gems: 2000 }); q2.send('hatch', { j: 0, n: 3 }); q2.send('upgrade', { id: 'soles' }); }, 2600);
        await step('a rainbow', () => { const q2 = window.__qa; q2.send('trail', { i: 8 }); q2.send('aura', { i: 5 }); q2.give({ allPals: true }); q2.send('warp', { to: 'spawn' }); }, 2500);
        await step('a race', () => window.__qa.play({ map: 2, lv: 30, now: true }), 2500, true);
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 15000 });
        await step('racing', () => window.__qa.auto(true), 9000);
        await page.waitForFunction(() => !window.__qa.state().match, { timeout: 170000 });
        await step('the results', () => window.__qa.auto(false));
        await step('another world', () => { const q2 = window.__qa; q2.give({ openWorlds: true }); q2.send('world', { w: 3 }); }, 3000, true);
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 3)));
        await page.close();
    }
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' new shaders or problems' : 'nothing compiled in play');
process.exit(fails ? 1 : 0);

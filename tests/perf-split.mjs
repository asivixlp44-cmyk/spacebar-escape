// QA helper: what running the Keyway costs on the weak laptop, piece by piece. The autopilot runs the same stretch with one thing at a time
// switched off (the floating numbers, the footstep sounds, the pets, the monsters, the sky...) and the frame rate is measured each time.
// Run: LOW_GPU=1 node tests/perf-split.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { w: 1366, h: 768, q: 'low', cpu: 4, uid: 'split' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ wins: 2000, shoe: 5, lv: 9, best: 8, allPals: true, speed: 60000 }); });
    await sleep(+(process.env.WAIT || 2500));
    const cases = [
        ['everything on', () => {}],
        ['no floating numbers', () => { window.__noFloat = true; }],
        ['no step sounds either', () => { window.__noStepSound = true; }],
        ['no pets either', () => { window.__qa.give({ allPals: false }); window.__qa.S.team = []; }],
        ['no Shade either', () => { window.__qa.give({ noShade: true }); }],
    ];
    for (const [name, fn] of cases) {
        await qa(page, fn);
        await qa(page, () => { const q = window.__qa; q.auto(false); q.close(); if (q.P.down) q.actions.giveUp(); q.teleport(0, 0, q.checkpoint(3).z, Math.PI); });
        await sleep(600);
        await qa(page, () => window.__qa.auto(true));
        await sleep(1500);
        const m = await measure(page, 5);
        console.log(name.padEnd(26), m.fps + ' FPS, p50 ' + m.p50 + ' p95 ' + m.p95 + ', work ' + m.avgMs + ' ms, ' + m.calls + ' calls, ' + Math.round(m.tris / 1000) + 'k tris', JSON.stringify(await qa(page, () => window.__qa.sections())));
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

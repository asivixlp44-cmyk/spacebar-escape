// QA helper: the first seconds of a run on the weak laptop (CPU 4x, 1366x768, Low), when a fresh page sets off up the Keyway from
// the spawn on the autopilot: the frame's sections and a CPU profile of that window, then the same again once it has settled.
// Run: LOW_GPU=1 node tests/perf-early.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { w: 1366, h: 768, q: 'low', cpu: 4, uid: 'early' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ wins: 2000, shoe: 5, lv: 9, best: 8, allPals: true, speed: 60000 }); });
    await sleep(+(process.env.PREWAIT || 1500));
    await qa(page, (nf) => { if (nf) window.__noFloat = true; window.__qa.close(); window.__qa.perf(true); window.__qa.auto(true); }, !!process.env.NOFLOAT);
    const c = await page.createCDPSession();
    await c.send('Profiler.enable');
    await c.send('Profiler.setSamplingInterval', { interval: 250 });
    for (const [name, wait] of [['early (1.5 s in)', 1500], ['settled (25 s in)', 20000]]) {
        await sleep(wait);
        await c.send('Profiler.start');
        const m = await measure(page, 6);
        const { profile } = await c.send('Profiler.stop');
        const self = new Map(), total = profile.samples.length, byId = new Map(profile.nodes.map((n) => [n.id, n]));
        for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
        console.log('== ' + name + ': ' + m.fps + ' FPS, p95 ' + m.p95 + ', work ' + m.avgMs + ' ms, ' + m.over50 + ' over 50 ms', JSON.stringify(await qa(page, () => window.__qa.sections())), JSON.stringify(await qa(page, () => { const s = window.__qa.state(); return { z: Math.round(s.z), lv: s.lv, stage: s.stage }; })));
        for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

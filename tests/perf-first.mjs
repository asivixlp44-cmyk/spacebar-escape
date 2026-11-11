// QA helper: a brand-new player's first minute on a weak device: no QA gifts, the autopilot from the spawn (it trains, then runs the
// Keyway), the frame rate in 5-second windows. Run: LOW_GPU=1 node tests/perf-first.mjs [laptop|portrait]
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT } from './lib.mjs';
const D = process.argv[2] === 'portrait' ? { w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true } : { w: 1366, h: 768, q: 'low', cpu: 4 };
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { ...D, uid: 'first' + Date.now() });
    console.log('load + join ' + page.loadSecs + ' s');
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.perf(true); window.__qa.auto(true); });
    if (process.env.PROF) {
        const c = await page.createCDPSession(); await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 250 }); await c.send('Profiler.start');
        await sleep(10000);
        const { profile } = await c.send('Profiler.stop');
        const self = new Map(), total = profile.samples.length, byId = new Map(profile.nodes.map((n) => [n.id, n]));
        for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
        for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
    }
    for (let i = 0; i < (process.env.PROF ? 0 : 12); i++) {
        const m = await measure(page, 5);
        const s = await qa(page, () => { const q = window.__qa, st = q.state(); if (q.P.down && q.actions.giveUp) q.actions.giveUp(); q.close(); return { z: Math.round(st.z), speed: Math.round(st.speed), stage: st.stage }; });
        console.log(String((i + 1) * 5).padStart(3) + ' s: ' + String(m.fps).padStart(3) + ' FPS, p95 ' + m.p95 + ', worst ' + m.max + ', ' + m.over50 + ' over 50 ms, work ' + m.avgMs + ' ms', JSON.stringify(s));
    }
    console.log('errors', page.errors);
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

// QA helper: what each part of a world costs on the weak laptop (CPU 4x, 1366x768, Low). Stands in a stage looking up the course and hides
// the world's meshes one at a time, measuring the frame each time. Run: LOW_GPU=1 node tests/perf-parts.mjs [stage index]
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT } from './lib.mjs';
const K = +(process.argv[2] || 1);
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { w: 1366, h: 768, q: 'low', cpu: 4, uid: 'parts' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ speed: 1e6, noShade: true }); });
    await sleep(12000);
    await qa(page, (k) => { const q = window.__qa; q.close(); q.perf(true); q.teleport(0, 0, q.checkpoint(k).z - 8, Math.PI); q.look(0, 0.2, 22); }, K);
    await sleep(2500);
    const base = await measure(page, 4);
    console.log('stage ' + (K + 1) + ' all: ' + base.fps + ' FPS, work ' + base.avgMs + ' ms, ' + base.calls + ' calls, ' + Math.round(base.tris / 1000) + 'k tris');
    const n = await qa(page, () => window.__qa.view().group.children.length);
    for (let i = 0; i < n; i++) {
        const name = await qa(page, (j) => { const o = window.__qa.view().group.children[j]; const m = o.material; const key = m ? (m.customProgramCacheKey ? m.customProgramCacheKey() : '') || m.type : ''; return o.type + ' ' + (o.isBatchedMesh ? 'batch ' : '') + String(key).slice(0, 28) + (o.count !== undefined ? ' x' + o.count : ''); }, i);
        await qa(page, (j) => { window.__qa.view().group.children[j].visible = false; }, i);
        await sleep(600);
        const m = await measure(page, 3);
        await qa(page, (j) => { window.__qa.view().group.children[j].visible = true; }, i);
        if (m.fps - base.fps >= 3 || base.avgMs - m.avgMs >= 0.6) console.log('  without ' + name.padEnd(44) + m.fps + ' FPS, work ' + m.avgMs + ' ms, ' + m.calls + ' calls');
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

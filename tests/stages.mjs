// Every stage of a world, one by one: a screenshot looking up it from just inside its gate (its lasers, rifts, key bridges
// ahead), then one a few seconds into it on the autopilot. Run: node tests/stages.mjs [world] (W, H, Q change it)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
const world = +(process.argv[2] || 0);
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5621/', { w: +(process.env.W || 1280), h: +(process.env.H || 720), q: process.env.Q || 'medium', uid: 'stages' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(800);
await ev((w) => { const q = window.__qa; q.close(); q.give({ speed: 1e30, openWorlds: true, noShade: true, wins: 1e6 }); if (w) q.send('world', { w }); }, world);
await sleep(world ? 4000 : 1200);
for (let k = 1; k < 15; k++) {
    await ev((kk) => { const q = window.__qa; q.close(); q.auto(false); const z = q.checkpoint(kk).z; q.teleport(0, 0, z - 2, Math.PI); q.look(0, 0.24, 24); }, k);
    await sleep(1300);
    const type = await ev((kk) => window.__qa.view().stageFx && window.__qa.stageType(kk), k);
    await shot(page, `w${world}-k${k}-${type}-a`);
    await ev(() => window.__qa.auto(true));
    await sleep(2600);
    await ev(() => window.__qa.close());
    await shot(page, `w${world}-k${k}-${type}-b`);
    const st = await ev(() => { const s = window.__qa.state(); return { z: s.z, y: s.y, stage: s.stage }; });
    console.log('stage', k + 1, type, JSON.stringify(st));
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);

// QA helper: stands at a spot and looks, for a screenshot of something odd (here: stage 1's end gate and the trophy beside it, from
// in front, from behind, close up). Run: node tests/probe.mjs
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5621/', { w: 1280, h: 720, q: 'high', uid: 'probe' + Date.now() });
await sleep(800);
// [name, stage k, x, z from its end gate, yaw]
const spots = [['arch1-front', 0, 0, 24, 0], ['arch1-back', 0, 0, -30, Math.PI], ['trophy1', 0, 6, 16, -0.5]];
for (const [name, k, x, dz, yaw] of spots) {
    await qa(page, (a) => { const q = window.__qa; q.close(); q.give({ lv: 20, reviveAt: 0 }); const z = q.wallZ(a.k + 1) + a.dz; q.teleport(a.x, 0, z, 0); q.look(a.yaw, 0.08, 12); }, { k, x, dz, yaw });
    await sleep(900);
    console.log(name, await shot(page, 'probe-' + name));
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);

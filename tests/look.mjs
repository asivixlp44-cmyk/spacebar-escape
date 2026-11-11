// Looks at the game from set places: the spawn (its dais, the FREE GIFT chest, the first gate up the way), a treadmill, the launch gantry,
// a gate with its trophy and "Recommended Level" board, a laser sweeper, a sliding laser gate, a rift stage (floating keys, a bridge),
// the finish gate, every world's plaza. A camera on the world; draws and triangles with each. Run: node tests/look.mjs (W, H, Q, BOTS)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: process.env.BOTS ? '' : '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5621/', { w: +(process.env.W || 1280), h: +(process.env.H || 720), q: process.env.Q || 'medium', uid: 'look' + Date.now() });
const log = async (name) => { const f = await shot(page, name); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__qa.state(), d = window.__qa.diag(); return { x: s.x, z: s.z, stage: s.stage, ...d }; }))); return f; };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
// stand still somewhere (nothing chasing, nothing locked), looking north
const at = (z, pitch, dist) => ev((zz, p, d) => { const q = window.__qa; q.close(); q.teleport(0, 0, zz, Math.PI); q.look(0, p, d); }, z, pitch, dist);
await sleep(800);
await ev(() => { const q = window.__qa; q.close(); q.give({ speed: 1e30, noShade: true }); });
await sleep(600);
await ev(() => window.__qa.close());
await log('a_spawn');
await ev(() => { const q = window.__qa; q.teleport(-20, 0, 75, Math.PI); q.look(0.5, 0.25, 18); });
await sleep(1500);
await log('b_treadmill');
await at(60, 0.12, 22);
await sleep(700);
await log('c_riftgate');
// stage 2's gate from 30 studs short of it: the trophy on the right (stage 1 pays there), the board on the left
await ev(() => { const q = window.__qa; q.close(); q.teleport(0, 0, q.checkpoint(1).z + 36, Math.PI); q.look(0, 0.1, 20); });
await sleep(900);
await log('d_arch');
await ev(() => { const q = window.__qa; q.teleport(8, 0, q.checkpoint(1).z + 14, Math.PI); q.look(-0.5, 0.05, 14); });
await sleep(700);
await log('d2_trophy');
// a laser sweeper and a sliding laser gate, from just short of them
const near = async (name, list, back, pitch) => {
    const z = await ev((l) => { const fx = window.__qa.view().stageFx, s = fx && fx[l] && fx[l][0]; return s ? s.o.z : null; }, list);
    if (z === null) { console.log(name, 'none in this world'); return; }
    await at(z + back, pitch, 20);
    await sleep(900);
    await log(name);
};
await near('e_laser', 'sweepers', 24, 0.22);
await near('e2_slider', 'sliders', 16, 0.18);
// a stage over a rift (floating keys, a bridge, crumbling keys, springs)
{
    const k = await ev(() => { for (let k = 1; k < 15; k++) if (/stone|lava|moat|island|bridge|crumble|bounce/.test(window.__qa.stageType(k))) return k; return -1; });
    if (k > 0) { await ev((kk) => { const q = window.__qa; q.close(); q.teleport(0, 0, q.checkpoint(kk).z + 2, Math.PI); q.look(0, 0.3, 24); }, k); await sleep(1000); await log('e3_pit_k' + k); }
}
await ev(() => { const q = window.__qa; q.teleport(0, 0, q.northEnd + 64, Math.PI); q.look(0, 0.12, 22); });
await sleep(900);
await log('f_end_arch');
for (const w of [1, 2, 3]) {
    await ev((ww) => { const q = window.__qa; q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    await ev(() => { window.__qa.close(); window.__qa.look(0, 0.2, 22); });
    await sleep(500);
    await log('g_world' + w);
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);

// QA helper: the autopilot through one stage at its Recommended Level, sampled every 60 ms (where it is, on the ground or not, how
// fast, dead), so a stage it can't pass shows where and how it goes wrong. Run: node tests/trace-stage.mjs <world> <stage 1-15> [secs]
import { startServer, startVite, stopAll, launch, open, sleep, TEST_PORT } from './lib.mjs';
import { recLevel } from '../shared/config.js';
import { stagePlan } from '../shared/world.js';
const w = +(process.argv[2] || 0), k = +(process.argv[3] || 1) - 1, SECS = +(process.argv[4] || 14);
const plan = stagePlan(w, k);
console.log('stage', k + 1, plan.type, 'level', recLevel(w, k));
for (const o of plan.list) console.log('  ', o.kind, JSON.stringify(o).slice(0, 160));
for (const o of plan.lakes) console.log('   lake', JSON.stringify(o));
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
try {
    const page = await open(b, 'http://localhost:5621/', { w: 960, h: 540, q: 'low', uid: 'trace' + Date.now() });
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    await sleep(800);
    await ev(() => { const q = window.__qa; q.close(); q.noWatch(true); q.give({ openWorlds: true, qi: 999 }); });
    await ev((ww) => { const q = window.__qa; q.send('world', { w: ww }); }, w);
    await sleep(3500);
    const lv = recLevel(w, k);
    await ev((s) => { const q = window.__qa; q.auto(false); q.close(); q.give(s); }, { lv, rebirths: Math.max(0, Math.ceil((lv - 2) / 5)), best: k, gems: 1e5, reviveAt: 0, ups: { feet: 0, reach: 0, spring: 0 } });
    await sleep(500);
    await ev((kk) => { const q = window.__qa, cp = q.checkpoint(kk); q.teleport(cp.x, 0, cp.z, Math.PI); }, k);
    await sleep(700);
    await ev(() => { window.__trace = []; window.__qa.auto(true); const tick = () => { const s = window.__qa.state(); window.__trace.push([performance.now() | 0, s.x, s.y, s.z, s.onGround ? 1 : 0, s.v, s.dead ? 1 : 0, s.deaths]); if (window.__trace.length < 2000) setTimeout(tick, 60); }; tick(); });
    await sleep(SECS * 1000);
    const T = await ev(() => window.__trace);
    let lastD = T[0][7];
    for (const r of T) { const [t, x, y, z, g, v, dead, d] = r; console.log(String(t).padStart(7), 'x', x.toFixed(1).padStart(6), 'y', y.toFixed(1).padStart(5), 'z', z.toFixed(1).padStart(8), g ? 'G' : 'air', 'v', String(v).padStart(5), dead ? 'DEAD' : '', d !== lastD ? '<< death ' + d : ''); lastD = d; }
} catch (e) { console.error(e); } finally { await b.close(); stopAll(); }
process.exit(0);

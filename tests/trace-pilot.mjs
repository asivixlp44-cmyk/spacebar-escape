// QA helper: follows the autopilot up the first stages and prints where it is twice a second (where it stalls, what killed it, the
// revive back into the stage). Run: node tests/trace-pilot.mjs [secs] (LV=n: start at that Level)
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
const SECS = +(process.argv[2] || 40);
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { w: 1280, h: 720, q: 'low', uid: 'trace' + Date.now() });
    page.on('console', (m) => { if (/pilot|fell|died|revive/i.test(m.text())) console.log('  [page]', m.text()); });
    await qa(page, (lv) => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ lv, gems: 500 }); }, +(process.env.LV || 1));
    await sleep(800);
    await qa(page, () => window.__qa.auto(true));
    for (let i = 0; i < SECS * 2; i++) {
        await sleep(500);
        const s = await qa(page, () => { const q = window.__qa, s = q.state(); q.close(); return { x: s.x, y: s.y, z: s.z, st: s.stage, v: s.v, walk: s.walk, lv: s.lv, dead: s.dead, deaths: s.deaths, revives: s.revives, shield: s.shield, revive: s.revive, mv: q.P.moving, tr: s.tread, wins: s.wins, bests: s.bests, g: q.guideTarget() }; });
        console.log(JSON.stringify(s));
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

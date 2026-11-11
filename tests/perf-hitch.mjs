// QA helper: what's in the long frames (over 50 ms) of a brand-new player's first minute on a weak device. Chrome's Long Animation
// Frame reports name the scripts that ran in each; the game's state says what was going on (a death, a warp, a level-up).
// Run: LOW_GPU=1 node tests/perf-hitch.mjs [laptop|portrait] [secs]
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
const D = process.argv[2] === 'portrait' ? { w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true } : { w: 1366, h: 768, q: 'low', cpu: 4 };
const SECS = +(process.argv[3] || 60);
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5621/', { ...D, uid: 'hitch' + Date.now(), init: () => {
        window.__loaf = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    if (e.duration < 50) continue;
                    const q = window.__qa, st = q && q.state ? q.state() : {};
                    window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
                        scripts: (e.scripts || []).map((s) => ({ d: Math.round(s.duration), inv: s.invoker, fn: s.sourceFunctionName, src: (s.sourceURL || '').split('/').pop().split('?')[0] + ':' + s.sourceCharPosition, layout: Math.round(s.forcedStyleAndLayoutDuration || 0) })).filter((s) => s.d >= 5),
                        st: { stage: st.stage, dead: st.dead, deaths: st.deaths, lv: st.lv, speed: Math.round(st.speed || 0) } });
                }
            }).observe({ type: 'long-animation-frame', buffered: true });
        } catch (e) { window.__loaf.push({ err: String(e) }); }
    } });
    console.log('load + join ' + page.loadSecs + ' s');
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.auto(true); window.__loaf.length = 0; });
    await sleep(SECS * 1000);
    const L = await page.evaluate(() => window.__loaf);
    console.log(L.length + ' long frames in ' + SECS + ' s');
    for (const e of L) console.log(JSON.stringify(e));
    console.log('errors', page.errors);
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);

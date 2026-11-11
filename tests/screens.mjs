// Every screen, at every size: four portrait phones, three landscape phones, a tablet, desktops. Measures the HUD's boxes and the touch
// controls for overlaps, things cut off and the Bloxity corner (top left), and saves a screenshot of each. Run: node tests/screens.mjs [size,size]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, OUT, TEST_PORT } from './lib.mjs';

const ALL = [
    { name: '390x844', w: 390, h: 844, dpr: 2, touch: true },
    { name: '360x800', w: 360, h: 800, dpr: 2, touch: true },
    { name: '375x667', w: 375, h: 667, dpr: 2, touch: true },
    { name: '844x390', w: 844, h: 390, dpr: 2, touch: true },
    { name: '1280x720', w: 1280, h: 720, dpr: 1, touch: false },
    { name: '1920x1080', w: 1920, h: 1080, dpr: 1, touch: false },
    { name: '1366x768', w: 1366, h: 768, dpr: 1, touch: false },
    { name: '1024x600', w: 1024, h: 600, dpr: 1, touch: false },
    { name: '800x600', w: 800, h: 600, dpr: 1, touch: false },
    { name: '768x1024', w: 768, h: 1024, dpr: 2, touch: true },
    { name: '667x375', w: 667, h: 375, dpr: 2, touch: true },
    // (a big Android phone upright, a big iPhone on its side: over half of Bloxity's players are on phones)
    { name: '412x915', w: 412, h: 915, dpr: 2, touch: true },
    { name: '932x430', w: 932, h: 430, dpr: 2, touch: true },
];
const SIZES = process.argv[2] ? ALL.filter((s) => process.argv[2].split(',').includes(s.name)) : ALL;
const HUD = ['#pillRow', '#winsBox', '#gemsBox', '#menuGrid', '#questBox', '#bPlay', '#bGift', '#bShop', '#bX2', '#csBox', '#powerLine', '#multis', '#lvBar', '#x20Badge', '#stick', '#lickBtn', '#jumpBtn', '#tips', '#revive'];
const WALL = [...HUD, '#wallBar'];
// the words that come and go: each big moment with two toasts up, against everything else on the screen
const LANE = [...HUD, '#toasts', '#bigText', '#popup', '#winPop', '#lvlUp'];
const MATCH = ['#mClock', '#scores', '#bQuit', '#powerLine', '#lvBar', '#stick', '#lickBtn', '#jumpBtn', '#wallBar'];
const QUEUE = [...HUD, '#queueBar', '#toasts'];
// the boxes on screen: which overlap, and what's cut off
const audit = (page, sels) => page.evaluate((list) => {
    const out = { off: [], over: [], corner: [] }, boxes = [], W = innerWidth, H = innerHeight;
    for (const s of list) {
        const e = document.querySelector(s);
        if (!e || e.hidden) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ s, l: r.left, t: r.top, r: r.right, b: r.bottom });
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.off.push(s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        // the Bloxity overlay's corner: top-left stays free
        if (r.left < 100 && r.top < 60) out.corner.push(s);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1.5 && oy > 1.5) out.over.push(a.s + ' x ' + b.s + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
    }
    return out;
}, sels);
let bad = 0;
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    for (const S of SIZES) {
        console.log('\n=== ' + S.name);
        const page = await open(browser, 'http://localhost:5621/', { ...S, q: 'low', uid: 'scr' + S.name + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(600);
        const report = async (tag, sels) => {
            await sleep(450);
            await shot(page, S.name + '-' + tag);
            if (!sels) return;
            const a = await audit(page, sels);
            const msg = [...a.off.map((x) => 'CUT ' + x), ...a.over.map((x) => 'OVER ' + x), ...a.corner.map((x) => 'CORNER ' + x)];
            if (msg.length) { bad += msg.length; console.log('  ' + tag + ': ' + msg.join(' · ')); } else console.log('  ' + tag + ': clean');
        };
        await report('hud', HUD);
        await qa(page, () => { window.__qa.give({ wins: 3000, gems: 200, playSecs: 200, best: 2, spins: 2, lv: 9, allPals: true }); });
        await sleep(300);
        await report('hud2', HUD);
        for (const [k, t] of [['work'], ['inv', 'team'], ['inv', 'jaws'], ['inv', 'trails'], ['inv', 'auras'], ['tele', 'stages'], ['tele', 'worlds'], ['spin'], ['rebirth'], ['shop'], ['shop', 'codes'], ['quests'], ['daily'], ['gifts'], ['boards'], ['settings']]) {
            await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
            await sleep(120);
            await shot(page, S.name + '-panel-' + k + (t ? '-' + t : ''));
            const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'none'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
            if (fit) { bad++; console.log('  ' + k + ': ' + fit); }
        }
        await qa(page, () => window.__qa.close());
        // a Star Capsule opening, three at a time
        await qa(page, () => window.__qa.ui.hatchShow({ j: 3, got: [{ id: 'solar0', fresh: true }, { id: 'solar3', fresh: false }, { id: 'solar4', fresh: true }], done: 0, mult: 3 }));
        await sleep(1500);
        await shot(page, S.name + '-hatch');
        const hfit = await page.evaluate(() => { for (const e of document.querySelectorAll('.hatchOne')) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); } return ''; });
        if (hfit) { bad++; console.log('  hatch: ' + hfit); }
        await sleep(1800);
        // the big moments, one at a time in their lane, with toasts up
        for (const [tag, say] of [['big', "t.bigText('EVERY STEP IS +20 SPEED!', '#7af4ff')"], ['level', 't.levelUp(14, 16)'], ['popup', "t.popup('🔄', 'REBIRTH 12!', 'Every step now gives x7 Speed', '#e0a8ff')"]]) {
            await page.evaluate("(() => { const t = window.__qa.ui; t.toast('👟 Run up the Keyway! Lasers and plasma send you back. Every gate: Wins!', '#fff'); t.toast('🏆 +12 Wins · first time through: x3!', '#ffe24a'); " + say + '; })()');
            await sleep(500);
            await report('lane-' + tag, LANE);
            await sleep(2600);
        }
        // on a treadmill
        await qa(page, () => { window.__qa.teleport(-20, 0, 75, Math.PI); });
        await sleep(900);
        await report('tread', HUD);
        // in the Keyway: the stage bar, a toast, a big word
        await qa(page, () => { window.__qa.teleport(0, 0, 12, Math.PI); });
        await sleep(900);
        await qa(page, () => { window.__qa.ui.toast('🔊 Tap anywhere for sound!', '#7de8ff'); window.__qa.ui.bigText('STAGE 2! RUN!', '#7dff6b'); });
        await report('wall', [...WALL, '#toasts', '#bigText']);
        // dead: back at the spawn in a bubble, the revive offer top middle (the server's; shown here if it's slow to say)
        await qa(page, () => window.__qa.die(0, 'pit'));
        await page.waitForFunction(() => window.__qa.state().revive, { timeout: 4000 }).catch(() => {});
        await qa(page, () => { if (!window.__qa.state().revive) window.__qa.ui.reviveShow({ k: 4, free: false, cost: 5, until: window.__qa.net.now() + 15000 }); window.__qa.ui.toast('💎 Not enough Gems to revive', '#ff9a8a'); });
        await report('dead', [...HUD, '#toasts']);
        // typing a Custom Speed: the keys go to the box (the runner stays put), Enter sets it
        const cs = await page.evaluate(async () => {
            const q = window.__qa, box = document.querySelector('#csIn'), z0 = q.state().z;
            box.focus(); box.value = '';
            return { z0, focused: document.activeElement === box, numeric: box.inputMode === 'numeric' };
        });
        await page.keyboard.type('12');
        await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW');
        await page.keyboard.press('Enter');
        await sleep(300);
        const cs2 = await qa(page, () => ({ z: window.__qa.state().z, walk: window.__qa.state().walk, cs: window.__qa.state().cs, val: document.querySelector('#csIn').value }));
        const csOk = cs.focused && cs.numeric && Math.abs(cs2.z - cs.z0) < 0.5 && cs2.walk === 12;
        if (!csOk) { bad++; console.log('  custom speed: FAIL ' + JSON.stringify({ ...cs, ...cs2 })); } else console.log('  custom speed: typed 12, walking ' + cs2.walk + ', stood still');
        await qa(page, () => { const b = document.querySelector('#csIn'); b.value = '999'; b.dispatchEvent(new Event('change')); });
        await qa(page, () => window.__qa.ui.reviveHide());
        await sleep(300);
        // queued, in a stage
        await qa(page, () => window.__qa.teleport(0, 0, 12, Math.PI));
        await sleep(600);
        await qa(page, () => window.__qa.play({ map: 0, lv: 12 }));
        await sleep(400);
        await report('wall-queued', [...WALL, '#queueBar', '#toasts']);
        await qa(page, () => window.__qa.send('unplay', {}));
        await sleep(300);
        await qa(page, () => { window.__qa.teleport(0, 0, 92, Math.PI); });
        await sleep(300);
        // the queue
        await qa(page, () => window.__qa.play({ map: 0, lv: 12 }));
        await qa(page, () => window.__qa.ui.toast('🏃 Someone joined the race!', '#7af4ff'));
        await report('queue', QUEUE);
        // a race
        await qa(page, () => window.__qa.send('unplay', {}));
        await sleep(300);
        await qa(page, () => window.__qa.play({ map: 1, lv: 12, now: true }));
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'wait'; }, { timeout: 15000 });
        await sleep(600);
        await report('race-line', MATCH);
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 15000 });
        await qa(page, () => window.__qa.auto(true));
        await sleep(3500);
        await qa(page, () => window.__qa.ui.toast('🏃 Someone joined the race!', '#7af4ff'));
        await report('race', [...MATCH, '#toasts']);
        await page.waitForFunction(() => !window.__qa.state().match, { timeout: 130000 });
        await sleep(1000);
        await shot(page, S.name + '-results');
        const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'no results'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
        if (fit) { bad++; console.log('  results: ' + fit); } else console.log('  results: clean');
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { bad += errs.length; console.log('  errors:', errs.slice(0, 4)); }
        await page.close();
    }
} catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
console.log('\n' + (bad ? bad + ' problems' : 'all clean') + '; shots in', OUT);
process.exit(bad ? 1 : 0);

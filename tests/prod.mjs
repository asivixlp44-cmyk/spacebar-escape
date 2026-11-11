// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's
// own words on screen as the only way to know what happened. Run: node tests/prod.mjs (it builds first)
import { execSync } from 'node:child_process';
import { startServer, stopAll, launch, open, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';
import { wallZ, stagePlan } from '../shared/world.js';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const parse = (t) => { const n = parseFloat(String(t).replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : /B$/.test(t) ? n * 1e9 : n; };
const num = async (page, sel) => parse(await text(page, sel));
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const fill = (page) => page.$eval('#wbFill', (e) => parseFloat((e.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 0])[1]));
const toasts = (page) => page.$eval('#toasts', (e) => e.textContent);
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
async function waitFor(fn, secs, every) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(every || 150); } return null; }
const modalUp = (page) => page.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel'));
const closeModal = async (page) => { if (await page.$eval('#modal', (e) => !e.hidden)) { await page.click('#modal [data-close]').catch(() => {}); await sleep(250); } };
// where you are in the Keyway, from the stage bar at the top ("STAGE N", how far through it to its gate): { k, z }, or null off it
async function whereRun(page) {
    if (!(await visible(page, '#wallBar'))) return null;
    const m = (await text(page, '#wbName')).match(/STAGE (\d+)/);
    if (!m) return null;
    const k = +m[1] - 1, f = await fill(page);
    return { k, z: wallZ(k) - f * (wallZ(k) - wallZ(k + 1)) };
}
// Speed as the HUD shows it, every change (the steps), from now on
const watchSpeed = (page) => page.evaluate(() => {
    window.__sp = [];
    const el = document.querySelector('#powerVal');
    if (window.__spObs) window.__spObs.disconnect();
    window.__spObs = new MutationObserver(() => window.__sp.push(el.textContent));
    window.__spObs.observe(el, { childList: true, characterData: true, subtree: true });
});
const speedSeen = (page) => page.evaluate(() => window.__sp.splice(0));
// how many steps that was (each puts Speed up by about 20; the server's word on it changes nothing you can see)
const stepsIn = (list, from) => list.map(parse).filter((v, i, a) => v - (i ? a[i - 1] : from) >= 0.5).length;
// Up the Keyway from where it starts: along its left wall (clear of the pillars, off the rift's key bridges), over stage 1's
// low wall (holding JUMP), through stage 1's gate (Wins), on into stage 2's rift (a rift): dead. Returns what it saw.
// io: { left(on), jump(on) } — the keyboard's A and SPACE, or a thumb on the stick and one on JUMP
const hurdle = stagePlan(0, 0).list.find((o) => o.kind === 'hurdle').z;
async function runToTheMoat(page, io, secs) {
    const seen = { inRun: false, arch: false, toast: '', dead: false, wins: 0, toastMs: 0, pushedBy: [] };
    const w0 = await num(page, '#winsVal');
    // every toast, when it came and went (a few at once push the oldest out early)
    await page.evaluate(() => {
        window.__toasts = [];
        new MutationObserver((ms) => { const now = performance.now(); for (const m of ms) { for (const n of m.addedNodes) window.__toasts.push({ t: n.textContent, at: now, el: n }); for (const n of m.removedNodes) { const r = window.__toasts.find((x) => x.el === n && !x.gone); if (r) r.gone = now; } } }).observe(document.querySelector('#toasts'), { childList: true });
    });
    await waitFor(() => visible(page, '#wallBar'), secs);
    seen.inRun = /STAGE 1/.test(await text(page, '#wbName').catch(() => ''));
    // to the left wall
    await io.left(true); await sleep(1700); await io.left(false);
    let jumping = false;
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
        if (await visible(page, '#revive')) { seen.dead = true; break; }
        const r = await whereRun(page);
        if (r && r.k === 0) {
            const want = r.z < hurdle + 14 && r.z > hurdle - 8;
            if (want !== jumping) { jumping = want; await io.jump(want); }
        }
        await sleep(40);
    }
    if (jumping) await io.jump(false);
    seen.wins = (await num(page, '#winsVal')) - w0;
    // the "+N Wins" toast: shown, for how long, and what came on top of it
    const tl = await page.evaluate(() => { const now = performance.now(), L = window.__toasts, i = L.findIndex((x) => /\+\d+ Wins/.test(x.t)); if (i < 0) return null; const w = L[i]; return { t: w.t, ms: Math.round((w.gone || now) - w.at), after: L.slice(i + 1).filter((x) => x.at < (w.gone || now) + 1).map((x) => x.t.slice(0, 40)) }; });
    if (tl) { seen.arch = true; seen.toast = tl.t; seen.toastMs = tl.ms; seen.pushedBy = tl.after; }
    return seen;
}

// always this code, not a build left over from before
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
await startServer(TEST_PORT, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:' + TEST_PORT + '/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menuGrid') && await visible(page, '#botArea'), 'no start menu: straight in the world, the HUD up');
    check(/^\d+ SPEED$/.test((await text(page, '#powerLine')).trim()) && /^LEVEL 1$/.test(await text(page, '#lvTxt')) && /^WALK · MAX 16$/.test(await text(page, '#csMax')) && (await text(page, '#x20Badge')) === '+1 / STEP', 'the HUD\'s words: "' + (await text(page, '#powerLine')).trim() + '", "' + await text(page, '#lvTxt') + '", "' + await text(page, '#csMax') + '", "' + await text(page, '#x20Badge') + '"');
    await sleep(1200);
    // the first thing: running is Speed, +1 a step
    await watchSpeed(page);
    const p0 = await num(page, '#powerVal');
    await page.keyboard.down('KeyW');
    await sleep(1600);
    const p1 = await num(page, '#powerVal');
    const seen = await speedSeen(page);
    const deltas = seen.map(parse).map((v, i, a) => v - (i ? a[i - 1] : p0)).filter((d) => d > 0).sort((a, b) => a - b);
    const med = deltas[Math.floor(deltas.length / 2)] || 0;
    check(p1 >= p0 + 3 && med >= 0.9 && med <= 1.6, 'W: running, every step +' + med + ' Speed (' + deltas.length + ' steps in 1.6 s): ' + await text(page, '#powerVal'));
    // up the Keyway: STAGE 1, through its gate (Wins), into the rift of stage 2: dead
    const kb = { left: (on) => (on ? page.keyboard.down('KeyA') : page.keyboard.up('KeyA')), jump: (on) => (on ? page.keyboard.down('Space') : page.keyboard.up('Space')) };
    const run = await runToTheMoat(page, kb, 45);
    await page.keyboard.up('KeyW');
    check(run.inRun, 'into the Keyway: STAGE 1 at the top');
    check(run.arch && run.wins >= 3, 'through the STAGE 1 arch: "' + run.toast + '", ' + await text(page, '#winsVal') + ' Wins');
    check(run.toastMs >= 1000, 'the Wins toast stays up to be read: ' + run.toastMs + ' ms' + (run.pushedBy.length ? ' (then ' + run.pushedBy.join(' | ') + ')' : ''));
    check(run.dead, 'into the moat of stage 2 off its keycap bridges: a death');
    await shot(page, 'prod-dead');
    const rvT = (await page.$eval('#rvTxt', (e) => e.innerText)).replace(/\s+/g, ' ');
    check(/Stage 2\?/.test(rvT) && (await text(page, '#rvTag')) === 'FREE' && !(await visible(page, '#wallBar')), 'back at the spawn, the offer at the top: "' + rvT + '" ' + await text(page, '#rvTag'));
    await page.click('#rvBtn');
    const back = await waitFor(async () => { const r = await whereRun(page); return r && r.k === 1 && !(await visible(page, '#revive')) && r; }, 5);
    check(!!back, 'the revive by its button: back in stage 2 (' + (back ? Math.round(back.z) : '?') + ')');
    await sleep(500);
    await shot(page, 'prod-revived');
    // Custom Speed: home, typed into (the runner stays put), then a walk: slower, by the steps it takes
    await page.keyboard.press('KeyR');
    await waitFor(async () => !(await visible(page, '#wallBar')), 5);
    await sleep(1200);
    const walkRate = async (secs) => { await watchSpeed(page); const v0 = await num(page, '#powerVal'); await page.keyboard.down('KeyW'); await sleep(secs * 1000); await page.keyboard.up('KeyW'); await sleep(150); return stepsIn(await speedSeen(page), v0) / secs; };
    const fast = await walkRate(1.5);
    const max0 = await text(page, '#csMax');
    await page.keyboard.press('KeyR'); await sleep(1500);
    await page.click('#csIn', { clickCount: 3 });
    const s0 = await num(page, '#powerVal');
    await page.keyboard.type('8');
    await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
    const s1 = await num(page, '#powerVal');
    const typed = await page.$eval('#csIn', (e) => e.value);
    await page.keyboard.press('Enter');
    await sleep(300);
    check(s1 === s0 && typed === '8', 'typing in the Custom Speed box (W too): the runner doesn\'t move (' + s0 + ' → ' + s1 + '), the box says ' + typed);
    check(/Walking at 8$/.test(await text(page, '#csCur')) && /Walking speed: 8/.test(await toasts(page)), 'OK: "' + await text(page, '#csCur') + '" (' + max0 + ')');
    const slow = await walkRate(1.5);
    check(slow > 0 && slow < fast * 0.7, 'and it walks slower: ' + slow.toFixed(1) + ' steps a second, against ' + fast.toFixed(1) + ' at the top');
    await page.click('#csIn', { clickCount: 3 });
    await page.keyboard.type('999');
    await page.click('#csOk');
    await sleep(300);
    const top = (await text(page, '#csMax')).match(/\d+/)[0];
    check((await text(page, '#csCur')) === 'Walking at ' + top, '999 and OK: back to the top: "' + await text(page, '#csCur') + '"');
    // a code typed in: some Wins to spend
    await page.click('#bCodes'); await sleep(300);
    await page.type('#codeIn', 'liftoff'); await page.keyboard.press('Enter'); await sleep(600);
    check(/Code redeemed/.test(await toasts(page)), 'a code typed in (the Codes button): ' + ((await toasts(page)).match(/Code redeemed[^🏆🎯✅]*/) || [''])[0]);
    await closeModal(page);
    // an upgrade
    await page.click('#bWork'); await sleep(300);
    const ub = await page.$('#modal [data-act="upgrade"].g-green');
    if (ub) await ub.click();
    check(!!ub && !!(await waitFor(async () => /Upgraded/.test(await toasts(page)), 4)), 'an upgrade bought by its button');
    await closeModal(page);
    // a Star Capsule, from the Inventory's chests
    await page.click('#bPals'); await sleep(300);
    await page.click('#modal [data-tab="jaws"]'); await sleep(250);
    await page.click('#modal [data-act="hatch"][data-n="1"]');
    const hatched = await waitFor(() => visible(page, '#hatch'), 3);
    await sleep(1200);
    await shot(page, 'prod-hatch');
    check(!!hatched, 'a Star Capsule opened (Inventory, Chests)');
    await waitFor(async () => !(await visible(page, '#hatch')), 5);
    await closeModal(page);
    // every menu button opens its panel, its X closes it; the tabs of the tabbed ones
    let allOpen = true;
    for (const b of ['#bRebirth', '#bWork', '#bPals', '#bTele', '#bQuests', '#bDaily', '#bSpin', '#bCodes', '#bSettings', '#bShop', '#bGift', '#winsBox', '#gemsBox']) {
        await page.click(b); await sleep(220);
        if (!(await modalUp(page))) { check(false, b + ' opens its panel'); allOpen = false; }
        const tabs = await page.$$eval('#modal [data-tab]', (e) => e.map((x) => x.dataset.tab));
        for (const t of tabs) {
            await page.click('#modal [data-tab="' + t + '"]'); await sleep(150);
            if (!(await page.$eval('#modal [data-tab="' + t + '"]', (e) => e.classList.contains('on')))) { check(false, b + ': its ' + t + ' tab'); allOpen = false; }
        }
        await page.click('#modal [data-close]'); await sleep(160);
        if (await page.$eval('#modal', (e) => !e.hidden)) { check(false, b + ': its X closes it'); allOpen = false; }
    }
    check(allOpen, 'every menu button opens its panel (each tab of Inventory, Teleport, Shop too), its X closes it');
    const snd0 = await page.$eval('#soundIc', (e) => e.className);
    await page.click('#bSound'); await sleep(250);
    const snd1 = await page.$eval('#soundIc', (e) => e.className);
    check(snd1 !== snd0 && /Sound off/.test(await toasts(page)), 'Sound: off by its button (' + snd1 + ')');
    await page.click('#bSound'); await sleep(250);
    check((await page.$eval('#soundIc', (e) => e.className)) === snd0, 'and on again');
    await page.click('#bX2'); await sleep(250);
    const x2q = await page.$eval('#confirm', (e) => !e.hidden && /2X SPEED/.test(e.textContent));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(200);
    check(x2q && await page.$eval('#confirm', (e) => e.hidden), '2X SPEED asks first; Cancel');
    await page.click('#bSpin'); await sleep(250);
    const canSpin = await page.$eval('#modal [data-act="spin"]', (e) => !e.disabled).catch(() => false);
    if (canSpin) { await page.click('#modal [data-act="spin"]'); await sleep(3900); check(/YOU WON/.test(await text(page, '#popT')), 'the wheel by its button: ' + await text(page, '#popS')); } else check(false, 'a spin to use');
    await closeModal(page);
    // the Treadmill button: there and onto the belt by itself; it runs by itself, faster holding SHIFT
    await page.click('#bTread');
    check(/To your best treadmill/.test(await toasts(page)), 'the Treadmill button: ' + ((await toasts(page)).match(/To your best treadmill!?/) || [''])[0]);
    await sleep(3200);
    const sp1 = await num(page, '#powerVal');
    await sleep(1500);
    const spA = await num(page, '#powerVal');
    await sleep(1500);
    const sp2 = await num(page, '#powerVal');
    const idle = Math.min(spA - sp1, sp2 - spA) / 1.5;
    check(sp2 > sp1 + 8, 'onto the belt by itself: it runs by itself (' + sp1 + ' → ' + sp2 + ')');
    check(/SPRINT/.test(await text(page, '#lickTxt')), 'on the belt DASH says SPRINT');
    await page.keyboard.down('ShiftLeft'); await sleep(2000); await page.keyboard.up('ShiftLeft');
    const sp3 = await num(page, '#powerVal');
    check((sp3 - sp2) / 2 > idle * 1.4, 'holding SHIFT sprints: ' + ((sp3 - sp2) / 2).toFixed(1) + ' a second, against ' + idle.toFixed(1));
    await shot(page, 'prod-tread');
    // the daily reward; claim it with its button
    await page.click('#bDaily'); await sleep(300);
    const canDaily = await page.$eval('#modal [data-act="daily"]', (e) => !e.disabled).catch(() => false);
    if (canDaily) { await page.click('#modal [data-act="daily"]'); await sleep(600); check(/Next reward/.test(await page.$eval('#modal', (e) => e.textContent)), 'the daily reward claimed by its button'); } else check(false, 'a daily reward to claim');
    await closeModal(page);
    // a race, all of it, with real input
    await page.click('#bPlay'); await sleep(400);
    check(await visible(page, '#queueBar') && /1 \/ 6 found/.test(await text(page, '#qFound')), 'RACE: the queue says who was found: ' + await text(page, '#qFound'));
    await page.click('#qCancel'); await sleep(400);
    check(!(await visible(page, '#queueBar')), 'cancel: out of the queue');
    await page.click('#bPlay');
    const inM = await waitFor(() => visible(page, '#matchHud'), 20);
    check(!!inM, 'the queue runs out: the course, the start line');
    await shot(page, 'prod-line');
    const go = await waitFor(async () => /RUN/.test(await text(page, '#countdown')), 12);
    check(!!go, 'the count, the gun');
    await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
    const wl = await waitFor(async () => { const rows = await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent)); return rows.length && (parseInt(rows[0], 10) >= 20 || /✓|❄️/.test(rows[0])); }, 25);
    check(!!wl, 'W and SPACE: up the lane on the board: ' + await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent).join()));
    await shot(page, 'prod-race');
    const res = await waitFor(() => page.$eval('#modal', (e) => !e.hidden && /Race again/.test(e.textContent)), 140);
    await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
    check(!!res, 'the race ends: the results, with a prize');
    await shot(page, 'prod-results');
    await closeModal(page);
    check(!(await visible(page, '#matchHud')) && await visible(page, '#menuGrid'), 'back in the world');
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 4)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push(r ? "room:yes" : "room:no"); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } }, on() {}, off() {} } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    console.log('--- a phone in portrait, touch only');
    const ph = await open(browser, url, { w: 390, h: 844, dpr: 2, touch: true, uid: 'prodph' + Date.now() });
    console.log('  load + join', ph.loadSecs, 's');
    await sleep(1500);
    check(await visible(ph, '#stick') && await visible(ph, '#lickBtn') && await visible(ph, '#jumpBtn'), 'the stick, DASH and JUMP are there');
    const stick = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
    const cdp = await ph.createCDPSession();
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const tapAt = async (p, id) => { await touch('touchStart', [{ x: p.x, y: p.y, id }]); await sleep(50); await touch('touchEnd', []); };
    // the thumbs: the stick (id 1, pushed up, or up and to the left), JUMP held (id 2)
    const th = { dx: 0, dy: -stick.r, jump: null };
    const thumbs = () => [{ x: stick.x + th.dx, y: stick.y + th.dy, id: 1 }, ...(th.jump ? [{ x: th.jump.x, y: th.jump.y, id: 2 }] : [])];
    const pw0 = await num(ph, '#powerVal');
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
    await touch('touchMove', thumbs());
    await sleep(1500);
    check(await num(ph, '#powerVal') >= pw0 + 3, 'the stick runs, and every step is Speed: ' + await text(ph, '#powerVal'));
    // a thumb on the stick, the other on DASH (a touch list: a new finger in it goes down; touchEnd lifts the fingers it lists)
    const lb = await center(ph, '#lickBtn');
    await touch('touchMove', [...thumbs(), { x: lb.x, y: lb.y, id: 2 }]);
    await sleep(60);
    const f0 = await ph.$eval('#lickFill', (e) => e.style.transform);
    await touch('touchEnd', [{ x: lb.x, y: lb.y, id: 2 }]);
    await sleep(100);
    check(/scaleY\(0\.[0-8]/.test(await ph.$eval('#lickFill', (e) => e.style.transform)) || /scaleY\(0\.[0-8]/.test(f0), 'DASH with a thumb still on the stick: the button empties and fills back');
    // the stick up the Keyway: STAGE 1, its gate, the rift; JUMP held by the other thumb over the low wall
    const jb = await center(ph, '#jumpBtn');
    const pad = {
        left: async (on) => { th.dx = on ? -stick.r * 0.7 : 0; th.dy = on ? -stick.r * 0.7 : -stick.r; await touch('touchMove', thumbs()); },
        jump: async (on) => { const had = !!th.jump; th.jump = on ? jb : null; if (on && !had) await touch('touchStart', thumbs()); else if (!on && had) await touch('touchEnd', [{ x: jb.x, y: jb.y, id: 2 }]); },
    };
    const prun = await runToTheMoat(ph, pad, 50);
    await touch('touchEnd', []);
    check(prun.inRun, 'the stick runs into the Keyway: STAGE 1');
    check(prun.wins >= 3, 'through the STAGE 1 arch on the stick: ' + await text(ph, '#winsVal') + ' Wins');
    check(prun.arch && prun.toastMs >= 1000, 'its "' + prun.toast + '" toast stays up to be read: ' + prun.toastMs + ' ms' + (prun.pushedBy.length ? ' (pushed out by ' + prun.pushedBy.join(' | ') + ')' : ''));
    check(prun.dead, 'on into the moat: a death');
    await shot(ph, 'prod-phone-dead');
    if (prun.dead) {
        await sleep(300);
        await tapAt(await center(ph, '#rvBtn'), 3);
        const pb = await waitFor(async () => { const r = await whereRun(ph); return r && r.k === 1 && r; }, 5);
        check(!!pb, 'the revive button by touch: back in stage 2');
    }
    await sleep(500);
    await shot(ph, 'prod-phone');
    await tapAt(await center(ph, '#bWork'), 3); await sleep(350);
    check(await modalUp(ph), 'a menu button by touch (Upgrade)');
    await sleep(300);
    await tapAt(await center(ph, '#modal [data-close]'), 4); await sleep(350);
    check(await ph.$eval('#modal', (e) => e.hidden), 'its X by touch');
    // a thumb on the stick, the other on a button: a browser makes no click for a second finger
    const t1 = await center(ph, '#bQuests');
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }, { x: t1.x, y: t1.y, id: 2 }]); await sleep(60);
    await touch('touchEnd', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
    await touch('touchEnd', []); await sleep(400);
    check(await modalUp(ph), 'a button pressed with a thumb still on the stick');
    check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);

// A simulated typical first session on the real formulas (shared/config.js) and the real stages (shared/world.js): runs the Keyway
// from the spawn, stage after stage, every step +1 Speed and +1 XP; dies now and then (more often in a stage laid out for a
// higher Level than its own: its gaps are sized to that Level's walk speed); revives when it's free (or for Gems now and then), else
// runs again from the start; trains on its best treadmill when it's stuck; follows the quests (rebirths, races, trains when one
// asks; rebirths too when it's been stuck a long while), buys what helps. It isn't a person, but it tells when things come.
// It plays one session out loud (seed 1), then the same over many seeds and prints the pacing table (medians, and the 10%..90% spread).
// node tests/economy.mjs [minutes]   (env: RATE treadmill steps/s, SKILL 0..1 how well it plays, SEEDS how many runs)
import {
    CFG, WORLDS, WALLS_N, POSTS, JAWBREAKERS, UPGRADES, upgradeCost, palsOf, PALS, teamMax, teamMult, stepGain, xpGain, xpNeed, padPay, maxWalk, rebirthLv, rebirthMult, postOpen,
    matchPrize, matchLv, matchInfo, worldOpen, TRAILS, fmt, clock, recLevel, strideOf, QUESTS, GIFTS, rewardSpeed, stageV, jumpV, postXp, SPIN, spinPrize, PLACES,
} from '../shared/config.js';
import { W, wallZ, stageLen, stagePlan } from '../shared/world.js';

const MINS = Number(process.argv[2] || 30), TREAD = Number(process.env.RATE || (CFG.treadRate + CFG.treadSprint) / 2), SKILL = Number(process.env.SKILL ?? 0.5), SEEDS = Number(process.env.SEEDS || 25);

// ----- each stage's speed gate, from its real layout: the walk speed a typical jump needs (2 studs early, no coyote time), and the
// least a perfect one does (from the very edge, with it) -----
const vy = jumpV(CFG.power), T = (dh) => (vy + Math.sqrt(Math.max(0, vy * vy - 2 * CFG.grav * dh))) / CFG.grav;
function gateOf(w, k) {
    const P = stagePlan(w, k);
    if (P.type === 'bounce' || P.type === 'crumble') return { typ: 0, per: 0 };
    const sup = P.plats.map((q) => ({ n: q.z + q.sz / 2, f: q.z - q.sz / 2, top: q.top, x: q.x, hx: q.sx / 2 }));
    const pits = P.lakes.map((l) => [l.z1, l.z0]).concat(P.list.filter((o) => o.kind === 'pool' && o.x1 - o.x0 > W.halfW * 1.9).map((o) => [o.z1, o.z0]));
    let typ = 0, per = 0;
    for (const [z1, z0] of pits) {
        const inside = sup.filter((s) => s.n <= z1 + 1 && s.f >= z0 - 1).sort((a, b) => b.n - a.n), chain = [];
        let at = { f: z1, top: 0, x: 0, hx: 99 };
        for (const s of inside) { if (s.n < at.f - 0.05) { chain.push([at, s]); at = s; } else if (s.f < at.f) at = { ...at, f: s.f, top: s.top }; }
        chain.push([at, { n: z0, top: 0, x: 0, hx: 99 }]);
        for (const [a, b] of chain) {
            const d = Math.hypot(a.f - b.n, Math.max(0, Math.abs(a.x - b.x) - a.hx - b.hx)), dh = b.top - a.top;
            typ = Math.max(typ, (d + 2) / T(dh)); per = Math.max(per, (d - 2) / (T(dh) + 0.1));
        }
    }
    return { typ, per };
}
const GATES = WORLDS.map((_, w) => Array.from({ length: WALLS_N }, (_, k) => gateOf(w, k)));
// how likely a try at a stage is to end in a laser or off an edge, by kind (more further in, less for a better player)
const RISK = { field: 0.02, moat: 0.06, sweeper: 0.16, sliders: 0.14, stones: 0.1, bridge: 0.14, crumble: 0.1, bounce: 0.08, gauntlet: 0.3 };

function simulate(seed, say) {
    const p = { world: 0, lv: 1, xp: 0, speed: 0, totalWins: 0, rebirths: 0, trail: 0, aura: 0, ups: {}, wins: 0, gems: 0, steps: 0, team: [], pals: {}, bests: {}, padsDone: {}, matches: 0, hatched: 0, upgrades: 0, pads: 0, tread: 0, spinsUsed: 0, podium: 0, matchWins: 0, qi: 0 };
    let t = 0, rng = seed, freeAt = 0, deaths = 0, revives = 0, gemRevives = 0, spun = 0, raceAt = 0, stuckK = -1, stuckSince = 0, at = 0;
    const R = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    const seen = new Map(), padAt = {}, tries = {}, gifts = new Set();
    const log = (s) => { if (say) console.log(clock(t).padStart(6), s); };
    const once = (k, s) => { if (!seen.has(k)) { seen.set(k, t); if (s) log(s); } };
    // Wins earned (spent or not, they count towards the treadmills)
    const gainWins = (n) => { p.wins += n; p.totalWins += n; for (let i = 1; i < POSTS.length; i++) if (!POSTS[i].gems && postOpen(p, i)) once('post' + i, 'the ' + POSTS[i].name + ' opens (x' + POSTS[i].mult + '): ' + fmt(p.totalWins) + ' Wins earned'); };
    const passChance = (k) => {
        const P = stagePlan(p.world, k), G = GATES[p.world][k], u = maxWalk(p), d = k / (WALLS_N - 1);
        let c = 1 - (RISK[P.type] ?? 0.1) * (1 + d * 0.8) * (1.4 - SKILL * 0.8);
        if (G.typ > 0) c *= u >= G.typ ? 1 : u <= G.per ? 0.02 : 0.02 + 0.98 * Math.pow((u - G.per) / (G.typ - G.per), 1.5);
        // the first tries at a stage: still learning it
        return c * Math.min(1, 0.55 + 0.15 * (tries[p.world + ':' + k] || 0) + SKILL * 0.2);
    };
    const addXp = (n) => {
        p.xp += n;
        while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; once('L' + p.lv); if (!p.rebirths && p.lv % 5 === 0) once('lv' + p.lv, 'Level ' + p.lv + ' (walk ' + maxWalk(p).toFixed(1) + ' studs/s)'); }
    };
    const step = (pm, tread, px) => { p.steps++; if (tread) p.tread++; p.speed += stepGain(p, false, p.world) * pm; addXp(xpGain(p) * (px ?? pm)); };
    const reward = (r) => { const s = rewardSpeed(r, p.lv); if (s) { p.speed += s; addXp(s); } gainWins(r.wins || 0); p.gems += r.gems || 0; };
    const questValue = (kind) => (kind === 'best' ? p.bests[0] || 0 : kind === 'spins' ? p.spinsUsed : kind === 'hatch' ? p.hatched : Math.floor(p[kind] || 0));
    const quests = () => { for (let i = 0; i < 4 && p.qi < QUESTS.length && questValue(QUESTS[p.qi].kind) >= QUESTS[p.qi].n; i++) { reward(QUESTS[p.qi]); p.qi++; } };
    const quest = () => QUESTS[p.qi] || {};
    const bestPost = () => { let b = 0; for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[b].mult) b = i; return b; };
    const best = () => p.bests[p.world] || 0;
    const bestTeam = () => {
        const own = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
        for (const a of own) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
        p.team = team;
    };
    // what it buys: walk speed first (it's what opens the stages), then XP, then the rest; a trail when a quest asks
    const WANT = ['reach', 'feet', 'scholar', 'luck', 'spring', 'soles', 'den'];
    const shop = () => {
        if (quest().kind === 'trail' && !p.trail && p.wins >= TRAILS[1].wins) { p.wins -= TRAILS[1].wins; p.trail = 1; once('tr1', 'trail: ' + TRAILS[1].name); }
        for (let go = true; go;) {
            go = false;
            for (const id of WANT) {
                const u = UPGRADES.find((x) => x.id === id), n = p.ups[id] || 0, c = upgradeCost(u, n);
                if (n < u.max && p.wins >= c * (id === 'reach' || id === 'feet' ? 1 : 1.6)) { p.wins -= c; p.ups[id] = n + 1; p.upgrades++; once('up' + id + n, n ? '' : 'upgrade: ' + u.name); go = true; break; }
            }
            if (go) continue;
            for (let j = JAWBREAKERS.length - 1; j >= 0; j--) {
                const J = JAWBREAKERS[j];
                if (p.wins < J.wins * (p.hatched ? 3 : 1)) continue;
                p.wins -= J.wins; p.hatched++;
                const list = palsOf(j), total = list.reduce((a, x) => a + x.odds, 0);
                let r = R() * total, a = list[0];
                for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
                p.pals[a.id] = (p.pals[a.id] || 0) + 1;
                bestTeam();
                once('jb' + j, 'opened the ' + J.name + ': ' + a.name + ', team x' + teamMult(p.team));
                go = true;
                break;
            }
            if (go) continue;
            const tr = TRAILS[p.trail + 1];
            if (tr && p.wins >= tr.wins * 2.5) { p.wins -= tr.wins; p.trail++; once('tr' + p.trail, 'trail: ' + tr.name + ' x' + tr.mult); go = true; }
        }
    };
    // on its best treadmill for so long (sprinting about half the time: RATE steps a second)
    const train = (secs) => { const b = bestPost(), pm = POSTS[b].mult, px = postXp(b); for (let s = 0; s < secs * TREAD; s++) step(pm, true, px); t += secs; };
    // one go at the Keyway, from stage `from` (0: from the spawn). Returns where it died (or WALLS_N: all the way)
    const runFrom = (from) => {
        const w = p.world;
        if (from === 0) t += (W.spawn.z - wallZ(0)) / maxWalk(p);
        for (let k = from; k < WALLS_N; k++) {
            const u = maxWalk(p), len = stageLen(k), key = w + ':' + k, c = passChance(k);
            tries[key] = (tries[key] || 0) + 1;
            const dies = R() > c, part = dies ? 0.25 + R() * 0.6 : 1;
            // walking it: a stride a step; a moment's wait at each laser
            const waits = stagePlan(w, k).list.filter((o) => o.kind === 'sweeper' || o.kind === 'slider').length * 0.9;
            t += (len * part) / u + waits * part;
            const n = Math.floor((len * part) / strideOf(u));
            for (let s = 0; s < n; s++) step(1, false);
            if (dies) { deaths++; return k; }
            // through its end gate: Wins (x3 the first time each rebirth), every 30 s at most
            if (t - (padAt[key] || -99) >= CFG.padCool) {
                padAt[key] = t;
                const first = !p.padsDone[key];
                p.padsDone[key] = 1;
                gainWins(padPay(p, w, k, first, false)); p.pads++;
            }
            if (k + 1 > best()) {
                p.bests[w] = k + 1;
                once('w' + w + 'k' + k, WORLDS[w].name + ' stage ' + (k + 1) + ' passed (Recommended Level ' + recLevel(w, k) + '): Level ' + p.lv + (p.rebirths ? ' (rebirth ' + p.rebirths + ')' : '') + ', walk ' + u.toFixed(0) + ', ' + fmt(p.speed) + ' Speed, ' + fmt(p.wins) + ' Wins, ' + tries[key] + ' tries');
            }
            quests(); shop();
        }
        return WALLS_N;
    };
    const rebirth = (why) => {
        if (p.lv < rebirthLv(p.rebirths)) return false;
        const lv = p.lv;
        p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0; p.padsDone = {};
        once('rb' + p.rebirths, 'REBIRTH ' + p.rebirths + ' at Level ' + lv + ' (' + why + '): x' + rebirthMult(p.rebirths) + ', ' + POSTS[bestPost()].name + ' x' + POSTS[bestPost()].mult + ' Speed, x' + postXp(bestPost()) + ' XP');
        quests();
        return true;
    };
    // a Black Hole Rush race (somewhere in the top four)
    const race = () => {
        raceAt = t;
        const lv = matchLv(p), D = matchInfo(lv), place = Math.floor(R() * 4), prize = matchPrize(place, D.segs, lv, p);
        t += D.secs * 0.5 + 12;
        gainWins(prize.wins); p.gems += prize.gems; p.speed += prize.speed; addXp(prize.speed); p.matches++;
        if (place <= 2) p.podium++;
        if (place === 0) p.matchWins++;
        once('race' + p.matches, 'race ' + p.matches + ' (' + D.segs + ' stretches): ' + PLACES[place] + ', +' + fmt(prize.wins) + ' Wins');
    };
    const end = MINS * 60;
    log('start');
    while (t < end) {
        for (let i = 0; i < GIFTS.length; i++) if (!gifts.has(i) && t >= GIFTS[i].min * 60) { gifts.add(i); reward(GIFTS[i]); }
        // the free spins (one to start with, one every few minutes): the plain Speed prize
        while (spun * CFG.spinMins * 60 <= t) { spun++; p.spinsUsed++; const z = spinPrize(SPIN[0], p); p.speed += z.speed; addXp(z.speed); }
        quests(); shop();
        // the quest says rebirth: it does; says race, or train: it does that
        const Q = quest();
        if (Q.kind === 'rebirths' && rebirth('the quest')) { at = 0; continue; }
        if ((Q.kind === 'matches' || Q.kind === 'podium' || Q.kind === 'matchWins') && t > raceAt + 60) { race(); continue; }
        if (Q.kind === 'tread') { train(20); continue; }
        // stuck: the stage it dies in is laid out for a much higher Level. Train (a minute or so at a time); after a long while stuck, rebirth
        const k = Math.min(WALLS_N - 1, best());
        if (best() < WALLS_N && passChance(k) < 0.3 && at === 0) {
            if (stuckK !== k) { stuckK = k; stuckSince = t; }
            if (t - stuckSince > 240 && rebirth('stuck at stage ' + (k + 1))) { stuckK = -1; continue; }
            once('stuck' + p.world + ':' + k + ':' + p.rebirths, 'stuck at stage ' + (k + 1) + ' (Recommended Level ' + recLevel(p.world, k) + ', Level ' + p.lv + '): training');
            train(45);
            continue;
        }
        const died = runFrom(at);
        if (died >= WALLS_N) {
            at = 0;
            if (WORLDS[p.world + 1] && worldOpen(p, p.world + 1)) { p.world++; once('world' + p.world, 'on to ' + WORLDS[p.world].name); }
            // (the next sector wants more rebirths: it rebirths as soon as it can, and trains for the next)
            else if (WORLDS[p.world + 1] && !rebirth('for ' + WORLDS[p.world + 1].name)) train(30);
            continue;
        }
        // died in stage `died`: back at the spawn. A free revive takes it back there; Gems now and then for a far one; else from the start
        t += 3;
        if (t >= freeAt) { freeAt = t + CFG.reviveFreeSecs; revives++; at = died; }
        else if (died >= 6 && p.gems >= CFG.reviveGems && R() < 0.5) { p.gems -= CFG.reviveGems; gemRevives++; at = died; }
        else at = 0;
        if (t > raceAt + 360) race();
    }
    log(`end: Level ${p.lv}, rebirths ${p.rebirths}, ${WORLDS[p.world].name} stage ${best()}, ${fmt(p.speed)} Speed, ${fmt(p.wins)} Wins, ${p.gems} Gems, ${p.steps} steps, ${deaths} deaths (${revives} free revives, ${gemRevives} for Gems), team x${teamMult(p.team)}, quest ${p.qi}/${QUESTS.length}`);
    return seen;
}

// ----- one session out loud, then the pacing over many -----
simulate(1, true);
const runs = Array.from({ length: SEEDS }, (_, i) => simulate(1 + i * 7919, false));
const q = (key, f) => { const v = runs.map((s) => (s.has(key) ? s.get(key) : Infinity)).sort((a, b) => a - b), x = v[Math.min(v.length - 1, Math.floor(f * v.length))]; return x === Infinity ? '  -  ' : clock(x); };
const row = (name, key) => '  ' + name.padEnd(30) + q(key, 0.5).padStart(7) + '   (' + q(key, 0.1) + ' .. ' + q(key, 0.9) + ')';
console.log('\nPACING: a brand-new player (skill ' + SKILL + ', ' + SEEDS + ' runs of ' + MINS + ' min): median   (10% .. 90%)');
for (const L of [5, 10, 15, 20, 25, 30]) console.log(row('Level ' + L + ' (first life)', 'lv' + L));
for (const r of [1, 2, 3]) console.log(row('rebirth ' + r, 'rb' + r));
for (let i = 1; i < 7; i++) console.log(row('the ' + POSTS[i].name + ' (x' + POSTS[i].mult + ')', 'post' + i));
console.log(row('a new world (' + WORLDS[1].name + ')', 'world1'));
console.log('  stage   rec Lv   Level rec first reached   stage passed            gate (walk needed / stage pace)');
for (let k = 0; k < WALLS_N; k++) {
    console.log('  ' + String(k + 1).padStart(5) + String(recLevel(0, k)).padStart(8) + '   ' + (q('L' + recLevel(0, k), 0.5) + ' (' + q('L' + recLevel(0, k), 0.1) + '..' + q('L' + recLevel(0, k), 0.9) + ')').padEnd(23) +
        (q('w0k' + k, 0.5) + ' (' + q('w0k' + k, 0.1) + '..' + q('w0k' + k, 0.9) + ')').padEnd(24) + GATES[0][k].typ.toFixed(0).padStart(4) + ' / ' + stageV(k).toFixed(0));
}

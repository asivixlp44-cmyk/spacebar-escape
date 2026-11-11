import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import { Match } from './Match.js';
import {
    CFG, WORLDS, WALLS_N, SHOES, TRAILS, AURAS, POSTS, postOpen, postXp, JAWBREAKERS, palById, palsOf, jbGems, teamMax, teamMult, SPIN, spinPrize, upgradeById, upgradeCost, jumpH, jumpV, jumpPowerOf, xpNeed,
    stepGain, xpGain, maxWalk, rebirthLv, recLevel, stageV, strideOf, padPay, padWins, worldOpen, worldReb, titleOf, TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, PACKS, rewardText, rewardSpeed, clamp, BOT_NAMES, PLACES, PALS,
} from '../../shared/config.js';
import { W, hubFor, wallZ, passedArch, nearPost, postSpot, northEnd, stageAt, checkpoint, BELT, stagePlan, inPool, sliderAt, SLIDER } from '../../shared/world.js';
import { SWEEP, sweeperAngle, TRAMP, TILE, onPlat } from '../../shared/stages.js';
import { newBody, stepBody, moveBudget } from '../../shared/physics.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Runner' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// the most a dash and a boost together make you go
const BURST = 2.0;
// how far a move may go, studs a second, at a top walk speed v (a dash, a boost, a spring key's throw: a little over it for a while;
// the server's guard never trusts the screen's own Custom Speed, only your Level's)
const moveRate = (v) => Math.max(v * 1.6 + 8, 46);

export const liveRooms = new Set();

// One server: up to 16 players training on the same plaza (a few bots keep it lively when it's quiet). Moving is client-side;
// every step, every gate passed, every death and revive and everything that earns or costs anything is counted and checked here.
// A life: from the spawn (or a revive, a warp) to the next death; the server remembers the stages your position was in during it.
export class RunRoom extends Room {
    maxClients = CFG.maxPlayers;
    // (a real client sends well under a hundred: its moves, its steps, a ping)
    maxMessagesPerSecond = 160;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.bots = [];
        this.race = new Match(this);
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('step', this.onStep);
        on('pad', this.onPadTouch);
        on('warp', this.onWarp);
        on('fell', this.onFell);
        on('candy', this.onCandy);   // (golden keys: none any more)
        on('revive', this.onRevive);
        on('respawn', this.onRespawn);
        on('shoe', this.onBuyShoe);
        on('upgrade', this.onUpgrade);
        on('trail', this.onTrail);
        on('aura', this.onAura);
        on('post', this.onBuyPost);
        on('hatch', this.onHatch);
        on('team', this.onTeam);
        on('teamBest', this.onTeamBest);
        on('rebirth', this.onRebirth);
        on('world', this.onWorld);
        on('spin', this.onSpin);
        on('pack', this.onPack);
        on('x2', this.onX2);
        on('w2', this.onW2);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        // (opening Quests: how far the daily tasks have got)
        on('want', (client) => { const s = this.sessions.get(client.sessionId), now = Date.now(); if (s && now - (s.wantAt || 0) > 1000) { s.wantAt = now; this.sendProfile(s); } });
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('play', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.press(s, m); });
        on('unplay', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.cancel(s); });
        on('quit', this.onQuit);
        on('mItem', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.item(s, m.i); });
        on('mFell', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.fell(s, m.i); });
        on('mHit', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.hit(s); });
        on('mFinish', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.finish(s); });
        // QA only (QA=1, never on Legion): give yourself Wins, Gems, levels...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.fillBots();
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // (the guest's copy was only loaded to look at: once it's been handed over, it doesn't stay in this server's memory)
        if (uid !== guest && !isOnline(guest)) releaseProfile(guest, isOnline);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        const now = Date.now();
        Object.assign(player, { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z, ry: Math.PI, t: now, world: profile.world || 0 });
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, ack: 0, tokens: 0, tokAt: 0, ttok: 0, ttokAt: 0,
            gifts: {}, last: { x: player.x, y: 0, z: player.z }, lastAt: now, snapAt: 0, warpAt: 0, stepAt: 0, distAcc: 0, fellAt: 0,
            // dead: the revive offer while it's open ({ k, why, at, until }); life: this life's stages (newLife)
            dead: null, life: null, match: null, racer: null, queued: false,
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, steps: 0, wins: 0, pads: 0, cleared: 0, best: 0, buys: 0, hatch: 0, lv0: profile.lv, rb0: profile.rebirths, matches: 0, matchWins: 0, deaths: 0, revives: 0,
                touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstPadAt: 0, firstMatchAt: 0,
            },
        };
        this.newLife(s, -1);
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_') });
        profile.lastSeen = now;
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        this.fillBots();
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['wins', 'totalWins', 'totalSpeed', 'topSpeed', 'gems', 'xp', 'speed', 'rebirths', 'shoe', 'trail', 'aura', 'steps', 'megas', 'cleared', 'escapes', 'catches', 'spins', 'spinsUsed', 'pads', 'upgrades', 'hatched', 'playtime', 'lastSeen', 'qi', 'tut', 'x2Until', 'w2Until', 'world', 'matches', 'matchWins', 'podium', 'deaths', 'revives', 'tread', 'freeReviveAt']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems);
        p.lv = clamp(Math.floor(num(p.lv, 1)), 1, 999);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.world = clamp(Math.floor(p.world), 0, WORLDS.length - 1);
        // (reach: per world, the furthest stage you've been in this rebirth: TELEPORT goes that far)
        for (const k of ['daily', 'codes', 'seen', 'jq', 'padsDone', 'bests', 'ups', 'trails', 'auras', 'posts', 'pals', 'index', 'jbDone', 'times', 'reach']) p[k] = obj(p[k]);
        if (!worldOpen(p, p.world)) p.world = 0;
        p.shoe = clamp(Math.floor(p.shoe), 0, SHOES.length - 1);
        p.trail = clamp(Math.floor(p.trail), 0, TRAILS.length - 1);
        p.aura = clamp(Math.floor(p.aura), 0, AURAS.length - 1);
        p.topSpeed = Math.max(p.topSpeed, p.speed);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.pals)) { if (!palById[id]) delete p.pals[id]; else p.pals[id] = Math.max(0, num(p.pals[id], 0) | 0); }
        p.team = (Array.isArray(p.team) ? p.team : []).filter((id) => p.pals[id] > 0).slice(0, teamMax(p));
        p.jq = { day: String(p.jq.day || ''), list: Array.isArray(p.jq.list) ? p.jq.list.slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) : [] };
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
        if (!p.padAt || typeof p.padAt !== 'object' || Array.isArray(p.padAt)) p.padAt = {};
        p.spinSecs = Math.max(0, num(p.spinSecs, 0) | 0);
    }

    // A dropped connection has 30 seconds to come back. Meanwhile they aren't shown in the world, and in a race a bot takes over after
    // a few seconds (tick). kickOthers ends the wait if they turn up in a new session instead.
    onDrop(client) {
        const r = this.allowReconnection(client, 30), s = this.sessions.get(client.sessionId);
        r.catch(() => {});
        if (!s) return;
        s.recon = r; s.dropAt = Date.now();
        s.player.world = OFFSTAGE;
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client; s.recon = null;
        kickOthers(s.profile.uid, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        // (back in the stage you were in: its checkpoint)
        if (!s.match && !s.dead) {
            const k = stageAt(s.last.z);
            if (k >= 0 && k < WALLS_N) this.toCheckpoint(s, k, 'back');
        }
        this.race.resync(s, { w: s.profile.world, x: s.last.x, z: s.last.z });
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) this.race.leave(s, true);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        this.fillBots();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            steps: st.steps, cleared: st.cleared, wins: st.wins, pads: st.pads, best: st.best, buys: st.buys, hatch: st.hatch, lv0: st.lv0, lv: p.lv, rb0: st.rb0, rb: p.rebirths, matches: st.matches, matchWins: st.matchWins, deaths: st.deaths, revives: st.revives,
            firstPad: st.firstPadAt ? Math.round((st.firstPadAt - s.joinedAt) / 1000) : -1, firstMatch: st.firstMatchAt ? Math.round((st.firstMatchAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name; pl.lv = p.lv; pl.wins = p.totalWins; pl.world = s.recon ? OFFSTAGE : p.world;
        pl.shoe = p.shoe; pl.trail = p.trail; pl.aura = p.aura;
        pl.team = (p.team || []).join(',');
        pl.title = titleOf(p.cleared);
    }
    x2On(p, now) { return (p.x2Until || 0) > (now || Date.now()); }
    w2On(p, now) { return (p.w2Until || 0) > (now || Date.now()); }
    // The player's private progress: straight away for anything they clicked on; while running, four times a second, only
    // what changes then (the rest of it isn't sent over and over)
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            wins: Math.floor(p.wins), totalWins: Math.floor(p.totalWins), totalSpeed: Math.floor(p.totalSpeed), topSpeed: Math.floor(p.topSpeed), gems: p.gems, xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv), ack: s.ack,
            rebirths: p.rebirths, shoe: p.shoe, trail: p.trail, aura: p.aura, trails: p.trails, auras: p.auras, posts: p.posts, ups: p.ups, upgrades: p.upgrades,
            steps: p.steps, megas: p.megas, cleared: p.cleared, escapes: p.escapes, catches: p.catches, bests: p.bests, padsDone: p.padsDone, pals: p.pals, team: p.team, hatched: p.hatched, index: p.index,
            spins: p.spins, spinIn: Math.max(0, CFG.spinMins * 60 - p.spinSecs), spinsUsed: p.spinsUsed, pads: p.pads, world: p.world, matches: p.matches, matchWins: p.matchWins, podium: p.podium,
            x2Until: p.x2Until, w2Until: p.w2Until,
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
            candies: p.candies, candyN: p.candyN,
            deaths: p.deaths, revives: p.revives, tread: p.tread, freeReviveAt: p.freeReviveAt, reach: p.reach,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile;
        s.dirtyAt = 0;
        this.checkQuests(s);
        // a quest or task just came good: there's more to tell than the short message holds
        if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); return; }
        const m = { xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv), ack: s.ack, steps: p.steps, tread: p.tread, cleared: p.cleared, deaths: p.deaths, wins: Math.floor(p.wins), totalSpeed: Math.floor(p.totalSpeed), bests: p.bests };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    payWins(s, n, name) { const p = s.profile; if (p.wins < n) { this.broke(s, n - p.wins, name, 'wins'); return false; } p.wins -= n; s.stats.buys++; return true; }
    payGems(s, n, name) { const p = s.profile; if (p.gems < n) { this.broke(s, n - p.gems, name, 'gems'); return false; } p.gems -= n; s.stats.buys++; return true; }
    giveReward(s, r, why) {
        const p = s.profile, speed = rewardSpeed(r, p.lv);
        // (a reward's Speed comes with as much XP)
        if (speed) { this.addSpeed(s, speed); this.addXp(s, speed); }
        if (r.wins) this.addWins(s, r.wins);
        if (r.gems) p.gems += r.gems;
        if (r.spins) p.spins += r.spins;
        if (r.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + r.x2 * 60000;
        const shown = { ...r, speed };
        if (why) this.sendTo(s, 'reward', { text: rewardText(shown), why, gems: r.gems || 0 });
        return shown;
    }
    addWins(s, n) {
        const p = s.profile;
        p.wins += n; p.totalWins += n; s.stats.wins += n;
        this.task(s, 'wins', n);
    }
    // Speed: the big number (and the leaderboard's)
    addSpeed(s, n) {
        const p = s.profile;
        p.speed += n; p.totalSpeed += n;
        if (p.speed > p.topSpeed) p.topSpeed = p.speed;
    }
    // XP fills the Level bar (no cap; what's over carries on into the next Level)
    addXp(s, n) {
        const p = s.profile;
        p.xp += n;
        let ups = 0;
        while (p.lv < 999 && p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; ups++; }
        if (ups) {
            this.task(s, 'levels', ups);
            this.sendTo(s, 'levelup', { lv: p.lv, xp: r1(p.xp), need: xpNeed(p.lv), walk: r1(maxWalk(p)), cap: false });
            s.player.lv = p.lv;
        }
    }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'spins') return p.spinsUsed;
        if (kind === 'best') return (p.bests && p.bests[0]) || 0;
        if (kind === 'hatch') return p.hatched;
        return Math.floor(p[kind] || 0);
    }
    // a quest done pays at once, and the next one comes up
    checkQuests(s) {
        const p = s.profile;
        for (let k = 0; k < 4 && p.qi < QUESTS.length; k++) {
            const Q = QUESTS[p.qi];
            if (this.questValue(p, Q.kind) < Q.n) break;
            p.qi++;
            this.giveReward(s, Q);
            this.sendTo(s, 'questdone', { text: Q.text, reward: rewardText(Q), wins: Q.wins || 0 });
            s.jqDirty = true;
        }
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: the bots, the races, the revive offers; every second: playtime, free spins -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        // (whatever goes wrong in one tick, the room and everyone in it carry on)
        try {
            for (const b of this.bots) this.driveBot(b, now, dt);
            this.race.update(now, dt);
            // a revive offer nobody took: gone (a moment's grace for an answer on its way)
            for (const s of this.sessions.values()) if (s.dead && now > s.dead.until + 3000) s.dead = null;
            this.secAcc += dt;
            if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
            for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
        } catch (e) { console.warn('[update]', e.message); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            // gone for now: their clocks wait; in a race, a bot carries on for them after a few seconds
            if (s.recon) { if (s.match && now - s.dropAt > DROP_MATCH_MS) this.sendHome(s); continue; }
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            if (p.spins < CFG.spinMax) { p.spinSecs++; if (p.spinSecs >= CFG.spinMins * 60) { p.spinSecs = 0; p.spins++; this.toast(s, '🎡 A free spin is ready!', GOLD); this.changed(s); } } else p.spinSecs = 0;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }

    // ----- lives: where you (re)start, the stages you're in, dying, reviving -----
    // a new life from stage k (-1: the Starport): the stages your position has been in since (a bit each), the furthest
    newLife(s, k) { s.life = { from: k, maxK: k, bits: k >= 0 && k < WALLS_N ? 1 << k : 0 }; }
    // a move from z0 to z1: every stage on the way is one you've been in this life (and this rebirth: TELEPORT goes that far)
    lifeMove(s, z0, z1) {
        const L = s.life, p = s.profile, ka = Math.max(0, stageAt(Math.max(z0, z1))), kb = Math.min(WALLS_N - 1, stageAt(Math.min(z0, z1)));
        for (let k = ka; k <= kb; k++) { L.bits |= 1 << k; if (k > L.maxK) L.maxK = k; }
        if (L.maxK > (finite(p.reach[p.world]) ? p.reach[p.world] : -1)) p.reach[p.world] = L.maxK;
    }
    // somewhere new by the server's word: the moves still on their way from where you were are dropped (no snap) until one arrives from
    // there, and the move guard starts afresh
    placeAt(s, x, y, z) { const now = Date.now(); s.last = { x, y, z }; s.homeAt = now; s.lastAt = now; s.moveB = undefined; }
    // to the start of stage k (back from a dropped connection), a new life from there
    toCheckpoint(s, k, why) {
        const cp = checkpoint(k);
        s.dead = null;
        this.placeAt(s, cp.x, 0, cp.z);
        this.newLife(s, k);
        this.sendTo(s, 'warped', { x: cp.x, y: 0, z: cp.z, why });
    }
    // your screen saw you die (a rift, a laser) in stage k: you're at the spawn now; a revive into the stage you died in is on offer for
    // a while (FREE every few minutes, else Gems). The stage is never further than your position got this life
    onFell(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || s.match || now - s.fellAt < 400) return;
        s.fellAt = now;
        const p = s.profile, L = s.life, ask = finite(m.k) ? clamp(m.k | 0, 0, WALLS_N - 1) : L.maxK, k = clamp(ask, 0, Math.max(0, L.maxK)), why = m.why === 'laser' ? 'laser' : 'pit';
        this.placeAt(s, W.spawn.x, 0, W.spawn.z);
        this.newLife(s, -1);
        const pl = s.player;
        pl.x = W.spawn.x; pl.y = 0; pl.z = W.spawn.z; pl.t = now; pl.anim = 0;
        s.dead = { k, why, at: now, until: now + CFG.reviveOffer * 1000 };
        p.deaths++; s.stats.deaths++;
        const free = now >= (p.freeReviveAt || 0);
        this.sendTo(s, 'died', { k, why, free, cost: free ? 0 : CFG.reviveGems, until: s.dead.until, freeAt: p.freeReviveAt || 0 });
        this.dirty(s);
    }
    // the revive offer taken: into the stage you died in, just inside its gate. FREE once every few minutes, else Gems
    onRevive(client) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || s.match || !s.dead || now > s.dead.until + 2000) return;
        const p = s.profile, k = s.dead.k, free = now >= (p.freeReviveAt || 0);
        if (free) p.freeReviveAt = now + CFG.reviveFreeSecs * 1000;
        else if (!this.payGems(s, CFG.reviveGems, 'a revive')) return;
        s.dead = null;
        const cp = checkpoint(k);
        this.placeAt(s, cp.x, 0, cp.z);
        this.newLife(s, k);
        p.revives++; s.stats.revives++;
        this.sendTo(s, 'revived', { k, x: cp.x, y: 0, z: cp.z, free, freeAt: p.freeReviveAt });
        this.changed(s);
    }
    // no thanks: the offer goes, you stay at the spawn
    onRespawn(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || !s.dead) return;
        s.dead = null;
        this.sendTo(s, 'warped', { x: s.last.x, y: 0, z: s.last.z, why: 'back' });
    }

    // ----- moving -----
    // where a player says they are: checked against how far their Level's walk speed could have taken them, and how high they can jump
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now(), p = s.profile, L = s.last;
        const dt = (now - s.lastAt) / 1000;
        s.lastAt = now;
        if (s.match) {
            if (!this.race.move(s, m, dt)) { L.x = m.x; L.y = m.y; L.z = m.z; this.setPublicMove(s, m, now); }
            return;
        }
        // just sent somewhere (a death, a revive, a warp, a rebirth, a world): the moves still on their way from where they were are
        // dropped (no snap) until they arrive
        if (s.homeAt) {
            if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 6) return;
            s.homeAt = 0;
        }
        const v = maxWalk(p), maxY = jumpH(jumpPowerOf(p)) + 12, dist = Math.hypot(m.x - L.x, m.z - L.z);
        const bad = !moveBudget(s, dist, moveRate(v), dt) || m.y > maxY || m.y < -40 || m.z < northEnd - 3 || m.z > W.plaza.z1 + 3 || Math.abs(m.x) > W.plaza.x1 + 3 || (m.z < W.plaza.z0 - 3 && Math.abs(m.x) > W.halfW + 3);
        if (bad) {
            if (now - s.snapAt > 300) { s.snapAt = now; this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z }); if (process.env.QA === '1') console.log('[snap]', p.name, 'from', [L.x, L.y, L.z].map((x) => +x.toFixed(1)), 'to', [m.x, m.y, m.z].map((x) => +x.toFixed(1)), 'dt', +dt.toFixed(2)); }
            return;
        }
        // strides for steps on the ground (a step needs the ground under it)
        if (m.y < 0.6 || m.a === 1) s.distAcc = Math.min(60, s.distAcc + dist);
        this.lifeMove(s, L.z, m.z);
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.setPublicMove(s, m, now);
        const post = finite(m.post) ? m.post | 0 : -1;
        s.player.post = m.a === 3 && post >= 0 && post < POSTS.length && postOpen(p, post) && nearPost(post, m.x, m.z, 6) ? post : 255;
        s.player.spd = clamp(finite(m.v) ? m.v : v, 0, v * BURST);
    }
    setPublicMove(s, m, now) {
        const pl = s.player;
        pl.x = m.x; pl.y = m.y; pl.z = m.z; pl.ry = finite(m.ry) ? m.ry : 0; pl.anim = finite(m.a) ? clamp(m.a | 0, 0, 3) : 0;
        pl.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    // ----- steps: from your screen, counted here. n of them, on a treadmill (post) or on the ground -----
    token(s, now, tread) {
        if (tread) {
            const rate = CFG.treadSprint * 1.12, cap = 14;
            s.ttok = Math.min(cap, (s.ttokAt ? s.ttok : cap) + (now - (s.ttokAt || now)) / 1000 * rate);
            s.ttokAt = now;
            if (s.ttok < 1) return false;
            s.ttok -= 1;
            return true;
        }
        s.tokens = Math.min(CFG.stepBurst, (s.tokAt ? s.tokens : CFG.stepBurst) + (now - (s.tokAt || now)) / 1000 * CFG.stepRate);
        s.tokAt = now;
        if (s.tokens < 1) return false;
        s.tokens -= 1;
        return true;
    }
    // every step: Speed (stepGain) and XP (xpGain), a treadmill's multipliers on top (mult for Speed, xp for XP)
    onStep(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.n)) return;
        if (finite(m.s)) s.ack = Math.max(s.ack, m.s | 0);
        if (s.match) return;
        const now = Date.now(), p = s.profile, w = p.world, L = s.last, n = clamp(m.n | 0, 0, 30), x2 = this.x2On(p, now);
        let post = finite(m.post) ? m.post | 0 : -1;
        if (post >= 0 && (post >= POSTS.length || !postOpen(p, post) || !nearPost(post, L.x, L.z, 7))) post = -1;
        // (a stride at the pace you're going, never more than your Level's)
        const pm = post >= 0 ? POSTS[post].mult : 1, px = post >= 0 ? postXp(post) : 1, stride = strideOf(clamp(s.player.spd || 0, CFG.walk, maxWalk(p))) * 0.7;
        let got = 0;
        for (let i = 0; i < n; i++) {
            if (!this.token(s, now, post >= 0)) break;
            if (post < 0) { if (s.distAcc < stride) break; s.distAcc -= stride; }
            got++;
            p.steps++; s.stats.steps++;
            this.addSpeed(s, stepGain(p, x2, w) * pm);
            this.addXp(s, xpGain(p) * px);
        }
        if (got) { this.task(s, 'steps', got); s.stepAt = now; if (post >= 0) { p.tread += got; this.task(s, 'tread', got); } }
        this.dirty(s);
    }
    // through stage k's end gate: your position (the server's) past its line (a few studs' slack), in that stage this life, not too
    // soon after the last time. Wins (x3 the first time each rebirth). (A revive offer still open doesn't matter: a death starts a new
    // life at the spawn, so running back up from there through the gates pays as it should)
    onPadTouch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || !finite(m.k)) return;
        const p = s.profile, k = m.k | 0, L = s.last, now = Date.now(), w = p.world;
        if (k < 0 || k >= WALLS_N || !passedArch(k, L.z, W.archSlack) || !(s.life.bits & (1 << k))) return;
        const key = w + ':' + k;
        if (now - (p.padAt[key] || 0) < CFG.padCool * 1000) return;
        p.padAt[key] = now;
        const first = !p.padsDone[key];
        p.padsDone[key] = 1;
        const n = padPay(p, w, k, first, this.w2On(p, now));
        this.addWins(s, n);
        p.pads++; s.stats.pads++;
        p.cleared++; s.stats.cleared++;
        this.task(s, 'cleared', 1);
        if (k >= 4) this.task(s, 'pads', 1);
        if (k + 1 > (p.bests[w] || 0)) { p.bests[w] = k + 1; s.stats.best = Math.max(s.stats.best, k + 1); }
        if (!s.stats.firstPadAt) s.stats.firstPadAt = now;
        this.sendTo(s, 'padok', { k, wins: n, n, first, cool: CFG.padCool });
        this.changed(s);
    }
    // (golden keys: there are none in the stages any more)
    onCandy(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s) this.sendTo(s, 'candy', { ok: false, k: m.k | 0, i: m.i | 0 });
    }
    // the quick ways round: the plaza, your best open treadmill, any stage you've been in this rebirth
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const now = Date.now(), p = s.profile;
        if (now - s.warpAt < 700) return;
        s.warpAt = now;
        let to = { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z }, k = -1;
        if (m.to === 'post') {
            let best = 0;
            for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
            const sp = postSpot(best);
            to = { x: sp.x, y: 0, z: sp.z + BELT.l / 2 + 2.5 };
        } else if (m.to === 'stage') {
            const top = Math.min(WALLS_N - 1, finite(p.reach[p.world]) ? p.reach[p.world] : 0);
            k = clamp(m.k | 0, 0, Math.max(0, top));
            const cp = checkpoint(k);
            to = { x: cp.x, y: 0, z: cp.z };
        }
        s.dead = null;
        this.placeAt(s, to.x, to.y, to.z);
        this.newLife(s, k);
        this.sendTo(s, 'warped', { ...to, k });
    }

    // ----- spending: upgrades, trails, auras, treadmills, Star Capsules, rebirths, worlds -----
    // (boots: gone from the game; a request for the next pair is ignored)
    onBuyShoe() {}
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = upgradeById[m.id];
        if (!u) return;
        const n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (!this.payWins(s, upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++;
        if (u.id === 'den' && !p.teamSet) this.bestTeam(p);
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    onTrail(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = TRAILS[i];
        if (!X) return;
        if (!p.trails[X.id] && i > 0) { if (!this.payWins(s, X.wins, X.name)) return; p.trails[X.id] = 1; this.sendTo(s, 'bought', { what: 'trail', i }); }
        p.trail = i;
        this.changed(s);
    }
    onAura(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = AURAS[i];
        if (!X) return;
        if (!p.auras[X.id] && i > 0) { if (!this.payGems(s, X.gems, X.name)) return; p.auras[X.id] = 1; this.sendTo(s, 'bought', { what: 'aura', i }); }
        p.aura = i;
        this.changed(s);
    }
    onBuyPost(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = POSTS[m.i | 0];
        if (!c || !c.gems || p.posts[c.id]) return;
        if (!this.payGems(s, c.gems, c.name)) return;
        p.posts[c.id] = 1;
        this.sendTo(s, 'bought', { what: 'post', i: m.i | 0 });
        this.changed(s);
    }
    // a Rift Core: Wins for one or three, its odds say who's inside
    onHatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, j = m.j | 0, J = JAWBREAKERS[j], n = m.n === 3 ? 3 : 1;
        if (!J) return;
        if (!this.payWins(s, J.wins * n, J.name)) return;
        const list = palsOf(j), got = [], total = list.reduce((a, x) => a + x.odds, 0);
        for (let i = 0; i < n; i++) {
            let r = Math.random() * total, a = list[0];
            for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
            p.pals[a.id] = (p.pals[a.id] || 0) + 1;
            p.hatched++; s.stats.hatch++;
            got.push({ id: a.id, fresh: !p.index[a.id] });
            p.index[a.id] = 1;
        }
        this.task(s, 'hatch', n);
        // the best of what you own goes on your team by itself until you've chosen for yourself
        if (!p.teamSet) this.bestTeam(p);
        let done = 0;
        if (!p.jbDone[J.id] && list.every((x) => p.index[x.id])) { p.jbDone[J.id] = 1; done = jbGems(j); p.gems += done; }
        this.sendTo(s, 'hatched', { j, got, done, mult: teamMult(p.team) });
        this.changed(s);
    }
    bestTeam(p) {
        const owned = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
        for (const a of owned) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
        p.team = team;
    }
    onTeam(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || ''), i = p.team.indexOf(id);
        if (!palById[id] || !p.pals[id]) return;
        if (m.on === false) { if (i >= 0) p.team.splice(i, 1); } else {
            const have = p.team.filter((x) => x === id).length;
            if (p.team.length >= teamMax(p) || have >= p.pals[id]) { this.toast(s, 'Your team is full', RED); return; }
            p.team.push(id);
        }
        p.teamSet = 1;
        this.changed(s);
    }
    onTeamBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.profile.teamSet = 0;
        this.bestTeam(s.profile);
        this.changed(s);
    }
    // rebirth: at Level 10 the first time, 5 more each time after (it costs nothing). Speed, Level and XP back to the start (and the
    // gates' first-time x3 again); Wins, Gems, pets, upgrades, trails, auras and worlds kept; every step x0.5 more for good
    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, need = rebirthLv(p.rebirths);
        if (p.lv < need) { this.toast(s, 'Rebirth needs Level ' + need, RED); return; }
        p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0;
        p.padsDone = {};
        p.padAt = {};
        p.reach = {};
        s.player.lv = 1;
        s.dead = null;
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.task(s, 'rebirth', 1);
        this.sendTo(s, 'reborn', { r: p.rebirths, x: sx, z: W.spawn.z, next: rebirthLv(p.rebirths) });
        this.changed(s);
    }
    onWorld(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, w = clamp(m.w | 0, 0, WORLDS.length - 1);
        if (w === p.world) return;
        if (!worldOpen(p, w)) {
            const cleared = ((p.bests && p.bests[w - 1]) || 0) >= WALLS_N, reb = worldReb(w);
            this.toast(s, '🔒 ' + WORLDS[w].name + ': ' + (cleared ? 'needs ' + reb + ' rebirths (you have ' + (p.rebirths || 0) + ')' : 'pass the last gate of ' + WORLDS[w - 1].name + (reb > (p.rebirths || 0) ? ' and rebirth ' + reb + ' times' : '')), RED);
            return;
        }
        p.world = w;
        s.dead = null;
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'warp', { w, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins < 1) return;
        p.spins--; p.spinsUsed++;
        let r = Math.random() * SPIN.reduce((a, x) => a + x.w, 0), i = 0;
        for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; }
        const prize = spinPrize(SPIN[i], p);
        if (prize.speed) { this.addSpeed(s, prize.speed); this.addXp(s, prize.speed); }
        if (prize.wins) this.addWins(s, prize.wins);
        if (prize.gems) p.gems += prize.gems;
        if (prize.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + prize.x2 * 60000;
        this.task(s, 'spins', 1);
        this.sendTo(s, 'spun', { i, text: rewardText(prize) });
        this.changed(s);
    }
    onPack(client, m) {
        const s = this.sessions.get(client.sessionId), k = s && PACKS.find((x) => x.id === m.id);
        if (!k || !this.payGems(s, k.gems, k.wins + ' Wins')) return;
        const n = Math.round(k.wins * WORLDS[s.profile.world].wins);
        this.addWins(s, n);
        this.toast(s, '+' + n + ' Wins!', GOLD);
        this.changed(s);
    }
    onX2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostP2Gems, 'x2 Speed')) return;
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.boostP2Mins * 60000;
        this.toast(s, 'x2 Speed for ' + CFG.boostP2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    onW2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostW2Gems, 'x2 Wins')) return;
        const p = s.profile;
        p.w2Until = Math.max(Date.now(), p.w2Until || 0) + CFG.boostW2Mins * 60000;
        this.toast(s, 'x2 Wins for ' + CFG.boostW2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    // ----- a race's end, on the room's side: what the player gets -----
    onMatchEnd(s, r, prize, rows, mt) {
        const p = s.profile;
        p.matches++; s.stats.matches++;
        if (!s.stats.firstMatchAt) s.stats.firstMatchAt = Date.now();
        if (r.place === 0) { p.matchWins++; s.stats.matchWins++; }
        if (r.place <= 2) p.podium++;
        this.addWins(s, prize.wins);
        p.gems += prize.gems;
        this.addSpeed(s, prize.speed); this.addXp(s, prize.speed);
        this.task(s, 'matches', 1);
        const sx = W.spawn.x + rnd(-4, 4);
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'mEnd', { place: r.place, prize, rows, spot: r.spot, lv: mt.lv, w: p.world, x: sx, z: W.spawn.z, placeName: PLACES[r.place] });
        this.changed(s);
    }
    onQuit(client) {
        const s = this.sessions.get(client.sessionId);
        // (the clock's run out already: the prize is a moment away, there's nothing to leave)
        if (!s || !s.match || s.match.phase === 'done') return;
        this.sendHome(s);
    }
    // out of the race, a bot in their place, back on the plaza
    sendHome(s) {
        this.race.leave(s, true);
        const sx = W.spawn.x + rnd(-4, 4), p = s.profile;
        this.placeAt(s, sx, 0, W.spawn.z);
        this.newLife(s, -1);
        this.sendTo(s, 'mBack', { w: p.world, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    // the race takes you: no revive waiting
    toRace(s) { s.dead = null; this.newLife(s, -1); }

    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        const shown = this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(shown, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        // (only the worlds' "new" flags are ever kept)
        if (typeof m.seen === 'string' && /^w\d$/.test(m.seen)) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        if (Array.isArray(m.errs)) for (const e of m.errs.slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { wins: row('totalWins', (p) => Math.floor(p.totalWins || 0)), speed: row('topSpeed', (p) => Math.floor(p.topSpeed || 0)), race: row('matchWins', (p) => Math.floor(p.matchWins || 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.wins)) { p.wins += m.wins; p.totalWins += Math.max(0, m.wins); }
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.lv)) { p.lv = clamp(m.lv | 0, 1, 999); p.xp = 0; }
        if (finite(m.speed)) { p.speed = Math.max(0, m.speed); p.topSpeed = Math.max(p.topSpeed, p.speed); }
        if (finite(m.rebirths)) p.rebirths = clamp(m.rebirths | 0, 0, 99);
        if (finite(m.shoe)) p.shoe = clamp(m.shoe | 0, 0, SHOES.length - 1);
        if (finite(m.reviveAt)) p.freeReviveAt = Math.max(0, m.reviveAt);
        if (m.ups && typeof m.ups === 'object') for (const id of Object.keys(m.ups)) { const u = upgradeById[id]; if (u) p.ups[id] = clamp(m.ups[id] | 0, 0, u.max); }
        if (finite(m.steps)) p.steps = Math.max(0, m.steps | 0);
        if (finite(m.spins)) p.spins = clamp(m.spins | 0, 0, 99);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (finite(m.best)) { p.bests[p.world] = clamp(m.best | 0, 0, WALLS_N); }
        if (m.openWorlds) { for (let w = 0; w < WORLDS.length; w++) p.bests[w] = WALLS_N; p.rebirths = Math.max(p.rebirths, worldReb(WORLDS.length - 1)); }
        if (m.allPals) { for (const a of PALS) { p.pals[a.id] = (p.pals[a.id] || 0) + 1; p.index[a.id] = 1; } this.bestTeam(p); }
        if (finite(m.lv)) s.player.lv = p.lv;
        // every bot off to the Keyway now (to watch them run it)
        if (m.botsRun) for (const b of this.bots) if (!b.run) { b.hang = 0; b.post = -1; b.pl.post = 255; b.goal = { x: rnd(-4, 4), z: wallZ(0) - 3, run: true }; b.until = Date.now() + 60000; }
        // a QA teleport: where the next move is checked from (a new life from where it lands, like a warp)
        if (Array.isArray(m.tp) && m.tp.every(finite)) { s.last = { x: m.tp[0], y: m.tp[1], z: m.tp[2] }; s.lastAt = Date.now(); s.homeAt = 0; s.moveB = undefined; s.dead = null; this.newLife(s, clamp(stageAt(m.tp[2]), -1, WALLS_N - 1)); }
        this.changed(s);
    }

    // ----- the bots: a few runners about when it's quiet (each real player sends one home): on a treadmill a while, wandering over to
    // the next thing, and runs up the Keyway at their Level's walk speed (they level up as they go). On the course they run on rails
    // over the real stage (its platforms, rifts and lasers, on the server's clock): a jump too short for their speed, or a laser they
    // misjudge, ends the run as it would anyone's: down, back at the spawn (now and then a revive into the stage) -----
    fillBots() {
        // (QA: no bots at all, for a clean shot)
        const want = process.env.NO_BOTS && !process.env.BLOXITY_GAME_ID ? 0 : Math.max(0, CFG.bots - this.sessions.size);
        while (this.bots.length > want) { const b = this.bots.pop(); this.state.players.delete(b.id); }
        const used = new Set([...this.state.players.values()].map((p) => p.name));
        while (this.bots.length < want) {
            const id = 'bot' + Math.floor(Math.random() * 1e9);
            let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            for (let i = 0; used.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (i > 10 ? i : '');
            used.add(name);
            const lv = Math.floor(rnd(2, 27)), pl = new PlayerState(), x = rnd(-30, 30), z = rnd(62, 98);
            const team = Array.from({ length: Math.floor(rnd(0, 3)) }, () => (Math.random() < 0.6 ? 'rookie' : 'lunar') + Math.floor(rnd(0, 5))).join(',');
            Object.assign(pl, { name, bot: true, pid: this.freePid(), lv, wins: Math.floor(rnd(5, 600)), x, y: 0, z, t: Date.now(), world: 0, shoe: 0, team, title: titleOf(lv), trail: Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0 });
            pl.av = botAvatar();
            this.state.players.set(id, pl);
            this.bots.push({ id, pl, lv, v: maxWalk({ lv }), skill: rnd(0.55, 0.95), lvAt: Date.now() + rnd(30000, 80000), body: newBody(x, 0, z), goal: null, until: 0, next: 0, post: -1, hang: 0, run: null });
        }
    }
    driveBot(b, now, dt) {
        const pl = b.pl;
        // a Level every minute or so (its walk speed with it)
        if (now > b.lvAt) { b.lvAt = now + rnd(45000, 90000); if (b.lv < 45) { b.lv++; b.v = maxWalk({ lv: b.lv }); pl.lv = b.lv; } }
        if (b.run) { this.botRun(b, now, dt); return; }
        const T = hubFor(0), body = b.body;
        const inp = { mx: 0, mz: 0, jump: false, hold: true, power: CFG.power, double: false, speed: b.v / CFG.walk };
        // on a treadmill: running in place
        if (b.hang > now) { pl.anim = 3; pl.post = b.post; pl.t = now; pl.spd = 22; return; }
        if (b.post >= 0) { b.post = -1; pl.post = 255; b.goal = null; }
        if (!b.goal || now > b.until) {
            const r = Math.random();
            if (r < 0.45) { const pi = [0, 1, 2, 3][Math.floor(rnd(0, 4))], sp = postSpot(pi); b.goal = { x: sp.x, z: sp.z, post: pi }; }
            else if (r < 0.85) b.goal = { x: rnd(-6, 6), z: wallZ(0) - 3, run: true };
            else b.goal = { x: rnd(-60, 60), z: rnd(60, 110) };
            b.until = now + 25000;
        }
        // to the Keyway through the middle of the mouth; through its first gate, the run itself
        let gx = b.goal.x, gz = b.goal.z;
        if (b.goal.run && body.z > W.plaza.z0 + 2 && Math.abs(body.x) > 8) { gx = 0; gz = W.plaza.z0 - 4; }
        if (b.goal.run && body.z < wallZ(0) - 1) { this.botStart(b); return; }
        const dx = gx - body.x, dz = gz - body.z, d = Math.hypot(dx, dz);
        if (d > 1.2) { inp.mx = dx / d; inp.mz = dz / d; } else if (b.goal.post !== undefined) { b.post = b.goal.post; b.hang = now + rnd(6000, 15000); pl.ry = Math.PI; body.x = b.goal.x; body.z = b.goal.z; pl.x = body.x; pl.z = body.z; }
        else if (!b.goal.run) b.goal = null;
        // it keeps clear of everyone else
        let ax = 0, az = 0;
        this.state.players.forEach((o) => {
            if (o === pl || o.match || o.world !== 0) return;
            const ex = body.x - o.x, ez = body.z - o.z, e2 = ex * ex + ez * ez;
            if (e2 < 49 && e2 > 0.01) { const e = Math.sqrt(e2), k = (7 - e) / 7 / e; ax += ex * k; az += ez * k; }
        });
        if ((ax || az) && d > 4) {
            inp.mx += ax * 2; inp.mz += az * 2;
            const ml = Math.hypot(inp.mx, inp.mz);
            if (ml > 1) { inp.mx /= ml; inp.mz /= ml; }
        }
        // a hop now and then
        if (body.onGround && now >= b.next) { if (Math.random() < 0.1) inp.jump = true; b.next = now + rnd(700, 2600); }
        stepBody(body, inp, dt, T.world);
        pl.x = body.x; pl.y = body.y; pl.z = body.z; pl.t = now;
        const sp = Math.hypot(body.vx, body.vz);
        if (sp > 1) pl.ry = Math.atan2(body.vx, body.vz);
        pl.anim = !body.onGround ? 2 : sp > 2 ? 1 : 0;
        pl.spd = sp;
    }
    // into the Keyway: as far as the stages laid out for about its Level (a little further, now and then)
    botStart(b) {
        let goal = 0;
        const lv = b.lv + rnd(-2, 6);
        for (let k = 0; k < WALLS_N; k++) if (recLevel(0, k) <= lv) goal = k;
        b.run = { x: b.body.x, y: 0, z: b.body.z, vy: 0, vz: 0, air: false, goal: Math.max(1, goal), k: 0, down: 0, lane: rnd(-7, 7), lead: 1, care: new Map() };
    }
    // back in the Starport (a run's end, or a death not revived)
    botHome(b) {
        const pl = b.pl, x = W.spawn.x + rnd(-5, 5), z = W.spawn.z + rnd(-3, 3);
        b.run = null; b.goal = null; b.until = 0;
        b.body = newBody(x, 0, z);
        pl.x = x; pl.y = 0; pl.z = z; pl.anim = 0; pl.ry = Math.PI;
    }
    // a bot's run, one tick
    botRun(b, now, dt) {
        const r = b.run, pl = b.pl, t = now / 1000;
        let v = b.v;
        pl.t = now; pl.post = 255;
        if (r.down) {
            // down: sinking for a moment, then the spawn; now and then a revive into the stage
            pl.anim = 4; pl.y = r.y = Math.max(-2.5, r.y - dt * 4);
            if (now - r.down < 1000) return;
            if (Math.random() > 0.4) { this.botHome(b); return; }
            const cp = checkpoint(r.k);
            Object.assign(r, { x: cp.x, y: 0, z: cp.z, vy: 0, vz: 0, air: false, down: 0 });
        }
        const k = stageAt(r.z);
        if (k >= WALLS_N || k > r.goal) { this.botHome(b); return; }
        // through a gate: its Wins on the board over its head
        if (k > r.k) { pl.wins += padWins(0, r.k); r.k = k; }
        const P = k >= 0 ? stagePlan(0, k) : null;
        // (hopping floating keys nobody goes flat out: the same easing off as a player's screen does)
        if (P && P.type === 'stones') v = Math.min(v, stageV(k) * 1.15 + 6);
        // (a jump's speed: not the careful walk of a narrow bridge)
        const vJump = v;
        const care = (o) => { if (!r.care.has(o)) r.care.set(o, Math.random() < 0.7 + 0.3 * b.skill); return r.care.get(o); };
        // where to steer: the next keycap ahead (a bridge's next key, the next island), else its lane, round what stands in the way
        let tx = r.lane, aimX = r.x, near = 1e9, nq = null;
        if (P) {
            // (the next stage's too, coming up to its gate: a bridge just inside it wants lining up for in good time)
            let cost = 1e9;
            const N = k + 1 < WALLS_N && r.z - wallZ(k + 1) < 70 ? stagePlan(0, k + 1).plats : null;
            for (const list of N ? [P.plats, N] : [P.plats]) for (const q of list) {
                // (its near edge still ahead: not the one underfoot)
                const ahead = r.z - (q.z + q.sz / 2);
                if (ahead < -0.3 || ahead > 80) continue;
                const c = ahead + 2 * Math.abs(q.x - r.x);
                if (c < cost) { cost = c; nq = q; near = ahead; tx = clamp(r.x, q.x - q.sx / 2 + 1.2, q.x + q.sx / 2 - 1.2); }
            }
            for (const o of P.list) {
                if (o.kind === 'crumble') { const pt = o.path.find((q) => q.z < r.z - Math.max(3, v * 0.12)); if (pt) { tx = pt.x; if (Math.abs(pt.x - r.x) > 1.5) near = Math.min(near, 2); } }
                else if (o.kind === 'pillars') { for (const q of o.list) if (r.z - q.z > -2 && r.z - q.z < 10 && Math.abs(tx - q.x) < q.s / 2 + 2) tx = q.x + (tx >= q.x ? 1 : -1) * (q.s / 2 + 3); }
                else if (o.kind === 'sweeper' && Math.abs(r.z - o.z) < 8 && Math.abs(tx - o.x) < 4) tx = o.x + (tx >= o.x ? 4.5 : -4.5);
            }
            // standing on a keycap: never off its sides (only off its far edge, jumping); on a walkway, over to where this key and the
            // next overlap, and no faster than a careful walk
            const on = r.air ? null : P.plats.find((q) => onPlat(q, r.x, r.z, 0.4) && r.y >= q.top - 0.3);
            aimX = tx;
            if (on) {
                let lo = on.x - Math.max(0, on.sx / 2 - 1.2), hi = on.x + Math.max(0, on.sx / 2 - 1.2);
                if (nq && nq !== on && Math.abs(on.z - on.sz / 2 - (nq.z + nq.sz / 2)) < 0.6) { lo = Math.max(lo, nq.x - nq.sx / 2 + 1); hi = Math.min(hi, nq.x + nq.sx / 2 - 1); if (lo > hi) lo = hi = (lo + hi) / 2; }
                tx = clamp(tx, lo, hi);
                if (on.sx < 6) v = Math.min(v, 40);
            }
        }
        // (in the air: on for where it meant to come down)
        if (r.air && r.aimX !== undefined) tx = r.aimX;
        // a laser gate's line just ahead, its panel on the way: a careful bot waits for it to pass
        let go = r.air && r.vz ? r.vz : v;
        if (P && !r.air) for (const o of P.list) if (o.kind === 'slider') {
            const dz = r.z - o.z - SLIDER.d / 2 - 0.7, t1 = t + Math.max(0, dz) / v, t2 = t + (dz + SLIDER.d + 1.4) / v;
            if (dz > 0 && dz < v * 0.4 + 1 && [t1 - 0.05, (t1 + t2) / 2, t2 + 0.08].some((tt) => Math.abs(r.x - sliderAt(o, tt)) < SLIDER.w / 2 + 1.4) && care(o)) go = 0;
        }
        // (not lined up with the keycap just ahead: it slows to step on it squarely)
        if (!r.air && near < 12 && Math.abs(tx - r.x) > 0.6) go = Math.min(go, v * 0.35);
        const sx = clamp(tx - r.x, -1, 1) * Math.min(Math.abs(tx - r.x) * 5, v * 0.7);
        r.x += sx * dt; r.z -= go * dt;
        const g = this.botGround(r.x, r.z);
        if (r.air) {
            const y0 = r.y;
            r.vy -= CFG.grav * dt; r.y += r.vy * dt;
            if (r.vy < 0 && g !== null && r.y <= g) { if (y0 >= g - 0.6) { r.y = g; r.air = false; r.vy = 0; r.vz = 0; r.aimX = undefined; } else { this.botDown(b, now); return; } }
            else if (g === null && r.y < -0.3) { this.botDown(b, now); return; }
        }
        // on the ground (or just landed: the next jump may be due at once, at its speed a keycap is gone in a tick or two)
        if (!r.air) {
            if (g === null) { this.botDown(b, now); return; }
            r.y = g;
            const tr = P && P.plats.find((q) => q.kind === 'tramp' && onPlat(q, r.x, r.z, 0.2));
            if (tr) {
                // a spring key: thrown at the next one (as a player is)
                let next = null;
                for (const q of P.plats) if (q.kind === 'tramp' && q.z < r.z - 4 && (!next || q.z > next.z)) next = q;
                const T2 = 2 * TRAMP.bounce / CFG.grav, tz = next ? next.z : P.lakes[0] ? P.lakes[0].z0 - 5 : r.z - 30;
                r.air = true; r.vy = TRAMP.bounce; r.vz = (r.z - tz) / T2; r.lane = next ? next.x : r.x;
            } else {
                // the edge (or a low wall) just ahead: jump, a stud or a few early (the less sure of itself, the earlier); a laser beam
                // coming round: a careful bot jumps it as it comes
                // (straight on, or on the line to the next keycap: a winding bridge goes on round its bend)
                const look = r.lead + go * dt, ahead = this.botAhead(r.x, r.z - look, Math.min(4, look * 0.8));
                let jump = ahead === null || ahead > r.y + 1.2 || (P && P.list.some((o) => o.kind === 'hurdle' && r.z - o.z > 0 && r.z - o.z < look + 1.5));
                if (!jump && P) for (const o of P.list) if (o.kind === 'sweeper' && Math.abs(r.z - go * 0.3 - o.z) < SWEEP.r + 2 && SOON.some((d) => sweepHit(o, r.x, r.z - go * d, t + d)) && care(o)) jump = true;
                if (jump) {
                    // in the air it eases off to come down on what's next (as a player does), never faster than it walks
                    const vy0 = jumpV(CFG.power);
                    r.air = true; r.vy = vy0; r.vz = vJump; r.lead = 0.8 + Math.random() * (1 - b.skill) * 6; r.aimX = aimX;
                    if (ahead === null) {
                        // the first keycap (or the bank) past the gap, a few studs either side at most: come down a little way onto it
                        let z = r.z - look, land = null;
                        for (let i = 0; i < 60 && !land; i++) { z -= 1.5; land = this.botLand(r.x, z, 7); }
                        if (land) {
                            const T = (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 - 2 * CFG.grav * (land.top - r.y)))) / CFG.grav, aim = land.near - Math.min(4, (land.near - land.far) * 0.45);
                            r.vz = clamp((r.z - aim) / T, vJump * 0.25, vJump); r.aimX = land.x;
                        }
                    }
                }
            }
        }
        // the lasers: touch one and the run is over
        if (P) for (const o of P.list) {
            if (o.kind === 'sweeper') { if (r.y <= SWEEP.y + SWEEP.t / 2 + 0.2 && sweepHit(o, r.x, r.z, t)) { this.botDown(b, now); return; } }
            else if (o.kind === 'slider' && Math.abs(r.z - o.z) < SLIDER.d / 2 + 0.7 && r.y < SLIDER.h - 0.6 && Math.abs(r.x - sliderAt(o, t)) < SLIDER.w / 2 + 0.7) { this.botDown(b, now); return; }
        }
        pl.x = r.x; pl.y = r.y; pl.z = r.z;
        if (go > 0.5) pl.ry = Math.atan2(sx, -go);
        pl.anim = r.air ? 2 : go > 0.5 ? 1 : 0;
        pl.spd = go;
    }
    botDown(b, now) { b.run.down = now; b.pl.anim = 4; }
    // what's just ahead at (x, z): what's underfoot there, or a keycap a little to one side of it (a winding bridge's next key)
    botAhead(x, z, reach) {
        const g = this.botGround(x, z), k = stageAt(z);
        if (g !== null || k < 0 || k >= WALLS_N) return g;
        for (const q of stagePlan(0, k).plats) if (Math.abs(z - q.z) < q.sz / 2 + 0.4 && Math.abs(x - q.x) < q.sx / 2 + reach) return q.top;
        return null;
    }
    // where to come down at z, a jump from x: the floor there, or a keycap within reach to one side ({ top, x, near, far })
    botLand(x, z, reach) {
        const k = stageAt(z);
        if (k < 0 || k >= WALLS_N) return { top: 0, x, near: z, far: z - 8 };
        let best = null, bd = 1e9;
        for (const q of stagePlan(0, k).plats) {
            const d = Math.abs(x - q.x) - q.sx / 2;
            if (Math.abs(z - q.z) < q.sz / 2 + 0.4 && d < reach && d < bd) { bd = d; best = { top: q.top, x: clamp(x, q.x - q.sx / 2 + 1.2, q.x + q.sx / 2 - 1.2), near: q.z + q.sz / 2, far: q.z - q.sz / 2 }; }
        }
        if (best) return best;
        return this.botGround(x, z) === 0 ? { top: 0, x, near: z, far: z - 8 } : null;
    }
    // what's underfoot at (x, z) on the course: a platform's top, the floor (0), or null (a rift)
    botGround(x, z) {
        const k = stageAt(z);
        if (k < 0 || k >= WALLS_N) return 0;
        const P = stagePlan(0, k);
        let top = -1;
        for (const q of P.plats) if (q.top > top && onPlat(q, x, z, 0.4)) top = q.top;
        if (top >= 0) return top;
        for (const o of P.list) if (o.kind === 'crumble') { for (const ti of o.tiles) if (Math.abs(ti.x - x) < TILE.s / 2 && Math.abs(ti.z - z) < TILE.s / 2) return 0; }
        return inPool(0, k, x, z) ? null : 0;
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile, world0 = guestProfile.world;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        s.profile.lastSeen = Date.now();
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        if (!s.match) {
            const w1 = s.profile.world;
            s.dead = null;
            if (w1 !== world0 || s.last.z < W.plaza.z0) {
                const sx = W.spawn.x + rnd(-4, 4), to = { x: sx, y: 0, z: W.spawn.z };
                this.placeAt(s, to.x, 0, to.z);
                this.newLife(s, -1);
                if (w1 !== world0) this.sendTo(s, 'warp', { w: w1, x: sx, z: W.spawn.z }); else this.sendTo(s, 'warped', to);
            }
        }
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !m || now - (s.avAt || 0) < 500) return;
        s.avAt = now;
        s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        const now = Date.now();
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40 || now - (s.emoteAt || 0) < 700) return;
        s.emoteAt = now;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

// a dropped player's "world": nobody's in it, so nobody draws them
const OFFSTAGE = 99;
const DROP_MATCH_MS = 6000;
const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// how far ahead (seconds) a bot looks for a laser beam coming round at it
const SOON = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
// a laser sweep's beams at server time t (seconds): is (x, z) on one? (the client's own test)
function sweepHit(o, x, z, t) {
    const dx = x - o.x, dz = z - o.z;
    if (Math.abs(dz) > SWEEP.r + 2) return false;
    for (let j = 0; j < o.bars; j++) {
        const a = sweeperAngle(o, t) + j * Math.PI / 2;
        if (Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) < SWEEP.r + 0.4 && Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) < SWEEP.t / 2 + 0.55) return true;
    }
    return false;
}
// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    // (one waiting to reconnect has no socket to close: its wait is over)
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { if (o.recon) o.recon.reject(false); else o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}

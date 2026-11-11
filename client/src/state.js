// Local mirror of this player's progress. The server owns the real values: everyone's position arrives
// through the room state, private progress in "profile" and "lite" messages.
export const S = {
    wins: 0, totalWins: 0, totalSpeed: 0, topSpeed: 0, gems: 0, xp: 0, speed: 0, powerShown: 0, pendXp: 0, pendN: 0, lv: 1, need: 20, rebirths: 0,
    shoe: 0, trail: 0, aura: 0, trails: {}, auras: {}, posts: {}, ups: {}, upgrades: 0, pals: {}, team: [], hatched: 0, index: {},
    steps: 0, megas: 0, cleared: 0, escapes: 0, catches: 0, bests: {}, padsDone: {}, matches: 0, matchWins: 0, podium: 0,
    spins: 0, spinIn: 0, spinsUsed: 0, pads: 0, world: 0,
    x2Until: 0, x2: false, w2Until: 0,
    qi: 0, qv: 0, jq: { day: '', list: [] }, daily: {}, codes: {}, gifts: {}, seen: {}, tut: 0,
    sessionSecs: 0, playtime: 0, firstPlay: Date.now(),
    joinedAt: Date.now(), profileAt: Date.now(), name: '',
    // this device only: your pace, the queue, the match you're in
    pace: 1, queued: false, qFound: 0, matchId: 0,
};

// Game actions that world objects and panels trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    rtt: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms (corrected for the round trip, smooth.js), so timers line up for everyone
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};

// QA: where a slow frame's time went (sections marked as the frame runs)
export const prof = { t: 0, parts: [], on: true, mark(name) { const n = performance.now(); this.parts.push(name, n - this.t); this.t = n; }, start() { this.parts.length = 0; this.t = performance.now(); } };

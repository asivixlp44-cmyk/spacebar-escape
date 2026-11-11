// Spacebar Escape: the game's data and formulas, shared by the client and the server.
// The loop: every step is +1 Speed and +1 XP. XP fills your Level, and your Level is how fast you can walk. Run the Keyway, a giant
// keyboard floating through space, cut into stages by warp gates: lasers sweep across it, plasma rifts cut it, floating keys hop over
// them in gaps sized for the stage's Recommended Level (too slow and you fall short). Touch a laser or a rift and you're back at the
// Starport (revive to the stage you were in: FREE every 3 minutes, else Gems). Every gate you pass pays Wins; Wins buy upgrades,
// trails and Star Capsules for pets, and the Wins you've earned all told open the faster treadmills in the Starport (they multiply
// every step). Rebirth at Level 10 (then 15, 20 ...) for a permanent multiplier; clearing the last stage of a sector opens the next.
// And RACE: Black Hole Rush, six lanes, the event horizon rolling in behind, first out wins.
// Everything is bought with Wins or Gems, all earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // moving: base walk speed (Level 1), gravity, the fastest fall, a jump's power; the fastest your Level ever makes you walk
    walk: 16, vMax: 92, grav: 110, fallMax: 210, airDash: 46, hopV: 22, power: 58,
    // steps the server counts: this many a second, a couple of seconds' worth saved for a hiccup in the network
    stepRate: 14, stepBurst: 26,
    // on the ground a step is a stride (longer the faster you go, so a step takes at least 1/4 s: about 4 steps a second, the
    // pace the Level curve is made for)
    stride: 4.2, strideHz: 4,
    // a treadmill: steps a second by itself, and sprinting (holding DASH)
    treadRate: 3, treadSprint: 5.5,
    // a stage's gate pays again after this long
    padCool: 30,
    // (unused: kept for callers that still read them)
    megaEvery: 20, megaK: 20,
    // DASH: how much faster, how long, how long before the next
    dashK: 1.65, dashSecs: 0.6, dashCool: 2.4,
    // (unused)
    shadeDelay: 1.3, shadeDelayEarly: 2.6, shadeBack: 14, reviveSecs: 4,
    // out: one FREE revive (back to the stage you were in) every so many seconds, else it costs Gems; the offer stays this long
    reviveFreeSecs: 180, reviveGems: 5, reviveOffer: 15,
    // the server keeps this many bots about when it's quiet (one leaves per player who joins)
    bots: 3,
    boostP2Gems: 25, boostP2Mins: 15, boostW2Gems: 40, boostW2Mins: 10,
    spinMins: 7, spinMax: 3,
    // Black Hole Rush: places, how long the queue stays open, how long the start line waits
    matchSpots: 6, matchQueue: 9, matchFull: 3, matchReady: 6,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));

export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, uncommon: { name: 'Uncommon', color: '#7dff6b' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});

// ----- (footwear: not part of this game; one plain entry so the profile's field and the avatar code have something to read) -----
export const SHOES = [{ id: 'none', name: 'Space Boots', rarity: 'common', add: 0, wins: 0, c1: 0xd8dce8, c2: 0x3a4a7a, glow: 0, wing: 0 }];
export const shoeOf = () => SHOES[0];

// ----- a step: +1 Speed and +1 XP (and everything that multiplies them) -----
export const STEP = 1;
// (the name the tests and older callers know it by)
export const X20 = STEP;
export const upLevel = (p, id) => (p && p.ups && p.ups[id]) || 0;
export const rebirthMult = (r) => 1 + 0.5 * (r || 0);
// ----- Level: XP fills it (no cap; XP carries over). Your Level is your top walking speed -----
// the XP a Level wants: 2, 3, 5, 7, 9, 11, 14 ... 23 at Level 10, about 100 at Level 20 (a few minutes in); then, through the Levels
// the last stages are laid out for (21 to 35), each one a fifth more again (the climb to the end of a sector takes a rebirth or two);
// past 35 the gentle curve again (rebirths want Level 10, 15, 20 ...)
const XG1 = 1.045, XG2 = 1.2;
export const xpNeed = (lv) => { const L = Math.max(1, Math.min(999, lv | 0)) - 1; return Math.max(2, Math.round((1.6 + 1.25 * L + 0.13 * L * L) * Math.pow(XG1, Math.max(0, L - 11)) * Math.pow(XG2, Math.min(15, Math.max(0, L - 19))))); };
// what every Level adds to the XP of a step (a hundredth each)
export const levelK = (lv) => 1 + 0.01 * (Math.max(1, lv | 0) - 1);
// XP a step (before a treadmill's multiplier): rebirths, Star Charts (+10% each), your Level
export const xpGain = (p) => STEP * rebirthMult(p.rebirths) * (1 + 0.1 * upLevel(p, 'scholar')) * levelK(p.lv);
// your top walking speed (studs/s): +2.2 a Level (Warp Strides add Levels' worth, up to the cap), Ion Boosters +2% each on top
export const maxWalk = (p) => Math.min(CFG.vMax, CFG.walk + 2.2 * (Math.max(1, (p && p.lv) | 0) - 1 + upLevel(p, 'reach'))) * (1 + 0.02 * upLevel(p, 'feet'));
// (no Level cap: a big number for anything that still asks)
export const lvCap = () => 999;
// rebirth: Level 10 the first time, 5 more each time after; how far you are (0..100). It costs nothing
export const rebirthLv = (r) => 10 + 5 * (r || 0);
export const rebirthPct = (p) => Math.min(100, Math.floor(((p.lv | 0) || 1) / rebirthLv(p.rebirths) * 100));
export const rebirthCost = () => 0;
// the Upgrades, for Wins (kept when you rebirth). feet: +2% top walk speed each (goes past the cap); reach: a Level's worth of walk
// speed each (+2.2, up to the cap: the early stages' friend); scholar: +10% XP a step
export const UPGRADES = [
    { id: 'soles', name: 'Thruster Soles', icon: '👟', text: 'More Speed from every step', base: 6, grow: 2.3, max: 18, stat: (n) => '+' + n * 15 + '% Speed a step' },
    { id: 'feet', name: 'Ion Boosters', icon: '⚡', text: 'Walk faster', base: 40, grow: 3.4, max: 10, stat: (n) => '+' + n * 2 + '% walk speed' },
    { id: 'scholar', name: 'Star Charts', icon: '🌟', text: 'More XP from every step', base: 12, grow: 2.5, max: 10, stat: (n) => '+' + n * 10 + '% XP a step' },
    { id: 'spring', name: 'Moon Boots', icon: '🌙', text: 'You jump higher and further', base: 18, grow: 2.6, max: 6, stat: (n) => '+' + n * 5 + '% jump' },
    { id: 'reach', name: 'Warp Strides', icon: '🚀', text: 'Walk faster: a Level\'s worth each', base: 50, grow: 3.5, max: 6, stat: (n) => '+' + (Math.round(n * 22) / 10) + ' walk speed' },
    { id: 'luck', name: 'Lucky Stars', icon: '🍀', text: 'More Wins from every gate', base: 25, grow: 2.6, max: 12, stat: (n) => '+' + n * 10 + '% Wins' },
    { id: 'den', name: 'Pet Pod', icon: '🛸', text: 'Room for one more pet on your team', base: 120, grow: 8, max: 3, stat: (n) => (3 + n) + ' on your team' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));
export const jumpPowerOf = (p) => CFG.power * Math.sqrt(1 + 0.05 * upLevel(p, 'spring'));
// (unused: kept so old callers still link)
export const megaEveryOf = () => CFG.megaEvery;
export const isMega = () => false;
export const teamMax = (p) => 3 + upLevel(p, 'den');

// ----- trails and auras: what you wear, and what it's worth. Trails for Wins, auras for Gems. Both more Speed -----
export const TRAILS = [
    { id: 'none', name: 'No Trail', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'dust', name: 'Stardust', rarity: 'common', wins: 15, gems: 0, c1: 0xdce8ff, mult: 1.1 },
    { id: 'ion', name: 'Ion Sparks', rarity: 'uncommon', wins: 90, gems: 0, c1: 0x5ae8ff, mult: 1.25 },
    { id: 'comet', name: 'Comet Tail', rarity: 'uncommon', wins: 450, gems: 0, c1: 0x7dff9a, mult: 1.5 },
    { id: 'solar', name: 'Solar Flare', rarity: 'rare', wins: 2500, gems: 0, c1: 0xffd23a, mult: 2 },
    { id: 'plasma', name: 'Plasma Wake', rarity: 'epic', wins: 15000, gems: 0, c1: 0xff5ac0, mult: 3 },
    { id: 'nebula', name: 'Nebula Mist', rarity: 'epic', wins: 1e5, gems: 0, c1: 0xa87aff, mult: 5 },
    { id: 'nova', name: 'Supernova', rarity: 'legendary', wins: 8e5, gems: 0, c1: 0xff5a2a, mult: 9 },
    { id: 'rainbow', name: 'Hyperdrive Rainbow', rarity: 'mythic', wins: 1e7, gems: 0, c1: 0xffffff, rainbow: 1, mult: 16 },
];
export const trailById = lookup(Object.fromEntries(TRAILS.map((s) => [s.id, s])));
export const AURAS = [
    { id: 'none', name: 'No Aura', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'ice', name: 'Ice Ring', rarity: 'uncommon', wins: 0, gems: 20, c1: 0x7ae8ff, mult: 1.25 },
    { id: 'corona', name: 'Solar Corona', rarity: 'rare', wins: 0, gems: 60, c1: 0xffa83a, mult: 1.6 },
    { id: 'aurora', name: 'Aurora Shield', rarity: 'epic', wins: 0, gems: 150, c1: 0x4aff9a, mult: 2.2 },
    { id: 'pulsar', name: 'Pulsar Glow', rarity: 'legendary', wins: 0, gems: 350, c1: 0xff6ad8, mult: 3.2 },
    { id: 'rainbow', name: 'Galaxy Overdrive', rarity: 'mythic', wins: 0, gems: 800, c1: 0xffffff, rainbow: 1, mult: 5 },
];
export const auraById = lookup(Object.fromEntries(AURAS.map((s) => [s.id, s])));

// ----- the treadmills in the Starport. Run on one and every step counts for its multiplier: mult for Speed (what its sign says), xp
// for XP (less: a treadmill is the steady way up, not a shortcut past the Levels). need: the Wins you've earned all told (never
// spent down) that open it; gems: its price instead -----
export const POSTS = [
    { id: 'moon', name: 'Moon Treadmill', mult: 1, xp: 1, need: 0, gems: 0, c: 0xb8c2d8, c2: 0x7dff6b },
    { id: 'mars', name: 'Mars Treadmill', mult: 2, xp: 1.25, need: 10, gems: 0, c: 0xd8552a, c2: 0xffd23a },
    { id: 'venus', name: 'Venus Treadmill', mult: 3, xp: 1.5, need: 60, gems: 0, c: 0xe8a84a, c2: 0xfff2a0 },
    { id: 'jupiter', name: 'Jupiter Treadmill', mult: 5, xp: 1.75, need: 300, gems: 0, c: 0xc8825a, c2: 0x5ae8ff },
    { id: 'saturn', name: 'Saturn Treadmill', mult: 8, xp: 2, need: 1500, gems: 0, c: 0xffc21e, c2: 0xfff4a0 },
    { id: 'neptune', name: 'Neptune Treadmill', mult: 12, xp: 2.4, need: 25000, gems: 0, c: 0x3a6aff, c2: 0xffffff },
    { id: 'pulsar', name: 'Pulsar Treadmill', mult: 20, xp: 2.8, need: 1000000, gems: 0, c: 0x7a4aff, c2: 0x3affc8 },
    { id: 'nebula', name: 'Nebula Treadmill', mult: 35, xp: 3.2, need: 0, gems: 120, c: 0xc83ad8, c2: 0xffd23a },
    { id: 'quasar', name: 'Quasar Treadmill', mult: 60, xp: 3.6, need: 0, gems: 400, c: 0x2a2a4a, c2: 0xff5ac0 },
];
export const postXp = (i) => (POSTS[i] && POSTS[i].xp) || 1;
export const postOpen = (p, i) => { const c = POSTS[i]; return !!c && (c.gems ? !!(p.posts && p.posts[c.id]) : (p.totalWins || 0) >= c.need); };
// the next treadmill your Wins will open (or null)
export const nextPost = (p) => POSTS.find((c) => !c.gems && (p.totalWins || 0) < c.need) || null;

// ----- pets: little space critters that follow you. Out of Star Capsules (eight of them), five in each -----
// ear: 0 none, 1 pointed, 2 floppy, 3 long; horn 0 none, 1 one, 2 antlers; tail 0..2; spike 0/1; ant: 1 a pair of antennae with
// glowing tips (client/src/pals.js builds them all from one model)
// (the capsules are called JAWBREAKERS in the code: the list every system already knows). c1: the shell, c2: the bands, c3: the glow
const PT = ['common', 'uncommon', 'rare', 'epic', 'legendary'], PM = [0.1, 0.18, 0.3, 0.55, 1], ODDS = [50, 30, 14, 5, 1];
const JB = (id, name, wins, c1, c2, c3, list) => ({ id, name, wins, c1, c2, c3, list });
const pal = (name, c1, c2, ear, horn, tail, spike, ant) => ({ name, c1, c2, ear, horn, tail, spike: spike || 0, ant: ant || 0 });
export const JAWBREAKERS = [
    JB('rookie', 'Rookie Capsule', 5, 0xd8dee8, 0xff7a3a, 0x7ae8ff, [pal('Moon Bunny', 0xf4f4ff, 0xffb0d8, 3, 0, 0), pal('Rocket Pup', 0xd8a468, 0xe83a3a, 2, 0, 1), pal('Astro Cat', 0x9aa2b4, 0xf4f4f4, 1, 0, 2), pal('Blip the Alien', 0x6ae05a, 0xe8ffb0, 0, 0, 0, 0, 1), pal('Comet Pony', 0x6aa8ff, 0xf4f8ff, 1, 0, 1)]),
    JB('lunar', 'Lunar Capsule', 40, 0x7a86a8, 0xffe27a, 0xfff2a0, [pal('Crater Hound', 0x6a7284, 0xd8dce8, 2, 0, 1), pal('Meteor Hedgehog', 0x8a6a5a, 0xffb43a, 0, 0, 0, 1), pal('Orbit Fox', 0xff8a3a, 0xffffff, 1, 0, 2), pal('Lunar Ram', 0xf4f0ec, 0x8a94ac, 2, 2, 0), pal('Satellite Bunny', 0xe8f0ff, 0x3ab4ff, 3, 0, 0, 0, 1)]),
    JB('comet', 'Comet Capsule', 260, 0x2a6ad8, 0x7af0ff, 0xe8fbff, [pal('Comet Wolf', 0xb8d8f4, 0x3a6ad8, 1, 0, 2), pal('Nebula Raven', 0x2a2a4a, 0x9a6aff, 1, 0, 0), pal('Starlit Lynx', 0xe8e8ff, 0x7a8aff, 1, 0, 2), pal('Asteroid Goat', 0xa89a8a, 0xffd23a, 2, 2, 0), pal('Star Unicorn', 0xfff4ff, 0xff8ad8, 1, 1, 2)]),
    JB('solar', 'Solar Capsule', 1700, 0xffc21e, 0xff5a1a, 0xfff4a0, [pal('Sun Hamster', 0xffc23a, 0xfff4d0, 1, 0, 0), pal('Solar Corgi', 0xf09a4a, 0xffffff, 1, 0, 1), pal('Flare Mole', 0x7a4a3a, 0xffd23a, 0, 0, 0, 1), pal('Corona Lion', 0xf0a83a, 0xb84a14, 1, 0, 2), pal('Sunbeam Stag', 0xffd24a, 0xfff4e0, 1, 2, 1)]),
    JB('plasma', 'Plasma Capsule', 11000, 0x8a1ab8, 0xff5ac0, 0xffd8f4, [pal('Plasma Pup', 0xff5ac0, 0xffe0f4, 2, 0, 1), pal('Ion Newt', 0x3ad8d8, 0xff5ac0, 0, 0, 2, 1), pal('Fusion Fox', 0xff4a8a, 0xffe24a, 1, 0, 2), pal('Reactor Boar', 0x4a2a5a, 0xff6ad8, 1, 1, 0, 1), pal('Photon Whelp', 0xd83ad8, 0x7af4ff, 1, 2, 2, 1)]),
    JB('nebula', 'Nebula Capsule', 75000, 0x3a2a9a, 0xb48aff, 0xc8b4ff, [pal('Nebula Deer', 0xa88aff, 0xfff4ff, 1, 2, 1), pal('Cosmic Turtle', 0x3a8a8a, 0xb4ffe8, 0, 0, 0, 1), pal('Aurora Owl', 0x4a6ad8, 0x7dffc8, 1, 0, 0), pal('Void Serpent', 0x3a2a6a, 0xff7ad8, 0, 0, 2, 1), pal('Galaxy Kirin', 0x5a4aff, 0xffd23a, 1, 1, 2, 1)]),
    JB('quantum', 'Quantum Capsule', 500000, 0x0a6a7a, 0x3affc8, 0xe8fffa, [pal('Pixel Penguin', 0x2a3a5a, 0x3affc8, 0, 0, 0), pal('Prism Fox', 0xd8f8ff, 0x3affc8, 1, 0, 2), pal('Quantum Yeti', 0xe8f4ff, 0x3ab4ff, 2, 2, 0, 1), pal('Robo Pup', 0x9aa8c0, 0x3affc8, 1, 0, 1, 0, 1), pal('Warp Wyvern', 0x3ad8ff, 0xd85aff, 3, 2, 2, 1)]),
    JB('galactic', 'Galactic Capsule', 3500000, 0x1e1a3a, 0xffc23a, 0xffffff, [pal('Starlight Kitten', 0xf4f0ff, 0xffd23a, 1, 0, 2), pal('Supernova Pup', 0xff5a3a, 0xffe24a, 2, 0, 1), pal('Cosmic Griffin', 0x7a5ad8, 0xfff4e0, 1, 0, 1, 1), pal('Pulsar Phoenix', 0xff6a1a, 0x7af4ff, 1, 1, 2, 1), pal('Black Hole Dragon', 0x2a1a4a, 0xffc23a, 3, 2, 2, 1, 1)]),
];
export const PALS = [];
JAWBREAKERS.forEach((J, j) => J.list.forEach((a, i) => {
    const k = Math.pow(2.3, j);
    PALS.push({ ...a, id: J.id + i, jb: j, tier: i, rarity: PT[i], odds: ODDS[i], mult: Math.round((1 + PM[i] * k) * 100) / 100 });
}));
export const palById = lookup(Object.fromEntries(PALS.map((a) => [a.id, a])));
export const palsOf = (j) => PALS.filter((a) => a.jb === j);
// your team's worth: what each pet adds, together
export function teamMult(team) {
    let m = 1;
    for (const id of team || []) { const a = palById[id]; if (a) m += a.mult - 1; }
    return Math.round(m * 100) / 100;
}
// a finished Star Capsule's collection pays this many Gems
export const jbGems = (j) => 5 + j * 5;

// ----- the Speed a step gives (before a treadmill's multiplier): +1, times rebirths, pets, trail, aura, Thruster Soles, the sector, x2 -----
export function stepGain(p, x2, w) {
    const world = WORLDS[w === undefined ? (p.world || 0) : w] || WORLDS[0];
    return STEP * rebirthMult(p.rebirths) * teamMult(p.team) * (TRAILS[p.trail | 0] || TRAILS[0]).mult * (AURAS[p.aura | 0] || AURAS[0]).mult * (1 + 0.15 * upLevel(p, 'soles')) * world.pow * (x2 ? 2 : 1);
}
export const padPay = (p, w, k, first, w2) => Math.max(1, Math.round(padWins(w, k) * (first ? FIRST_PAD : 1) * (1 + 0.1 * upLevel(p, 'luck')) * (w2 ? 2 : 1)));

// ----- the sectors (worlds): 15 stages each, every one laid out for a higher Level and paying more than the last. Clearing the last
// opens the next -----
export const WALLS_N = 15;
// keys: the keycap colourway of the keyboard floor (legend: the letters on them, legendGlow 0..1: how much they glow, rgb 0..1: how
// much of an RGB wave runs through the glow); floor/floor2/path/rim: the Starport's deck plates, its lanes and its edge;
// wall/wall2: hull panels, light and dark; trim: the neon strips; moss: what caps the tops of things; hazard/hazard2: the rifts
// (plasma, magma, cryo, dark matter); sea/sea2: the sector's two nebula colours (the menus' cards use sea); glow: portals and lights;
// banner: the accent colour (stripes, collars, chevrons)
export const WORLDS = [
    {
        id: 'orbit', name: 'Home Row Orbit', rank: 'I', icon: '🌍', pow: 1, wins: 1, mood: 'orbit',
        floor: 0xc6d0e6, floor2: 0xb4bfd8, path: 0x6f7fae, rim: 0x3c4670, wall: 0xe4eaf6, wall2: 0x7c89b0, trim: 0x3ae8ff, moss: 0xffffff, hazard: 0x1a5aff, hazard2: 0x7af0ff, sea: 0x2a5ad8, sea2: 0x3ad8c8, glow: 0x7ae8ff,
        keys: [0xf0f4ff, 0x5ab8ff, 0xff7a3a], legend: 0x1a2a66, legendGlow: 0, rgb: 0, banner: 0xff7a3a,
        stages: ['Launch Lane', 'Tab Trail', 'Shift Shuttle', 'Caps Lock Canyon', 'Enter Orbit', 'Alt Asteroids', 'Backspace Belt', 'Space Walk', 'Ctrl Station', 'Delete Drift', 'Arrow Array', 'Home Row Run', 'Insert Point', 'Page Up Peak', 'Escape Velocity'],
    },
    {
        id: 'redshift', name: 'Redshift Ridge', rank: 'II', icon: '🪐', pow: 40, wins: 120, mood: 'redshift',
        floor: 0x8e6a5e, floor2: 0x7e5c52, path: 0x5a3a34, rim: 0x32201e, wall: 0xb25a44, wall2: 0x402830, trim: 0xff8a2a, moss: 0xffc890, hazard: 0xff4a0a, hazard2: 0xffd23a, sea: 0xb8401e, sea2: 0xff9a3a, glow: 0xff8a2a,
        keys: [0x34282e, 0x4c3438, 0xff5a2a], legend: 0xffb04a, legendGlow: 1, rgb: 0, banner: 0xffd23a,
        stages: ['Rust Runway', 'Ember Enter', 'Crater Caps', 'Magma Macro', 'Dust Devil Dash', 'Shift Storm', 'Iron Insert', 'Canyon Ctrl', 'Lava Lock', 'Scorch Scroll', 'Furnace Five', 'Tab Tremor', 'Meteor Menu', 'Redline Return', 'The Red Giant'],
    },
    {
        id: 'frost', name: 'Frostbyte Rings', rank: 'III', icon: '❄️', pow: 1600, wins: 14000, mood: 'frost',
        floor: 0xd6e8f8, floor2: 0xc6dcf0, path: 0x86a8d0, rim: 0x4a6a98, wall: 0xe6f4ff, wall2: 0x6a94c4, trim: 0x5ae8ff, moss: 0xffffff, hazard: 0x1a7ad8, hazard2: 0xc8f4ff, sea: 0x3a8ad8, sea2: 0xa8f0ff, glow: 0x7ae8ff,
        keys: [0xf4faff, 0x9adcff, 0x3a6ad8], legend: 0x1e4aa8, legendGlow: 0.25, rgb: 0, banner: 0x3a8aff,
        stages: ['Icicle Input', 'Ring Road', 'Comet Ctrl', 'Snowdrift Shift', 'Frozen Function', 'Glacier Glide', 'Crystal Caps', 'Polar Page', 'Hail Home', 'Frostbyte Falls', 'Shiver Scroll', 'Aurora Alt', 'Blizzard Backspace', 'Zero Kelvin', 'The Ice Giant'],
    },
    {
        id: 'esc', name: 'Esc Horizon', rank: 'IV', icon: '🌌', pow: 64000, wins: 1.7e6, mood: 'esc',
        floor: 0x4a3e86, floor2: 0x42367a, path: 0x2c2260, rim: 0x1c143e, wall: 0x5646a0, wall2: 0x2a1e5a, trim: 0xffc23a, moss: 0xffe08a, hazard: 0x24083e, hazard2: 0xc87aff, sea: 0x5a2ab8, sea2: 0xff5ac0, glow: 0xd87aff,
        keys: [0x2e2258, 0x47308e, 0xffc23a], legend: 0xff7ad8, legendGlow: 1, rgb: 1, banner: 0xff5ac0,
        stages: ['Twilight Tab', 'Gravity Gate', 'Photon Path', 'Warp Row', 'Quasar Keys', 'Void Shift', 'Pulsar Page', 'Dark Matter Dash', 'Singularity Step', 'Lightspeed Lock', 'Nebula Num', 'Wormhole Way', 'Phantom Print', 'The Last Enter', 'Event Horizon'],
    },
];
// the Level a stage is laid out for (its "Recommended Level" sign): every sector the same curve (later ones also want the sector open)
const REC = [1, 2, 4, 6, 8, 10, 12, 14, 17, 20, 23, 26, 29, 32, 35];
export const recLevel = (w, k) => REC[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
// what passing a stage's gate pays (x the sector's Wins)
const STAGE_WINS = [1, 1, 2, 3, 5, 7, 10, 14, 19, 26, 35, 47, 63, 84, 112];
export const stageName = (w, k) => WORLDS[w].stages[k];
export const padWins = (w, k) => STAGE_WINS[k] * WORLDS[w].wins;
// the first time through a gate each rebirth pays this much more
export const FIRST_PAD = 3;
// a sector opens when the last gate of the one before is passed and you've been reborn enough times (worldReb)
const WORLD_REB = [0, 1, 4, 8];
export const worldReb = (w) => WORLD_REB[w] || 0;
export const worldOpen = (p, w) => w === 0 || (((p.bests && p.bests[w - 1]) || 0) >= WALLS_N && (p.rebirths || 0) >= worldReb(w));
// (the gates never lock: kept so old callers still link)
export const stageNeed = () => 0;
export function gateLock() { return WALLS_N; }
// how fast you run, studs a second: your top walking speed (the screen's Custom Speed may ask for less: min(custom, this))
export const runSpeed = (p) => maxWalk(p || {});
// a step on the ground: a stride, longer the faster you go
export const strideOf = (v) => Math.max(CFG.stride, v / CFG.strideHz);
// (unused)
export const shadeRel = () => 0;
// how fast the stage is meant to be run (its gaps and layout are sized for this): the top walk speed at its Recommended Level
export const stageV = (k) => Math.min(CFG.vMax, CFG.walk + 2.2 * (recLevel(0, k) - 1));

// ----- a title over your head: how far you've come (stages cleared, all told) -----
const TITLES = [[0, 'Cadet'], [3, 'Key Tapper'], [8, 'Rookie Pilot'], [15, 'Star Runner'], [25, 'Comet Chaser'], [40, 'Orbit Ace'], [60, 'Galaxy Sprinter'], [100, 'Keyboard Astronaut'], [160, 'Lightspeed Legend']];
export const titleOf = (cleared) => { let t = TITLES[0][1]; for (const [n, name] of TITLES) if ((cleared || 0) >= n) t = name; return t; };

// ----- Black Hole Rush: what a race is like at a Level. Longer and tougher as you level up, and better paid -----
// your Level for this: your Level plus what you've left behind in rebirths
export const matchLv = (p) => (p.lv || 1) + 3 * (p.rebirths || 0);
export function matchInfo(lv) {
    const L = Math.max(1, lv | 0), segs = Math.min(14, 5 + Math.floor(L / 6));
    return {
        segs,
        // the clock runs out long after a good run; that's for the ones who stop
        secs: Math.round(Math.min(150, 24 + segs * 6.5)),
        // what's in the way: rifts and barriers from the start, swinging wrecking arms from Level 4, sliding cargo pods from Level 6,
        // pylons from Level 8
        blades: L < 4 ? 0 : Math.min(segs - 1, 1 + Math.floor(L / 7)),
        sliders: L < 6 ? 0 : Math.min(segs - 2, 1 + Math.floor(L / 9)),
        pillars: L < 8 ? 0 : Math.min(segs - 1, 1 + Math.floor(L / 10)),
        // the black hole behind: when it sets off, how fast, how fast it speeds up
        surgeAt: Math.max(3.5, 6 - L * 0.05), surgeV: Math.min(22, 15 + L * 0.12), surgeA: Math.min(0.55, 0.22 + L * 0.006),
        // how good the bots are: how they run, how often they trip
        botPace: Math.min(1, 0.86 + L * 0.004), botTrip: Math.max(0.12, 0.45 - L * 0.006),
    };
}
// in a race your Speed counts only so much (a log scale): a new player with quick feet can beat a veteran
export const matchPower = (p) => Math.round((1 + Math.min(0.2, Math.log10(1 + (p.speed || 0)) * 0.015)) * 100) / 100;
export const MATCH = { v: 27, boostSecs: 1.6, boostK: 1.45, stunSecs: 0.7, r: 3.2 };
export const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const PLACE_K = [4.5, 3.2, 2.4, 1.8, 1.4, 1.1], PLACE_GEMS = [8, 5, 3, 2, 1, 1];
export function matchPrize(place, segs, lv, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    const k = PLACE_K[place] ?? 1.1, grow = 1 + Math.min(1.5, (lv | 0) * 0.015);
    return {
        wins: Math.max(1, Math.round((1 + best) * k * grow)),
        gems: (PLACE_GEMS[place] ?? 1) + (place === 0 ? Math.min(12, Math.floor((lv | 0) / 12)) : 0),
        // Speed and as much XP (a quarter of your Level's XP x the place's share x how far you got)
        speed: Math.max(1, Math.round(Math.max(1, xpNeed(p.lv || 1) * 0.25) * k * Math.min(2.5, 0.5 + (segs || 0) / 6))),
    };
}
// everyone's colour in a race: their lane, their lights, their name on the board
export const SPOT_COL = [0xff4a6a, 0x3ab4ff, 0xffd23a, 0x46ec50, 0xc45aff, 0xff8a2a];
export const SPOT_CSS = SPOT_COL.map((c) => '#' + c.toString(16).padStart(6, '0'));

// ----- the wheel: one spin's prizes (weights) -----
export const SPIN = [
    { w: 22, xp: 1, text: 'Speed', color: '#3ad8ff' }, { w: 18, wins: 1, text: 'Wins', color: '#ffd028' }, { w: 14, gems: 5, text: '5 Gems', color: '#b45aff' },
    { w: 12, xp: 3, text: 'Big Speed', color: '#7ae8ff' }, { w: 10, wins: 3, text: 'Big Wins', color: '#ff9a1a' }, { w: 10, x2: 10, text: 'x2 Speed', color: '#46ec50' },
    { w: 8, gems: 15, text: '15 Gems', color: '#7a4aff' }, { w: 6, wins: 10, text: 'Huge Wins', color: '#ff4a8a' },
];
// a spin's prize grows with what you've reached (its Speed comes with as much XP)
export function spinPrize(s, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    return { speed: s.xp ? Math.max(1, Math.round(s.xp * xpNeed(p.lv || 1) * 0.35)) : 0, wins: s.wins ? Math.round(s.wins * (1 + best)) : 0, gems: s.gems || 0, x2: s.x2 || 0 };
}

// ----- daily tasks -----
// (pads: gates passed from Stage 5 on; tread: steps on a treadmill)
export const TASKS = lookup({
    wins: { text: 'Collect Wins', icon: '🏆', n: 40, gems: 6, wins: 6 },
    steps: { text: 'Take 800 steps', icon: '👟', n: 800, gems: 5, wins: 4 },
    cleared: { text: 'Pass Keyway gates', icon: '🚩', n: 12, gems: 6, wins: 5 },
    levels: { text: 'Level Up', icon: '⭐', n: 15, gems: 6, wins: 5 },
    pads: { text: 'Pass gates from Stage 5 on', icon: '🏁', n: 5, gems: 6, wins: 6 },
    matches: { text: 'Race in Black Hole Rush', icon: '🥇', n: 3, gems: 8, wins: 6 },
    hatch: { text: 'Open Star Capsules', icon: '🛸', n: 5, gems: 5, wins: 4 },
    spins: { text: 'Spin the Wheel', icon: '🎡', n: 2, gems: 5, wins: 3 },
    tread: { text: 'Take 400 steps on a treadmill', icon: '🏃', n: 400, gems: 5, wins: 4 },
    rebirth: { text: 'Rebirth', icon: '🔁', n: 1, gems: 8, wins: 6 },
});
const TASK_POOL = ['steps', 'cleared', 'levels', 'pads', 'matches', 'hatch', 'spins', 'tread', 'rebirth'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['wins'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen); they pay as soon as they're done -----
// kind: what's counted (best: stages passed in Home Row Orbit; pads: gates passed, all told; tread: steps on a treadmill;
// totalWins: Wins earned all told, what opens the treadmills)
export const QUESTS = [
    { kind: 'speed', n: 12, text: 'Take your first steps: reach 12 Speed!', gems: 2 },
    { kind: 'best', n: 1, text: 'Run through the Stage 1 gate', wins: 1 },
    { kind: 'lv', n: 5, text: 'Reach Level 5: Levels make you walk faster!', gems: 2 },
    { kind: 'best', n: 2, text: 'Cross the plasma rift: pass Stage 2', gems: 3 },
    { kind: 'upgrades', n: 1, text: 'Buy an upgrade', gems: 3 },
    { kind: 'best', n: 3, text: 'Jump the laser: pass Stage 3', wins: 3 },
    { kind: 'totalWins', n: 10, text: 'Earn 10 Wins: the Mars Treadmill opens (x2)!', gems: 3 },
    { kind: 'hatch', n: 1, text: 'Open a Star Capsule for a pet', wins: 2 },
    { kind: 'best', n: 4, text: 'Hop the floating keys: pass Stage 4', gems: 4 },
    { kind: 'lv', n: 10, text: 'Reach Level 10', gems: 3 },
    { kind: 'speed', n: 500, text: 'Reach 500 Speed', wins: 6 },
    { kind: 'best', n: 6, text: 'Pass Stage 6', gems: 4 },
    { kind: 'matches', n: 1, text: 'Press RACE: run Black Hole Rush', gems: 5 },
    { kind: 'totalWins', n: 60, text: 'Earn 60 Wins: the Venus Treadmill opens (x3)!', gems: 4 },
    { kind: 'lv', n: 20, text: 'Reach Level 20', gems: 5 },
    { kind: 'best', n: 8, text: 'Pass Stage 8', wins: 20 },
    { kind: 'trail', n: 1, text: 'Get a trail', wins: 8 },
    { kind: 'best', n: 10, text: 'Pass Stage 10', gems: 8 },
    { kind: 'totalWins', n: 300, text: 'Earn 300 Wins: the Jupiter Treadmill opens (x5)!', gems: 6 },
    { kind: 'lv', n: 25, text: 'Reach Level 25', wins: 40 },
    { kind: 'rebirths', n: 1, text: 'Rebirth: x1.5 Speed and XP for good', gems: 10 },
    { kind: 'tread', n: 300, text: 'Take 300 steps on a treadmill', wins: 10 },
    { kind: 'podium', n: 1, text: 'Finish a race in the top 3', gems: 8 },
    { kind: 'best', n: 12, text: 'Pass Stage 12', gems: 12 },
    { kind: 'spins', n: 5, text: 'Spin the wheel 5 times', gems: 6 },
    { kind: 'lv', n: 30, text: 'Reach Level 30', wins: 120 },
    { kind: 'best', n: 15, text: 'Pass all 15 stages: a new sector!', gems: 40 },
    { kind: 'rebirths', n: 2, text: 'Rebirth twice', gems: 12 },
    { kind: 'totalWins', n: 1500, text: 'Earn 1,500 Wins: the Saturn Treadmill opens (x8)!', gems: 12 },
    { kind: 'rebirths', n: 3, text: 'Rebirth 3 times', gems: 15 },
    { kind: 'steps', n: 5000, text: 'Take 5,000 steps', wins: 120 },
    { kind: 'matchWins', n: 1, text: 'Win a race', gems: 15 },
    { kind: 'lv', n: 40, text: 'Reach Level 40', gems: 20 },
    { kind: 'rebirths', n: 5, text: 'Rebirth 5 times', gems: 30 },
    { kind: 'matchWins', n: 5, text: 'Win 5 races', gems: 30 },
    { kind: 'hatch', n: 50, text: 'Open 50 Star Capsules', gems: 40 },
    { kind: 'steps', n: 50000, text: 'Take 50,000 steps', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
export const DAILY = [
    { speed: 40 }, { spins: 2 }, { wins: 15 }, { gems: 10 }, { speed: 400 }, { x2: 30 }, { wins: 150, gems: 30 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, speed: 150 }, { min: 5, wins: 12 }, { min: 9, spins: 1 }, { min: 14, gems: 8 }, { min: 20, wins: 50 }, { min: 30, x2: 15 }, { min: 45, wins: 200, gems: 10 },
];
export const CODES = lookup({
    SPACEBAR: { speed: 200 }, GALAXY: { gems: 5 }, LIFTOFF: { wins: 10 }, BLOXITY: { spins: 2 }, LEGION: { gems: 5 }, WARP: { wins: 8, speed: 100 },
});
export const PACKS = [
    { id: 'p1', gems: 10, wins: 20 }, { id: 'p2', gems: 30, wins: 90 }, { id: 'p3', gems: 80, wins: 320 },
];
// a reward's Speed grows with your Level (what the server pays, and what the screen promises): speed 100 is a whole Level's XP.
// It comes with as much XP
export const rewardSpeed = (r, lv) => (r.speed ? Math.max(1, Math.round(r.speed * 0.01 * xpNeed(lv || 1))) : 0);
// HTML: a Win (a trophy) and Speed (a bolt) are drawn (classes "wc", "pc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.speed ? fmt(r.speed) + (plain ? ' Speed' : ' <i class="pc"></i>') : '', r.wins ? fmtComma(r.wins) + (plain ? ' Wins' : ' <i class="wc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Speed ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

export const BOT_NAMES = [
    'AstroAda', 'CometKai', 'NovaNia', 'OrbitOli', 'RocketRae', 'StarSam', 'LunaLex', 'ZeroGZed', 'QuasarQuinn', 'WarpWes',
    'PixelPia', 'TurboTess', 'ShiftSam', 'EnterEmi', 'TabTara', 'CapsCal', 'EscEli', 'KeyKiko', 'BlastBo', 'NebulaNed',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
// a small number with a decimal when it has one (a step's "+1.5"), a big one as fmt
export const fmtStep = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock and everyone in the worlds and races (players and the bots). Private progress (Wins, Gems, quests...) goes only to its owner in "profile".
// Positions carry a server-time stamp (t): other clients smooth them on that timeline. (shK..shV: the old station monster's four numbers,
// unused now: there are no chasers.)
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bot: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.float32().default(0),
    t: t.float64().default(0),       // when they were there (server ms)
    anim: t.uint8().default(0),      // 0 idle, 1 run, 2 air, 3 on a treadmill, 4 down (a bot that's just died)
    post: t.uint8().default(255),    // the treadmill they're on (255: none)
    spd: t.float32().default(16),    // how fast they're running (studs a second): their legs keep pace
    shoe: t.uint8().default(0),      // which shoes
    team: t.string().default(''),    // their Familiars, by id
    title: t.string().default(''),
    lv: t.uint16().default(1),
    wins: t.float64().default(0),    // Wins collected
    world: t.uint8().default(0),
    match: t.uint16().default(0),    // the race they're in (0: none)
    trail: t.uint8().default(0),
    aura: t.uint8().default(0),
    av: t.string().default(''),      // packed Bloxity avatar (equipped ids + proportions)
    shK: t.uint8().default(255),     // (no chasers any more: always 255)
    shAt: t.float64().default(0),    // when it set off (server ms)
    shZ: t.float32().default(0),     // where it set off from
    shV: t.float32().default(0),     // how fast it runs
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),     // the server's clock, every patch
    players: t.map(PlayerState),
}, 'GameState');

# Spacebar Escape

A multiplayer "+1 Speed" runner for the browser, built with **Three.js** and **Colyseus** for Bloxity (listed as **+1 Speed Spacebar Escape**). **Every step you take is +1 Speed and +1 XP, and every step clacks a giant keyboard key.** XP fills your Level, and your **Level sets how fast you can walk** (the WALK box lets you walk slower). You land on the **Starport**, a station deck floating in space: train on its treadmills, then run the **Keyway**, a giant mechanical keyboard floating north through the stars, cut into fifteen stages per sector by warp gates with "STAGE N" on them. Spinning lasers, sliding force gates and rifts of plasma cut across it, with key bridges and floating keys to hop. Touch a laser or the plasma and you're back at the Starport in a shield bubble, offered a revive straight back into the stage. Every gate you pass pays Wins. The Wins you earn open faster treadmills; spend them on upgrades, Star Capsules for pets and trails; rebirth for a multiplier; clear a sector's fifteen stages to open the next; and press **RACE** to run five others in **Black Hole Rush** with a black hole rolling in behind.

The genre and the core loop (a step is +1 Speed, Levels are walking speed, stages down a keyboard course, Wins, rebirths) follow the Roblox game *+1 Universe Keyboard Escape*, studied from its page and screenshots. Everything players see and hear is our own: the name, the four sectors and their sixty stages, the Starport, the warp gates, the skies, the treadmills, the pets and capsules, the HUD and its layout, the icons, the text, the sounds and the music. Black Hole Rush, the quests and the daily systems aren't in the reference.

**There are no in-app purchases.** Everything costs Wins (from the gates and races) or Gems (from quests, daily tasks, races, gifts, the wheel, the daily reward and codes). No Bux are spent anywhere.

It shares its engine with the other Legion games: the server, Bloxity login and avatars, the top games' character animation, the camera and lighting rig, the quality system, profiles, saves, play stats, test scripts and deploy workflow. It is forked from Keystone Castle (the newest Legion game when this one started, and the same genre), so it already had the RACE queue, the start line, bot takeover, the per-mover snapshot buffer, far-avatar LOD and the whole test suite. What's new here: the +1 step and its Level curve, treadmills that open with the Wins you've earned, sectors that also want rebirths, denser stages in later sectors, the whole world's art (`world.js`, `arenaview.js`), the deep-space sky, the HUD (layout, style, icons), the pets' antennae, the Star Capsules, and both songs.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client. **`main.js`**: boot and warm-up, your runner on the shared physics, steps with prediction, treadmills, the gates and what they pay, lasers and rifts and going out, the revive offer, your walking speed, who's pressing the keys, the guide chevrons, the camera, keyboard / mouse / touch / controller, other players smoothed on the server's clock, the network, your race, the QA autopilot. **`world.js`**: a sector on screen: the Starport (deck, landing pad, kiosks, treadmills, capsule stands, the launch gantry, the rocket, the radar dish), the Keyway with its rails, warp gates, Recommended Level holos, trophies and rifts, what drifts round it. **`engine.js`**: the renderer, the light rig, the deep-space sky (nebulae, stars, each sector's planet or black hole, all in one dome shader), the moods, lettering. **`keycaps.js`**: the keycap floor (two instanced shapes, chunked, pressed and rippling in the vertex shader, letters from one glyph atlas, lit when pressed). **`stagefx.js`**: each stage's moving things (the laser sweepers, the sliding force gates, the glitch keys). **`arenaview.js`**: a race's lanes and the black hole. **`chars.js` + `avatar.js`**: characters, their trails and auras. **`pals.js`**: every pet in one draw. **`ui.js` + `index.html`**: the HUD and panels. **`icons.js`**: the HUD's drawn icons, a picture of every pet and capsule. **`asmr.js`**: the key clacks and the effects, synthesised at load (in a worker, `asmr-worker.js`). **`audio.js`**: the mixer and the two songs. Also `fx.js`, `geo.js`, `signs.js`, `smooth.js`, `blobs.js`. |
| `server/` | Colyseus 0.18 server. **`RunRoom.js`** (the `run` room): steps and their two token buckets, the stride check, the move guard, the gates and their Wins, going out and revives, upgrades, trails, auras, treadmills, capsules, teams, rebirths, sectors, the wheel, tasks, quests, rewards, codes, the Starport's bots. **`Match.js`**: the RACE queue, the start line, the race, its bots, the black hole, the prizes. Also profiles (MongoDB on Legion), leaderboards, play stats. |
| `shared/` | **`config.js`**: the step, XP and Levels, walk speed, rebirths, upgrades, trails, auras, treadmills, pets and capsules, the sectors and every stage's Recommended Level and pay, revives, what a race is like at a Level and what it pays, tasks, quests, rewards, codes. **`stages.js`**: the kinds of stage. **`world.js`**: where everything stands, every stage's obstacles from its seed. **`arena.js`**: a race's course from its seed, the black hole. **`physics.js`**: moving and jumping, the move guard. |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game by `node tests/covers.mjs` (git-ignored, like the other Legion games' covers) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3059
```

For development, run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5621. The client talks to the server on port 3059 (`VITE_SERVER_URL` overrides that).

- Dev builds, or a build with `VITE_QA=1`, expose `window.__qa`: the autopilot, perf readings, teleports.
- Restart the server after changing `shared/`.
- For testing only, `QA=1` lets the client give itself Speed, Wins, Gems, Levels, rebirths and upgrades (`__qa.give`) and pick a race's map and Level. It is refused on Legion.

## Gameplay

- **Steps.** Run (WASD, the stick, the left stick) and every stride is a step: **+1 Speed** and **+1 XP**, a "+1" popping up beside you. Rebirths, pets, your trail and aura, Thruster Soles, the sector you're in, the treadmill you're on and 2X multiply the Speed (the badge by the Speed shows what a step is worth: "+1 / STEP", "+4.5 / STEP" ...); rebirths, Star Charts and a little for every Level multiply the XP. A stride gets longer the faster you go, so you take about 4 steps a second. Speed is your score (the Fastest board, a little in races, rewards).
- **Level is your walking speed.** XP fills the Level bar (2 XP for Level 2, 23 at Level 10, about 100 at Level 20, then steeply: 470 at Level 25, 2,000 at Level 30, 8,200 at Level 35). Every Level adds 2.2 to your top walking speed: 16 studs a second at Level 1, 58 at Level 20, up to 92 (Ion Boosters go past that). The **WALK** box at the bottom lets you set a walking speed up to your max for the tricky bits; your screen keeps it.
- **The keycap floor.** The whole Keyway (and the keyboard beds on the Starport, and every race lane) is floored with giant mechanical-keyboard keys in each sector's colourway, a letter on every key, rows staggered like a real board. A key clacks down and lights up under whoever stands on it, and every footstep sends a typing ripple out through the keys round it. Every step on the keys is a key clack (on the Starport's deck it's a boot tap).
- **Treadmills.** Nine on the Starport, each labelled with what it multiplies. Step on one and stand still: you run in place by yourself (3 steps a second), and holding **DASH** (Shift, a click, the button, RT) sprints at 5.5. Every step on a belt counts its multiplier in Speed (and a smaller one in XP: a treadmill is the steady way up, not a shortcut past the Levels):
  - They open with the **Wins you've earned in all** (spending doesn't close them): x1 Moon, x2 Mars (10 Wins), x3 Venus (60), x5 Jupiter (300), x8 Saturn (1,500), x12 Neptune (25,000), x20 Pulsar (1,000,000).
  - x35 Nebula (120 Gems) and x60 Quasar (400 Gems).
  - A locked belt sits still and dark with what it wants on its screen. The **Train** button takes you to your best open one, and a pop-up tells you the moment a new one opens.
- **The Keyway.** Fifteen stages in each of four sectors, each as long as about five seconds' running at its Recommended Level, and a bit (about 140 to 480 studs). The keys sit in a sunken keyboard between the station's rails.
  - **Gates.** Every stage starts at a warp gate with "STAGE N" over it and the stage's name above. The gates never shut. Before a harder stage a holo says **Recommended Level N** (1, 2, 4, 6, 8, 10, 12, 14, 17, 20, 23, 26, 29, 32, 35 in every sector): the stage's gaps are sized to that Level's walking speed.
  - **Every stage is a challenge of its own** (`shared/stages.js`), so no two in a row play alike. Each sector runs through them in its own order, and later sectors pack more into a stage at the same Level. The stage's name and a one-line tip show as you step in:
    - **Open Keys**: open keys, pylons to weave round, a low barrier to hop, boost chevrons; after the first stage, rifts to jump.
    - **Plasma Rifts**: rifts right across the way with key bridges over them; further in, a force gate and a rift with one floating key to jump to and from.
    - **Spin Laser**: a laser beam turning round its emitter pylon, right across the way: jump it as it comes round (two beams crossed, later on).
    - **Force Gates**: laser panels sliding from rail to rail: time it and slip past (and, further in, a rift to jump between two of them).
    - **Skybridge**: one narrow winding walkway of keys over the rift (later with gaps, and a laser sweep between its two halves).
    - **Floating Keys**: the floor is a rift; hop from one giant floating key to the next. The gaps are sized to the stage's pace: too slow and you fall short.
    - **Glitch Keys**: a bridge of keys over a rift; each one sinks and blinks out a moment after you step on it.
    - **Jump Pads**: a rift too wide to jump; land on the sprung spacebars and each throws you on to the next.
    - **The Last Sector** (each sector's 15th): floating keys, a laser sweep, the skybridge and force gates, one after another.
  - **Going out.** Touch a laser or fall in a rift and it's over for this run: a flash, and you're back on the landing pad in a bubble shield (3 seconds, nothing can hurt you). At the top of the screen "Revive to Stage N?" is on offer for 15 seconds: **FREE** once every 3 minutes, otherwise 5 Gems. Take it and you're put just inside that stage's gate; leave it and you run again from the start (earning all the way).
  - **Wins.** Passing a stage's end gate pays its Wins (a trophy by the gate shows how many): x3 the first time each rebirth, and again every 30 seconds. **Lucky Stars** pay more. **TO STAGE** (B) warps you to the furthest stage you've reached this rebirth; the **Teleport** panel lists the Starport, every stage you've reached and the sectors.
- **Rebirth.** The Rebirth button shows how far you are (100% at Level 10, then 15, 20 ... five more each time). It's free: back to Level 1, 0 Speed and 0 XP, and in return every step gives x1.5, x2, x2.5 ... Speed and XP for good. You keep your Wins, Gems, pets, upgrades, trails, auras, treadmills and the sectors you've opened, and the first-time x3 on every gate comes back.
- **Star Capsules and pets.** Eight capsules (Rookie, Lunar, Comet, Solar, Plasma, Nebula, Quantum, Galactic; 5 Wins to 3.5M), five pets in each (50 / 30 / 14 / 5 / 1%), forty in all: a Moon Bunny, a Rocket Pup, Blip the Alien, a Comet Wolf, a Star Unicorn, a Corona Lion, a Cosmic Turtle, a Warp Wyvern, a Pulsar Phoenix, a Black Hole Dragon... each following you round and multiplying your Speed. Open one or three at a time; a finished collection pays Gems. Three on your team at first, up to six (**Pet Pod**). The best go on your team by themselves until you choose your own. Pets, trails and auras live in the **Pets** panel.
- **Upgrades** (Wins, kept when you rebirth): Thruster Soles (+15% Speed a step), Ion Boosters (+2% walk speed, past the cap), Star Charts (+10% XP a step), Moon Boots (jump higher), Warp Strides (a Level's worth of walk speed each), Lucky Stars (+10% Wins from a gate), Pet Pod. **8 trails** for Wins (Stardust x1.1 to Hyperdrive Rainbow x16) and **5 auras** for Gems (Ice Ring x1.25 to Galaxy Overdrive x5), both multiplying your Speed. Above the Speed the HUD shows what multiplies a step: pets, trail and aura, upgrades, rebirths.
- **Four sectors:**
  - **Home Row Orbit**: a blue planet curving below, pale station hull, a white, blue and orange keyboard, teal and blue nebulae.
  - **Redshift Ridge**: an amber nebula and a banded red giant, rust-red iron, a black keyboard with glowing orange letters, plasma the colour of lava (its lasers are a hot orange).
  - **Frostbyte Rings**: an ice giant and its rings, white and ice-blue hull, a white and blue keyboard, cold blue plasma.
  - **Esc Horizon**: a black hole with its burning ring across a violet sky, a purple keyboard whose letters run through the rainbow, magenta lasers.
  - Clear a sector's 15th stage and the next one opens through the WORLDS ring on the Starport, once you've rebirthed enough (1, 4 and 8 rebirths for the second, third and fourth). Each sector multiplies every step's Speed (x40, x1,600, x64,000) and its gates' Wins.
- **Black Hole Rush** (RACE, top right, or walk through the gate):
  - **The queue.** Everyone who presses RACE at about the same time goes in one race, and the queue shows how many were found ("2 / 6 found, starts in 7 s"). A late press before the gun takes a bot's place on the start line.
  - **Bots** fill only the empty places. A bot takes over at once, under their name, from a player who leaves (after 6 seconds for a dropped connection).
  - **The course.** Six keycap lanes, each railed in its racer's colour, with the same rifts, barriers, wrecking arms, cargo pods, pylons and boost chevrons in every lane.
  - **The black hole.** It wakes behind the start line and comes on faster and faster. Whoever it reaches is out where they stand, and the screen glows violet round the edges as it closes in.
  - **Fair speeds.** Everyone runs at about the same speed (your Speed counts only a little, on a log scale), so a new player with good jumps can beat a veteran. First through the warp gate wins; the rest get a last 12 seconds.
- **Content grows with you.** A race's Level is your Level plus 3 for each rebirth, and it decides the course's length (5 stretches at Level 1, up to 14), the clock, wrecking arms from Level 4, cargo pods from Level 6, pylons from Level 8, how fast the black hole comes, how well the bots run, and the prize. On the Keyway every stage wants a higher Level than the one before and pays more Wins, every sector packs its stages tighter, and the treadmills, capsules, trails and auras are priced to keep opening for hours.
- **The rest of a session:**
  - **Quests:** a chain of 37 at the top of the screen (reach a Level, reach some Speed, pass a stage, earn Wins, buy an upgrade, open a capsule, race, rebirth, train on a treadmill...), each paid as soon as it's done.
  - **Daily tasks:** 3 a day (Wins, steps, gates passed, Levels, gates from Stage 5 on, races, capsules, spins, treadmill steps, a rebirth).
  - **The Lucky Wheel:** a free spin every 7 minutes of play, up to 3 saved.
  - **Daily reward** over 7 days, **FREE gifts** at 2 / 5 / 9 / 14 / 20 / 30 / 45 minutes (the gift timer top right, and a FREE GIFT crate by the landing pad), and **2X Speed** (25 Gems, 15 minutes) and x2 Wins (40 Gems, 10 minutes).
  - **Codes:** `SPACEBAR`, `GALAXY`, `LIFTOFF`, `BLOXITY`, `LEGION`, `WARP`.
  - **Leaderboards:** Most Wins, Fastest (top Speed) and Races Won, on holo boards on the Starport and in a panel.
  - **Titles** over your head that grow with the stages you clear: Cadet, Key Tapper, Rookie Pilot, Star Runner, Comet Chaser, Orbit Ace, Galaxy Sprinter, Keyboard Astronaut, Lightspeed Legend.
  - **The guide:** chevrons on the ground flow from you to what to do next: train, the Keyway, through the next gate, the quest's place.
- **Pacing** (`tests/economy.mjs`, run on 11 November 2026): a simulated brand-new player on the real formulas and stages, 25 runs of 30 minutes. It runs the Keyway from the landing pad, goes out now and then (more often in a stage laid out for a higher Level than its own), revives when it's free (or for Gems now and then), trains on its best treadmill when it's stuck, follows the quests and buys what helps. Medians (and the 10% to 90% range where it's wide):

  | When | What |
  |---|---|
  | 0:37 | Level 10 |
  | 0:43 | The Mars Treadmill (x2) opens |
  | 1:33 | Stage 5 passed |
  | 2:55 | Level 20 |
  | 3:50 | The Jupiter Treadmill (x5) opens |
  | 4:05 | Stage 10 passed |
  | 7:06 | First rebirth |
  | 9:51 | The Saturn Treadmill (x8) opens |
  | 15:08 (11:21 to 21:19) | Stage 15 passed, Redshift Ridge opens |
  | 17:30 | The Neptune Treadmill (x12) opens |
  | 22:40 | Second rebirth |
  | 30:04 | The Pulsar Treadmill (x20) opens |

  A typical run ends its 30 minutes in Redshift Ridge with two or three rebirths and about 25 of the 37 quests done; Frostbyte Rings (4 rebirths) and Esc Horizon (8) are still ahead. It's a simulation, not a person's session: nobody has playtested the pacing yet.
- **The server decides:**
  - **Steps.** Every step counts against a token bucket (14 a second on the ground, fewer on a belt). A step on the ground also needs a stride's worth of distance that the move guard accepted, and a step on a belt needs you to be standing on an open belt.
  - **Moves.** Moving further than your Level lets you walk (dash and boost included) or higher than a jump goes is sent back. It's judged on your top walking speed, never the WALK box.
  - **Gates.** A gate pays only if the server has you past it, having come through its stage in this life, and not again within 30 seconds.
  - **Going out and revives.** Going out puts you on the landing pad on the server too; the revive offer is for the furthest stage your server position reached in that life, free or for Gems as the server's clock says.
  - Every purchase, treadmill unlock, rebirth, sector and race result, and every race's black hole.
- **On your screen first.** Your own movement runs on your device. Your Speed, XP and Level show each step at once, and each answer from the server takes off the steps it covers, so nothing jumps back over a long round trip.
- **Far from the servers** (300-400 ms round trip from Sri Lanka): the server's clock is corrected for the round trip, and the lasers turn on it, so everyone sees them in the same place. Others are drawn a little in the past on it, between snapshots stamped with server time, and each mover's delay follows how late its own snapshots arrive.
- **A dropped connection** reconnects by itself within 30 seconds and is told where things stand. Dropped for over 6 seconds in a race, a bot carries on for you and you come back to the Starport.
- **Phones, portrait and landscape:**
  - The HUD is sized from the screen's width in portrait and its height in landscape. Quests, Daily, Spin, Codes and Settings are small pills right of the Bloxity corner; Wins, Gems and the square buttons (Rebirth, Upgrade, Pets, Teleport, Train, Sound) run down the left (two columns on a landscape phone); RACE, the free gift, Shop and 2X down the right; what a step is worth, the big Speed, the WALK box and the Level bar along the bottom. The top-left corner stays free.
  - The stick, DASH and JUMP sit clear of the Speed and Level block and the side columns.
  - The camera widens and pulls back in portrait, and widens further the faster you run.
  - A button works with a thumb still on the stick.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Run | WASD / arrows | Left stick | The stick |
| Jump (hold to keep hopping; let go early for a short hop) | Space | A | JUMP |
| Dash / sprint on a treadmill (hold) | Shift, F, Enter, a click on a belt | RT, LT or X | DASH |
| Revive (while it's offered) / use (Upgrades, Rebirth, a capsule, the rings) | E | Y | The revive button / tap the bubble |
| Camera | Drag, wheel | Right stick, R3 to zoom | Drag, pinch |
| To a stage / home | B / R | Y with nothing near / L3 | Teleport |
| Race | P | LB | RACE |
| Pets / Upgrades / Teleport / Wheel / Quests / Shop / Sound | J / U / T / C / Q / G / M | D-pad to the HUD's buttons, A to press; Back for Quests | The buttons |
| WALK speed | Click the box, type, Enter | The ring onto the box | Tap the box (number pad) |
| In a panel | Mouse, Esc | D-pad or left stick moves the ring, A presses, B goes back, LB / RB change tabs | Tap |

## Sound

- **The key clacks and the rest** are synthesised sample by sample while the game loads, in a worker on another core while the page builds the world (filtered noise, resonances and pitch sweeps, several variations of each), so running sounds like fast typing on a big mechanical keyboard:
  - every step on the keys is a key press: a click or tactile bump, the clack and the deep thock of the bottom-out, a little plastic ring, a softer upstroke, with three kinds of switch (creamy linear, tactile, clicky) and a random pitch;
  - a step on a treadmill is a spacebar thock with its stabiliser rattle; a step on the Starport's deck a boot tap;
  - a landing is several keys at once; a jump a switch spring's boing; a boost a whoosh; a glitch key a crunch; a plunge into a rift a splash.
  - A sound in play is one buffer source and a gain (and a panner for someone else's), never more than 22 footsteps and 12 effects at once.
- **Effects** for buying, Level Up, a capsule opening, a gate paying out, going out, the respawn in the bubble and a revive. All are rendered into buffers while loading.
- **Music**, all our own and all generated from instruments synthesised here (a plucked synth, a glass bell, a soft lead, a round bass, kick, snare, hats, a noise sweep, a crash): "Starport Drift" (a floating B-minor synth-pop loop at 110 BPM) on the Starport and down the stages, and "Event Horizon" (a driving E-minor chase at 150 BPM) in a race. Each is rendered once into loops by an OfflineAudioContext behind the loading screen and plays from memory; on Low only the calm loop of each is made, and nothing is ever played note by note.

## Graphics and performance

- **The top games' lighting** (hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping). **Only matte (Lambert) and unlit materials**: no reflections, no environment map, no bloom or post-processing. Each sector has a mood that only tints that rig and sets the sky.
- **The sky** is one dome and one shader: a deep gradient, two layers of nebula from a small tiling noise texture, hashed stars that twinkle, a shooting star now and then, a far sun, and the sector's great body drawn in the shader itself (the blue planet with its clouds and day side, the banded red giant, the ringed ice giant, the black hole with its ring of fire). On Low it drops the second nebula layer, the second star layer and the shooting stars.
- **Our own art, all built here**: the Starport's deck plates and lit lanes, the landing pad's star and the FREE GIFT crate by it, station modules with lit windows, thrusters under the deck's edge, lamp posts, the Upgrade Lab and the Rebirth Reactor, the launch gantry with its warp ring, a rocket on its pad, a radar dish, treadmills with scrolling belts, glowing consoles and their multiplier on a sign, Star Capsules turning over their stands, the WORLDS ring and the BLACK HOLE RUSH gate, holo leaderboards; the Keyway's rails with their light strips, the warp gates ("STAGE N" lettered over each), Recommended Level holos, trophies on plinths, plasma in the rifts, pylons, laser emitters with their beams (an opaque white-hot core and a soft glow round it), sliding force gates, key bridges and floating keys, glitch keys, sprung spacebars; asteroids and far stations drifting round it all. Forty pets (some with antennae), trails and auras, chunky outlined lettering on every sign, drawn HUD icons.
- **The keycap floor** (`keycaps.js`): every key is an instance of one of two shapes, a sculpted keycap close up (chamfered corners, a tapered skirt, a dished top with its letter, 40 triangles) and a plain tapered block further off (10). The keys are kept in chunks of 36 studs along the course; each frame the chunks the camera sees are picked (near ones sculpted, far ones plain, the rest none) and only when that choice changes are their instances copied into the two meshes: two draws for all the keys in view. The press under a runner (up to 8 at once), its light and the typing ripple of the last 16 footsteps are in the vertex shader; the letters come from one 512 x 512 glyph atlas (backlit in Redshift Ridge and Esc Horizon, rainbow in Esc Horizon).
- **Draw calls**: static things are merged per stage into one **BatchedMesh** per material. Each stage is culled on its own by the camera and the sun's shadow view, and also when it lies beyond the fog. Its draw list changes only when one comes into view or goes out. The small things (light strips, lamps, drifting rocks, trims) are in a **detail kit** per stage, drawn only within 175 studs (120 on Low) and never in the shadow pass. Treadmills' belts and capsules are instanced; the gates' lettering is one atlas and one draw. The lasers are one draw a kind for a whole sector (and one more for their glow, not on Low), and only the ones near the camera are moved. Far characters drop their accessories and team.

- **Typical views** (`tests/tris.mjs`, 1280x720, the shadow pass included on Medium):

  | Quality | At the spawn | At a gate | In Stage 4 |
  |---|---|---|---|
  | Low | 17 draws, 57K triangles | 17 draws, 57K triangles | 18 draws, 31K triangles |
  | Medium | 21 draws, 143K triangles | 17 draws, 81K triangles | 24 draws, 87K triangles |

- **Close to the camera**: a race's wrecking arm swinging past the lens and a glitch key right under it dissolve in a fine checker, so nothing fills the screen and hides you.
- **Weak devices** start on **Low**: phones, and PCs with 4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons or software renderers.
  - Low means no shadow code, no multisampling on PCs (decided before the WebGL context exists), bigger keys further apart with simpler far shapes, fewer details, the simpler sky, no laser glow, fewer word pops (at most 4 at once), half the sound variations, a cap on footstep sounds and no speed lines.
  - Below 54 FPS the resolution steps down first, then the quality below 45.
  - On a 120 Hz+ screen, when frames are uneven, the game draws every other refresh.
- **Made for low-end PCs and phones** (the engine's measures, found with CPU profiles and per-part measurements on a 4x-throttled CPU):
  - **Floating numbers**: every step's "+1" goes on one instanced glyph sheet, a single draw for all of them, with no canvas painted or texture uploaded per number (only the word pops are sprites, capped on Low).
  - **Sound**: the key-clack bank is synthesised in a Web Worker (`asmr-worker.js`) while the page builds the world, and handed back without copying; if a worker can't start, the page makes it itself as before. On a simulated weak phone that loading step went from 1.5 to 1.8 s of the page's own time to a few milliseconds. On Low it makes half the footstep variations and one of each effect. The music's loops render in idle moments, and on Low whatever the loading screen didn't finish waits for the first 20 s of play.
  - **The keycap floor**: two draws for every key in view, instances copied only when the chunks in view change.
  - **Signs, HUD and memory**: one sign atlas uploading only a changed cell, HUD written only on change with bars moved by transforms, vertex arrays released once on the graphics card.
- **Loading**:
  - Every shader is compiled and drawn once behind the loading screen: the course and its batches, the keycaps (both shapes), instanced props, the lasers and their glow, shadows, the light, pets, signs, the shield bubble, a whole race's course with its keys, cargo pods and black hole, effects, the avatar.
  - Every HUD screen and panel, the revive offer included, is painted once. Every emoji the game can show is drawn once in the page and once in a canvas. The GPU's name is read once.
  - `tests/warm.mjs` does everything a player can do, every kind of stage, a laser, a rift and a revive included, and lists anything compiled in play.
- **The HUD** writes to the page only when a value changes and moves its bars with transforms. Nothing in the frame loop reads layout, and the toasts and flying Wins take the window's size from a cached value (reading it just after adding a toast made the page lay itself out on the spot, up to 20 ms on a weak phone).
- **The CPU profile** (`tests/perf.mjs profile`: unminified dev build, weak laptop, Low, CPU 4x, running the Keyway):

  - Self time: 35.9% `(program)` (the browser's own and the graphics driver's work), 9.8% idle, 3.8% Three.js `setProgram`; no function of the game's own is over 1.2%.
  - Layout and style reads in the frame loop: 0.00%. Audio-node calls: 0.19% to 0.40%.
  - A frame's work: about 2 ms update, 0.5 ms camera and sky, 5.5 to 5.8 ms render.

- **Measured** on this PC, on 11 November 2026: Intel UHD Graphics on ANGLE D3D11 (forced with `LOW_GPU=1`), Chrome, headless, a 144 Hz display, the automatic resolution step-down switched off. Frames drawn per second, with the 95th percentile frame interval in brackets. *Paced* means the game was drawing every other refresh of the fast screen.

  | Device | Running the Keyway (autopilot) | Sprinting on a treadmill | At a gate | At the spawn | In a race | Load + join (dev build) |
  |---|---|---|---|---|---|---|
  | Desktop, 1920x1080, High | 78 (21.2 ms) | 67 paced (13.8 ms) | 72 paced (7.1 ms) | 71 paced (7.1 ms) | 79 paced (14 ms) | 7.2 s |
  | Desktop, 1600x900, Medium | 103 (20.7 ms) | 116 (14.2 ms) | 140 (7.2 ms) | 88 paced (13.9 ms) | 72 paced (7.2 ms) | 4.3 s |
  | **Weak laptop**: CPU throttled 4x, 1366x768, Low | 78 (21 ms) | 89 paced (20.7 ms) | 97 paced (14 ms) | 70 paced (7.1 ms) | 95 (20.8 ms) | 10.9 s |
  | **Phone**: 844x390 @2x, touch, Low, CPU 4x | 68 (27.8 ms) | 66 paced (14 ms) | 73 paced (20.8 ms) | 69 paced (7.1 ms) | 69 paced (7.2 ms) | 13.2 s |
  | **Phone**: 390x844 @2x, touch, Low, CPU 4x | 71 paced (27.8 ms) | 65 paced (13.9 ms) | 68 paced (13.7 ms) | 69 paced (7.1 ms) | 76 (20.9 ms) | 8.6 s |

  The weak laptop's Keyway figure moves between runs: 48, 61, 67 and 66 in four runs before the loading changes below, 78 in this one (those changes don't touch a frame's work, so most of that spread is the PC).
  - **The loading changes** (the sound bank in a worker, the toasts' layout read gone), measured on simulated weak phones: the production build's loading step for the sounds went from 1.5 to 1.8 s to a few milliseconds, and the whole load from 11.3 and 11.8 s (two runs) to 9.7, 10.7 and 12.9 s (three runs). A brand-new player's first minute in portrait (`tests/perf-hitch.mjs`) had 7 frames over 50 ms instead of 13.

  `perf.mjs` measures running only a few seconds after joining, when a new session's one-time work (level-ups every few seconds, quest rewards, the first textures) is still happening.
  - **Caveats:** numbers move between runs and with what else the PC is doing. The phones here are simulated (a desktop chip and a 4x-throttled CPU): the game has not yet been measured on a real phone or on the Legion servers.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which). They use their own server port (3069; `TEST_PORT` and `VITE_PORT` move them, so two suites can run side by side), so a game running on 3059 can stay up.

- **`tests/server.test.mjs`, a headless server test.** It covers:
  - A new player's start, ping and the clock, the bots (home for each real player, up the course, never faster than their Level walks).
  - **Steps:** standing still counts nothing; +1 Speed and XP a step; no more steps than strides run; a batch's limit.
  - **Treadmills:** +1 x the belt, only open ones (by Wins earned), only standing on them, their clock-limited bucket.
  - **Moving:** faster than your Level walks is sent back (fine at a higher Level); +2.2 walk speed a Level; too far, too high.
  - **Gates:** short of one pays nothing; through it x3 the first time each rebirth; not again within 30 s; a gate you haven't reached, or passed without coming through its stage, pays nothing.
  - **Going out and revives:** it's counted where you really were; back on the pad with no snap; the first revive FREE into the stage, just inside its gate; one at a time; the next within 3 minutes costs 5 Gems (refused without them); no thanks keeps you on the pad; free again after 3 minutes.
  - **Spending and rewards:** upgrades (Ion Boosters walk faster, Star Charts learn faster), a trail, an aura, a Gem belt, three capsules and the auto team; the daily reward, a gift before and at its time, codes, the wheel, quests.
  - **Rebirth** (below Level 10 refused, what it resets, what it keeps, the next one at Level 15) and **the sectors** (the last gate and the rebirths they want); TO STAGE no further than you've been this rebirth, Train to your best belt.
  - **A second player** sees the first.
  - **Races:** the queue for two, one race, bots filling, a late RACE taking a bot's place; nobody runs before the gun, out of your lane is sent back; finishing; standing still the black hole takes you; a leaver's bot under their name; places and prizes.
  - Nonsense messages; the save on rejoining.
- **`tests/economy.mjs`, a simulated first session**, for the pacing above.
- **`tests/autopilot.mjs`, browser runs with the autopilot:** one press of SPACE gives one jump; the whole loop (steps at +1 Speed and XP, up the Keyway through the gates for Wins, a laser or a rift back to the pad in a bubble, the revive offer back to the stage, a treadmill, the WALK box); full races on all four maps; a run in each other sector; no snaps, no console errors.
- **`tests/passable.mjs`, every stage of every sector passable:** the autopilot starts just inside each stage's gate at the stage's Recommended Level (that Level's walk speed, no upgrades) and has to pass its end gate, paid by the server. Going out sends it to the pad and it takes the revive back in; the tries each stage took are printed, to show which stages are too hard. **`tests/stages.mjs`** screenshots every stage of a sector; **`tests/trace-stage.mjs`** follows the autopilot through one.
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players: the round trip measured, Speed never jumping back while running and no step lost, a gate passed on your screen paid on the server, going out and a revive landing where the server puts you (no snap), others smooth on the server's clock, one queue and one race, each seeing the other.
- **`tests/reconnect.mjs`, a dropped connection** on the Starport and in a race, short and long: it reconnects by itself, steps still count, a bot takes over, nobody's stuck on a course.
- **`tests/prod.mjs`, the production build with real input only.** No QA hooks: keyboard, mouse and touch, with the game's words on screen as the only way to know what happened: W to run (Speed goes up), onto the Keyway and through a gate for Wins; a typed code, an upgrade, a capsule opened, every menu button and its panel, the wheel; the Train button and a step onto the belt (it runs by itself; Shift sprints), the daily reward; the queue (found count, cancel) and a whole race on W and Space; `loadingEnd()` called once, after joining a server, with a stand-in for the SDK; and on a portrait phone: the stick runs, DASH works with a thumb on the stick, a menu button by touch, a button with a thumb still on the stick.
- **`tests/gamepad.mjs`, a session with a controller alone** (a stand-in for the Gamepad API): running, looking, jumps, dashes, RT sprinting on a belt, every HUD button and panel by the ring, buying something, a race to the end, unplugging.
- **`tests/screens.mjs`, screenshots of every screen** at 390x844, 360x800, 375x667, 412x915, 844x390, 667x375, 932x430, 768x1024, 800x600, 1024x600, 1280x720, 1366x768 and 1920x1080: the HUD, every panel, a capsule opening, the big moments with toasts up, a treadmill, a stage, the revive offer, the queue, a race and the results. The HUD's boxes and touch controls are measured for overlaps, anything cut off and the Bloxity corner.
- **`tests/perf.mjs`, frame rates** (`LOW_GPU=1` for the integrated chip; `profile` for a CPU profile of the dev build). **`tests/warm.mjs`** lists any shader compiled after loading. **`tests/tris.mjs`** lists where the triangles go in a few views. **`tests/look.mjs`** takes a few fixed views; **`tests/covers.mjs`** renders the covers. QA helpers kept from the engine: `perf-split.mjs`, `perf-early.mjs`, `perf-first.mjs`, `perf-hitch.mjs`, `perf-parts.mjs`, `trace-pilot.mjs`, `probe.mjs`.
- **The last full run** (11 November 2026):

  - `server.test.mjs`: 96 passed, 0 failed.
  - `passable.mjs`: all 60 stages passed at their Recommended Levels, no stage needing more than 3 tries. (57 in one run and the last 3 in a second, the first having been stopped partway.)
  - `autopilot.mjs`: 42 checks, all good: the whole loop, full races on all four maps, a run in each other sector, 0 snaps, no console errors.
  - `prod.mjs`: 51 checks on the production build with real input, all good, the portrait phone included.
  - `gamepad.mjs`: 67 checks. `latency.mjs`: 17 checks at a measured 360 ms round trip. `reconnect.mjs`: 12 checks. All good.
  - `warm.mjs`: nothing compiled in play.
  - After the loading changes, `autopilot.mjs`, `warm.mjs`, `prod.mjs` (the worker in the production build included), `screens.mjs` on four phone sizes and `perf.mjs` were run again: all good.
  - `screens.mjs`: every screen clean at all 13 sizes: no overlaps, nothing cut off, the Bloxity corner free. (One size timed out loading on a bad spell of the network here, with Google Fonts and the SDK failing, and was clean when run again.)
  - Two browser suites run at the same time on this PC report stages and checks as failed that pass alone, so they were run one at a time.

- **Not tested yet:** a real controller in a person's hands, a real phone, the Legion servers, the real Bloxity SDK (a stand-in here), and a person playing it. The pacing comes from the simulation and the autopilot. The sounds and the two songs were checked by measurement (levels, peaks, no NaNs), not by ear.
- **Known limits:**
  - Rifts, lasers and boost chevrons are judged on the player's screen, not the server (in a race the server judges them for bots). A modified client could skip going out. Refusing moves over them would pull honest players back at a 350 ms round trip, so it's left this way until it's shown to matter. Steps, walking speed, gates, revives and the black hole are all the server's.
  - The page waits for the Bloxity SDK's script before the game starts, as in the other Legion games, so a stalled request for it holds up loading.
  - A laser sweep's beam stops a little short of the rails, so hugging a rail gets past it untouched. It's the same in the engine this came from; lengthening the beam is a one-number change (`SWEEP.r` in `shared/stages.js`) if it turns out to be used too much.

## Hosting

Not hosted yet: the folder isn't a git repository, and nothing has been pushed or deployed. When it is: `bloxity-setup.html` has every field of Bloxity's Create New Game form with copy buttons and the two covers (`node tests/setup-page.mjs` writes it), and `.github/workflows/deploy.yml` deploys to Legion on a push to `main` of `LEGiON-Platforms/spacebar-escape` (it needs the `LEGION_DEPLOY_TOKEN` secret; prod will be https://spacebar-escape.play.bloxity.io once hosted). Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo): session length, time to the first gate passed, steps, gates passed and stages cleared, going out and revives, capsules, races, levels and rebirths gained, frame rate by device, errors.

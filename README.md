# OVERSTEER

A playable web driving sandbox built with Three.js and cannon-es. All city and vehicle geometry is created locally in code; no downloaded game models are required.

## Skyport aircraft and multiplayer dogfights

Choose **Map → Skyport Air Arena**, or **Vehicle → Aircraft** while offline. Skyport is aircraft-only (enforced in the browser and relay); other maps remain road-vehicle-only. The open 9.6 km airspace has a 3 km runway, airport buildings, river, clouds and distant low-poly mountains. Pilots spawn airborne and can make gentle runway landings. This is assisted arcade flight, not a realistic flight simulator; airport buildings/clouds/mountains are visual scenery, and aircraft do not use rigid-body midair collisions.

- **Kestrel F-27:** original low-poly fighter, swept wings, twin fins, cannon and afterburner.
- **Skyliner 777:** original Boeing 777-inspired twin-turbofan airliner, cabin windows and swept wings; unarmed with slower handling. Not an exact licensed Boeing model.
- **Click the game once:** capture and hide the OS cursor using [Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API). **Esc** releases the mouse; menus also release it. Capture needs a browser-supported user click; permission failures show a retry message.
- **Mouse movement:** moves a bounded virtual aim marker using relative mouse motion, so the OS cursor cannot leave the game while captured. The aircraft follows the marker. **F** centres the marker and camera.
- **Hold Mouse 1 after capture:** fire at the marker's camera ray. Nearby target convergence corrects the offset between the chase camera and gun muzzle. The relay validates finite coordinates, range and a forward aiming cone before checking hits; client-provided hit/damage claims are never used. **Hold right mouse:** look around without firing; releasing recentres the view. **C:** cockpit/chase view.
- **W/S:** increase/decrease thrust; **A/D:** bank; **arrows:** backup pitch/bank controls; **Shift:** fighter afterburner. Touch has pitch and FIRE buttons.
- **R:** recovery/respawn (8-second cooldown while alive). Destruction automatically respawns after 4 seconds; fresh spawns get a 5-second shield, cancelled when they fire. **V** cycles only the current map's vehicle type.

Public matchmaking and private room codes work in Skyport. A cannon hit removes 25 of 100 hull points; four hits destroy an aircraft, trigger a shared explosion and award a kill. The scoreboard tracks kills/losses and late joiners receive current health. Aircraft transmit full 3D orientation and altitude. The server only performs bounded numeric ray/sphere hit checks, rate limiting, health/scoring and respawn rules; no renderer or physics world runs there. Tracers and capped explosion particles render in browsers. Positions are still client-reported, so this is not a cheat-proof authoritative flight simulation.

The Skyport ground now uses non-overlapping surface tiles instead of stacked grass, runway, taxiway and water sheets. Runway paint uses explicit depth bias, and flight camera near clipping is 2 m in chase view / 0.5 m in cockpit view to improve depth precision over the 11 km viewing range.

Upload **`oversteer-flight-fix.zip`** using **Express / Node 22.x / npm / `server.js`** and redeploy. This includes the flicker fix, pointer lock, cursor-ray aiming, all vehicles/maps and prebuilt `dist/`. Update the relay too, not just the browser assets. All players should refresh after deployment. Automated tests cover ground overlap, pointer-lock lifecycle, aim projection, flight, geometry and real WebSocket combat. No browser visual play-test was performed.

## Scooters and vehicle categories

The garage now has **All / Cars / Racing Cars / Bikes / Scooters / Aircraft** filters (14 vehicles total). Filtering does not change your current vehicle; selecting a model does. Cycling with **V** reveals the selected vehicle's category if necessary.

- **Swift GT 350:** silver sporty maxi scooter, split front fairing, twin headlights, windscreen, stepped black seat and mirrors.
- **Vesper 125:** blue retro scooter, rounded leg shield and rear pods, circular handlebar headlamp, black bench and mirrors.

Both are original lightweight procedural models inspired by the supplied reference images, not exact imported replicas. They include a seated helmeted rider, browser-side collisions/dents, remote name tags and multiplayer wheelies (**B + throttle**, once moving). Balance and wheelies use the existing arcade two-wheel system, not a full motorcycle simulation. Geometry is merged by material to keep draw calls low.

Both scooters are included in **`oversteer-flight-fix.zip`**. Automated geometry, physics, categories and real WebSocket sync tests cover both scooters.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a static site in `dist/`, deployable to any static web host. `npm run preview` previews that build. On Windows PowerShell with script execution disabled, use `npm.cmd`.

## Multiplayer deployment (Node.js)

This project now includes its own WebSocket room server. It needs a Node.js host rather than static-only hosting.

For `cargame-mp.thetrafficedge.com` on Hostinger, deploy the whole project (not only `dist/`) and configure:

```text
Node.js:       22.x (22.12+)
Build command: npm install && npm run build
Start command: npm start
```

The app listens on the `PORT` supplied by Hostinger and serves both the game and `/ws` WebSocket endpoint from the same domain. After deployment, use **Multiplayer** in the game:

- **Join multiplayer** enters an existing public room for the current map, or creates one if none exists.
- **Create private room** makes a code for friends.
- A `?room=CODE` link opens the join dialog with the code filled, so you can enter your driver name first.
- Public rooms always use 15 traffic cars. Private rooms start at 15; only the creator can change the room density.
- A driver name is required before public matchmaking, private creation or joining by code; blank/invisible names are rejected by the browser and relay. Names can be up to 16 characters and are remembered locally.
- Your own car and other drivers have overhead name tags while connected. Tags face the camera, stay upright during rolls, keep a readable screen size, and render above scene geometry without fog. Vehicle choice is shared with all room members.

Rooms are in-memory and disappear when their final player leaves or the Node app restarts. The private creator's admin rights last for that connection; they are not transferred to guests.

The upload ZIP includes the prebuilt `dist/` folder. On Hostinger's Express preset choose Node 22.x, npm and entry file `server.js`. Upload the whole ZIP and redeploy; it does not require a build-command field. Do not upload only `dist/` because the relay also needs `server.js` and `src/vehicleModels.js`.

Player-to-player collisions run in each browser using finite-mass Cannon bodies, with vehicle-sized shapes, local impulses and local damage. The server validates and relays numeric position, orientation and velocity snapshots at about 20 Hz; it runs no physics loop. Extrapolation is limited to 150 ms and collision bodies are disabled after 750 ms without a snapshot. Cars overlapping at spawn/reset stay non-colliding until separated. Departing players' bodies and render resources are removed.

This reduces server CPU usage, but bandwidth and room routing still cost resources. Player-to-player collision results can diverge under latency and are not cheat-proof or authoritative. Multiplayer NPCs now share stable IDs, colours, route positions and visible damage using a room epoch and periodic clock synchronization. Player dents/repairs and bike wheelies are relayed as bounded numeric state. Rendering and rigid-body collision response remain browser-side.

## Controls

| Input | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A, D / Left, Right | Steer |
| Space | Rear-wheel handbrake |
| B + throttle / touch B / gamepad Y | Bike wheelie (hold while moving) |
| C | Third-person chase / first-person cockpit |
| Drag on the world, in either camera | 360-degree look / orbit (stays where you leave it) |
| Mouse wheel / two-finger pinch | Chase distance / cockpit field-of-view zoom |
| F / double-click / Recenter button | Reset camera angle and zoom |
| R / Recover button | Recover at last racing checkpoint; repair and reset on other maps |
| V | Swap vehicle |
| N | Swap map |
| M | Toggle engine audio |
| Esc | Pause / resume |

A gamepad is used when one is active: left stick steers, the triggers are throttle and brake, and A/B is the handbrake. The keyboard takes over the moment a key is pressed.

Touch controls appear on phones and other touch devices. Audio starts only after a user gesture. Changing tabs or windows pauses the game and releases inputs.

## Included

- A five-speed gearbox with a torque curve, shift points, a rev limiter, and overrun engine braking, driving four independently sprung raycast wheels.
- Longitudinal load transfer: the body dives and squats, and grip moves between the axles under braking and power. A soft traction limit keeps the driven axle from snapping the tail out on its own, while the handbrake bypasses it.
- Front-biased brakes: 100-0 km/h in roughly 39 m (about 1.0 g).
- Three maps, chosen from the Map panel: **Apex Grand Prix**, a 5.4 km racing loop; **Portside District**, a tight city grid; and **Cape Verde Highway**, a four-lane coastal circuit lined with pine, guardrails and overhead gantries.
- Fourteen vehicles: Veloce 240 RS, Marlin GT V8, Comet Hatch S, Viper Coupe GT, Nomad SUV LX, Hauler Pickup XT, Falcon Rally RS, Tempest V12, Formula R1, Rider 900, Swift GT 350, Vesper 125, Kestrel F-27 and Skyliner 777. Choose by category in Vehicle, or cycle with V.
- Rash AI traffic driving the same car and the same suspension as the player. Drivers speed, tailgate, swerve between lanes, stab the brakes for no reason, overtake anything slower, and dive for the player's lane rather than yield. Density is adjustable from 0 to 64 cars, on the HUD and in settings.
- Fixed 120 Hz physics, rigid-body contact resolution, solid buildings, curbs and barriers, a freight-yard ramp, and movable cones.
- Impact-position-based permanent mesh dents, body condition readout, reduced engine performance after damage, and repair/reset.
- Drift scoring with a combo multiplier: hold a slide to build it, exit cleanly to bank it, crash to lose it.
- Shadows, live minimap, skid marks, synthesized engine/crash audio, paint customization, and graphics settings.
- Seven-gate solo time trials on Portside and Cape Verde; three-lap solo/multiplayer races on Apex.

## Apex Grand Prix racing

Select **Map → Apex Grand Prix** before public matchmaking or creating a room. Joining by code loads the host's map automatically. Enter your name, gather up to eight drivers, then the host presses **Start race**. A four-second countdown resets everybody to separate grid slots. **Restart race** resets the entire race, points, times and positions. The private creator starts as race host; the first public player hosts public races. If the host leaves, race control transfers to a remaining driver (this does not transfer private-room traffic permissions).

The original 5.4 km layout is inspired by Silverstone's long straights, arena turns and fast esses, using the [official FIA British GP circuit map](https://www.fia.com/sites/default/files/doc_5_-_2022_british_grand_prix_-_event_notes_-_circuit_map_v2.pdf) as a reference. It is not an exact replica. There are runoffs, continuous collision barriers, red/white kerbs, pit buildings, grandstands, a starting grid and a full-circuit minimap.

- Three laps; 24 ordered checkpoint crossings per lap. Cross forward and within the gate width. The next required gate is orange and marked on the minimap. Skipping a gate or crossing backwards does not count.
- Four cyan boost pads give 2.3 seconds of additional browser-side acceleration and +25 points, once per pad per lap. Checkpoints give +100, laps +500, and finish order adds a bonus. Standings are ordered by completed checkpoints, then finish time, not point totals; equal progress uses grid order.
- **R** or **Recover** repairs and returns you upright to your last accepted checkpoint, facing forward. Before the first checkpoint it returns you to your grid slot. Progress and points are preserved; boost is cancelled. Recovery is rate-limited to once per second. Circuit practice also remembers ordered checkpoints.
- No AI traffic on Apex (including public rooms). Public city/highway rooms remain fixed at 15; private city/highway traffic still belongs to the creator.
- Cars cannot be changed during an active race. New racers cannot enter during countdown/racing; public matchmaking creates another waiting room. Join private races before the start or after everyone finishes/leaves.
- Race clocks continue while a player's menu is open or tab is hidden. Local driving pauses, not the race. Use **Start race** offline for a solo timed run; public/private multiplayer uses the same rules.

The Node process checks numeric checkpoint crossings, boosts, race permissions and timing on incoming state packets. It has no physics engine, rendering loop or per-frame world simulation. Browsers still simulate player collisions, acceleration and damage. This is lightweight casual racing, not cheat-proof competitive racing: clients report positions and lag can affect collision/finish ordering. Server restart loses in-memory rooms/results.

Upload **oversteer-racing-deploy.zip** using Hostinger's Express preset, Node 22.x, npm and entry file `server.js`. The archive contains prebuilt `dist/` and all shared server modules; do not upload only `dist/`. No extra environment variables are required. Hostinger supplies `PORT`.

## Scope and limitations

The handling is inspired by heavy, softly sprung older driving games. This is a small original browser game, not a reproduction of GTA IV. Damage is an approximation: impact falloff deforms render-mesh vertices while the chassis collision shape remains rigid. It does **not** implement BeamNG's node/beam soft-body solver, panel detachment, realistic drivetrain failure, or crash safety modeling. Raycast tires also simplify tire deformation and contact patches. A small fixed step and thick obstacles reduce tunneling, but this is not a continuous-collision solver.

The gearbox is automatic only, with no clutch or manual shifting. AI traffic follows a single lane-based route per map rather than navigating the full street grid, and recovers itself if spun around or shoved off the road; it does not obey the city's junctions and there are no pedestrians. Traffic cars are drawn as instanced copies of the player's model, so they share one paint material set and cannot be individually damaged.

Fonts load from Google Fonts when available and fall back to local system fonts. Game code and assets are bundled for deployment. WebGL 2 is required.

## Validation

### Bikes, sports cars and synchronized traffic

**Rider 900** is an original low-poly classic/naked motorcycle based on the supplied visual reference: dark angular tank, round headlight, flat seat, spoked wheels, chrome fork/exhaust and a helmeted seated human rider. Hold **B** while accelerating above 3 m/s to raise the bike/rider around the rear wheel; release B to lower it. Touch B and gamepad Y work too. This is an arcade wheelie animation with balance-assisted chassis physics and hidden paired wheel rays, not a physically accurate two-wheel motorcycle simulator. Other players see the same wheelie through the network; repairs reset it.

**Tempest V12** is a Lamborghini-inspired wedge supercar (not a licensed/imported replica). **Formula R1** is an original F1-style open-wheel racer with suspension arms, front/rear wings and helmeted driver. New vehicle silhouettes and wheel layouts work in multiplayer and the existing garage/camera controls.

Vehicle geometry is merged by material, including the wheels. Remote cars use reduced trim/interior detail and are hidden beyond 350 m. Numeric dent histories are capped at 24 impacts, validated by the server and only reapplied when changed. Late joiners receive the current history; repair clears it. Very old dents beyond that bounded history can differ from the owner's model, and wheel spin is approximate rather than a full suspension replay.

Multiplayer city/highway NPCs use the same room start epoch and deterministic lane routes on every client. They keep stable identities/paint as density changes and do not rewind when a player repairs or the host leaves. Clock round trips run every five seconds. Only nearby NPCs get browser collision proxies (85 m); instanced visuals are culled beyond 260 m. NPC impact reports require a fresh nearby player position and relative speed, and are rate-limited; shared damage produces shader dents and darker paint for everyone, including late joiners. NPCs remain on their shared paths after collisions rather than sharing a full rigid-body crash simulation. Solo NPCs retain the original physics AI. Apex remains traffic-free.

Upload **oversteer-bikes-shared-traffic.zip** using the existing Express / Node 22.x / `server.js` setup. Updated server modules and rebuilt `dist/` are both included. These changes require everyone to refresh the client after deployment.

`tests/vehicles-sync.test.js` covers wheelie lift/release, damage replay/repair, mesh budgets, deterministic NPC paths/proxies, damage validation and real WebSocket wheelie/dent/NPC synchronization. This does not replace visual play-testing on the target browser/device.

### Arcade combat and breakable props

On Apex, start a solo or multiplayer race and drive through the floating **?** boxes. There are 24 boxes in paired racing lines; each has a shared eight-second respawn cooldown. Hold one item at a time. Press **E** or tap the purple **Use item** button:

- **Nitro:** 2.5 seconds of extra acceleration, with the existing speed cap.
- **Shield:** protects against one weapon hit for up to six seconds. Does not disable normal vehicle/barrier collisions.
- **Pulse bolt:** shoots forward along the car's heading for up to three seconds. A hit briefly slows/pushes an opponent; aim down a straight. Bolts can also smash props.
- **Oil trap:** drops behind the car for nine seconds, briefly slowing and yawing the first opponent to cross it. Cannot hit its owner.

Forty wooden crates and traffic cones sit near the racing line edges. Drive into them above 4 m/s or shoot them to smash them for **+10 points**. A successful unshielded weapon hit earns **+75 points**. Breaking state is shared by everyone in an active race, and every restart restores the props and clears all items, shields, hazards and scores. In untimed practice, prop breaking is local and does not award race points. Players behind on checkpoints have an increased chance of receiving Nitro.

The server chooses items, validates pickup proximity/cooldowns, consumes inventory, checks numeric projectile/oil hits and broadcasts sequenced events. Duplicate hit events cannot apply repeated client knockback. There is a 1.8-second post-hit immunity window and two seconds of weapon immunity after checkpoint recovery. Weapons are unavailable during countdown or after finishing. As elsewhere in this game, client-reported driving positions are trusted; this is casual racing, not an anti-cheat system.

No debris or weapon rigid bodies are added to Cannon. The server advances analytic hazard paths only when fresh driving states arrive (at most 25 checks/second per room), not through a physics loop. Projectiles use a straight path rather than terrain collision physics. A room has at most 12 live hazards; each browser has at most 64 short-lived cosmetic debris particles, pooled instanced visuals, and a 300 m effects visibility radius. Previous scenery streaming and render optimizations remain enabled. Server bandwidth still increases when gameplay events are broadcast.

Upload **oversteer-arcade-racing.zip** using the existing Express / Node 22.x / `server.js` settings. Both the updated Node modules and rebuilt `dist/` are required. The archive includes both.

`tests/arcade.test.js` checks pickups, cooldowns, inventory limits, projectile/oil hits, shields, recovery immunity, destruction, restart cleanup, bounded rendering and real WebSocket state synchronization. Visual browser play-testing has not been performed.

### Apex browser performance

Apex keeps its full 1,522 static obstacles but only activates those near the local car (160 m preload radius, refreshed after 32 m of movement). The floor, local car and remote-player collision bodies are never streamed out. Checkpoint recovery, race resets and car/map changes refresh nearby obstacles before the next physics step. All track barriers remain solid; the physics timestep stays at 120 Hz.

Track surfaces are split into roughly 144 m sections. Coloured scenery boxes are merged into 128 m spatial tiles, so camera/shadow culling can exclude distant sections. Road/runoff surfaces no longer overlap in three full-track layers. Decorative treetops and low kerbs/barriers do not cast expensive shadows; nearby tall structures still do. Sign textures are 512×128 instead of 1024×256. Apex uses a 1024 shadow map, a 900 m far clip with matching fog, and a high-quality pixel-ratio cap of 1.25. Race HUD DOM work runs at 10 Hz while checkpoint detection and driving remain full-rate.

Run `node scripts/benchmark-apex.mjs` for a CPU-only fixed-step benchmark, or add `--full-scenery` to compare with all static bodies active. This is not a browser FPS/GPU benchmark. The read-only `window.__oversteer.snapshot()` includes `physicsBodies`, `sceneryActive`, `sceneryTotal`, `pixelRatio`, `drawCalls` and `triangles` for live troubleshooting. Choose **Settings → Graphics quality → Performance** for the lowest rendering load.

Upload `oversteer-apex-optimized.zip` with the same Express / Node 22.x / `server.js` deployment settings. The archive includes the rebuilt client; a server-only update will not deliver these browser changes.

`tests/racing.test.js` covers track closure and spawn directions, gate order/direction/width, three-lap finishes, scoring, boost reuse, checkpoint recovery, full race resets, orbit-camera math, generated world geometry/disposal and real WebSocket host permissions, race synchronization and public-room isolation. No Playwright is needed. These additions have not been visually play-tested in a browser.

`tests/multiplayer.test.js` exercises all seven models, repeated mesh/cockpit switching, browser collision damage and momentum transfer, spawn protection, stale/removed remote bodies, and real WebSocket room/traffic permissions. It does not require Playwright. The current changes have not been visually verified in a live browser.

`npm test` checks suspension equilibrium, acceleration/braking/reverse, steering, collisions and damage, repair/reset, deterministic fixed-step behavior, gearbox progression and rev limits, engine braking, analog/digital input parity, load transfer, and the route lane and heading conventions that traffic depends on. Browser smoke testing is in `tests/browser.mjs` and can be run against a dev server with `node tests/browser.mjs`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if an existing Chromium installation should be used.

Physics references: [cannon-es RaycastVehicle](https://pmndrs.github.io/cannon-es/docs/classes/RaycastVehicle.html). Rendering reference: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

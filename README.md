# OVERSTEER

A playable web driving sandbox built with Three.js and cannon-es. All city and vehicle geometry is created locally in code; no downloaded game models are required.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a static site in `dist/`, deployable to any static web host. `npm run preview` previews that build. On Windows PowerShell with script execution disabled, use `npm.cmd`.

## Controls

| Input | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A, D / Left, Right | Steer |
| Space | Rear-wheel handbrake |
| C | Third-person chase / first-person cockpit |
| Drag in cockpit | Look around |
| R | Repair and reset |
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
- Two maps, chosen from the Map panel: **Portside District**, a tight city grid, and **Cape Verde Highway**, a four-lane coastal circuit lined with pine, guardrails and overhead gantries.
- Two vehicles with distinct drivetrains: the Veloce 240 RS (1,480 kg, I6) and the heavier, softer Marlin GT (1,710 kg, V8).
- Rash AI traffic driving the same car and the same suspension as the player. Drivers speed, tailgate, swerve between lanes, stab the brakes for no reason, overtake anything slower, and dive for the player's lane rather than yield. Density is adjustable from 0 to 64 cars, on the HUD and in settings.
- Fixed 120 Hz physics, rigid-body contact resolution, solid buildings, curbs and barriers, a freight-yard ramp, and movable cones.
- Impact-position-based permanent mesh dents, body condition readout, reduced engine performance after damage, and repair/reset.
- Drift scoring with a combo multiplier: hold a slide to build it, exit cleanly to bank it, crash to lose it.
- Shadows, live minimap, skid marks, synthesized engine/crash audio, paint customization, and graphics settings.
- A seven-gate time trial per map, each with its own personal best stored locally.

## Scope and limitations

The handling is inspired by heavy, softly sprung older driving games. This is a small original browser game, not a reproduction of GTA IV. Damage is an approximation: impact falloff deforms render-mesh vertices while the chassis collision shape remains rigid. It does **not** implement BeamNG's node/beam soft-body solver, panel detachment, realistic drivetrain failure, or crash safety modeling. Raycast tires also simplify tire deformation and contact patches. A small fixed step and thick obstacles reduce tunneling, but this is not a continuous-collision solver.

The gearbox is automatic only, with no clutch or manual shifting. AI traffic follows a single lane-based route per map rather than navigating the full street grid, and recovers itself if spun around or shoved off the road; it does not obey the city's junctions and there are no pedestrians. Traffic cars are drawn as instanced copies of the player's model, so they share one paint material set and cannot be individually damaged.

Fonts load from Google Fonts when available and fall back to local system fonts. Game code and assets are bundled for deployment. WebGL 2 is required.

## Validation

`npm test` checks suspension equilibrium, acceleration/braking/reverse, steering, collisions and damage, repair/reset, deterministic fixed-step behavior, gearbox progression and rev limits, engine braking, analog/digital input parity, load transfer, and the route lane and heading conventions that traffic depends on. Browser smoke testing is in `tests/browser.mjs` and can be run against a dev server with `node tests/browser.mjs`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if an existing Chromium installation should be used.

Physics references: [cannon-es RaycastVehicle](https://pmndrs.github.io/cannon-es/docs/classes/RaycastVehicle.html). Rendering reference: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

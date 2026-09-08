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
| M | Toggle engine audio |
| Esc | Pause / resume |

Touch controls appear on phones and other touch devices. Audio starts only after a user gesture. Changing tabs or windows pauses the game and releases inputs.

## Included

- Rear-wheel drive, mass and inertia, four independently sprung raycast wheels, damping, speed-sensitive steering, aerodynamic drag, braking, reverse, and grip-limited slides.
- Fixed 120 Hz physics, rigid-body contact resolution, solid buildings, curbs and barriers, a freight-yard ramp, and movable cones.
- Impact-position-based permanent mesh dents, body condition readout, reduced engine performance after damage, and repair/reset.
- A modeled sedan with detailed wheels, lights, windows, cabin, and animated steering wheel.
- A procedural industrial district, shadows, live minimap, skid marks, synthesized engine/crash audio, paint customization, and graphics settings.
- A six-checkpoint time trial, with a personal best stored locally.

## Scope and limitations

The handling is inspired by heavy, softly sprung older driving games. This is a small original browser game, not a reproduction of GTA IV. Damage is an approximation: impact falloff deforms render-mesh vertices while the chassis collision shape remains rigid. It does **not** implement BeamNG's node/beam soft-body solver, panel detachment, realistic drivetrain failure, or crash safety modeling. Raycast tires also simplify tire deformation and contact patches. A small fixed step and thick obstacles reduce tunneling, but this is not a continuous-collision solver. The environment contains no AI traffic or pedestrians.

Fonts load from Google Fonts when available and fall back to local system fonts. Game code and assets are bundled for deployment. WebGL 2 is required.

## Validation

`npm test` checks suspension equilibrium, acceleration/braking/reverse, steering, collisions and damage, repair/reset, and deterministic fixed-step behavior. Browser smoke testing is in `tests/browser.mjs` and can be run against a dev server with `node tests/browser.mjs`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if an existing Chromium installation should be used.

Physics references: [cannon-es RaycastVehicle](https://pmndrs.github.io/cannon-es/docs/classes/RaycastVehicle.html). Rendering reference: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

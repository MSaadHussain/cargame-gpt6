/**
 * The car's shape, defined once as a sequence of calls against an emitter.
 *
 * The player's car runs this against an emitter that builds individually
 * addressable meshes, because impact deformation has to move single panels.
 * Traffic runs the same definition against an emitter that merges everything
 * into one geometry per material, so every AI car is the same model drawn from
 * a handful of instanced meshes.
 */
export function defineCarBody(api, options = {}) {
  const { part, beam, windowQuad } = api;
  const interior = options.interior !== false;
  const detail = options.detail !== false;

  // Main body panels. These are the ones that take dents.
  part(1.91, 0.44, 4.38, 0, 0.22, 0, 'paint', 0.11, true);
  part(1.83, 0.18, 1.34, 0, 0.51, -1.44, 'paint', 0.07, true);
  part(1.85, 0.18, 0.85, 0, 0.51, 1.7, 'paint', 0.06, true);
  part(1.52, 0.1, 1.81, 0, 1.11, 0.08, 'paint', 0.055, true);
  part(1.86, 0.09, 4.05, 0, 0.04, 0, 'dark', 0.025);

  windowQuad([[-0.84, 0.6, -1.14], [0.84, 0.6, -1.14], [0.72, 1.075, -0.8], [-0.72, 1.075, -0.8]], 'front');
  windowQuad([[0.84, 0.6, 1.24], [-0.84, 0.6, 1.24], [-0.72, 1.075, 0.92], [0.72, 1.075, 0.92]], 'rear');

  for (const s of [-1, 1]) {
    windowQuad([[s * 0.85, 0.59, -1.1], [s * 0.85, 0.59, 1.18], [s * 0.735, 1.07, 0.88], [s * 0.735, 1.07, -0.77]], 'side');
    beam([s * 0.85, 0.57, -1.14], [s * 0.74, 1.11, -0.8], 0.075, 'paint');
    beam([s * 0.85, 0.57, 1.26], [s * 0.74, 1.11, 0.92], 0.105, 'paint');
    beam([s * 0.86, 0.59, 0.05], [s * 0.75, 1.095, 0.05], 0.072, 'trim');
    part(0.045, 0.056, 3.96, s * 0.961, 0.245, 0, 'trim');
    if (detail) {
      part(0.026, 0.035, 2.52, s * 0.944, 0.575, 0.06, 'chrome');
      part(0.022, 0.025, 0.28, s * 0.966, 0.47, -0.04, 'chrome', 0.009);
      part(0.022, 0.025, 0.28, s * 0.966, 0.47, 0.91, 'chrome', 0.009);
      part(0.007, 0.34, 0.012, s * 0.962, 0.37, 0.2, 'dark');
      part(0.007, 0.31, 0.012, s * 0.962, 0.36, 1.18, 'dark');
      part(0.007, 0.31, 0.012, s * 0.962, 0.36, -1.05, 'dark');
      part(0.018, 0.053, 0.14, s * 0.963, 0.46, -1.29, 'headlight');
    }
    // Mirrors, lights and bumper corners read at any distance, so traffic keeps them.
    part(0.25, 0.16, 0.31, s * 1.01, 0.69, -0.85, 'paint', 0.06);
    part(0.19, 0.10, 0.02, s * 1.024, 0.7, -0.686, 'chrome', 0.025);
    part(0.68, 0.18, 0.065, s * 0.53, 0.4, -2.171, 'headlight', 0.025, true);
    part(0.66, 0.16, 0.075, s * 0.56, 0.42, 2.175, 'red', 0.025, true);
    part(0.6, 0.027, 0.08, s * 0.56, 0.40, 2.19, 'chrome');
    part(0.17, 0.12, 0.12, s * 0.66, 0.12, -2.18, 'headlight', 0.025);
  }

  part(0.42, 0.19, 0.05, 0, 0.4, -2.2, 'trim', 0.02);
  if (detail) for (let i = -3; i <= 3; i++) part(0.013, 0.14, 0.06, i * 0.05, 0.4, -2.23, 'chrome');
  part(1.82, 0.085, 0.12, 0, 0.21, -2.2, 'trim', 0.03, true);
  part(1.82, 0.085, 0.12, 0, 0.20, 2.2, 'trim', 0.03, true);
  part(0.8, 0.095, 0.055, 0, 0.07, -2.16, 'dark');
  if (detail) part(0.15, 0.12, 0.26, -0.65, -0.01, 2.17, 'chrome', 0.05);

  if (interior) {
    for (const x of [-0.43, 0.43]) {
      part(0.55, 0.15, 0.57, x, 0.37, 0.12, 'dark', 0.06);
      part(0.55, 0.55, 0.13, x, 0.65, 0.41, 'dark', 0.05, false, { rotateX: -0.12 });
      part(0.27, 0.18, 0.12, x, 0.99, 0.44, 'dark', 0.05);
    }
    part(1.49, 0.35, 0.25, 0, 0.64, 0.99, 'dark', 0.06);
    part(1.6, 0.16, 0.45, 0, 0.58, -0.88, 'dark', 0.055);
    part(1.5, 0.04, 0.04, 0, 0.565, -0.63, 'chrome');
    part(0.24, 0.28, 0.57, 0, 0.33, -0.4, 'dark', 0.03);
  } else {
    // Traffic still needs something behind the glass, but only a suggestion of it.
    part(1.3, 0.42, 1.5, 0, 0.62, 0.1, 'dark', 0.05);
  }
}

// Wheel construction, shared so traffic rolls on the same rims as the player.
export function defineWheel(api, options = {}) {
  const { cylinder, box, torus } = api;
  const detail = options.detail !== false;
  cylinder(0.36, 0.36, 0.235, 32, 'rubber', 0, 0);
  for (const side of [-1, 1]) {
    cylinder(0.25, 0.25, 0.018, 32, 'chrome', side * 0.124, 0);
    cylinder(0.208, 0.208, 0.019, 32, 'dark', side * 0.137, 0);
    for (let j = 0; j < 8; j++) box(0.024, 0.405, 0.045, side * 0.15, j * Math.PI / 8, 'chrome');
    cylinder(0.075, 0.075, 0.027, 16, 'chrome', side * 0.16, 0);
    if (detail) torus(0.3, 0.006, 4, 32, 'trim', side * 0.12);
  }
}

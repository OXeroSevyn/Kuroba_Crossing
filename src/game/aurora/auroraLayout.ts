/**
 * Placement of the Aurora City diorama in the open world (no three.js dependency, so the HUD can
 * use it too). The diorama is built in its own local units with the harbor towards local +z; it is
 * rotated so the harbor faces the western sea and scaled up to match the player's size.
 *
 *   local (x, z)  ->  world (AURORA_ORIGIN_X - S * z,  AURORA_ORIGIN_Z + S * x)
 *
 *  - Local north edge z = -43.5 sits on the Kuroba border at world x = -47.
 *  - Local City Hall spine x = 0 lines up with the Grand Central highway at world z = 13.8.
 *  - Quay z = 32.5 -> world x = -142 (sea beyond); outskirts reach local x = 134 -> world z ~ 181.
 */
export const AURORA_SCALE = 1.25;
export const AURORA_ORIGIN_X = -101.375;
export const AURORA_ORIGIN_Z = 13.8;

/** World x of the Kuroba/Aurora border. */
export const AURORA_BORDER_X = AURORA_ORIGIN_X + 43.5 * AURORA_SCALE;
/** World z of the city's northern (Snowpeak-side) edge. */
export const AURORA_NORTH_Z = AURORA_ORIGIN_Z - 46 * AURORA_SCALE;
/** World x of the harbor quay / western shore. */
export const AURORA_COAST_X = AURORA_ORIGIN_X - 32.5 * AURORA_SCALE;

export function auroraLocalToWorld(lx: number, lz: number): { x: number; z: number } {
  return { x: AURORA_ORIGIN_X - AURORA_SCALE * lz, z: AURORA_ORIGIN_Z + AURORA_SCALE * lx };
}

/** World yaw (forward = sin/cos) for a heading along diorama-local +x / -x / +z / -z. */
export const AURORA_YAW = { px: 0, nx: Math.PI, pz: -Math.PI * 0.5, nz: Math.PI * 0.5 } as const;

/** True for world points inside the Aurora City footprint (city, outskirts and western sea). */
export function isInAuroraFootprint(x: number, z: number): boolean {
  return x < AURORA_BORDER_X && z > AURORA_NORTH_Z;
}

/** Aurora's main streets as world-space segments [x1, z1, x2, z2], for the minimap. */
export const AURORA_MINIMAP_ROADS: Array<[number, number, number, number]> = (
  [
    [0, -43.5, 0, -33], // City Hall spine: gateway -> North loop (City Hall blocks the middle)
    [0, -17.5, 0, -12], // City Hall south steps -> plaza
    [0, 11.5, 0, 33], // Harbor spine
    [-42, 16, 134, 16], // Southern Boulevard -> outskirts
    [-24, -35, 24, -35], // North downtown loop
    [-24, -13, 24, -13], // Mid downtown road
    [-22, -37, -22, -11],
    [22, -37, 22, -11],
    [-10, -15, -10, 18], // Plaza avenues
    [10, -15, 10, 18],
    [39, -25, 39, 18], // East perimeter avenue
    [-34, -23.25, -22, -23.25], // Park spur
    [22, -23.25, 134, -23.25], // Village lane -> outskirts
    [65.76, -43.5, 65.76, 30.5], // Outskirts Avenue A (south beltway)
  ] as Array<[number, number, number, number]>
).map(([ax, az, bx, bz]) => {
  const a = auroraLocalToWorld(ax, az);
  const b = auroraLocalToWorld(bx, bz);
  return [a.x, a.z, b.x, b.z];
});

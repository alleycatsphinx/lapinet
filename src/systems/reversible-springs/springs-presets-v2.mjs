/** V2 demo presets recorded from operator screenshots (Nov 16, 2026).
 * Coefficients match the screenshots. Population and coordinate resolution
 * are independently raised to the maximum for the selected sphere topology.
 * 24-cell source sphere: 6,272 bonded sites. 11-cell source sphere: 515
 * trimmed symmetrically to 512 for bounded all-pairs interactions.
 */
export const SPRING_PRESETS=Object.freeze({
 springs:Object.freeze({
  mode:'bonded',shape:'sphere',side:24,precision:96,
  stiffness:61,restScale:180,perturb:0,
  reflect:false,collisions:false,collisionRadius:65,
  alignment:0,coupling:0,cohesion:0,separation:0,contactRange:160,
  gravity:4,enableGravity:false,showEdges:true,showVelocity:false
 }),
 flock:Object.freeze({
  mode:'flock',shape:'sphere',side:11,precision:96,
  stiffness:0,restScale:100,perturb:10,
  reflect:true,collisions:false,collisionRadius:65,
  alignment:62,coupling:1,cohesion:22,separation:1,contactRange:160,
  gravity:4,enableGravity:false,showEdges:true,showVelocity:true
 }),
 dynamic:Object.freeze({
  mode:'dynamic',shape:'sphere',side:11,precision:96,
  stiffness:12,restScale:100,perturb:10,
  reflect:false,collisions:false,collisionRadius:65,
  alignment:0,coupling:0,cohesion:0,separation:0,contactRange:155,
  gravity:4,enableGravity:false,showEdges:true,showVelocity:false
 }),
 linear:Object.freeze({
  mode:'straight',shape:'sphere',side:11,precision:96,
  stiffness:0,restScale:100,perturb:10,
  reflect:true,collisions:true,collisionRadius:65,
  alignment:0,coupling:0,cohesion:0,separation:0,contactRange:160,
  gravity:4,enableGravity:false,showEdges:true,showVelocity:true
 })
});
export const DEMO_NAMES=Object.freeze(['springs','flock','dynamic','linear']);

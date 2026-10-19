import * as CANNON from 'cannon-es';
import { FLIGHT_LIMIT, FLIGHT_CEILING } from './airCombatRules.js';
import { aircraftSpec } from './aircraftSpecs.js';
export { flightSpawn, FLIGHT_LIMIT, FLIGHT_CEILING } from './airCombatRules.js';
export function resetFlight(physics) {
  physics.flight={throttle:.65,speed:95,pitch:0,roll:0,heading:0,crashed:false,gearDown:false,gear:0,grounded:false};
}
export function toggleLandingGear(physics) {
  if(!physics.flightMode||physics.flight.grounded)return false;
  physics.flight.gearDown=!physics.flight.gearDown;return true;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const delta=new CANNON.Quaternion(),forward=new CANNON.Vec3(),up=new CANNON.Vec3();
export function stepFlight(physics,input,dt) {
  const f=physics.flight,b=physics.chassis,s=aircraftSpec(physics.spec.id);
  if(f.crashed||physics.damage>=100){b.velocity.setZero();return;}
  f.gear=clamp(f.gear+(f.gearDown?1:-1)*dt*.8,0,1);
  f.throttle=clamp(f.throttle+((input.forward?1:0)-(input.backward?1:0))*dt*.4,0,1);
  const pitch=clamp(input.pitchAxis||0,-1,1),bank=clamp(input.rollAxis||0,-1,1),rudder=clamp(input.yawAxis||0,-1,1);
  // Local quaternion integration permits complete loops and barrel rolls.
  const pitchStep=(f.grounded&&f.speed<s.stallSpeed*1.15?0:pitch*s.pitchRate)*dt,rollStep=(f.grounded?0:bank*s.rollRate)*dt,yawStep=rudder*s.yawRate*dt;
  delta.setFromEuler(pitchStep,yawStep,rollStep,'YXZ');b.quaternion.mult(delta,b.quaternion);b.quaternion.normalize();
  f.pitch+=pitchStep;f.roll+=rollStep;f.heading+=yawStep;
  const target=f.throttle*s.maxSpeed+(input.boost&&physics.spec.id==='kestrel'?65:0);
  f.speed+=(target-f.speed)*Math.min(1,dt*(f.grounded?.8:.3));
  if(f.grounded&&input.backward)f.speed=Math.max(0,f.speed-dt*22);
  b.quaternion.vmult(new CANNON.Vec3(0,0,-1),forward);b.quaternion.vmult(new CANNON.Vec3(0,1,0),up);
  if(Math.max(Math.abs(b.position.x),Math.abs(b.position.z))>FLIGHT_LIMIT||b.position.y>FLIGHT_CEILING+80) {
    const heading=Math.atan2(b.position.x,b.position.z);b.quaternion.setFromEuler(-.12,heading,0,'YXZ');b.quaternion.vmult(new CANNON.Vec3(0,0,-1),forward);b.quaternion.vmult(new CANNON.Vec3(0,1,0),up);
  }
  b.velocity.copy(forward.scale(f.speed));
  if(f.grounded) {
    if(f.speed>s.stallSpeed*1.15&&forward.y>.08)f.grounded=false;
    else {b.velocity.y=0;b.position.y=s.gearHeight;}
  } else if(f.speed<s.stallSpeed)b.velocity.y-=(s.stallSpeed-f.speed)*.65;
  b.angularVelocity.setZero();b.force.setZero();b.torque.setZero();physics.world.step(dt);
  if(b.position.y<s.gearHeight&&!f.grounded) {
    const runway=Math.abs(b.position.x)<43&&Math.abs(b.position.z)<1490;
    if(runway&&f.gear>.95&&up.y>.85&&Math.abs(forward.x)<.3&&b.velocity.y>-6&&forward.y>-.15&&f.speed<s.landingSpeed) {
      b.position.y=s.gearHeight;b.velocity.y=0;f.grounded=true;
      b.quaternion.setFromEuler(0,Math.atan2(-forward.x,-forward.z),0,'YXZ');
    } else {b.position.y=s.gearHeight;f.crashed=true;physics.damage=100;b.velocity.setZero();}
  }
  physics.throttle=f.throttle;physics.rpm=physics.spec.idleRpm+f.throttle*(physics.spec.maxRpm-physics.spec.idleRpm);
  physics.gear=1;physics.braking=!!input.backward;physics.distance+=f.speed*dt;physics.steer=bank*.4;
}

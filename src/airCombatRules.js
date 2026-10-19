// Numeric-only room rules: no renderer, Cannon world, or projectile simulation.
import { isAircraft } from './vehicleModels.js';
import { AirWeapons } from './airWeapons.js';
export const FLIGHT_LIMIT=4800, FLIGHT_CEILING=1800;
export function flightSpawn(slot=0) {return {x:(slot%4-1.5)*220,y:260+Math.floor(slot/4)*120,z:1300+Math.floor(slot/4)*500,heading:0};}
export function shotDirection(p) {
  const {qx:x,qy:y,qz:z,qw:w}=p;
  return {x:-2*(x*z+w*y),y:2*(w*x-y*z),z:-(1-2*(x*x+y*y))};
}
export class AirCombat {
  constructor(){this.pilots=new Map();this.weapons=new AirWeapons(this,shotDirection);}
  join(id,name,now=Date.now()) {
    const used=new Set([...this.pilots.values()].map(p=>p.slot));let slot=0;while(used.has(slot))slot++;
    const p={id,name,slot,hp:100,kills:0,deaths:0,protectedUntil:now+5000,respawnAt:0,lastShot:-Infinity,lastReset:now};
    this.weapons.reset(p);this.pilots.set(id,p);return flightSpawn(slot);
  }
  leave(id){this.pilots.delete(id);}
  snapshot(now=Date.now()){return {serverNow:now,pilots:[...this.pilots.values()].map(({lastShot,lastReset,...p})=>p),missiles:this.weapons.snapshot()};}
  die(id,position,now=Date.now(),killer=null) {
    const p=this.pilots.get(id);if(!p||p.hp<=0)return null;
    p.hp=0;p.deaths++;p.respawnAt=now+4000;
    if(killer&&killer!==id&&this.pilots.has(killer))this.pilots.get(killer).kills++;
    return {id,x:position.x,y:position.y,z:position.z};
  }
  respawn(id,now=Date.now()) {
    const p=this.pilots.get(id);if(!p||(p.hp<=0?now<p.respawnAt:now-p.lastReset<8000))return null;
    const dead=p.hp<=0;p.hp=100;p.protectedUntil=now+5000;p.respawnAt=0;p.lastReset=now;p.lastShot=now;
    if(dead)this.weapons.reset(p);else{p.lockTarget=null;p.lockReady=false;}
    return flightSpawn(p.slot);
  }
  fire(id,positions,now=Date.now(),aim=null) {
    const p=this.pilots.get(id),shooter=positions.get(id);
    if(!p||p.hp<=0||!shooter?.ready||shooter.vehicle!=='kestrel'||!Number.isFinite(shooter.stateAt)||now<shooter.stateAt||now-shooter.stateAt>600||now-p.lastShot<250)return null;
    const forward=shotDirection(shooter),origin={x:shooter.x+forward.x*10,y:shooter.y+forward.y*10,z:shooter.z+forward.z*10};
    let direction=forward,range=1400;
    if(aim!==null) {
      if(!aim||!['x','y','z'].every(k=>Number.isFinite(aim[k])))return null;
      const dx=aim.x-origin.x,dy=aim.y-origin.y,dz=aim.z-origin.z,length=Math.hypot(dx,dy,dz);
      if(length<2||length>1800)return null;
      direction={x:dx/length,y:dy/length,z:dz/length};
      // Bounded forward aiming cone; never accept a client-supplied hit or damage.
      if(direction.x*forward.x+direction.y*forward.y+direction.z*forward.z<.35)return null;
      range=Math.min(1400,length+1);
    }
    p.lastShot=now;p.protectedUntil=0;
    let nearest=range,hit=null;
    for(const [other,target] of positions) {
      const pilot=this.pilots.get(other);
      if(other===id||!pilot||pilot.hp<=0||now<pilot.protectedUntil||!target.ready||!isAircraft(target.vehicle)||!Number.isFinite(target.stateAt)||now<target.stateAt||now-target.stateAt>600)continue;
      const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,along=dx*direction.x+dy*direction.y+dz*direction.z;
      const radius=target.vehicle==='skyliner'?22:7;
      const sideSquared=Math.max(0,dx*dx+dy*dy+dz*dz-along*along);
      if(sideSquared>radius*radius||along<0)continue;
      const entry=Math.max(0,along-Math.sqrt(radius*radius-sideSquared));
      if(entry<nearest){nearest=entry;hit=other;}
    }
    let destroyed=null;
    if(hit){const victim=this.pilots.get(hit);if(victim.hp<=25)destroyed=this.die(hit,positions.get(hit),now,id);else victim.hp-=25;}
    return {t:'airShot',shooter:id,origin,direction,length:nearest,hit,destroyed,air:this.snapshot(now)};
  }
}

// Bounded numeric homing simulation. No meshes, rigid bodies or browser imports.
export class AirWeapons {
  constructor(combat,direction){this.combat=combat;this.direction=direction;this.missiles=[];this.serial=0;}
  reset(p){p.missiles=4;p.flares=3;p.lockTarget=null;p.lockStarted=0;p.lockReady=false;p.flareUntil=0;p.lastFlare=-10000;p.lastLaunch=-10000;}
  valid(id,target,positions,now) {
    const a=positions.get(id),b=positions.get(target),pilot=this.combat.pilots.get(id),other=this.combat.pilots.get(target);
    if(!a?.ready||!b?.ready||a.vehicle!=='kestrel'||!pilot||!other||pilot.hp<=0||other.hp<=0||other.protectedUntil>now||id===target||now-a.stateAt>700||now-b.stateAt>700)return false;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz),f=this.direction(a);
    return d>20&&d<2500&&(dx*f.x+dy*f.y+dz*f.z)/d>.7;
  }
  lock(id,target,positions,now=Date.now()) {
    const p=this.combat.pilots.get(id);if(!p)return false;
    if(!this.valid(id,target,positions,now)){p.lockTarget=null;p.lockReady=false;return false;}
    if(p.lockTarget!==target){p.lockTarget=target;p.lockStarted=now;p.lockReady=false;}return true;
  }
  launch(id,positions,now=Date.now()) {
    const p=this.combat.pilots.get(id),a=positions.get(id);
    if(!p?.lockReady||p.missiles<=0||this.missiles.length>=16||now-p.lastLaunch<900||!this.valid(id,p.lockTarget,positions,now))return null;
    const f=this.direction(a),target=this.combat.pilots.get(p.lockTarget);
    const missile={id:++this.serial,owner:id,target:p.lockTarget,x:a.x+f.x*12,y:a.y+f.y*12,z:a.z+f.z*12,lastAt:now,expires:now+30000,diverted:false};
    if(target.flareUntil>now&&target.decoy){missile.decoy={...target.decoy};missile.diverted=true;}
    this.missiles.push(missile);p.missiles--;p.lastLaunch=now;p.protectedUntil=0;p.lockTarget=null;p.lockReady=false;
    return {t:'airMissile',owner:id,missile:{...missile},air:this.combat.snapshot(now)};
  }
  flare(id,positions,now=Date.now()) {
    const p=this.combat.pilots.get(id),a=positions.get(id);
    if(!p||p.hp<=0||p.flares<=0||!a?.ready||now-a.stateAt>700||now-p.lastFlare<2000)return null;
    p.flares--;p.lastFlare=now;p.flareUntil=now+2500;
    const f=this.direction(a);p.decoy={x:a.x-f.x*100+80,y:a.y-30,z:a.z-f.z*100};
    for(const m of this.missiles)if(m.target===id&&!m.diverted){m.decoy={...p.decoy};m.diverted=true;}
    return {t:'airFlare',id,x:a.x,y:a.y,z:a.z,air:this.combat.snapshot(now)};
  }
  tick(positions,now=Date.now()) {
    const events=[];let active=this.missiles.length>0;
    for(const p of this.combat.pilots.values())if(p.lockTarget){active=true;if(!this.valid(p.id,p.lockTarget,positions,now)){p.lockTarget=null;p.lockReady=false;}else p.lockReady=now-p.lockStarted>=1200;}
    for(let i=this.missiles.length-1;i>=0;i--) {
      const m=this.missiles[i],target=positions.get(m.target),pilot=this.combat.pilots.get(m.target),goal=m.decoy||target;
      if(now>=m.expires||!goal||(!m.diverted&&(!pilot||pilot.hp<=0))){this.missiles.splice(i,1);continue;}
      const dt=Math.max(0,Math.min(.1,(now-m.lastAt)/1000));m.lastAt=now;
      const dx=goal.x-m.x,dy=goal.y-m.y,dz=goal.z-m.z,d=Math.hypot(dx,dy,dz),step=650*dt,radius=m.diverted?3:target.vehicle==='skyliner'?22:7;
      if(d<=step+radius) {
        if(!m.diverted&&now>=pilot.protectedUntil){const destroyed=this.combat.die(m.target,target,now,m.owner);if(destroyed)events.push({t:'airMissileHit',destroyed,owner:m.owner});}
        this.missiles.splice(i,1);continue;
      }
      m.x+=dx/d*step;m.y+=dy/d*step;m.z+=dz/d*step;
    }
    return {active,events};
  }
  snapshot(){return this.missiles.map(({lastAt,expires,decoy,...m})=>m);}
}

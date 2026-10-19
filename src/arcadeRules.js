import { CIRCUIT } from './circuit.js';

const offset=(t,side)=>{const p=CIRCUIT.sample(t);return {x:p.x-p.nz*side,z:p.z+p.nx*side,yaw:p.yaw};};
export const PICKUPS=Array.from({length:12},(_,i)=>[-5.5,5.5].map((side,j)=>({id:i*2+j,...offset((i+.5)/12,side)}))).flat();
export const BREAKABLES=Array.from({length:40},(_,i)=>({id:i,type:i%2?'cone':'crate',...offset((i+.35)/40,(i%2?1:-1)*8.5)}));
export const ITEM_NAMES={boost:'Nitro',shield:'Shield',bolt:'Pulse bolt',oil:'Oil trap'};
export const HAZARD_LIMIT=12;
export function hazardPosition(h,time) {const age=Math.max(0,time-h.born)/1000;return {x:h.x+(h.dx||0)*age,z:h.z+(h.dz||0)*age};}
export function segmentDistance(a,b,p) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
  return Math.hypot(a.x+dx*t-p.x,a.z+dz*t-p.z);
}

// Small event-driven numeric rules, not a rigid-body simulation. No server frame loop.
export class Arcade {
  constructor(random=Math.random) {this.random=random;this.players=new Map();this.positions=new Map();this.pickups=PICKUPS.map(()=>0);this.broken=new Set();this.hazards=[];this.events=[];this.seq=0;this.nextHazard=0;this.lastTick=0;}
  player(id) {if(!this.players.has(id))this.players.set(id,{item:null,shieldUntil:0,boostUntil:0,immuneUntil:0});return this.players.get(id);}
  event(type,data) {this.events.push({seq:++this.seq,type,...data});if(this.events.length>24)this.events.shift();}
  recover(id,now) {const p=this.player(id);p.boostUntil=0;p.immuneUntil=now+2000;this.positions.delete(id);}
  leave(id) {this.players.delete(id);this.positions.delete(id);this.hazards=this.hazards.filter(h=>h.owner!==id);}
  use(id,drivers,now) {
    const p=this.player(id),position=this.positions.get(id),driver=drivers.get(id);
    if(!p.item||!position||now-position.at>750||!driver||driver.dnf||driver.finishMs!==null)return false;
    const item=p.item;
    if((item==='oil'||item==='bolt')&&this.hazards.length>=HAZARD_LIMIT)return false;
    p.item=null;
    if(item==='shield')p.shieldUntil=now+6000;
    else if(item==='boost')p.boostUntil=now+2500;
    else {
      const {qx=0,qy=0,qz=0,qw=1}=position;
      let dx=-2*(qx*qz+qw*qy),dz=-(1-2*(qx*qx+qy*qy));const length=Math.hypot(dx,dz);
      if(length>.01){dx/=length;dz/=length;}else {dx=0;dz=-1;}
      const behind=item==='oil'?-5:5;
      this.hazards.push({id:++this.nextHazard,type:item,owner:id,x:position.x+dx*behind,z:position.z+dz*behind,dx:item==='bolt'?dx*90:0,dz:item==='bolt'?dz*90:0,born:now,expires:now+(item==='bolt'?3000:9000),lastAt:now});
    }
    this.event('use',{owner:id,item,x:position.x,z:position.z});return true;
  }
  update(id,state,drivers,now) {
    const previous=this.positions.get(id),current={...state,at:now};this.positions.set(id,current);
    const p=this.player(id);let changed=false;
    const grounded=state.y>=-.5&&state.y<3;
    // A recovery/teleport cannot sweep through an entire line of boxes.
    const from=previous&&now-previous.at<500&&Math.hypot(previous.x-state.x,previous.z-state.z)<30?previous:state;
    if(grounded) {
      if(!p.item)for(const box of PICKUPS) {
        if(this.pickups[box.id]>now||segmentDistance(from,state,box)>2.7)continue;
        const leader=Math.max(...[...drivers.values()].map(d=>d.passed));
        const behind=(drivers.get(id)?.passed||0)<leader;
        const deck=behind?['boost','boost','shield','bolt','oil']:['boost','shield','bolt','oil'];
        p.item=deck[Math.min(deck.length-1,Math.floor(this.random()*deck.length))];this.pickups[box.id]=now+8000;
        this.event('pickup',{owner:id,item:p.item,x:box.x,z:box.z});changed=true;break;
      }
      if(Math.hypot(state.vx||0,state.vz||0)>4)for(const prop of BREAKABLES) {
        if(!this.broken.has(prop.id)&&segmentDistance(from,state,prop)<2.2){this.breakProp(prop,id,drivers);changed=true;}
      }
    }
    if(now-this.lastTick<40)return changed;
    this.lastTick=now;
    const survivors=[];
    for(const h of this.hazards) {
      if(now>=h.expires){changed=true;continue;}
      const a=hazardPosition(h,h.lastAt),b=hazardPosition(h,now);let consumed=false;
      if(h.type==='bolt')for(const prop of BREAKABLES)if(!this.broken.has(prop.id)&&segmentDistance(a,b,prop)<1.5) {
        this.breakProp(prop,h.owner,drivers);consumed=true;changed=true;break;
      }
      if(!consumed&&now-h.born>200)for(const [target,s] of this.positions) {
        const d=drivers.get(target),effects=this.player(target);
        if(target===h.owner||!d||d.dnf||d.finishMs!==null||now-s.at>750||s.y>4||effects.immuneUntil>now)continue;
        // Relative segment handles a moving car crossing a stationary oil patch too.
        const dt=Math.min(.15,Math.max(0,now-h.lastAt)/1000);
        const start={x:a.x-s.x+(s.vx||0)*dt,z:a.z-s.z+(s.vz||0)*dt};
        const end={x:b.x-s.x,z:b.z-s.z};
        if(segmentDistance(start,end,{x:0,z:0})>(h.type==='oil'?3.8:3))continue;
        const blocked=effects.shieldUntil>now;effects.shieldUntil=0;effects.immuneUntil=now+1800;
        if(!blocked){effects.boostUntil=0;d.boostUntil=0;const owner=drivers.get(h.owner);if(owner)owner.points+=75;}
        this.event('hit',{owner:h.owner,target,weapon:h.type,blocked,x:s.x,z:s.z,dx:h.dx/90,dz:h.dz/90});
        consumed=true;changed=true;break;
      }
      if(!consumed){h.lastAt=now;survivors.push(h);}
    }
    this.hazards=survivors;return changed;
  }
  breakProp(prop,owner,drivers) {this.broken.add(prop.id);const p=drivers.get(owner);if(p)p.points+=10;this.event('break',{prop:prop.id,owner,x:prop.x,z:prop.z});}
  snapshot() {return {players:Object.fromEntries([...this.players].map(([id,p])=>[id,{...p}])),pickups:[...this.pickups],broken:[...this.broken],hazards:this.hazards.map(({lastAt,...h})=>h),events:this.events.map(e=>({...e})),seq:this.seq};}
}

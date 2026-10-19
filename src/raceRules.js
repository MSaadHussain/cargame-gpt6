import { GATES, BOOSTS, LAPS, gridSlot, checkpointSpawn, crossedGate } from './circuit.js';
import { Arcade } from './arcadeRules.js';

// Timing/progress only. Shared with solo practice; no rendering or car physics on the server.
export class Race {
  constructor() { this.id=0; this.startAt=0; this.drivers=new Map(); this.arcade=new Arcade(); }
  start(players,now=Date.now()) {
    this.id++; this.startAt=now+4000; this.drivers.clear();
    this.arcade=new Arcade();
    players.forEach((p,slot)=>this.drivers.set(p.id,{id:p.id,name:p.name,slot,passed:0,points:0,finishMs:null,dnf:false,last:null,lastGateAt:this.startAt,boosts:[],boostUntil:0,recoveryAt:0}));
    return this.snapshot(now);
  }
  phase(now=Date.now()) {
    if(!this.startAt) return 'waiting';
    if([...this.drivers.values()].every(p=>p.finishMs!==null||p.dnf)) return 'finished';
    return now<this.startAt ? 'countdown':'running';
  }
  update(id,state,now=Date.now()) {
    const p=this.drivers.get(id);
    if(!p || p.finishMs!==null || p.dnf || now<this.startAt) return false;
    let changed=this.arcade.update(id,state,this.drivers,now);
    const next=(p.passed+1)%GATES.length;
    if(now-p.lastGateAt>900 && crossedGate(p.last,state,GATES[next])) {
      p.passed++; p.points+=100; p.lastGateAt=now; changed=true;
      if(p.passed%GATES.length===0) { p.points+=500; p.boosts=[]; }
      if(p.passed===GATES.length*LAPS) {
        p.finishMs=now-this.startAt;
        const place=[...this.drivers.values()].filter(d=>d.finishMs!==null).length;
        p.points+=Math.max(200,1200-place*200);
      }
    }
    if(p.finishMs===null) for(const boost of BOOSTS) {
      if(!p.boosts.includes(boost.index) && Math.abs(state.y??1)<4 && Math.hypot(state.x-boost.x,state.z-boost.z)<12 && (state.vx*boost.nx+state.vz*boost.nz)>2) {
        p.boosts.push(boost.index); p.boostUntil=now+2300; p.points+=25; changed=true;
      }
    }
    p.last={x:state.x,z:state.z};
    return changed;
  }
  recover(id,now=Date.now()) {
    const p=this.drivers.get(id); if(!p || p.dnf || now-p.recoveryAt<1000) return null;
    p.recoveryAt=now; p.last=null; p.boostUntil=0;
    this.arcade.recover(id,now);
    return this.phase(now)==='countdown' || p.passed===0 ? gridSlot(p.slot) : checkpointSpawn(p.passed%GATES.length,p.slot);
  }
  useItem(id,now=Date.now()) {return this.phase(now)==='running'&&this.arcade.use(id,this.drivers,now);}
  leave(id) { const p=this.drivers.get(id); if(p) p.dnf=true; this.arcade.leave(id); }
  snapshot(now=Date.now()) {
    return {id:this.id,startAt:this.startAt,serverNow:now,phase:this.phase(now),laps:LAPS,arcade:this.arcade.snapshot(),
      drivers:[...this.drivers.values()].sort((a,b)=>Number(a.dnf)-Number(b.dnf)||(a.finishMs??Infinity)-(b.finishMs??Infinity)||b.passed-a.passed||a.slot-b.slot)
        .map(({last,lastGateAt,recoveryAt,...p})=>p)};
  }
}

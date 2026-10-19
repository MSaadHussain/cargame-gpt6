// Client-only warning cadence. Missile targeting/diversion stays server-owned.
export class MissileWarning {
  constructor(beep) { this.beep=beep; this.reset(); }
  reset() { this.nextBeep=0; this.active=false; }
  update(snapshot,self,{enabled=true,paused=false,now=Date.now()}={}) {
    const alive=(snapshot?.pilots?.find(p=>p.id===self)?.hp??0)>0;
    const incoming=enabled&&alive&&!!snapshot?.missiles?.some(m=>m.target===self&&!m.diverted);
    if(!incoming||paused) { this.reset(); return incoming; }
    if(!this.active||now>=this.nextBeep) { this.beep(); this.nextBeep=now+650; }
    this.active=true;
    return incoming;
  }
}

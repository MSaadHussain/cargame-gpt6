import * as CANNON from 'cannon-es';
import { Race } from './raceRules.js';
import { GATES, gridSlot, checkpointSpawn, crossedGate } from './circuit.js';
import { ITEM_NAMES } from './arcadeRules.js';

export function createRacing(physics, hooks) {
  const panel=document.createElement('section'); panel.className='race-panel'; panel.hidden=true;
  panel.innerHTML=`<div class="race-eyebrow">APEX GRAND PRIX · 5.4 KM</div><h2>Race control</h2><p class="race-status"></p><div class="race-stats"></div><ol class="race-board" aria-label="Race standings"></ol><div class="race-actions"><button class="race-start">Start race</button><button class="race-recover">Recover · R</button></div><small>3 laps · 24 checkpoints · cyan pads = boost<br>+100 checkpoint · +500 lap · +25 boost</small>`;
  const countdown=document.createElement('div'); countdown.className='race-countdown'; countdown.hidden=true; countdown.setAttribute('role','status');
  const useButton=document.createElement('button');useButton.className='race-item';useButton.type='button';panel.append(useButton);
  document.querySelector('#game').append(panel,countdown);
  const status=panel.querySelector('.race-status'),stats=panel.querySelector('.race-stats'),board=panel.querySelector('.race-board'),button=panel.querySelector('.race-start');
  let enabled=false, online=false, self='solo', host=false, snapshot=null, offset=0, practiceCheckpoint=0, practiceLast=null;
  const solo=new Race();
  let lastPaint=-Infinity;
  const now=()=>Date.now()+offset;
  const driver=()=>snapshot?.drivers.find(p=>p.id===self);
  const phase=()=>!snapshot?.startAt?'waiting':snapshot.phase==='finished'?'finished':now()<snapshot.startAt?'countdown':'running';
  const time=ms=>`${Math.floor(ms/60000)}:${(ms/1000%60).toFixed(2).padStart(5,'0')}`;
  function accept(data,reset=false) {
    if(!enabled || !data) return;
    snapshot=data; offset=data.serverNow-Date.now();
    hooks.arcade?.receive(data,self,reset);
    if(reset && driver()) { hooks.place(gridSlot(driver().slot)); hooks.toast('Grid set. Get ready for the lights!'); }
    paint();
  }
  function start() {
    if(!enabled || (online&&!host)) return;
    if(online) hooks.start();
    else accept(solo.start([{id:'solo',name:hooks.name()||'Solo driver'}]),true);
  }
  function recover() {
    if(!enabled) return false;
    if(driver()) {
      if(online) hooks.recover(snapshot.id);
      else { const spawn=solo.recover(self); if(spawn) { hooks.place(spawn); accept(solo.snapshot()); } }
    } else { practiceLast=null; hooks.place(practiceCheckpoint ? checkpointSpawn(practiceCheckpoint):gridSlot(0)); }
    return true;
  }
  button.onclick=start; panel.querySelector('.race-recover').onclick=recover;
  function useItem() {
    if(!enabled||phase()!=='running'||driver()?.finishMs!==null||!snapshot?.arcade?.players[self]?.item)return;
    if(online)hooks.useItem?.(snapshot.id);
    else if(solo.useItem(self))accept(solo.snapshot());
  }
  useButton.onclick=useItem;
  function paint() {
    if(!enabled) return;
    lastPaint=Date.now();
    const p=driver(),stage=phase();
    const item=snapshot?.arcade?.players[self]?.item;
    useButton.disabled=stage!=='running'||!p||p.finishMs!==null||!item;
    useButton.textContent=item?`Use ${ITEM_NAMES[item]} · E`:'? Drive through a mystery box';
    useButton.title=stage==='waiting'?'Start a race to collect items':'E or tap to use your held item';
    button.disabled=online&&!host; button.textContent=snapshot?.startAt?'Restart race':'Start race';
    status.textContent=online?(host?'You are race host · start / restart for everyone':'Waiting for race host · race continues while menus are open'):'Solo practice · join multiplayer to race friends';
    if(stage==='waiting') stats.textContent='PRACTICE · Join friends, then start';
    else if(p) stats.textContent=`${p.finishMs!==null?'FINISHED · '+time(p.finishMs):'LAP '+Math.min(3,Math.floor(p.passed/GATES.length)+1)+'/3 · CP '+p.passed%GATES.length+'/24'} · ${p.points} PTS`;
    else stats.textContent='Waiting for the next race';
    const signature=JSON.stringify(snapshot?.drivers.map(d=>[d.id,d.passed,d.points,d.finishMs,d.dnf])||[]);
    if(board.dataset.signature!==signature) {
      board.dataset.signature=signature; board.replaceChildren();
      for(const [i,p] of (snapshot?.drivers||[]).entries()) {
        const row=document.createElement('li'); row.classList.toggle('self',p.id===self);
        const name=document.createElement('span'),value=document.createElement('b'); name.textContent=`${i+1}. ${p.name}`;
        value.textContent=p.dnf?'LEFT':p.finishMs!==null?time(p.finishMs):`${p.points} pts`;
        row.append(name,value); board.append(row);
      }
    }
    const left=snapshot?.startAt-now();
    const boost=Math.max(p?.boostUntil||0,snapshot?.arcade?.players[self]?.boostUntil||0)>now();
    countdown.hidden=!(p && (left>0 || left>-1200 || boost));
    countdown.textContent=left>0?String(Math.ceil(left/1000)):boost?'BOOST':'GO!';
    countdown.classList.toggle('boosting',boost&&left<=0);
    panel.classList.toggle('boosting',boost);
  }
  return {
    get id(){return snapshot?.id||0;},
    get active(){return enabled&&!!snapshot?.startAt&&phase()!=='finished';},
    get locked(){const p=driver();return enabled&&p&&(phase()==='countdown'||p.finishMs!==null);},
    get nextGate(){return enabled?GATES[((driver()?.passed??practiceCheckpoint)+1)%GATES.length]:null;},
    map(id) { enabled=id==='apex'; snapshot=null;practiceCheckpoint=0;practiceLast=null;panel.hidden=!enabled;countdown.hidden=true;hooks.arcade?.map(id); document.querySelector('#game').classList.toggle('race-map',enabled); paint(); },
    offline() {online=false;self='solo';host=false;snapshot=null;offset=0;hooks.arcade?.clear();paint();},
    joined(room) {online=true;self=room.id;host=room.raceHostId===self;accept(room.race);},
    receive(packet) {host=packet.raceHostId===self;accept(packet.race,packet.t==='raceStart');},
    recovered(packet) {if(packet.raceId===snapshot?.id) {hooks.place(packet.spawn);hooks.toast('Recovered at your last checkpoint.');}},
    start,recover,useItem,
    beforeStep() {
      const p=driver(); if(!enabled || !p) return;
      const body=physics.chassis;
      if(phase()==='countdown') {
        const spawn=gridSlot(p.slot); body.position.x=spawn.x;body.position.z=spawn.z;
        body.quaternion.setFromEuler(0,spawn.heading,0);body.velocity.x=body.velocity.z=0;body.angularVelocity.setZero();body.aabbNeedsUpdate=true;
      } else if(p.finishMs===null && Math.max(p.boostUntil,snapshot.arcade?.players[self]?.boostUntil||0)>now() && body.velocity.length()<62) {
        body.applyLocalForce(new CANNON.Vec3(0,0,-body.mass*11),new CANNON.Vec3());
      }
    },
    update() {
      if(!enabled) return;
      const p=physics.chassis.position,v=physics.chassis.velocity;
      const q=physics.chassis.quaternion;
      if(!online && snapshot?.startAt && solo.update(self,{x:p.x,y:p.y,z:p.z,vx:v.x,vz:v.z,qx:q.x,qy:q.y,qz:q.z,qw:q.w})) accept(solo.snapshot());
      if(!snapshot?.startAt) {
        if(crossedGate(practiceLast,p,GATES[(practiceCheckpoint+1)%GATES.length])) practiceCheckpoint=(practiceCheckpoint+1)%GATES.length;
        practiceLast={x:p.x,z:p.z};
      }
      if(Date.now()-lastPaint>=100)paint();
    },
  };
}

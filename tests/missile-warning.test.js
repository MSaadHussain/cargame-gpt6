import test from 'node:test';
import assert from 'node:assert/strict';
import { MissileWarning } from '../src/missileWarning.js';
import { EngineAudio } from '../src/audio.js';

const snapshot=(missiles=[],hp=100)=>({pilots:[{id:'target',hp},{id:'shooter',hp:100}],missiles});
const missile={id:1,target:'target',diverted:false};

test('incoming warning sounds immediately only for the target, repeats, and stops after flares',()=>{
  let beeps=0;const alarm=new MissileWarning(()=>beeps++),air=snapshot([missile]);
  assert.equal(alarm.update(air,'shooter',{now:100}),false);assert.equal(beeps,0);
  assert.equal(alarm.update(air,'target',{now:100}),true);assert.equal(beeps,1);
  alarm.update(air,'target',{now:749});assert.equal(beeps,1);
  alarm.update(air,'target',{now:750});assert.equal(beeps,2);
  const flared=snapshot([{...missile,diverted:true}]);
  assert.equal(alarm.update(flared,'target',{now:800}),false);
  alarm.update(flared,'target',{now:1500});assert.equal(beeps,2);
  alarm.update(air,'target',{now:1501});assert.equal(beeps,3);
  assert.equal(alarm.update(snapshot(),'target',{now:2200}),false);assert.equal(beeps,3);
});

test('warning handles simultaneous missiles, death, pause, disconnect and map changes',()=>{
  let beeps=0;const alarm=new MissileWarning(()=>beeps++);
  const air=snapshot([{...missile,diverted:true},{...missile,id:2}]);
  assert.equal(alarm.update(air,'target',{now:0}),true);assert.equal(beeps,1);
  alarm.update(air,'target',{now:700,paused:true});assert.equal(beeps,1);
  alarm.update(air,'target',{now:701});assert.equal(beeps,2);
  assert.equal(alarm.update(snapshot([missile],0),'target',{now:1400}),false);
  assert.equal(alarm.update(null,'target',{now:1500}),false);
  assert.equal(alarm.update(air,'target',{now:1600,enabled:false}),false);assert.equal(beeps,2);
  alarm.reset();alarm.update(air,'target',{now:1601});assert.equal(beeps,3);
});

test('warning audio schedules a clear two-tone burst, cleans nodes, and respects mute/pause',()=>{
  const oscillators=[],gains=[];
  const audio=new EngineAudio();audio.enabled=true;
  audio.context={currentTime:10,destination:{},
    createOscillator(){const o={frequency:{value:0},connect(){},disconnect(){this.disconnected=true;},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};oscillators.push(o);return o;},
    createGain(){const values=[];const g={gain:{setValueAtTime(v,t){values.push([v,t]);},linearRampToValueAtTime(v,t){values.push([v,t]);}},values,connect(){},disconnect(){this.disconnected=true;}};gains.push(g);return g;},
  };
  audio.aircraftEvent('warning',0);
  assert.equal(oscillators.length,2);
  assert.deepEqual(oscillators.map(o=>o.frequency.value),[1100,1500]);
  assert.deepEqual(oscillators.map(o=>o.startAt),[10,10.18]);
  for(let i=0;i<2;i++){
    assert.ok(gains[i].values.some(([v])=>v===audio.volume*.65));
    assert.ok(oscillators[i].stopAt>oscillators[i].startAt);
    oscillators[i].onended();assert.ok(oscillators[i].disconnected&&gains[i].disconnected);
  }
  audio.enabled=false;audio.aircraftEvent('warning');
  audio.enabled=true;audio.paused=true;audio.aircraftEvent('warning');
  assert.equal(oscillators.length,2);
});

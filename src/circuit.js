import { Route } from './route.js';

// Original 5.4 km layout inspired by Silverstone's arena, fast esses and long straights.
// Reference: FIA 2022 British GP circuit map (see README). Not a surveyed replica.
const controls = [[150,550],[60,300],[-30,260],[-90,100],[-210,140],[-250,270],[-520,300],[-680,280],[-720,100],[-570,0],[-520,-350],[-360,-430],[-220,-300],[-100,-450],[300,-420],[580,-240],[630,60],[460,190],[420,420],[300,550]];
function interpolate(a,b,c,d,t) {
  return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
}
const points=[];
for(let i=0;i<controls.length;i++) for(let j=0;j<20;j++) {
  const a=controls[(i+controls.length-1)%controls.length],b=controls[i],c=controls[(i+1)%controls.length],d=controls[(i+2)%controls.length];
  points.push({x:interpolate(a[0],b[0],c[0],d[0],j/20),z:interpolate(a[1],b[1],c[1],d[1],j/20)});
}
const length=new Route({points}).total, scale=5400/length;
export const CIRCUIT = new Route({points:points.map(p=>({x:p.x*scale,z:p.z*scale})),lanes:4,laneWidth:5,speedLimit:34,name:'Apex Grand Prix'});
export const GATES = Array.from({length:24},(_,i)=>({...CIRCUIT.sample(i/24),index:i}));
export const BOOSTS = [.12,.35,.61,.82].map((t,i)=>({...CIRCUIT.sample(t),t,index:i}));
export const LAPS = 3;
export function gridSlot(slot=0) {
  const p=CIRCUIT.sample(-(18+Math.floor(slot/2)*9)/CIRCUIT.total);
  const side=(slot%2 ? 1:-1)*3.5;
  return {...p,x:p.x-p.nz*side,z:p.z+p.nx*side,heading:p.yaw};
}
export function checkpointSpawn(checkpoint=0,slot=0) {
  const p=CIRCUIT.sample(checkpoint/GATES.length+5/CIRCUIT.total);
  const offset=(slot%2 ? 1:-1)*3.5;
  return {...p,x:p.x-p.nz*offset,z:p.z+p.nx*offset,heading:p.yaw};
}
// Forward plane crossing, bounded to track width; works even between low-rate snapshots.
export function crossedGate(previous,current,gate) {
  if (!previous || Math.abs(current.y??1)>5) return false;
  const from=(previous.x-gate.x)*gate.nx+(previous.z-gate.z)*gate.nz;
  const to=(current.x-gate.x)*gate.nx+(current.z-gate.z)*gate.nz;
  if(from>0 || to<=0 || to-from>35) return false;
  const f=-from/(to-from),x=previous.x+(current.x-previous.x)*f,z=previous.z+(current.z-previous.z)*f;
  return Math.abs((x-gate.x)*-gate.nz+(z-gate.z)*gate.nx)<CIRCUIT.width/2+2;
}

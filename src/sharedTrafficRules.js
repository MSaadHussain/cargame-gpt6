import {gridRoute,ovalRoute} from './route.js';
export const NPC_COLORS=['#b8483a','#3d5f7d','#c9b57e','#5a6b57','#8d8f93','#a8623c','#454b52','#95a3ac'];
const routes={portside:gridRoute([-84,84],{lanes:2,laneWidth:4.4,speedLimit:21}),coastline:ovalRoute({straight:520,radius:150,lanes:4,laneWidth:4.2,speedLimit:34,segments:30})};
export function npcPose(map,index,epoch,time) {
  const route=routes[map];if(!route)return null;
  const speed=route.speedLimit*(.8+(index%5)*.065),t=index*.61803398875+(time-epoch)/1000*speed/route.total;
  const lane=index%route.lanes,p=route.sample(t,lane);
  return {id:'npc-'+index,index,x:p.x,y:.56,z:p.z,qx:0,qy:Math.sin(p.yaw/2),qz:0,qw:Math.cos(p.yaw/2),vx:p.nx*speed,vy:0,vz:p.nz*speed,vehicle:'veloce',ready:true,paint:NPC_COLORS[index%NPC_COLORS.length]};
}
export function cleanDents(value) {
  if(!Array.isArray(value))return [];
  return value.slice(-24).filter(d=>d&&['x','y','z','s'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])))
    .map(d=>({x:Math.max(-3,Math.min(3,d.x)),y:Math.max(-1,Math.min(3,d.y)),z:Math.max(-3,Math.min(3,d.z)),s:Math.max(0,Math.min(.72,d.s))}));
}
export function damageNPC(room,player,index,now=Date.now()) {
  if(!Number.isInteger(index)||index<0||index>=room.density||room.map==='apex'||!player.ready||now-(player.stateAt||0)>1000)return false;
  const pose=npcPose(room.map,index,room.trafficEpoch,now);if(!pose||Math.hypot(player.x-pose.x,player.z-pose.z)>9||Math.abs(player.y-pose.y)>3)return false;
  const speed=Math.hypot(player.vx-pose.vx,player.vz-pose.vz);
  if(speed<3||now-(room.npcHits[index]||0)<700)return false;
  room.npcHits[index]=now;room.npcDamage[index]=Math.min(100,(room.npcDamage[index]||0)+Math.min(30,speed*1.2));return true;
}

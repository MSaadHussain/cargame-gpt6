import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join as pathJoin, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { vehicleId, isTwoWheeler, vehicleForMap } from './src/vehicleModels.js';
import { AirCombat } from './src/airCombatRules.js';
import { playerName } from './src/playerName.js';
import { Race } from './src/raceRules.js';
import { cleanDents, damageNPC } from './src/sharedTrafficRules.js';

const port = Number(process.env.PORT || 3000);
const dist = resolve('dist');
const rooms = new Map();
const MAX_PLAYERS = 8;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const roomCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const newCode = () => randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const clean = (value, fallback, size) => String(value ?? fallback).replace(/[<>]/g, '').trim().slice(0, size) || fallback;
const finite = (value, fallback, max = 10000) => Number.isFinite(Number(value)) ? Math.max(-max, Math.min(max, Number(value))) : fallback;

function publicPlayer(player) { const { ws, ...data } = player; return data; }
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcast(room, data, except) { const message = JSON.stringify(data); for (const player of room.players.values()) if (player.ws !== except && player.ws.readyState === WebSocket.OPEN) player.ws.send(message); }
function quit(player) {
  if (!player?.room) return; const room = rooms.get(player.room); if (!room) return;
  room.players.delete(player.id); room.race?.leave(player.id); room.air?.leave(player.id); broadcast(room, {t:'leave',id:player.id});
  if(room.air)broadcast(room,{t:'airState',air:room.air.snapshot()});
  if(room.race) {
    if(room.raceHostId===player.id) room.raceHostId=room.players.keys().next().value || null;
    broadcast(room,{t:'raceState',race:room.race.snapshot(),raceHostId:room.raceHostId});
  }
  if (!room.players.size) rooms.delete(player.room); player.room = null;
}
function createRoom(map, isPublic) { let code = newCode(); while (rooms.has(code)) code = newCode(); const room = { code, map, public: isPublic, density: ['apex','skyport'].includes(map)?0:15,trafficEpoch:Date.now(),npcDamage:Array(64).fill(0),npcHits:Array(64).fill(0), adminId: null, raceHostId:null, race:map==='apex'?new Race():null, air:map==='skyport'?new AirCombat():null, players: new Map() }; rooms.set(code, room); return room; }
function choosePublic(map) { return [...rooms.values()].find(room => room.public && room.map === map && room.players.size < MAX_PLAYERS && (!room.race || ['waiting','finished'].includes(room.race.phase()))) || createRoom(map, true); }
function join(ws, current, room, meta) {
  if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', message: 'This room is full.' });
  if(room.race && ['countdown','running'].includes(room.race.phase())) return send(ws,{t:'error',message:'Race in progress. Join after the finish, or use a new room.'});
  quit(current);
  rooms.set(room.code, room);
  const player = { id: randomUUID().slice(0, 8), room: room.code, ws, name: clean(meta.name, 'Driver', 16), map: room.map, vehicle: vehicleId(meta.vehicle), paint: clean(meta.paint, '#67877d', 12), x: 0, y: 1, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ready: false, braking: false };
  player.vehicle=vehicleForMap(player.vehicle,room.map);
  const airSpawn=room.air?.join(player.id,player.name);
  if(airSpawn)Object.assign(player,{x:airSpawn.x,y:airSpawn.y,z:airSpawn.z});
  if (!room.public && !room.adminId) room.adminId = player.id;
  if(!room.raceHostId) room.raceHostId=player.id;
  send(ws, { t: 'welcome', id: player.id, name: player.name, vehicle:player.vehicle,airSpawn,air:room.air?.snapshot(),map: room.map, room: room.code, public: room.public, density: room.density,trafficEpoch:room.trafficEpoch,serverNow:Date.now(),npcDamage:room.npcDamage, isAdmin: room.adminId === player.id, raceHostId:room.raceHostId, race:room.race?.snapshot(), players: [...room.players.values()].map(publicPlayer) });
  room.players.set(player.id, player); broadcast(room, { t: 'join', player: publicPlayer(player) }, ws);if(room.air)broadcast(room,{t:'airState',air:room.air.snapshot()}); return player;
}

const server = createServer((req, res) => {
  if (!req.url || req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  const candidate = normalize(pathJoin(dist, relativePath));
  const file = candidate.startsWith(dist) && existsSync(candidate) ? candidate : pathJoin(dist, 'index.html');
  if (!existsSync(file)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Build missing. Run npm run build.'); }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  let player = null, lastState = 0, lastAirCommand = 0; ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let packet; try { packet = JSON.parse(raw.toString()); } catch { return; } if (!packet || typeof packet !== 'object') return;
    const meta = { name: playerName(packet.name), map: ['portside','coastline','apex','skyport'].includes(packet.map)?packet.map:'portside', vehicle: packet.vehicle, paint: packet.paint };
    if (['quick','create','join'].includes(packet.t) && !meta.name) return send(ws, {t:'error',message:'Enter your driver name before joining.'});
    if (packet.t === 'quick') { player = join(ws, player, choosePublic(meta.map), meta) || player; return; }
    if (packet.t === 'create') { player = join(ws, player, createRoom(meta.map, false), meta) || player; return; }
    if (packet.t === 'join') { const room = rooms.get(roomCode(packet.room)); if (!room) return send(ws, { t: 'error', message: 'Room code not found.' }); player = join(ws, player, room, meta) || player; return; }
    if (packet.t === 'traffic' && player) {
      const room = rooms.get(player.room);
      if (!room || room.race || room.air || room.public || room.adminId !== player.id) return;
      room.density = Math.round(Math.max(0, finite(packet.density, room.density, 64)));
      broadcast(room, { t: 'traffic', density: room.density });
      return;
    }
    if(packet.t==='raceStart' && player) {
      const room=rooms.get(player.room);
      if(!room?.race || room.raceHostId!==player.id || Date.now()-(room.lastRaceStart||0)<1500) return;
      room.lastRaceStart=Date.now();
      broadcast(room,{t:'raceStart',race:room.race.start([...room.players.values()]),raceHostId:room.raceHostId});
      return;
    }
    if(packet.t==='recover' && player) {
      const room=rooms.get(player.room); if(!room?.race || packet.raceId!==room.race.id) return;
      const spawn=room.race.recover(player.id);
      if(spawn) { send(ws,{t:'recover',spawn,raceId:room.race.id}); broadcast(room,{t:'raceState',race:room.race.snapshot(),raceHostId:room.raceHostId}); }
      return;
    }
    if(packet.t==='useItem' && player) {
      const room=rooms.get(player.room);
      if(room?.race && packet.raceId===room.race.id && room.race.useItem(player.id))broadcast(room,{t:'raceState',race:room.race.snapshot(),raceHostId:room.raceHostId});
      return;
    }
    if(packet.t==='clock'&&player&&Number.isFinite(packet.sent)){send(ws,{t:'clock',sent:packet.sent,now:Date.now()});return;}
    if(packet.t==='npcHit'&&player){const room=rooms.get(player.room);if(room&&damageNPC(room,player,packet.index))broadcast(room,{t:'npcDamage',npcDamage:room.npcDamage,serverNow:Date.now()});return;}
    if(['airFire','airRespawn','airCrash','airLock','airLaunch','airFlare'].includes(packet.t)&&player) {
      const room=rooms.get(player.room);if(!room?.air)return;
      if(['airLock','airLaunch','airFlare'].includes(packet.t)){const time=Date.now();if(time-lastAirCommand<80)return;lastAirCommand=time;}
      if(packet.t==='airLock'){const ok=room.air.weapons.lock(player.id,packet.target,room.players);send(ws,{t:'airNotice',message:ok?'Acquiring target lock...':'Aim at an unshielded aircraft within 2.5 km.'});broadcast(room,{t:'airState',air:room.air.snapshot()});}
      if(packet.t==='airLaunch'){const event=room.air.weapons.launch(player.id,room.players);if(event)broadcast(room,event);else send(ws,{t:'airNotice',message:'Need a completed target lock and a missile.'});}
      if(packet.t==='airFlare'){const event=room.air.weapons.flare(player.id,room.players);if(event)broadcast(room,event);else send(ws,{t:'airNotice',message:'Flares empty or cooling down (2 seconds).'});}
      if(packet.t==='airFire'){const event=room.air.fire(player.id,room.players,Date.now(),packet.aim??null);if(event)broadcast(room,event);}
      if(packet.t==='airRespawn') {
        if(room.air.pilots.get(player.id)?.hp>0&&room.air.weapons.missiles.some(m=>m.target===player.id&&!m.diverted)){send(ws,{t:'airNotice',message:'Incoming missile! Use F flares before recovering.'});return;}
        const spawn=room.air.respawn(player.id);
        if(spawn){Object.assign(player,{x:spawn.x,y:spawn.y,z:spawn.z,ready:false,damage:0,dents:[]});send(ws,{t:'airRespawn',spawn});broadcast(room,{t:'airState',air:room.air.snapshot()});}
      }
      if(packet.t==='airCrash'&&player.ready&&player.y<8) {
        const destroyed=room.air.die(player.id,player);
        if(destroyed)broadcast(room,{t:'airCrash',destroyed,air:room.air.snapshot()});
      }
      return;
    }
    if (packet.t !== 'state' || !player) return;
    if (Date.now() - lastState < 35) return;
    lastState = Date.now();
    const room = rooms.get(player.room); if (!room) return;
    player.x = finite(packet.x, player.x); player.y = finite(packet.y, player.y, 100); player.z = finite(packet.z, player.z); player.qx = finite(packet.qx, player.qx, 1); player.qy = finite(packet.qy, player.qy, 1); player.qz = finite(packet.qz, player.qz, 1); player.qw = finite(packet.qw, player.qw, 1); player.braking = Boolean(packet.braking); player.vehicle = vehicleId(packet.vehicle); player.paint = /^#[0-9a-f]{6}$/i.test(packet.paint) ? packet.paint : '#67877d';
    player.vehicle=vehicleForMap(player.vehicle,room.map);
    if(room.air)player.y=Math.max(0,finite(packet.y,player.y,2200));
    for (const key of ['vx','vy','vz']) player[key] = finite(packet[key],0,room.air?350:100);
    for (const key of ['wx','wy','wz']) player[key] = finite(packet[key],0,20);
    const norm = Math.hypot(player.qx,player.qy,player.qz,player.qw);
    if (norm > .001) for (const key of ['qx','qy','qz','qw']) player[key] /= norm;
    else { player.qx = player.qy = player.qz = 0; player.qw = 1; }
    player.ready = true;
    player.stateAt=Date.now();
    player.wheelie=isTwoWheeler(player.vehicle)?Math.max(0,finite(packet.wheelie,0,.7)):0;
    player.steer=finite(packet.steer,0,.7);player.damage=Math.max(0,finite(packet.damage,0,100));player.dents=cleanDents(packet.dents);
    if(room.air)player.damage=100-room.air.pilots.get(player.id).hp;
    player.landingGear=room.air?Math.max(0,finite(packet.landingGear,0,1)):0;
    if(room.race && packet.raceId===room.race.id && room.race.update(player.id,player)) broadcast(room,{t:'raceState',race:room.race.snapshot(),raceHostId:room.raceHostId});
    broadcast(room, { t: 'state', player: publicPlayer(player) }, ws);
  });
  ws.on('close', () => quit(player)); ws.on('error', () => quit(player));
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } } }, 30000);
setInterval(()=>{const now=Date.now();for(const room of rooms.values())if(room.air){const result=room.air.weapons.tick(room.players,now);for(const event of result.events)broadcast(room,{...event,air:room.air.snapshot(now)});if(result.active&&now-(room.lastAirUpdate||0)>=100){room.lastAirUpdate=now;broadcast(room,{t:'airState',air:room.air.snapshot(now)});}}},50);
server.listen(port, '0.0.0.0', () => console.log(`Oversteer multiplayer listening on ${server.address().port}`));

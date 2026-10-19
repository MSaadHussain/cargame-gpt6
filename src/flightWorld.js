import * as THREE from 'three';
import { ovalRoute } from './route.js';
import { flightGroundTiles } from './flightGround.js';

export function buildFlightWorld(b) {
  const surfaces=new Map();
  const quad=(vertices,x,z,w,d,y=0)=>{const l=x-w/2,r=x+w/2,n=z-d/2,s=z+d/2;vertices.push(l,y,n,l,y,s,r,y,n,r,y,n,l,y,s,r,y,s);};
  for(const tile of flightGroundTiles()){if(!surfaces.has(tile.color))surfaces.set(tile.color,[]);quad(surfaces.get(tile.color),tile.x,tile.z,tile.w,tile.d);}
  for(const [color,vertices] of surfaces){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const ground=new THREE.Mesh(geo,b.material(color));ground.receiveShadow=true;ground.userData.airGround=true;b.own(geo);b.attach(ground);}
  // Only paint markings overlay the partition, with explicit depth bias.
  const paint=[];
  for(let z=-1400;z<=1400;z+=100){quad(paint,0,z,3,48,.025);for(const s of [-1,1])b.box(s*44,.2,z,1.2,.4,2,'#d6e3a6');}
  for(const z of [-1440,1440])for(let x=-32;x<=32;x+=8)quad(paint,x,z,4,65,.025);
  const paintGeo=new THREE.BufferGeometry();paintGeo.setAttribute('position',new THREE.Float32BufferAttribute(paint,3));paintGeo.computeVertexNormals();
  const paintMat=new THREE.MeshStandardMaterial({color:'#eeece0',roughness:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const markings=new THREE.Mesh(paintGeo,paintMat);markings.renderOrder=1;markings.userData.airMarkings=true;b.own(paintGeo);b.own(paintMat);b.attach(markings);
  const mapBuildings=[];
  for(let z=-900;z<=900;z+=300){b.box(350,17,z,110,34,95,'#afb9b5');b.box(294,11,z,1,22,65,'#344651');mapBuildings.push({x:350,z,w:110,d:95});}
  b.box(530,26,0,95,52,220,'#c9c5b1');b.box(530,56,0,120,10,245,'#567682');
  b.box(240,40,-450,18,80,18,'#c6cabb');b.box(240,83,-450,42,10,42,'#385566');
  // A low-detail mountain ring is scenery, outside the playable flight boundary.
  const mountainGeo=new THREE.ConeGeometry(1,1,5);b.own(mountainGeo);
  const mountains=new THREE.InstancedMesh(mountainGeo,b.material('#7a8384'),36),dummy=new THREE.Object3D();
  for(let i=0;i<36;i++){const angle=i/36*Math.PI*2,r=6400;dummy.position.set(Math.cos(angle)*r,200+i%4*80,Math.sin(angle)*r);dummy.scale.set(650,400+i%4*160,650);dummy.updateMatrix();mountains.setMatrixAt(i,dummy.matrix);}
  mountains.computeBoundingSphere();b.attach(mountains);
  const cloudGeo=new THREE.IcosahedronGeometry(1,0);b.own(cloudGeo);
  const clouds=new THREE.InstancedMesh(cloudGeo,b.material('#e2e9e8'),54);
  for(let i=0;i<54;i++){dummy.position.set(Math.sin(i*2.4)*4500,1100+i%5*90,Math.cos(i*1.8)*4500);dummy.scale.set(100+i%3*50,30,90);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}
  clouds.computeBoundingSphere();b.attach(clouds);
  return {mapBuildings,roads:[],dynamics:[],route:ovalRoute({straight:2800,radius:150,lanes:2,laneWidth:40,segments:20}),fog:{color:'#b8d3e0',near:4000,far:10500},sky:'#a9d2e9'};
}

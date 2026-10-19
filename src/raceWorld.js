import * as THREE from 'three';
import { CIRCUIT as route, GATES, BOOSTS, gridSlot } from './circuit.js';

export function buildRaceWorld(b) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3000), b.material('#79926a'));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.04; ground.receiveShadow = true;
  b.own(ground.geometry); b.attach(ground);
  // Non-overlapping coloured strips, split into ~144 m chunks. The old three
  // whole-track ribbons drew every metre (and overlapping layers) on every frame.
  const roadMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});b.own(roadMaterial);
  const strips=[[-24,-14.5,'#c4b792'],[-14.5,-10,'#457c6b'],[-10,10,'#424b50'],[10,14.5,'#457c6b'],[14.5,24,'#c4b792']];
  const count=1200,chunkSize=32;
  for(let start=0;start<count;start+=chunkSize) {
    const vertices=[],colors=[],indices=[],end=Math.min(count,start+chunkSize);
    for(const [left,right,tint] of strips) {
      const base=vertices.length/3,color=new THREE.Color(tint);
      for(let i=start;i<=end;i++) {
        const p=route.sample(i/count);
        for(const offset of [right,left]) {vertices.push(p.x-p.nz*offset,.025,p.z+p.nx*offset);colors.push(color.r,color.g,color.b);}
        if(i<end) {const a=base+(i-start)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,roadMaterial);mesh.receiveShadow=true;mesh.userData.roadChunk=true;b.own(geometry);b.attach(mesh);
  }
  // Continuous crash walls outside generous runoff. Batches keep draw calls small.
  for(let i=0;i<600;i++) {
    const p=route.sample(i/600),n=route.sample((i+1)/600);
    for(const side of [-1,1]) {
      b.box(p.x-p.nz*10.4*side,.047,p.z+p.nx*10.4*side,1,.035,9.3,i%2?'#f0ece1':'#cf574b',false,p.heading);
      const x=p.x-p.nz*24*side,z=p.z+p.nx*24*side;
      const nx=n.x-n.nz*24*side,nz=n.z+n.nx*24*side;
      b.box((x+nx)/2,.65,(z+nz)/2,.65,1.3,Math.hypot(nx-x,nz-z)+.3,'#cfd4d0',true,Math.atan2(nx-x,nz-z));
    }
  }
  for(const p of GATES) {
    for(const side of [-1,1]) b.box(p.x-p.nz*12*side,3,p.z+p.nx*12*side,.35,6,.35,'#d1e3d6');
    b.box(p.x,6,p.z,24.5,.45,.45,p.index?'#6bbaae':'#e8aa52',false,p.heading);
    b.sign(p.index?`CHECKPOINT ${String(p.index).padStart(2,'0')}`:'APEX • START / FINISH',p.x,6.8,p.z,14,1.1,'#172e35','#e5f1df',p.yaw);
  }
  const start=GATES[0];
  for(let row=0;row<2;row++) for(let col=0;col<20;col++) {
    const side=col-9.5,along=row-.5;
    b.box(start.x-start.nz*side+start.nx*along,.055,start.z+start.nx*side+start.nz*along,1,.035,1,(row+col)%2?'#f1f0df':'#192c35',false,start.heading);
  }
  for(let i=0;i<8;i++) {
    const p=gridSlot(i);
    b.box(p.x,.06,p.z,2.8,.025,5.5,'#e3dbc0',false,p.heading);
    b.box(p.x,.08,p.z,2.5,.025,5.2,'#424b50',false,p.heading);
  }
  for(const p of BOOSTS) {
    b.box(p.x,.065,p.z,18,.035,18,'#168d99',false,p.heading);
    for(let i=-2;i<=2;i++) for(const side of [-1,1]) {
      const along=i*3,across=side*2;
      b.box(p.x+p.nx*along-p.nz*across,.09,p.z+p.nz*along+p.nx*across,5,.025,.65,'#8dffe0',false,p.heading+side*.55);
    }
    b.sign('BOOST +25',p.x-p.nz*14,2.5,p.z+p.nx*14,5,1.2,'#103e49','#8dffe0',p.yaw);
  }
  const mapBuildings=[];
  // Pit complex and tiered stands are aligned to local track direction.
  for(const t of [.985,.18,.43,.70]) {
    const p=route.sample(t);
    for(let tier=0;tier<5;tier++) {
      const side=35+tier*3,x=p.x-p.nz*side,z=p.z+p.nx*side;
      b.box(x,1+tier*.8,z,3,2+tier*1.6,65,tier%2?'#294e62':'#d7d2bd',true,p.heading);
    }
    b.box(p.x-p.nz*49,10,p.z+p.nx*49,19,.5,69,'#e4e1d2',false,p.heading);
    b.sign('APEX GRAND PRIX',p.x-p.nz*36,7,p.z+p.nx*36,36,2,'#192f3d','#e7c17d',p.yaw);
    mapBuildings.push({x:p.x-p.nz*42,z:p.z+p.nx*42,w:18,d:60});
  }
  for(let i=0;i<22;i++) {
    const p=route.sample(.9+i*.003),side=-40;
    b.box(p.x-p.nz*side,3,p.z+p.nx*side,17,6,13,i%2?'#c9ccc2':'#668a96',true,p.heading);
    b.box(p.x-p.nz*(side+9),1.8,p.z+p.nx*(side+9),.1,3.4,9,'#243b44',false,p.heading);
  }
  for(let i=0;i<140;i++) {
    const p=route.sample(i/140),side=(i%2?1:-1)*(70+(i%7)*7);
    b.tree(p.x-p.nz*side,p.z+p.nx*side,1+(i%3)*.2,true,false);
  }
  return {mapBuildings,roads:[],dynamics:[],route,fog:{color:'#cad7cf',near:280,far:850},sky:'#b5d1de'};
}

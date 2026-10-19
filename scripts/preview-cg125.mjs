// CPU geometry preview, not a WebGL/browser screenshot or performance benchmark.
// Run: node scripts/preview-cg125.mjs
import * as THREE from 'three';
import {mkdirSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createCarGeometry,carMaterials} from '../src/car.js';

const width=1500,height=850,pixels=Buffer.alloc(width*height*4),depth=new Float32Array(width*height).fill(Infinity);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels[i]=235;pixels[i+1]=238;pixels[i+2]=237;pixels[i+3]=255;}
const {body,wheel}=createCarGeometry({model:'cg125'}),materials=carMaterials('#bf1021');
const meshes=[];
for(const [key,g] of Object.entries(body))meshes.push({key,g,matrix:new THREE.Matrix4()});
for(const z of [-.71,.71])for(const [key,g] of Object.entries(wheel))meshes.push({key,g,matrix:new THREE.Matrix4().makeScale(.65,1,1).setPosition(0,-.25,z)});
const light=new THREE.Vector3(3,6,-4).normalize();
function render(rect,position,span) {
  const [left,top,w,h]=rect,camera=new THREE.OrthographicCamera(-span*w/h/2,span*w/h/2,span/2,-span/2,.1,30);
  camera.position.set(...position);camera.lookAt(0,.40,0);camera.updateMatrixWorld();
  const pv=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  for(const {key,g,matrix} of meshes){
    const p=g.attributes.position,n=g.attributes.normal,color=materials[key].color.clone().convertLinearToSRGB();
    const verts=[],world=new THREE.Vector3(),norm=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
    for(let i=0;i<p.count;i++){
      world.fromBufferAttribute(p,i).applyMatrix4(matrix);norm.fromBufferAttribute(n,i).applyNormalMatrix(normalMatrix);
      const shade=.48+.52*Math.max(0,norm.dot(light));world.applyMatrix4(pv);
      verts.push([left+(world.x+1)*w/2,top+(1-world.y)*h/2,world.z,shade]);
    }
    const count=g.index?.count??p.count;
    for(let i=0;i<count;i+=3){
      const a=verts[g.index?g.index.getX(i):i],b=verts[g.index?g.index.getX(i+1):i+1],c=verts[g.index?g.index.getX(i+2):i+2];
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(den>=-.0001)continue;
      const minX=Math.max(left,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(left+w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const minY=Math.max(top,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(top+h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den;
        const v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,wc=1-u-v;
        if(u<0||v<0||wc<0)continue;
        const z=u*a[2]+v*b[2]+wc*c[2],offset=y*width+x;if(z>=depth[offset])continue;
        depth[offset]=z;const shade=u*a[3]+v*b[3]+wc*c[3],index=offset*4;
        pixels[index]=Math.min(255,Math.round(color.r*shade*255));pixels[index+1]=Math.min(255,Math.round(color.g*shade*255));pixels[index+2]=Math.min(255,Math.round(color.b*shade*255));
      }
    }
  }
}
render([0,0,850,850],[7,.4,0],2.65);
render([850,0,650,850],[4,2.0,-4],2.65);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=data=>{let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
const output=fileURLToPath(new URL('../artifacts/cg125-preview.png',import.meta.url));
mkdirSync(fileURLToPath(new URL('../artifacts/',import.meta.url)),{recursive:true});
writeFileSync(output,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
for(const g of [...Object.values(body),...Object.values(wheel)])g.dispose();for(const m of Object.values(materials))m.dispose();
console.log(output);

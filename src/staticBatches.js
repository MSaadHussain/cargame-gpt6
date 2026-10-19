import * as THREE from 'three';

// Merge differently coloured boxes per spatial tile, not one enormous batch per colour.
// This makes both camera and shadow frustum culling effective around a long circuit.
export class StaticBatches {
  constructor(boxGeometry,cellSize=128) {this.geometry=boxGeometry;this.cellSize=cellSize;this.cells=new Map();}
  add(matrix,color,shadow) {
    const e=matrix.elements,key=`${Math.floor(e[12]/this.cellSize)},${Math.floor(e[14]/this.cellSize)},${Number(shadow)}`;
    if(!this.cells.has(key))this.cells.set(key,{shadow,items:[]});
    this.cells.get(key).items.push({matrix:matrix.clone(),color});
  }
  flush(attach,own) {
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});own(material);
    const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3(),color=new THREE.Color();
    const source=this.geometry,vertices=source.attributes.position.count;
    for(const {shadow,items} of this.cells.values()) {
      const positions=[],normals=[],colors=[],indices=[];
      for(const [i,item] of items.entries()) {
        normalMatrix.getNormalMatrix(item.matrix);color.set(item.color);
        for(let v=0;v<vertices;v++) {
          point.fromBufferAttribute(source.attributes.position,v).applyMatrix4(item.matrix);
          normal.fromBufferAttribute(source.attributes.normal,v).applyNormalMatrix(normalMatrix);
          positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);colors.push(color.r,color.g,color.b);
        }
        for(const index of source.index.array)indices.push(index+i*vertices);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.userData.staticChunk=true;
      own(geometry);attach(mesh);
    }
    this.cells.clear();
  }
}

// Static obstacles only. The floor, player and multiplayer bodies always stay live.
// Generous preload radius covers max-speed driving, cameras and checkpoint teleports.
export class SceneryStream {
  constructor(world,bodies,{cellSize=128,radius=160,refreshDistance=32}={}) {
    this.world=world;this.bodies=[...bodies];this.cells=new Map();this.active=new Set();
    this.cellSize=cellSize;this.radius=radius;this.refreshDistance=refreshDistance;this.last=null;
    for(const body of this.bodies) {
      if(body.mass!==0)throw Error('Only static scenery can be streamed');
      body.updateAABB();const {lowerBound:a,upperBound:b}=body.aabb;
      for(let x=Math.floor(a.x/cellSize);x<=Math.floor(b.x/cellSize);x++)
        for(let z=Math.floor(a.z/cellSize);z<=Math.floor(b.z/cellSize);z++) {
          const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(body);
        }
      if(body.world===world)world.removeBody(body);
    }
  }
  update(position,force=false) {
    if(!force && this.last && Math.hypot(position.x-this.last.x,position.z-this.last.z)<this.refreshDistance)return;
    const {x,z}=position,r=this.radius,s=this.cellSize,next=new Set();
    for(let cx=Math.floor((x-r)/s);cx<=Math.floor((x+r)/s);cx++)
      for(let cz=Math.floor((z-r)/s);cz<=Math.floor((z+r)/s);cz++)
        for(const body of this.cells.get(`${cx},${cz}`)||[]) {
          const {lowerBound:a,upperBound:b}=body.aabb;
          if(a.x<=x+r&&b.x>=x-r&&a.z<=z+r&&b.z>=z-r)next.add(body);
        }
    for(const body of this.active)if(!next.has(body))this.world.removeBody(body);
    for(const body of next)if(!this.active.has(body))this.world.addBody(body);
    this.active=next;this.last={x,z};
  }
  dispose() {
    for(const body of this.active)if(body.world===this.world)this.world.removeBody(body);
    this.active.clear();this.cells.clear();this.bodies.length=0;this.last=null;
  }
}

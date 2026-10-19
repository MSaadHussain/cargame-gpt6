// A partition, not stacked ground/road sheets: each horizontal cell has one surface.
export const AIR_SURFACES = [
  {x:-1800,z:0,w:1000,d:10000,color:'#4d91a5'},
  {x:380,z:0,w:340,d:900,color:'#9b9f91'},
  {x:0,z:0,w:90,d:3000,color:'#38434b'},
  {x:190,z:0,w:48,d:3000,color:'#68716c'},
  ...[-1200,0,1200].map(z=>({x:95,z,w:150,d:55,color:'#68716c'})),
];
export function flightGroundTiles() {
  const xs=[...new Set([-7000,7000,...AIR_SURFACES.flatMap(s=>[s.x-s.w/2,s.x+s.w/2])])].sort((a,b)=>a-b);
  const zs=[...new Set([-7000,7000,...AIR_SURFACES.flatMap(s=>[s.z-s.d/2,s.z+s.d/2])])].sort((a,b)=>a-b);
  const tiles=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++) {
    const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2;
    const surface=AIR_SURFACES.findLast(s=>Math.abs(x-s.x)<s.w/2&&Math.abs(z-s.z)<s.d/2);
    tiles.push({x,z,w:xs[i]-xs[i-1],d:zs[j]-zs[j-1],color:surface?.color??'#71896c'});
  }
  return tiles;
}
export const flightClipPlanes = cockpit => ({near:cockpit?.5:2,far:11000});

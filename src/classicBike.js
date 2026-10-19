import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Reference-built CG-style commuter. Full geometry is shared by local/remote
// players; the caller merges these parts into one draw per material. No textures,
// downloaded models, per-frame geometry generation, or DOM dependencies.
const V=p=>new THREE.Vector3(...p);
function builders(emit) {
  function tube(a,b,r,key='chrome',segments=10) {
    const from=V(a),to=V(b),g=new THREE.CylinderGeometry(r,r,from.distanceTo(to),segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize()));
    g.translate(...a.map((v,i)=>(v+b[i])/2));emit(g,key);
  }
  function box(w,h,d,x,y,z,key='chrome',radius=.012) {
    const g=radius?new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/2,h/2,d/2)):new THREE.BoxGeometry(w,h,d);
    emit(g.translate(x,y,z),key);
  }
  function path(points,r,key='chrome',segments=32,sides=8) {
    emit(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(V)),segments,r,sides,false),key);
  }
  function poly(points,key) {
    const data=[];
    // Side decals can be concave lightning shapes; a triangle fan would fill
    // their cut-outs. Triangulate in the side plane before mirroring both faces.
    const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p[2],p[1])),[]);
    for(const [a,b,c] of triangles)for(const i of [a,b,c,a,c,b])data.push(...points[i]);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));g.computeVertexNormals();emit(g,key);
  }
  return {tube,box,path,poly};
}

// Small code-native badge lettering, not a bitmap pasted over the motorcycle.
const GLYPHS={
  C:[[[1,0],[0,0],[0,1],[1,1]]],G:[[[1,0],[0,0],[0,1],[1,1],[1,.5],[.5,.5]]],
  '1':[[[.3,.2],[.6,0],[.6,1]],[[.2,1],[1,1]]],
  '2':[[[0,0],[1,0],[1,.5],[0,.5],[0,1],[1,1]]],
  '5':[[[1,0],[0,0],[0,.5],[1,.5],[1,1],[0,1]]],
  H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.5],[1,.5]]],
  O:[[[0,0],[1,0],[1,1],[0,1],[0,0]]],N:[[[0,1],[0,0],[1,1],[1,0]]],
  D:[[[0,0],[.65,0],[1,.2],[1,.8],[.65,1],[0,1],[0,0]]],
  A:[[[0,1],[.45,0],[.55,0],[1,1]],[[.2,.6],[.8,.6]]],
};

export function defineClassicBike(api) {
  const emit=(g,key)=>api.geometry(g,key),{tube,box,path,poly}=builders(emit);
  // Long red tank with rounded/chamfered shoulders and tapered knee end.
  const sections=[[-.59,.095,.37,.54],[-.54,.17,.33,.61],[-.43,.205,.32,.64],[-.22,.20,.31,.625],[-.04,.16,.32,.59],[.045,.11,.34,.56]];
  const ring=[[-.78,0],[-1,.18],[-1,.76],[-.78,.95],[-.35,1],[.35,1],[.78,.95],[1,.76],[1,.18],[.78,0],[.35,-.02],[-.35,-.02]];
  const positions=[],indices=[];
  for(const [z,width,bottom,top] of sections)for(const [x,y] of ring)positions.push(x*width,bottom+(top-bottom)*y,z);
  for(let s=0;s<sections.length-1;s++)for(let i=0;i<ring.length;i++){
    const a=s*ring.length+i,b=s*ring.length+(i+1)%ring.length,c=b+ring.length,d=a+ring.length;
    indices.push(a,b,d,b,c,d);
  }
  for(let i=1;i<ring.length-1;i++){indices.push(0,i+1,i);const o=(sections.length-1)*ring.length;indices.push(o,o+i,o+i+1);}
  for(let i=0;i<indices.length;i+=3)[indices[i],indices[i+2]]=[indices[i+2],indices[i]];
  const tank=new THREE.BufferGeometry();tank.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));tank.setIndex(indices);tank.computeVertexNormals();emit(tank,'paint');
  const widthAt=z=>{for(let i=1;i<sections.length;i++)if(z<=sections[i][0]){const a=sections[i-1],b=sections[i],t=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1);return a[1]+(b[1]-a[1])*t;}return sections.at(-1)[1];};
  tube([0,.633,-.31],[0,.652,-.31],.043);tube([0,.653,-.31],[0,.658,-.31],.03,'trim',16);

  // Bench, piped perimeter, seams and chrome rear grab rail.
  box(.34,.115,.98,0,.495,.51,'rubber',.045);
  for(const s of [-1,1]) {
    path([[s*.16,.47,.04],[s*.175,.46,.35],[s*.17,.48,.82],[s*.15,.54,.98]],.006,'trim',24,5);
    path([[s*.14,.41,.08],[s*.17,.41,.6],[s*.19,.51,.97],[s*.15,.62,1.04]],.014);
  }
  path([[-.15,.62,1.04],[0,.63,1.055],[.15,.62,1.04]],.014);
  for(let i=0;i<9;i++)box(.30,.002,.004,0,.553,.12+i*.09,'trim',0);
  box(.35,.025,.035,0,.547,.49,'dark',.005);

  // Tubular cradle, swingarm, triangulation and red side covers.
  for(const s of [-1,1]) {
    path([[s*.075,.58,-.52],[s*.13,.10,-.42],[s*.13,-.34,-.22],[s*.13,-.35,.22],[s*.12,.34,.18],[s*.075,.58,-.52]],.021,'dark',36);
    tube([s*.12,.34,.16],[s*.12,.40,.83],.018,'dark');
    tube([s*.12,-.18,.18],[s*.105,-.25,.71],.024,'trim');
    tube([s*.12,.4,.80],[s*.12,.02,.20],.018,'dark');
    box(.05,.26,.43,s*.155,.245,.28,'paint',.024);
    const side=(pts,key,offset=.184)=>poly(pts.map(([z,y])=>[s*offset,y,z]),key);
    side([[.09,.34],[.46,.34],[.35,.28],[.49,.23],[.16,.25]],'decalGold');
    side([[.1,.325],[.43,.325],[.30,.29],[.16,.29]],'dark',.186);
    side([[.18,.265],[.39,.27],[.31,.25],[.2,.245]],'decalCyan',.187);
    // Tank lightning stripes follow the tank taper, with tiny depth separation.
    const stripe=(pts,key,offset=.002)=>{
      // Split at tank sections so decals follow its taper instead of cutting inside it.
      for(let section=1;section<sections.length;section++) {
        let clipped=pts.map(p=>p.slice());
        for(const [boundary,keepGreater] of [[sections[section-1][0],true],[sections[section][0],false]]) {
          const result=[];
          for(let i=0;i<clipped.length;i++){
            const a=clipped[i],b=clipped[(i+1)%clipped.length],inside=p=>keepGreater?p[0]>=boundary:p[0]<=boundary;
            if(inside(a))result.push(a);
            if(inside(a)!==inside(b)){const t=(boundary-a[0])/(b[0]-a[0]);result.push([boundary,a[1]+(b[1]-a[1])*t]);}
          }
          clipped=result;
        }
        if(clipped.length>=3)poly(clipped.map(([z,y])=>[s*(widthAt(z)+offset),y,z]),key);
      }
    };
    stripe([[-.535,.51],[-.14,.545],[-.215,.435],[-.04,.475],[-.10,.36],[-.49,.36]],'dark');
    stripe([[-.52,.505],[-.16,.53],[-.24,.421],[-.064,.463],[-.12,.375],[-.485,.377]],'decalGold',.003);
    stripe([[-.49,.478],[-.235,.50],[-.30,.43],[-.46,.40]],'decalWhite',.004);
    stripe([[-.48,.448],[-.266,.475],[-.317,.427],[-.46,.412]],'decalCyan',.005);
    stripe([[-.48,.386],[-.16,.398],[-.117,.427],[-.15,.386]],'decalWhite',.005);
    // Wing-shaped tank badge above the striping, on both sides.
    for(let i=0;i<5;i++)stripe([[-.44+i*.012,.58-i*.009],[-.32,.552-i*.004],[-.35,.547-i*.004],[-.44+i*.012,.573-i*.009]],'chrome',.005);
    const text=(word,z,y,height,x,key)=>{
      const w=height*.52;
      for(let i=0;i<word.length;i++)for(const line of GLYPHS[word[i]]||[])for(let j=1;j<line.length;j++){
        const pt=([u,v])=>[s*x,y-v*height,z+(s>0?word.length*1.35-i*1.35-u:i*1.35+u)*w];
        tube(pt(line[j-1]),pt(line[j]),height*.055,key,4);
      }
    };
    text('HONDA',-.43,.538,.014,.209,'decalWhite');
    text('CG125',.145,.322,.03,.189,'decalWhite');
  }

  // Air-cooled upright single-cylinder engine, stacked fins and alloy crankcase.
  box(.28,.235,.31,0,-.12,-.04,'chrome',.055);
  tube([-.17,-.10,-.055],[.17,-.10,-.055],.115,'chrome',24);
  for(const s of [-1,1]) {
    tube([s*.172,-.10,-.055],[s*.181,-.10,-.055],.086,'chrome',24);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;tube([s*.183,-.10+Math.sin(a)*.094,-.055+Math.cos(a)*.094],[s*.19,-.10+Math.sin(a)*.094,-.055+Math.cos(a)*.094],.008,'trim',6);}
  }
  box(.20,.23,.20,0,.105,-.14,'trim',.018);
  for(let i=0;i<9;i++)box(.26,.012,.24,0,.005+i*.026,-.14,'chrome',.006);
  box(.235,.067,.235,0,.275,-.14,'chrome',.015);
  for(const s of [-1,1])tube([s*.08,.28,-.17],[s*.08,-.02,-.17],.009,'chrome',6);
  box(.105,.1,.1,0,.16,.035,'chrome',.018);
  tube([0,.15,.03],[0,.16,.16],.041,'rubber');
  path([[.05,.29,-.18],[.09,.37,-.18],[.07,.39,.05],[.04,.31,.13]],.007,'rubber',18,5);
  // Chain guard left, long chrome exhaust right, exposed curved header.
  box(.055,.09,.73,-.12,-.13,.38,'chrome',.022);
  path([[.08,.21,-.25],[.11,.13,-.38],[.17,-.22,-.37],[.24,-.33,-.16],[.25,-.29,.21]],.029,'chrome',32);
  path([[.25,-.29,.12],[.26,-.265,.4],[.26,-.18,.91]],.062,'chrome',28,16);
  tube([.26,-.18,.90],[.26,-.17,.985],.047,'chrome',20);
  tube([.26,-.17,.985],[.26,-.168,.991],.029,'dark',16);
  for(let i=0;i<4;i++)tube([.318,-.20+i*.012,.40+i*.08],[.32,-.235+i*.012,.48+i*.08],.005,'trim',5);

  // Chrome fenders are curved shells, not rectangular blocks above tyres.
  function fender(z,start,end,width,radius) {
    const pos=[],idx=[],n=32;
    for(let i=0;i<=n;i++){
      const a=start+(end-start)*i/n;
      for(let j=0;j<7;j++){const u=j/6,rr=radius+.019*Math.sin(u*Math.PI);pos.push((u-.5)*width,-.25+Math.sin(a)*rr,z+Math.cos(a)*rr);}
    }
    for(let i=0;i<n;i++)for(let j=0;j<6;j++){const a=i*7+j,b=a+1,c=a+7,d=c+1;idx.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();emit(g,'chrome');
    const back=g.clone(),reverse=idx.slice();for(let i=0;i<reverse.length;i+=3)[reverse[i],reverse[i+2]]=[reverse[i+2],reverse[i]];
    back.setIndex(reverse);back.computeVertexNormals();emit(back,'chrome');
    // Rolled side lips.
    for(const s of [-1,1]){const pts=[];for(let i=0;i<=24;i++){const a=start+(end-start)*i/24;pts.push([s*width/2,-.25+Math.sin(a)*radius,z+Math.cos(a)*radius]);}path(pts,.004,'chrome',32,5);}
  }
  fender(-.71,.2,Math.PI-.12,.15,.397);fender(.71,-.42,Math.PI-.18,.17,.40);
  box(.16,.22,.025,0,-.12,1.105,'rubber',.015);
  box(.145,.1,.02,0,.10,1.08,'dark',.006);
  box(.11,.065,.005,0,.115,1.093,'decalWhite',.003);
  box(.16,.10,.085,0,.34,1.01,'dark',.012);box(.14,.08,.035,0,.34,1.063,'red',.012);
  tube([0,.4,.85],[0,.34,1.01],.018,'trim');
  tube([0,.34,1.01],[0,.10,1.08],.012,'trim');

  // Front fork (red upper sleeves), drum linkage, rear twin spring shocks.
  for(const s of [-1,1]) {
    tube([s*.095,-.25,-.71],[s*.095,.22,-.59],.029,'chrome',16);
    tube([s*.095,.21,-.59],[s*.095,.47,-.525],.018,'chrome',16);
    tube([s*.095,.45,-.53],[s*.095,.69,-.47],.033,'paint',16);
    tube([s*.1,-.25,-.71],[s*.1,.08,-.90],.007,'chrome',6);
    tube([s*.15,-.23,.71],[s*.15,.39,.49],.015,'chrome');
    tube([s*.15,.21,.553],[s*.15,.39,.49],.033,'chrome');
    const helix=[];
    for(let i=0;i<=144;i++){const t=i/144,a=t*Math.PI*20;helix.push([s*.15+Math.cos(a)*.028,-.17+t*.39,.69-t*.138+Math.sin(a)*.028]);}
    path(helix,.006,'chrome',144,5);
    box(.022,.065,.045,s*.128,.185,-.595,'signal',.008);
    tube([s*.095,.55,-.50],[s*.23,.55,-.69],.012,'chrome');box(.065,.055,.067,s*.245,.55,-.69,'signal',.015);
    tube([s*.09,.38,.91],[s*.23,.38,.91],.012,'chrome');box(.065,.055,.067,s*.245,.38,.91,'signal',.015);
    tube([s*.10,-.20,.13],[s*.27,-.20,.13],.017);box(.11,.04,.065,s*.285,-.20,.13,'rubber',.008);
  }
  tube([-.12,.66,-.48],[.12,.66,-.48],.021,'chrome');
  // Round headlight, twin clocks, swept handlebar, levers, mirrors and cables.
  tube([0,.63,-.68],[0,.63,-.775],.096,'dark',28);
  for(const s of [-1,1])tube([s*.095,.63,-.49],[s*.095,.63,-.73],.012,'chrome');
  tube([0,.63,-.765],[0,.63,-.797],.100,'chrome',32);
  tube([0,.63,-.798],[0,.63,-.805],.085,'headlight',32);
  for(let i=-3;i<=3;i++)box(.004,.15,.003,i*.018,.63,-.808,'decalWhite',0);
  for(const s of [-1,1]){
    tube([s*.058,.75,-.48],[s*.058,.81,-.48],.047,'dark',20);
    tube([s*.058,.812,-.48],[s*.058,.814,-.48],.039,'glass',20);
    tube([s*.058,.816,-.48],[s*.071,.816,-.50],.002,'decalWhite',5);
    path([[0,.73,-.43],[s*.15,.74,-.43],[s*.24,.84,-.38],[s*.34,.85,-.34]],.013,'chrome',24);
    tube([s*.255,.845,-.37],[s*.37,.85,-.33],.022,'rubber',16);
    box(.055,.06,.05,s*.23,.84,-.39,'dark',.009);
    path([[s*.23,.85,-.41],[s*.3,.85,-.43],[s*.38,.86,-.39]],.006,'chrome',14,6);
    path([[s*.23,.87,-.39],[s*.25,1.03,-.42],[s*.30,1.13,-.44]],.008,'chrome',16,6);
    const mirror=new THREE.SphereGeometry(1,16,10);mirror.scale(.05,.078,.016).rotateZ(s*-.2).translate(s*.31,1.17,-.44);emit(mirror,'dark');
    const face=new THREE.SphereGeometry(1,16,10);face.scale(.042,.067,.005).rotateZ(s*-.2).translate(s*.31,1.17,-.422);emit(face,'chrome');
  }
  path([[.24,.84,-.40],[.13,.62,-.55],[.12,.16,-.59],[.115,-.22,-.71]],.004,'rubber',30,5);
  path([[-.23,.84,-.40],[-.11,.60,-.38],[-.10,.23,.04]],.004,'rubber',24,5);
  tube([.19,-.06,.13],[.24,.10,.23],.009);tube([.24,.10,.23],[.31,.10,.23],.014,'rubber');

  // Seated rider: feet on pegs and hands actually reaching the grips.
  // Included identically for local and remote players, carried by wheelie pivot.
  box(.31,.44,.23,0,.86,.24,'dark',.055);
  box(.27,.16,.27,0,.59,.27,'dark',.04);
  const helmet=new THREE.SphereGeometry(.16,24,16);helmet.scale(1,1.1,1.04).translate(0,1.24,.21);emit(helmet,'rubber');
  box(.25,.095,.035,0,1.26,.055,'glass',.018);
  for(const s of [-1,1]) {
    tube([s*.16,1.02,.20],[s*.25,.84,-.01],.060,'dark',12);
    tube([s*.25,.84,-.01],[s*.30,.85,-.32],.044,'dark',12);
    box(.09,.065,.10,s*.31,.85,-.33,'rubber',.022);
    tube([s*.11,.58,.27],[s*.24,.24,-.02],.071,'dark',12);
    tube([s*.24,.24,-.02],[s*.25,-.12,.15],.052,'dark',12);
    box(.11,.085,.24,s*.27,-.155,.07,'rubber',.025);
  }
}

export function defineClassicWheel(api) {
  const emit=(g,key)=>api.geometry(g,key),{tube}=builders(emit);
  // Open wire-spoked wheels: unlike the old car wheel, no solid inner disc.
  const tyre=new THREE.TorusGeometry(.305,.055,12,48);tyre.rotateY(Math.PI/2).scale(1.5,1,1);emit(tyre,'rubber');
  for(const s of [-1,1]) {
    for(const r of [.270,.285]){const rim=new THREE.TorusGeometry(r,.009,6,48);rim.rotateY(Math.PI/2).translate(s*.065,0,0);emit(rim,'chrome');}
    const sidewall=new THREE.TorusGeometry(.315,.0025,4,48);sidewall.rotateY(Math.PI/2).translate(s*.078,0,0);emit(sidewall,'rubber');
  }
  tube([-.075,0,0],[.075,0,0],.086,'chrome',28);
  tube([-.09,0,0],[.09,0,0],.029,'trim',16);
  for(let i=0;i<36;i++) {
    const a=i*Math.PI*2/36,s=i%2?1:-1,b=a+s*.32;
    tube([s*.07,Math.sin(a)*.074,Math.cos(a)*.074],[s*.06,Math.sin(b)*.272,Math.cos(b)*.272],.0025,'chrome',5);
  }
  // Fine shoulder tread breaks up the round tyre without oversized blocks.
  for(let i=0;i<48;i++)for(const s of [-1,1]) {
    const a=i*Math.PI*2/48;
    const g=new THREE.BoxGeometry(.035,.003,.014);g.translate(s*.038,.358,0).rotateX(a);emit(g,'trim');
  }
}

import { modelOf } from './vehicleModels.js';
import { defineAircraft } from './aircraftBody.js';

/**
 * The car's shape, defined once as a sequence of calls against an emitter.
 *
 * The player's car runs this against an emitter that builds individually
 * addressable meshes, because impact deformation has to move single panels.
 * Traffic runs the same definition against an emitter that merges everything
 * into one geometry per material, so every AI car is the same model drawn from
 * a handful of instanced meshes.
 */
export function defineCarBody(api, options = {}) {
  if(modelOf(options.model).kind==='aircraft')return defineAircraft(api,options.model);
  if(['rider','swift','vesper','tempest','formula'].includes(options.model))return defineSpecial(api,options.model);
  if (options.model && !['veloce', 'marlin'].includes(options.model)) return defineVariant(api, options);
  const { part, beam, windowQuad } = api;
  const interior = options.interior !== false;
  const detail = options.detail !== false;

  // Main body panels. These are the ones that take dents.
  part(1.91, 0.44, 4.38, 0, 0.22, 0, 'paint', 0.11, true);
  part(1.83, 0.18, 1.34, 0, 0.51, -1.44, 'paint', 0.07, true);
  part(1.85, 0.18, 0.85, 0, 0.51, 1.7, 'paint', 0.06, true);
  part(1.52, 0.1, 1.81, 0, 1.11, 0.08, 'paint', 0.055, true);
  part(1.86, 0.09, 4.05, 0, 0.04, 0, 'dark', 0.025);

  windowQuad([[-0.84, 0.6, -1.14], [0.84, 0.6, -1.14], [0.72, 1.075, -0.8], [-0.72, 1.075, -0.8]], 'front');
  windowQuad([[0.84, 0.6, 1.24], [-0.84, 0.6, 1.24], [-0.72, 1.075, 0.92], [0.72, 1.075, 0.92]], 'rear');

  for (const s of [-1, 1]) {
    windowQuad([[s * 0.85, 0.59, -1.1], [s * 0.85, 0.59, 1.18], [s * 0.735, 1.07, 0.88], [s * 0.735, 1.07, -0.77]], 'side');
    beam([s * 0.85, 0.57, -1.14], [s * 0.74, 1.11, -0.8], 0.075, 'paint');
    beam([s * 0.85, 0.57, 1.26], [s * 0.74, 1.11, 0.92], 0.105, 'paint');
    beam([s * 0.86, 0.59, 0.05], [s * 0.75, 1.095, 0.05], 0.072, 'trim');
    part(0.045, 0.056, 3.96, s * 0.961, 0.245, 0, 'trim');
    if (detail) {
      part(0.026, 0.035, 2.52, s * 0.944, 0.575, 0.06, 'chrome');
      part(0.022, 0.025, 0.28, s * 0.966, 0.47, -0.04, 'chrome', 0.009);
      part(0.022, 0.025, 0.28, s * 0.966, 0.47, 0.91, 'chrome', 0.009);
      part(0.007, 0.34, 0.012, s * 0.962, 0.37, 0.2, 'dark');
      part(0.007, 0.31, 0.012, s * 0.962, 0.36, 1.18, 'dark');
      part(0.007, 0.31, 0.012, s * 0.962, 0.36, -1.05, 'dark');
      part(0.018, 0.053, 0.14, s * 0.963, 0.46, -1.29, 'headlight');
    }
    // Mirrors, lights and bumper corners read at any distance, so traffic keeps them.
    part(0.25, 0.16, 0.31, s * 1.01, 0.69, -0.85, 'paint', 0.06);
    part(0.19, 0.10, 0.02, s * 1.024, 0.7, -0.686, 'chrome', 0.025);
    part(0.68, 0.18, 0.065, s * 0.53, 0.4, -2.171, 'headlight', 0.025, true);
    part(0.66, 0.16, 0.075, s * 0.56, 0.42, 2.175, 'red', 0.025, true);
    part(0.6, 0.027, 0.08, s * 0.56, 0.40, 2.19, 'chrome');
    part(0.17, 0.12, 0.12, s * 0.66, 0.12, -2.18, 'headlight', 0.025);
  }

  part(0.42, 0.19, 0.05, 0, 0.4, -2.2, 'trim', 0.02);
  if (detail) for (let i = -3; i <= 3; i++) part(0.013, 0.14, 0.06, i * 0.05, 0.4, -2.23, 'chrome');
  part(1.82, 0.085, 0.12, 0, 0.21, -2.2, 'trim', 0.03, true);
  part(1.82, 0.085, 0.12, 0, 0.20, 2.2, 'trim', 0.03, true);
  part(0.8, 0.095, 0.055, 0, 0.07, -2.16, 'dark');
  if (detail) part(0.15, 0.12, 0.26, -0.65, -0.01, 2.17, 'chrome', 0.05);

  if (interior) {
    for (const x of [-0.43, 0.43]) {
      part(0.55, 0.15, 0.57, x, 0.37, 0.12, 'dark', 0.06);
      part(0.55, 0.55, 0.13, x, 0.65, 0.41, 'dark', 0.05, false, { rotateX: -0.12 });
      part(0.27, 0.18, 0.12, x, 0.99, 0.44, 'dark', 0.05);
    }
    part(1.49, 0.35, 0.25, 0, 0.64, 0.99, 'dark', 0.06);
    part(1.6, 0.16, 0.45, 0, 0.58, -0.88, 'dark', 0.055);
    part(1.5, 0.04, 0.04, 0, 0.565, -0.63, 'chrome');
    part(0.24, 0.28, 0.57, 0, 0.33, -0.4, 'dark', 0.03);
  } else {
    // Traffic still needs something behind the glass, but only a suggestion of it.
    part(1.3, 0.42, 1.5, 0, 0.62, 0.1, 'dark', 0.05);
  }
}

function defineSpecial({part,beam,windowQuad},id) {
  const human=(y,z,bike=false)=>{
    part(.4,.56,.26,0,y,z,'dark',.07);
    part(.33,.34,.34,0,y+.43,z-.12,'paint',.14);
    part(.29,.12,.05,0,y+.46,z-.3,'glass',.03);
    for(const s of [-1,1]) {
      beam([s*.2,y+.15,z],[s*.34,y-.03,z-.26],.14,'dark');
      beam([s*.34,y-.03,z-.26],[s*(bike?.3:.21),y-.13,z-.54],.11,'dark');
      part(.12,.1,.15,s*(bike?.3:.21),y-.13,z-.56,'chrome',.03);
      beam([s*.14,y-.25,z+.05],[s*.3,y-.48,z-.3],.18,'dark');
      beam([s*.3,y-.48,z-.3],[s*.27,y-.8,z+.02],.14,'dark');
      part(.16,.12,.3,s*.27,y-.83,z-.05,'rubber',.03);
    }
  };
  if(id==='swift'||id==='vesper') {
    const sport=id==='swift', axle=modelOf(id).wheelbase/2;
    // Open step-through, enclosed engine and a seated rider; no car-shaped chassis panels.
    part(.65,.13,1.16,0,-.04,.02,'dark',.055);
    part(.54,.11,.77,0,.035,-.04,'rubber',.04);
    part(.57,.39,.95,0,.2,.56,'dark',.09);
    part(.53,.15,sport?1.06:.86,0,.6,.47,'rubber',.065);
    if(sport)part(.49,.1,.42,0,.7,.78,'rubber',.045);
    for(const s of [-1,1]) {
      part(.17,sport?.34:.43,sport?1.1:.85,s*.3,.31,.58,'paint',sport?.045:.14,true,{rotateX:sport?-.12:0});
      part(.11,.15,.8,s*.29,.005,.15,'paint',.045,true);
      beam([s*.13,.62,-.55],[s*.13,-.25,-axle],.055,'chrome');
      beam([s*.24,.38,.64],[s*.24,-.2,axle],.065,'chrome');
      for(let i=0;i<5;i++)part(.09,.025,.09,s*.24,.02+i*.055,.72,'trim',.009);
      beam([s*.3,.94,-.38],[s*.48,1.36,-.48],.022,sport?'chrome':'paint');
      part(.19,.13,.07,s*.49,1.4,-.48,sport?'dark':'paint',.055);
      part(.15,.09,.015,s*.49,1.4,-.44,'chrome',.03);
      part(.19,.055,.075,s*.4,.94,-.38,'rubber',.025);
      beam([s*.28,.71,.58],[s*.29,.71,1.01],.045,'chrome');
    }
    beam([-.43,.94,-.38],[.43,.94,-.38],.045,'chrome');
    part(.23,.29,.64,-.22,-.15,.66,'chrome',.07);
    for(let i=0;i<5;i++)part(.025,.025,.31,-.345,-.22+i*.04,.68,'trim');
    beam([.29,-.1,.26],[.34,-.16,1.04],.14,'dark');
    part(.32,.075,.055,0,.49,sport?1.14:1.03,'red',.025);
    part(.22,.29,.055,0,.18,sport?1.12:1.03,'dark',.025,false,{rotateX:.15});
    part(.16,.1,.015,0,.2,sport?1.16:1.07,'chrome',.01);
    part(.34,.12,.59,0,.18,-axle,sport?'paint':'dark',.05);
    if(sport) {
      // Split swept-back fairings, slanted twin lights and a tall smoked screen.
      part(.63,.47,.33,0,.37,-.62,'paint',.055,true,{rotateX:-.26});
      part(.6,.28,.38,0,.71,-.69,'paint',.055,true,{rotateX:.4});
      part(.4,.44,.07,0,.96,-.61,'glass',.055,false,{rotateX:.38});
      for(const s of [-1,1]) {
        part(.19,.09,.08,s*.19,.68,-.91,'headlight',.035,false,{rotateX:.4});
        beam([s*.27,.47,-.67],[s*.29,.08,-.15],.13,'paint');
        part(.09,.1,.2,s*.3,.23,.88,'trim',.025);
      }
      part(.33,.07,.045,0,.48,-.83,'dark',.015);
    } else {
      // Rounded front apron and handlebar-mounted circular headlamp.
      part(.64,.73,.23,0,.38,-.57,'paint',.105,true,{rotateX:-.12});
      part(.46,.25,.25,0,.76,-.56,'paint',.095,true);
      part(.57,.2,.23,0,.95,-.47,'paint',.085,true);
      part(.25,.25,.11,0,.95,-.62,'chrome',0,false,{cylinder:true});
      part(.21,.21,.025,0,.95,-.69,'headlight',0,false,{cylinder:true});
      for(const s of [-1,1]) {
        part(.09,.18,.035,s*.23,.37,-.72,'headlight',.03);
        part(.045,.075,.085,s*.18,.13,-.84,'red',.02);
      }
    }
    // Upright scooter posture: hands reach bars, feet rest on the floorboard.
    human(1.08,.16,true);
    return;
  }
  if(id==='rider') {
    part(.34,.4,.5,0,.08,-.05,'chrome',.025,true);
    for(let i=0;i<5;i++)part(.42,.035,.4,0,.05+i*.065,-.1,'trim');
    part(.53,.32,.68,0,.51,-.27,'paint',.035,true,{rotateX:-.08});
    part(.46,.14,.97,0,.57,.42,'rubber',.025);
    part(.4,.25,.42,0,.31,.39,'paint',.02,true);
    part(.28,.28,.18,0,.76,-.84,'chrome',0,false,{cylinder:true});
    part(.23,.23,.025,0,.76,-.945,'headlight',0,false,{cylinder:true});
    part(.34,.065,.66,0,.19,-.8,'paint',.025,false,{rotateX:-.12});
    part(.32,.07,.59,0,.22,.78,'paint',.025);
    part(.24,.08,.05,0,.51,1,'red',.02);
    for(const s of [-1,1]) {
      beam([s*.14,.87,-.52],[s*.14,-.23,-.78],.065,'chrome');
      beam([s*.16,.46,-.45],[s*.16,-.15,-.3],.065,'chrome');
      beam([s*.16,-.15,-.3],[s*.16,-.18,.78],.065,'chrome');
      beam([s*.16,.49,.55],[s*.18,-.25,.78],.09,'chrome');
    }
    beam([-.39,.88,-.5],[.39,.88,-.5],.055,'chrome');
    for(const s of [-1,1])part(.18,.06,.07,s*.39,.88,-.5,'rubber');
    beam([.22,-.04,-.3],[.29,-.12,.45],.075,'chrome');
    beam([.29,-.12,.45],[.3,-.08,1.03],.14,'chrome');
    human(1.06,.22,true);return;
  }
  if(id==='formula') {
    part(.54,.38,3.8,0,.24,-.3,'paint',.04,true);
    part(.32,.18,1.65,0,.36,-1.64,'paint',.025,true,{rotateX:-.06});
    part(2.04,.08,.52,0,.06,-2.28,'dark',.02,true);
    part(1.88,.09,.43,0,.94,2.12,'paint',.02,true);
    for(const s of [-1,1]) {
      part(.48,.36,1.46,s*.49,.24,.48,'paint',.06,true);
      part(.3,.24,.08,s*.48,.3,-.27,'dark');
      part(.08,.45,.5,s*.94,.25,-2.27,'paint');
      part(.075,.65,.52,s*.9,.69,2.1,'paint');
      beam([s*.38,.32,1.4],[s*.38,.92,2.1],.065,'trim');
      for(const z of [-1.6,1.6])for(const y of [.02,.25])beam([s*.2,y,z*.65],[s*.91,-.17,z],.05,'chrome');
    }
    part(.56,.32,.65,0,.46,.24,'dark',.06);
    part(.42,.3,.44,0,.82,.35,'paint',.13);
    part(.38,.1,.04,0,.85,.11,'glass',.02);
    beam([0,.55,-.5],[0,1.06,-.12],.065,'trim');
    for(const s of [-1,1])beam([0,1.06,-.12],[s*.32,.87,.65],.065,'trim');
    part(.6,.12,.06,0,.38,2.36,'red');return;
  }
  part(2.08,.3,4.7,0,.18,0,'paint',.045,true);
  part(1.88,.12,1.55,0,.41,-1.48,'paint',.025,true,{rotateX:-.1});
  part(1.5,.09,1.25,0,.88,-.05,'paint',.035,true);
  part(2.17,.07,.45,0,.01,-2.16,'dark');
  windowQuad([[-.91,.44,-1.18],[.91,.44,-1.18],[.7,.84,-.64],[-.7,.84,-.64]],'front');
  windowQuad([[.9,.45,1.06],[-.9,.45,1.06],[-.7,.84,.53],[.7,.84,.53]],'rear');
  for(const s of [-1,1]) {
    windowQuad([[s*.93,.45,-1.15],[s*.93,.45,1],[s*.72,.84,.51],[s*.72,.84,-.61]],'side');
    beam([s*.92,.44,-1.18],[s*.73,.88,-.64],.06,'paint');
    beam([s*.93,.44,1.1],[s*.73,.88,.55],.09,'paint');
    part(.07,.3,.8,s*1.035,.28,.65,'dark');
    part(.48,.07,.12,s*.67,.34,-2.36,'headlight',.02);
    part(.78,.05,.07,s*.56,.36,2.36,'red');
    part(.08,.25,.14,s*.67,.66,1.86,'trim');
    part(.28,.1,.24,s*1.07,.62,-.72,'paint',.03);
    part(.15,.15,.24,s*.58,.08,2.37,'chrome',.045);
  }
  part(1.98,.07,.38,0,.82,1.86,'dark');
  for(let i=0;i<5;i++)part(1.2,.035,.08,0,.46,1.1+i*.16,'trim');
  part(1.45,.2,.35,0,.42,-.7,'dark');
}

function defineVariant({ part, beam, windowQuad }, options) {
  const m = modelOf(options.model), w = m.width, end = m.length / 2;
  const rear = m.cabinRear, roof = m.roof;
  const pickup = m.kind === 'pickup', sport = m.kind === 'sport';
  // Each silhouette has its own cabin, deck and equipment, rather than scaling a sedan.
  part(w, .44, m.length, 0, .22, 0, 'paint', .09, true);
  part(w * .96, .12, .9, 0, .5, -end + .47, 'paint', .04, true);
  part(w * .94, .09, m.length * .96, 0, .02, 0, 'dark');
  part(w * .76, .1, rear + .82, 0, roof, (rear - .82) / 2, 'paint', .045, true);
  windowQuad([[-w*.43,.56,-1.14],[w*.43,.56,-1.14],[w*.37,roof-.06,-.82],[-w*.37,roof-.06,-.82]], 'front');
  windowQuad([[w*.43,.56,rear+.16],[-w*.43,.56,rear+.16],[-w*.37,roof-.06,rear],[w*.37,roof-.06,rear]], 'rear');
  for (const s of [-1, 1]) {
    windowQuad([[s*w*.44,.56,-1.1],[s*w*.44,.56,rear+.12],[s*w*.375,roof-.06,rear-.03],[s*w*.375,roof-.06,-.8]], 'side');
    beam([s*w*.44,.52,-1.15],[s*w*.38,roof,-.82],.075,'paint');
    beam([s*w*.44,.52,rear+.2],[s*w*.38,roof,rear],.1,'paint');
    part(.24,.14,.27,s*w*.52,.66,-.87,'paint',.04);
    part(w*.3,sport ? .08 : .18,.07,s*w*.29,.41,-end-.025,'headlight',.02,true);
    part(w*.3,.12,.07,s*w*.29,.41,end+.025,'red',.02,true);
    part(.04,.13,m.length*.8,s*w*.51,.08,0,'trim');
    part(.035,.035,.25,s*w*.5,.48,-.18,'chrome');
  }
  part(w*.85,.13,.14,0,.18,-end,'trim',.03,true);
  part(w*.85,.13,.14,0,.18,end,'trim',.03,true);
  part(w*.35,.2,.08,0,.38,-end-.015,'dark');
  if (pickup) {
    part(w*.84,.07,2,0,.48,end-1.04,'dark');
    for (const s of [-1,1]) part(.14,.42,2.15,s*(w/2-.09),.66,end-1.09,'paint',.03,true);
    part(w,.42,.13,0,.66,end-.07,'paint',.03,true);
    for (const s of [-1,1]) beam([s*.7,.53,.4],[s*.7,1.2,.4],.1,'chrome');
    beam([-.7,1.2,.4],[.7,1.2,.4],.1,'chrome');
  } else if (m.kind === 'suv' || m.kind === 'hatch') {
    part(w*.86,.35,.12,0,.66,end-.1,'paint',.03,true);
    if (m.kind === 'suv') {
      for (const s of [-1,1]) part(.07,.09,2.05,s*.65,roof+.14,.3,'trim');
      part(.65,.65,.27,0,.69,end+.13,'rubber',.19);
      part(.4,.4,.03,0,.69,end+.28,'chrome',.15);
    }
  } else {
    part(w*.92,.15,end-rear-.15,0,.53,(end+rear+.15)/2,'paint',.04,true);
  }
  if (sport || m.kind === 'rally') {
    for (const s of [-1,1]) part(.07,.32,.12,s*.61,.76,end-.38,'trim');
    part(w*1.03,.07,.38,0,.95,end-.38,'dark',.02);
    part(w*1.05,.06,.36,0,.02,-end+.03,'dark');
    part(.54,.13,.48,0,.63,-1.48,'dark',.03);
    if (m.kind === 'rally') {
      for (const x of [-.55,-.18,.18,.55]) part(.23,.23,.12,x,.59,-end-.08,'headlight',.08);
      part(.3,.01,.8,0,.575,-1.52,'red');
      for (const s of [-1,1]) part(.32,.01,rear+.76,s*.43,roof+.055,(rear-.82)/2,'red');
    }
  }
  if (options.interior !== false) {
    part(w*.77,.15,.4,0,.59,-.88,'dark',.04);
    for (const x of [-.43,.43]) {
      part(.52,.13,.5,x,.37,0,'dark',.04);
      part(.52,.48,.12,x,.65,.29,'dark',.04);
    }
  }
}

// Wheel construction, shared so traffic rolls on the same rims as the player.
export function defineWheel(api, options = {}) {
  const { cylinder, box, torus } = api;
  const detail = options.detail !== false;
  cylinder(0.36, 0.36, 0.235, detail?24:12, 'rubber', 0, 0);
  for (const side of [-1, 1]) {
    cylinder(0.25, 0.25, 0.018, detail?24:12, 'chrome', side * 0.124, 0);
    cylinder(0.208, 0.208, 0.019, detail?24:12, 'dark', side * 0.137, 0);
    for (let j = 0; j < 8; j++) box(0.024, 0.405, 0.045, side * 0.15, j * Math.PI / 8, 'chrome');
    cylinder(0.075, 0.075, 0.027, 16, 'chrome', side * 0.16, 0);
    if (detail) torus(0.3, 0.006, 4, 32, 'trim', side * 0.12);
  }
}

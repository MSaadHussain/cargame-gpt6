// Original low-poly silhouettes, merged by the existing material emitter.
export function defineAircraft({part,beam,panel}, id) {
  const airliner=id==='skyliner';
  if(id==='sparrow') {
    part(1.25,1.2,4.8,0,.55,0,'paint',.45,true);
    part(.85,.85,2.4,0,.55,2.4,'paint',.32,true);
    part(1.15,1.15,.8,0,.55,-2.6,'chrome',0,false,{cylinder:true});
    part(.7,.7,.3,0,.55,-3.12,'dark',0,false,{cylinder:true});
    part(.7,.4,1.05,0,1.2,-.1,'dark',.18);
    part(.55,.4,.09,0,1.45,-.58,'glass',.09);
    part(.32,.35,.34,0,1.4,.15,'trim',.12);
    for(const y of [.1,2.1]) {
      part(9,.13,1.35,0,y,-.4,'paint',.055,true);
      for(const s of [-1,1])part(.16,.08,1.2,s*4.35,y+.1,-.4,s>0?'headlight':'red',.035);
    }
    for(const s of [-1,1]) {
      beam([s*3,.1,-.9],[s*3,2.1,-.9],.075,'trim');beam([s*3,.1,.1],[s*3,2.1,.1],.075,'trim');
      beam([s*.5,1,-.7],[s*1,2.1,-.9],.07,'chrome');
      beam([s*3,.1,-.9],[s*3,2.1,.1],.025,'chrome');
    }
    part(3.4,.1,1.05,0,.7,2.9,'paint',.04,true);
    panel([[0,.7,2],[0,2.3,2.8],[0,2.2,3.6],[0,.7,3.6]],'paint');
    return;
  }
  if(airliner) {
    part(5.8,5.8,47,0,2,0,'paint',2.5,true);
    part(4.8,4.4,10,0,1.8,-26,'paint',2,true);
    part(3.2,3.2,8,0,2,26,'paint',1.4,true);
    part(3.1,.85,.2,0,3,-30.5,'glass',.2);
    for(const s of [-1,1]) {
      // Swept wings, horizontal stabilisers and under-wing twin turbofans.
      panel([[s*2,1,-8],[s*29,.3,10],[s*28,.3,14],[s*2,1,7]],'paint');
      panel([[s*1.5,3,21],[s*12,3,28],[s*11,3,31],[s*1.5,3,27]],'paint');
      beam([s*28,.3,13],[s*29,2.5,12],.22,'paint');
      part(3.5,3.5,6.5,s*10,-1.5,0,'paint',0,true,{cylinder:true});
      part(2.9,2.9,.15,s*10,-1.5,-3.3,'dark',0,false,{cylinder:true});
      part(1.05,1.05,.2,s*10,-1.5,-3.4,'chrome',0,false,{cylinder:true});
      part(1.3,2,3,s*10,.35,.7,'trim',.2);
      for(let i=0;i<28;i++)part(.07,.46,.63,s*2.88,2.8,-20+i*1.5,'glass',.12);
      for(const z of [-21,-5,16])part(.07,2.4,1.2,s*2.92,2.1,z,'chrome',.12);
      part(.1,.45,41,s*2.92,1.4,0,'trim',.04);
      part(.5,.22,.6,s*28,.5,13,s===1?'headlight':'red',.08);
    }
    panel([[0,3,20],[0,13,27],[0,13,30],[0,3,31]],'paint');
    part(.5,.4,1,0,4.9,-2,'red',.1);
    return;
  }
  part(1.8,1.5,11,0,.5,0,'paint',.6,true);
  part(1.15,.95,4,0,.45,-6,'paint',.45,true);
  part(.3,.3,1.8,0,.4,-8,'trim',.13);
  part(1.1,.85,3,0,1.35,-2.5,'glass',.4);
  for(const s of [-1,1]) {
    panel([[s*.7,.4,-3],[s*6,.25,2.5],[s*5.7,.25,4],[s*.7,.4,3]],'paint');
    panel([[s*.5,.8,5],[s*3.5,.6,7.5],[s*3.2,.6,8],[s*.5,.8,7]],'paint');
    panel([[s*.65,1,4],[s*1.7,4,6.5],[s*1.8,4,7.7],[s*.7,1,7.5]],'paint');
    part(.65,.6,2,s*1.05,.15,-.8,'dark',.1);
    part(.36,.36,2.3,s*3,-.1,1.8,'chrome',.15);
    part(.16,.16,.9,s*.48,.25,-6.3,'dark',.04);
    part(.2,.12,.3,s*5.8,.35,3.4,s===1?'headlight':'red',.04);
  }
  part(1.15,1.15,.6,0,.4,5.9,'dark',0,false,{cylinder:true});
  part(.82,.82,.15,0,.4,6.25,'red',0,false,{cylinder:true});
}

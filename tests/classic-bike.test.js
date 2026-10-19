import test from 'node:test';
import assert from 'node:assert/strict';
import {createCarGeometry} from '../src/car.js';

test('CG 125 preserves identical full-detail local and multiplayer geometry with bounded triangles',()=>{
  const local=createCarGeometry({model:'cg125',detail:true,interior:true,damageDetail:true});
  const remote=createCarGeometry({model:'cg125',detail:false,interior:false,damageDetail:true});
  let triangles=0;
  try {
    for(const group of ['body','wheel']) {
      assert.deepEqual(Object.keys(local[group]),Object.keys(remote[group]));
      for(const [key,g] of Object.entries(local[group])) {
        const other=remote[group][key];
        for(const attr of ['position','normal','uv'])assert.deepEqual(g.attributes[attr].array,other.attributes[attr].array,`${group}/${key}/${attr}`);
        assert.ok([...g.attributes.position.array].every(Number.isFinite));
        triangles+=g.attributes.position.count/3*(group==='wheel'?2:1);
      }
    }
    assert.ok(triangles>20000&&triangles<50000,`${triangles} triangles including both wheels`);
    assert.ok(local.body.paint.attributes.normal.getX(0)<0,'tank outward normals');
    for(const key of ['chrome','decalGold','decalCyan','decalWhite','signal'])assert.ok(local.body[key].attributes.position.count>0);
  } finally {
    for(const model of [local,remote])for(const group of ['body','wheel'])Object.values(model[group]).forEach(g=>g.dispose());
  }
});

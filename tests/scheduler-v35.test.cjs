/* Run with: node tests/scheduler-v35.test.cjs */
const assert=require('node:assert/strict');
const s=require('../scheduler-v35.js');
const day='2026-10-26';
const at=t=>day+'T'+t;
const now=new Date(at('08:00')+':00');
const task=(id,mins,due='2026-10-30')=>({actionId:id,task:id,status:'Open',priority:'Medium',dueDate:due,estimatedMinutes:mins});
const window=[{start:at('09:00'),end:at('17:00')}];
{
 const r=s.needsScheduling([task('a',120),{...task('done',30),status:'Done'}],[],now);
 assert.deepEqual(r.map(t=>t.actionId),['a']);
 assert.equal(r[0].unscheduledMinutes,120);
}
{
 const r=s.autoSchedule({tasks:[task('a',60)],workWindows:window,now,
 blocks:[{kind:'meeting',start:at('09:00'),end:at('09:30')}]});
 assert.equal(r.scheduled.length,1);
 assert.equal(r.scheduled[0].start,at('09:30'));
 assert.equal(r.scheduled[0].end,at('10:30'));
}
{
 const r=s.autoSchedule({tasks:[task('a',120)],workWindows:window,now,minimumBlockMinutes:30,
 blocks:[{kind:'manual',start:at('09:30'),end:at('10:30')}]});
 assert.equal(r.scheduled.reduce((n,b)=>n+(new Date(b.end)-new Date(b.start))/60000,0),120);
 assert.equal(r.scheduled[0].start,at('09:00'));
 assert.equal(r.blocks.some(b=>b.kind==='manual'&&b.start===at('09:30')),true);
}
{
 const r=s.autoSchedule({tasks:[task('a',240)],workWindows:[{start:at('09:00'),end:at('10:00')}],now});
 assert.equal(r.scheduled.length,1);
 assert.deepEqual(r.unscheduled,[{actionId:'a',remainingMinutes:180}]);
}
{
 const r=s.reconcileMeetings([
  {kind:'manual',start:at('10:00'),end:at('11:00')},
  {kind:'auto',start:at('11:00'),end:at('12:00')}
 ],[{start:at('10:30'),end:at('11:30')}]);
 assert.equal(r.conflicts.length,1);
 assert.equal(r.autoBlocksToReschedule.length,1);
}
console.log('V3.5 scheduler tests passed');

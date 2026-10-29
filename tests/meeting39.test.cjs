const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const FIXED=new Date(2026,9,29,12,0);
class Clock extends Date {
  constructor(...args){super(...(args.length?args:[FIXED.getTime()]));}
  static now(){return FIXED.getTime();}
}
function load(){
  const window={};
  const sandbox={window,document:{addEventListener(){}},Date:Clock,console};
  vm.runInNewContext(fs.readFileSync("recurring36.js","utf8"),sandbox);
  vm.runInNewContext(fs.readFileSync("meeting39.js","utf8"),sandbox);
  return window.ForgeMeetingLog39;
}
function meeting(id,date="2026-10-29",start="09:00",hours=1,extra={}){
  return {uid:id,type:"meeting",title:"Weekly operations",date,start,hours,...extra};
}
function dataOf(...blocks){
  return {notes:blocks.map((b,i)=>({noteId:"N"+i,tags:"SMA35-SCHEDULE",note:JSON.stringify(b)})),timeEntries:[],projects:[],goals:[]};
}
test("meetings log only after ending; prep and pre-rollout history are excluded",()=>{
  const m=load(),d=dataOf(meeting("morning"),meeting("future","2026-10-29","13:00"),meeting("old","2026-10-28","08:00"),{...meeting("prep"),type:"prep"});
  const due=m.due(d,new Clock());
  assert.equal(due.length,1);assert.equal(due[0].uid,"morning");
});
test("recurring instances have distinct stable IDs and skip canceled dates",()=>{
  const m=load();
  const recur=meeting("series","2026-10-29","09:00",1,{recurrence:{frequency:"weekly",every:1,weekdays:[4],until:"",exceptions:{"2026-11-05":{skip:true}},segments:[]}});
  const due=m.due(dataOf(recur),new Date(2026,10,13,12));
  assert.deepEqual(due.map(x=>x.occurrenceDate),["2026-10-29","2026-11-12"]);
  assert.notEqual(m.marker(due[0]),m.marker(due[1]));
});
test("save uses scheduled duration, project and inherited goal; check prevents second write",async()=>{
  const m=load(),original=dataOf(meeting("team"));
  original.notes[0].note=JSON.stringify({...JSON.parse(original.notes[0].note),projectId:"P1"});
  original.projects=[{projectId:"P1",goalId:"G1"}];
  let source=original,writes=0,errors=[];
  const bridge={async call(method,payload){
    if(method==="getBootstrap")return JSON.parse(JSON.stringify(source));
    if(method==="saveTimeEntry"){
      writes++;source.timeEntries.push({...payload,timeEntryId:"T1"});return {};
    }
    throw Error(method);
  }};
  const opts={getData:()=>source,getBridge:()=>bridge,onFresh:x=>{source=x;},onError:e=>errors.push(e)};
  assert.equal(await m.syncOnce(opts),1);
  assert.equal(await m.syncOnce(opts),0);
  assert.equal(writes,1);assert.equal(errors.length,0);
  assert.equal(source.timeEntries[0].hours,1);
  assert.equal(source.timeEntries[0].projectId,"P1");
  assert.equal(source.timeEntries[0].goalId,"G1");
  assert.match(source.timeEntries[0].description,/\[Forge meeting: team:2026-10-29\]/);
});
test("an uncertain write is not blindly retried in the same app session",async()=>{
  const m=load(),data=dataOf(meeting("unverified"));
  let writes=0,errors=[];
  const opts={
    getData:()=>data,
    getBridge:()=>({async call(method){if(method==="getBootstrap")return JSON.parse(JSON.stringify(data));writes++;throw Error("timeout");}}),
    onError:e=>errors.push(e)
  };
  assert.equal(await m.syncOnce(opts),0);
  assert.equal(await m.syncOnce(opts),0);
  assert.equal(writes,1);assert.equal(errors.length,1);
});

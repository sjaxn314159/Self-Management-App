const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
function load(){
  const sandbox={window:{},Date,console};
  vm.runInNewContext(fs.readFileSync("recurring36.js","utf8"),sandbox,{filename:"recurring36.js"});
  return sandbox.window.AtlasRecurrence36;
}
function series(recurrence={}){
 return {noteId:"N-100",uid:"SERIES-100",type:"meeting",title:"Friday GEMBA",date:"2026-10-23",start:"08:00",hours:1,locked:true,recurrence:{frequency:"weekly",every:1,weekdays:[5],until:"",exceptions:{},segments:[],...recurrence}};
}
function days(x){return Array.from(x, b=>b.date);}
test("weekly meetings repeat indefinitely without storing duplicate notes",()=>{
 const e=load(),r=e.expand([series()],"2026-10-23","2026-11-20");
 assert.deepEqual(days(r),["2026-10-23","2026-10-30","2026-11-06","2026-11-13","2026-11-20"]);
 assert.equal(r[1].occurrenceDate,"2026-10-30");assert.equal(r[1].isRecurring,true);
});
test("biweekly can repeat on multiple selected days",()=>{
 const e=load(),s=series({frequency:"biweekly",every:1,weekdays:[1,3]});s.date="2026-10-26";
 assert.deepEqual(days(e.expand([s],"2026-10-26","2026-11-12")),["2026-10-26","2026-10-28","2026-11-09","2026-11-11"]);
});
test("monthly on 31st clamps February but restores March 31st",()=>{
 const e=load(),s=series({frequency:"monthly",every:1,weekdays:[]});s.date="2027-01-31";
 assert.deepEqual(days(e.expand([s],"2027-01-31","2027-04-01")),["2027-01-31","2027-02-28","2027-03-31"]);
});
test("repeat end date includes its final occurrence",()=>{
 const e=load();
 assert.deepEqual(days(e.expand([series({until:"2026-11-06"})],"2026-10-23","2026-11-30")),["2026-10-23","2026-10-30","2026-11-06"]);
});
test("edit only one recurring meeting keeps the others intact",()=>{
 const e=load(),s=series(),occur=e.expand([s],"2026-10-30","2026-10-30")[0];
 const fixed=e.changeSeries(s,occur,{date:"2026-10-29",start:"10:00",hours:1.5,title:"Rescheduled GEMBA"},"one",null);
 assert.equal(s.recurrence.exceptions["2026-10-30"],undefined,"source record must not be mutated");
 const x=e.expand([fixed],"2026-10-23","2026-11-13");
 assert.deepEqual(days(x),["2026-10-23","2026-10-29","2026-11-06","2026-11-13"]);
 assert.equal(x[1].occurrenceDate,"2026-10-30");assert.equal(x[1].start,"10:00");assert.equal(x[2].title,"Friday GEMBA");
});
test("this-and-future edit changes only later occurrences",()=>{
 const e=load(),s=series(),occur=e.expand([s],"2026-11-06","2026-11-06")[0];
 const next=e.changeSeries(s,occur,{date:"2026-11-06",start:"11:00",hours:1,title:"New GEMBA"},"future",{frequency:"weekly",every:1,weekdays:[5],until:""});
 const result=e.expand([next],"2026-10-23","2026-11-20");
 assert.deepEqual(result.map(x=>x.start),["08:00","08:00","11:00","11:00","11:00"]);
 assert.deepEqual(result.map(x=>x.title),["Friday GEMBA","Friday GEMBA","New GEMBA","New GEMBA","New GEMBA"]);
});
test("entire series edit changes every occurrence",()=>{
 const e=load(),s=series(),occur=e.expand([s],"2026-10-30","2026-10-30")[0];
 const next=e.changeSeries(s,occur,{date:"2026-10-23",start:"09:00",hours:2,title:"Weekly Operations"},"all",{frequency:"weekly",every:1,weekdays:[5],until:""});
 assert.deepEqual(e.expand([next],"2026-10-23","2026-11-06").map(x=>x.start),["09:00","09:00","09:00"]);
});
test("cancel one meeting, then stop all future meetings",()=>{
 const e=load(),s=series(),occur=e.expand([s],"2026-10-30","2026-10-30")[0];
 const once=e.removeSeries(s,occur,"one");
 assert.deepEqual(days(e.expand([once],"2026-10-23","2026-11-13")),["2026-10-23","2026-11-06","2026-11-13"]);
 const future=e.removeSeries(once,e.expand([once],"2026-11-06","2026-11-06")[0],"future");
 assert.deepEqual(days(e.expand([future],"2026-10-23","2026-11-30")),["2026-10-23"]);
 assert.equal(e.removeSeries(s,occur,"all"),null);
});
test("one-off blocks do not become recurring",()=>{
 const e=load(),one={noteId:"N-200",type:"prep",title:"Prepare report",date:"2026-10-23",start:"13:00",hours:1};
 assert.deepEqual(days(e.expand([one],"2026-10-23","2026-11-30")),["2026-10-23"]);
});
test("weekly series renders correctly when navigating months later",()=>{
 const e=load(),r=e.expand([series()],"2027-05-01","2027-05-31");
 assert.equal(r.length,4);assert(r.every(x=>x.date.startsWith("2027-05")));
});

/* Offline smoke tests for the V3.5 planner. No credentials or Sheets access. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
function iso(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,"0"),String(x.getDate()).padStart(2,"0")].join("-");}
function parseIso(v){const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3],12):null;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function startWeek(d){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function nextMonday(){let d=new Date();do{d=addDays(d,1);}while(d.getDay()!==1);return iso(d);}
function launch(){
  const state={data:{actions:[],notes:[]},cursor:new Date(),calendarMode:"day"};
  const listeners={},edited=[];
  const sandbox={window:{},document:{addEventListener(name,cb){(listeners[name]??=[]).push(cb);}},openAction(a){edited.push(a);},state,crypto:webcrypto,Date,console,
    esc:v=>String(v??""),iso,parseIso,addDays,startWeek,
    todayIso:()=>iso(new Date()),fmtDate:v=>v,priorityClass:v=>String(v||"").toLowerCase(),
    empty:v=>v};
  vm.runInNewContext(fs.readFileSync("scheduler35.js","utf8"),sandbox,{filename:"scheduler35.js"});
  return {plan:sandbox.window.plan35,state,listeners,edited};
}
function note(date,start,hours,type="meeting",actionId=""){
  return {noteId:"N-"+start,tags:"SMA35-SCHEDULE",note:JSON.stringify({uid:start,date,start,hours,type,actionId,title:"Reserved"})};
}
test("empty bootstrap can initialize the planner",()=>{
  const {plan}=launch();assert.equal(plan.blocks().length,0);assert.equal(plan.backlog().length,0);
});
test("planner notes remain separate from ordinary notes",()=>{
  const {plan,state}=launch();state.data.notes=[{noteId:"N-1",tags:"Work",note:"Regular"}];
  assert.equal(plan.isPlannerNote(state.data.notes[0]),false);assert.equal(plan.blocks().length,0);
});
test("completed action blocks do not occupy time",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.actions=[{actionId:"ACT-1",task:"Complete",status:"Done"}];
  state.data.notes=[note(d,"09:00",1,"action","ACT-1")];
  assert.equal(plan.blocks().length,0);
});
test("protected meeting blocks reserve their time",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.notes=[note(d,"09:00",1)];
  const slot=plan.findGap(1,d,540,[],[]);
  assert.equal(slot.date,d);assert.equal(slot.start,"10:00");
});
test("auto gap finding protects noon lunch",()=>{
  const {plan}=launch(),d=nextMonday();
  const slot=plan.findGap(1,d,720,[],[]);
  assert.equal(slot.date,d);assert.equal(slot.start,"12:30");
});
test("duration and 5 PM boundary are validated",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.actions=[{actionId:"ACT-1",status:"Open",task:"Do the work"}];
  assert.throws(()=>plan.validateBlock({type:"action",actionId:"ACT-1",date:d,start:"16:30",hours:1}),/8:00 AM and 5:00 PM/);
  assert.throws(()=>plan.validateBlock({type:"action",actionId:"ACT-1",date:d,start:"09:00",hours:.3}),/Duration/);
  assert.equal(plan.validateBlock({type:"action",actionId:"ACT-1",date:d,start:"09:00",hours:1}).hours,1);
});
test("unscheduled queue preserves actions and original due date",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.actions=[{actionId:"ACT-1",task:"Due soon",status:"Open",dueDate:d,estimatedHours:2}];
  assert.equal(plan.backlog().length,1);
  assert.equal(state.data.actions[0].dueDate,d);
  state.data.notes=[note(d,"09:00",2,"action","ACT-1")];
  assert.equal(plan.backlog().length,0);
  assert.equal(state.data.actions[0].dueDate,d);
});

test("60-minute day-view block occupies two 30-minute rows",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.notes=[note(d,"08:00",1)];
  const day=plan.renderDay(parseIso(d));
  assert.match(day,/--plan-length:2;--plan-start-offset:0/);
  assert.match(day,/8:00 AM/);
  assert.match(day,/data-plan-time="08:30"/);
});
test("90-minute day-view block occupies three rows",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.notes=[note(d,"09:00",1.5)];
  assert.match(plan.renderDay(parseIso(d)),/--plan-length:3;--plan-start-offset:0/);
});
test("quarter-hour starts and durations are drawn at fractional rows",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.notes=[note(d,"09:15",.25)];
  assert.match(plan.renderDay(parseIso(d)),/plan-compact" style="--plan-length:0\.5;--plan-start-offset:0\.5"/);
});

test("day and week calendar actions show a separate Edit Action button",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.actions=[{actionId:"ACT-1",task:"Inspect quality results",status:"Open",dueDate:d}];
  state.data.notes=[note(d,"09:00",1,"action","ACT-1")];
  state.cursor=parseIso(d);
  const html=plan.renderDay(parseIso(d));
  assert.match(html,/<div class="plan-block action has-action-edit"/);
  assert.match(html,/class="plan-block-main" data-plan-edit="N-09:00"/);
  assert.match(html,/class="plan-action-edit" data-plan-action-edit="ACT-1"/);
  assert.doesNotMatch(html,/<button[^>]*class="plan-block action/,"no buttons nested inside buttons");
  assert.match(plan.calendarPanel(),/data-plan-action-edit="ACT-1"/);
});
test("Edit Action opens the action editor rather than the schedule editor",()=>{
  const {state,listeners,edited}=launch();
  const action={actionId:"ACT-1",task:"Inspect quality results",status:"Open"};
  state.data.actions=[action];
  let prevented=0,stopped=0;
  const element={dataset:{planActionEdit:"ACT-1"}};
  listeners.click[0]({target:{closest(){return element;}},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(edited.length,1);
  assert.equal(edited[0],action);
  assert.equal(prevented,1);
  assert.equal(stopped,1);
});
test("meeting blocks do not show an Edit Action button",()=>{
  const {plan,state}=launch(),d=nextMonday();
  state.data.notes=[note(d,"08:00",1,"meeting")];
  assert.doesNotMatch(plan.renderDay(parseIso(d)),/data-plan-action-edit=/);
});

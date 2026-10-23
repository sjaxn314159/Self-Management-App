/* Self Management V3.5 — calendar-first scheduling layer.
   Schedule blocks use tagged Google Sheets Notes records through the existing
   Apps Script API. No browser-only plan data; no new API credentials required.
   Outlook is intentionally NOT connected in this release. */
(function(){
"use strict";
const TAG="SMA35-SCHEDULE", START=480, END=1020, STEP=30;
let writing=false;
function h(v){return esc(v==null?"":v);}
function pad(n){return String(n).padStart(2,"0");}
function min(t){const p=String(t||"08:00").split(":");return Number(p[0])*60+Number(p[1]);}
function clock(n){return pad(Math.floor(n/60))+":"+pad(n%60);}
function pretty(n){return new Date(2000,0,1,Math.floor(n/60),n%60).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});}
function round(n){return Math.ceil(n/STEP)*STEP;}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : "plan-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
function today(){return todayIso();}
function actionId(a){return String(a.actionId||a.row);}
function getAction(id){return (state.data.actions||[]).find(a=>actionId(a)===String(id));}
function isOpen(a){return a&&String(a.status).toLowerCase()!=="done";}
function dateShift(ds,n){return iso(addDays(parseIso(ds),n));}
let cachedBlocks=null,cachedData=null,cachedCursor="",cachedDate="";
function blocks(){
  const current=iso(state.cursor),now=today(),notes=state.data.notes;
  if(cachedBlocks&&cachedData===notes&&cachedCursor===current&&cachedDate===now)return cachedBlocks;
  const raw=(notes||[]).filter(isPlannerNote).map(n=>{
    try{
      const v=JSON.parse(n.note||"{}");
      if(!v.date||!v.start||!(Number(v.hours)>0)||!["action","meeting","prep"].includes(v.type))return null;
      return Object.assign({},v,{noteId:n.noteId,hours:Number(v.hours),locked:v.type!=="action",uid:v.uid||n.noteId});
    }catch(e){return null;}
  }).filter(Boolean).filter(b=>b.type!=="action"||isOpen(getAction(b.actionId)));
  const from=[dateShift(now,-90),dateShift(current,-65)].sort()[0];
  const to=[dateShift(now,130),dateShift(current,65)].sort().pop();
  cachedBlocks=window.AtlasRecurrence36?window.AtlasRecurrence36.expand(raw,from,to):raw;
  cachedData=notes;cachedCursor=current;cachedDate=now;
  return cachedBlocks;
}
function parentBlock(id){
  const n=(state.data.notes||[]).find(x=>x.noteId===id&&isPlannerNote(x));
  if(!n)return null;
  try{return Object.assign({},JSON.parse(n.note||"{}"),{noteId:n.noteId});}catch(e){return null;}
}
function isPlannerNote(n){return String(n.tags||"").split(/[\s,]+/).includes(TAG);}
function label(b){return b.type==="action"?(getAction(b.actionId)||{}).task||b.title||"Missing action":b.title;}
function desc(b){return (b.type==="meeting"?"Meeting":b.type==="prep"?"Protected prep":"Action")+" · "+(Number(b.hours)||1)+" hr";}
function occupied(b){return [min(b.start),min(b.start)+Math.round(b.hours*60)];}
function overlaps(a,b){if(a.date!==b.date||(a.noteId===b.noteId&&(a.occurrenceDate||a.date)===(b.occurrenceDate||b.date)))return false;const x=occupied(a),y=occupied(b);return x[0]<y[1]&&y[0]<x[1];}
function conflicts(b,all){return (all||blocks()).filter(x=>overlaps(b,x));}
function validHours(hh){const n=Number(hh);if(!isFinite(n)||n<.25||n>8||Math.round(n*4)!==n*4)throw Error("Duration must be 0.25–8 hours in 15-minute increments.");return n;}
function validateBlock(b){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!parseIso(b.date)||iso(parseIso(b.date))!==b.date)throw Error("Choose a valid date.");
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start))throw Error("Choose a valid time.");
  b.hours=validHours(b.hours);
  if(min(b.start)<START||min(b.start)+b.hours*60>END)throw Error("Schedule between 8:00 AM and 5:00 PM. Work hours can be configurable in a later revision.");
  if(b.type==="action"&&!isOpen(getAction(b.actionId)))throw Error("Choose an open action.");
  if(b.type!=="action"&&!String(b.title||"").trim())throw Error("Give the meeting/prep a title.");
  return b;
}
function backlog(){
  const limit=dateShift(today(),30),now=new Date(),minuteNow=now.getHours()*60+now.getMinutes();
  const scheduled=new Set(blocks().filter(b=>b.type==="action"&&(b.date>today()||(b.date===today()&&min(b.start)+b.hours*60>minuteNow))).map(b=>String(b.actionId)));
  return (state.data.actions||[]).filter(isOpen).filter(a=>!scheduled.has(actionId(a))).filter(a=>!a.dueDate||a.dueDate<=limit).sort((a,b)=>{
    const due=(a.dueDate||"9999").localeCompare(b.dueDate||"9999");if(due)return due;
    return ({"High":0,"Medium":1,"Low":2}[a.priority]||0)-({"High":0,"Medium":1,"Low":2}[b.priority]||0);
  });
}
function blockHtml(b,short,dayView=false){
  const kind=b.type,expired=b.date<today()||(b.date===today()&&min(b.start)+b.hours*60<=new Date().getHours()*60+new Date().getMinutes());
  // Position by elapsed minutes, not by number of 30-minute rows. A one-hour
  // block therefore spans two rows, and quarter-hour starts align correctly.
  const durationMinutes=Math.round(Number(b.hours)*60);
  const inlineStyle=dayView?' style="--plan-length:'+(durationMinutes/STEP)+';--plan-start-offset:'+((min(b.start)%STEP)/STEP)+'"':'';
  const compact=dayView&&durationMinutes<=15?' plan-compact':'';
  return '<button class="plan-block '+h(kind)+compact+'"'+inlineStyle+' draggable="true" data-plan-drag="'+h(b.noteId)+'" data-plan-edit="'+h(b.noteId)+'" data-plan-occurrence="'+h(b.occurrenceDate||'')+'" title="Tap to edit; drag to move"><strong>'+h(pretty(min(b.start)))+' · '+h(label(b))+'</strong><small>'+h(desc(b))+(b.isRecurring?" · "+h(window.AtlasRecurrence36.ruleSummary(parentBlock(b.noteId))):"")+(kind==="action"&&expired?" · REVIEW":"")+'</small></button>';
}
function calControls(){
  return '<div class="plan-toolbar"><div class="seg">'+["day","week","month"].map(m=>'<button data-plan-mode="'+m+'" class="'+(state.calendarMode===m?"active":"")+'">'+m[0].toUpperCase()+m.slice(1)+'</button>').join("")+'</div><div class="cal-nav"><button class="btn" data-plan-offset="-1" aria-label="Previous">‹</button><button class="btn" data-plan-today>Today</button><button class="btn" data-plan-offset="1" aria-label="Next">›</button></div></div>';
}
function calDay(d){
  const ds=iso(d),bs=blocks().filter(b=>b.date===ds),slots=[];
  for(let m=START;m<END;m+=STEP){
    const list=bs.filter(b=>min(b.start)>=m&&min(b.start)<m+STEP);
    slots.push('<div class="plan-slot" data-plan-date="'+ds+'" data-plan-time="'+clock(m)+'"><span class="plan-hour">'+h(pretty(m))+'</span><div class="plan-slot-work">'+list.map(b=>blockHtml(b,false,true)).join("")+'</div></div>');
  }
  return '<div class="plan-day"><div class="plan-view-sub">Drop a block onto a time slot, or tap it to move, finish, or unschedule it.</div>'+slots.join("")+'</div>';
}
function calWeek(d){
  const first=startWeek(d),days=[];
  for(let i=0;i<7;i++){
    const date=iso(addDays(first,i)),x=blocks().filter(b=>b.date===date).sort((a,b)=>min(a.start)-min(b.start));
    days.push('<div class="plan-week-day" data-plan-date="'+date+'"><div class="plan-week-title"><strong>'+h(fmtDate(date,{weekday:"short",month:"short",day:"numeric"}))+'</strong><button class="link-btn" data-plan-new-date="'+date+'" aria-label="Add block">+</button></div><div class="plan-week-list">'+(x.length?x.map(b=>blockHtml(b,true)).join(""):'<span class="muted">Available</span>')+'</div></div>');
  }
  return '<div class="plan-week-grid">'+days.join("")+'</div><p class="plan-view-sub">Drag onto another day to move a block; adjust its time in the editor.</p>';
}
function calMonth(d){
  const first=new Date(d.getFullYear(),d.getMonth(),1,12),s=startWeek(first),days=[];
  for(let i=0;i<42;i++){
    const x=addDays(s,i),date=iso(x),all=blocks().filter(b=>b.date===date);
    days.push('<button class="plan-month-day '+(x.getMonth()!==d.getMonth()?"other":"")+'" data-plan-open-date="'+date+'"><strong>'+x.getDate()+'</strong>'+(all.length?'<span>'+all.length+' block'+(all.length===1?"":"s")+'</span>':'')+'</button>');
  }
  return '<div class="plan-month-grid">'+days.join("")+'</div>';
}
function calendar(){
  const d=state.cursor,mode=state.calendarMode;
  const title=mode==="month"?d.toLocaleDateString(undefined,{month:"long",year:"numeric"}):mode==="week"?fmtDate(iso(startWeek(d)),{month:"short",day:"numeric"})+" – "+fmtDate(iso(addDays(startWeek(d),6)),{month:"short",day:"numeric",year:"numeric"}):d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  return '<div class="card plan-calendar"><div class="card-head"><div><h3>'+h(title)+'</h3><p>Scheduled actions, meetings and protected prep · 8 AM–5 PM</p></div></div><div class="card-body">'+calControls()+(mode==="day"?calDay(d):mode==="week"?calWeek(d):calMonth(d))+'</div></div>';
}
function nowPanel(){
  const ds=today(),n=new Date(),m=n.getHours()*60+n.getMinutes(),b=blocks().filter(x=>x.date===ds).sort((a,b)=>min(a.start)-min(b.start));
  const current=b.find(x=>min(x.start)<=m&&min(x.start)+x.hours*60>m);
  const next=b.find(x=>min(x.start)>m);
  const missed=b.filter(x=>x.type==="action"&&min(x.start)+x.hours*60<=m);
  function tile(heading,item){return '<div class="plan-now-tile"><div class="kpi-label">'+heading+'</div>'+(item?'<strong>'+h(label(item))+'</strong><div class="meta">'+h(pretty(min(item.start)))+' · '+h(desc(item))+'</div><button class="link-btn" data-plan-edit="'+h(item.noteId)+'" data-plan-occurrence="'+h(item.occurrenceDate||'')+'">View block →</button>':'<strong>Nothing scheduled</strong>')+'</div>';}
  return '<div class="plan-now-grid">'+tile("NOW",current)+tile("UP NEXT",next)+'</div>'+(missed.length?'<div class="plan-review-strip"><strong>'+missed.length+' finished time block'+(missed.length===1?"":"s")+' need review</strong> '+missed.slice(0,3).map(x=>'<button class="btn" data-plan-review="'+h(x.noteId)+'">Did you finish '+h(label(x))+'?</button>').join("")+'</div>':"");
}
function needs(){
  const a=backlog(),items=a.slice(0,28);
  return '<div class="card plan-needs"><div class="card-head"><div><h3>Needs Scheduling <span class="pill">'+a.length+'</span></h3><p>Open actions due within 30 days (plus overdue and undated). Due dates never change when scheduling.</p></div><button class="btn primary" data-plan-auto>Auto-Schedule</button></div><div class="card-body">'+(items.length?items.map(x=>'<div class="plan-backlog-row"><div><strong>'+h(x.task)+'</strong><div class="meta"><span class="pill '+priorityClass(x.priority)+'">'+h(x.priority)+'</span><span>'+h(x.dueDate?fmtDate(x.dueDate):"No due date")+'</span><span>'+h(Number(x.estimatedHours)||1)+' hr estimate</span></div></div><button class="btn" data-plan-action="'+h(actionId(x))+'">Schedule</button></div>').join("")+(a.length>items.length?'<p class="muted">Showing first 28. Schedule these to reveal more.</p>':""):empty("Everything in the next 30 days has a time slot."))+'</div></div>';
}
function top(){
  return '<div class="plan-head"><div><span class="plan-eyebrow">ATLAS COMMAND · TIME-BLOCK PLANNER</span><h2>Your next move, not just your due date.</h2></div><div class="inline-actions"><button class="btn" data-plan-new="meeting">+ Meeting</button><button class="btn" data-plan-new="prep">+ Protected prep</button></div></div>';
}
function todayPanel(){return top()+nowPanel()+calendar()+needs();}
function calendarPanel(){return top()+calendar()+needs();}
function findGap(hours,fromDate,afterMinute,ignoreNotes,additional){
  const count=Math.round(hours*60),base=parseIso(fromDate||today()),ignore=new Set(ignoreNotes||[]);
  const extras=additional||[];
  for(let day=0;day<35;day++){
    const date=iso(addDays(base,day)),weekday=parseIso(date).getDay();if(weekday===0||weekday===6)continue;
    const busy=blocks().filter(b=>b.date===date&&!ignore.has(b.noteId)).concat(extras.filter(b=>b.date===date)).map(occupied);
    busy.push([720,750]); // lunch reservation; never place work over lunch
    const now=new Date(),earliest=date===today()?round(now.getHours()*60+now.getMinutes()):START;
    for(let s=round(Math.max(START,day===0?(afterMinute||START):START,earliest));s+count<=END;s+=STEP){
      if(busy.every(x=>s+count<=x[0]||s>=x[1]))return{date:date,start:clock(s)};
    }
  }
  return null;
}
async function writeBlock(data){
  const b=validateBlock(Object.assign({},data));
  const payload={noteId:b.noteId||"",date:b.date,title:"Planner · "+(b.type==="action"?(getAction(b.actionId)||{}).task||"Action":b.title),note:JSON.stringify({uid:b.uid||uid(),type:b.type,actionId:b.actionId||"",title:b.title||"",date:b.date,start:b.start,hours:b.hours,recurrence:b.recurrence||null}),tags:TAG,pinned:"No"};
  const key=JSON.parse(payload.note).uid;
  await bridge.call("saveNote",payload);
  const fresh=await bridge.call("getBootstrap");
  const saved=(fresh.notes||[]).find(n=>{
    if(!isPlannerNote(n))return false;
    try{const j=JSON.parse(n.note||"{}");return j.uid===key&&j.date===b.date&&j.start===b.start&&Number(j.hours)===Number(b.hours)&&JSON.stringify(j.recurrence||null)===JSON.stringify(b.recurrence||null);}catch(e){return false;}
  });
  if(!saved)throw Error("Block save was not verified. Check the planner before retrying.");
  state.data=fresh;render();
  return Object.assign({},b,{noteId:saved.noteId,uid:key});
}
async function eraseBlock(b){
  if(!b||!b.noteId)throw Error("Block not found.");
  await bridge.call("deleteNote",b.noteId);
  const fresh=await bridge.call("getBootstrap");
  if((fresh.notes||[]).some(n=>n.noteId===b.noteId))throw Error("Could not verify unscheduling; please refresh.");
  state.data=fresh;render();
}
async function saveMoved(b,makeRoom){
  const cl=conflicts(b);
  if(cl.some(x=>x.locked))throw Error("This conflicts with a meeting or protected prep. Pick a different time.");
  if(cl.length&&!makeRoom)throw Error("Time conflict. Move the block manually or choose Make Room to reschedule flexible work.");
  if(makeRoom){
    const reservations=[b];
    for(const x of cl){
      const slot=findGap(x.hours,b.date,min(b.start)+b.hours*60,[x.noteId,b.noteId],reservations);
      if(!slot)throw Error("There is not enough free space to Make Room.");
      reservations.push(Object.assign({},x,slot));
    }
    for(const x of reservations.slice(1)){await writeBlock(x);}
  }
  return writeBlock(b);
}
async function withBusy(job){
  if(writing)return;
  writing=true;
  try{await job();}catch(e){toast(e.message||String(e));}finally{writing=false;releaseSavingButtons();}
}
function blockForm(b){
  b=b||{};
  if(window.Atlas36UI&&b.type!=="action")return window.Atlas36UI.blockForm(b);
  const editing=!!b.noteId;
  const kind=b.type||"action",ds=b.date||iso(state.cursor),t=b.start||"09:00";
  const options=(state.data.actions||[]).filter(a=>isOpen(a)||actionId(a)===String(b.actionId)).map(a=>'<option value="'+h(actionId(a))+'" '+(actionId(a)===String(b.actionId)?"selected":"")+'>'+h(a.task)+'</option>').join("");
  openSheet(editing?"Edit Time Block":"Schedule Time",'<form id="planBlockForm"><div class="form-grid"><div class="form-group"><label>Block type</label><select name="type"><option value="action" '+(kind==="action"?"selected":"")+'>Action</option><option value="meeting" '+(kind==="meeting"?"selected":"")+'>Meeting (fixed)</option><option value="prep" '+(kind==="prep"?"selected":"")+'>Protected prep (fixed)</option></select></div><div class="form-group"><label>Action</label><select name="actionId"><option value="">Choose action…</option>'+options+'</select></div><div class="form-group full"><label>Title (meeting / prep)</label><input class="field" name="title" value="'+h(b.title||"")+'" placeholder="Meeting or preparation"></div><div class="form-group"><label>Date</label><input class="field" name="date" type="date" required value="'+h(ds)+'"></div><div class="form-group"><label>Start</label><input class="field" name="start" type="time" step="900" required value="'+h(t)+'"></div><div class="form-group"><label>Duration (hours)</label><input class="field" name="hours" type="number" min=".25" max="8" step=".25" required value="'+h(b.hours||((getAction(b.actionId)||{}).estimatedHours)||1)+'"></div><div class="form-group"><label>Conflicts</label><select name="conflict"><option value="manual">Keep fixed blocks; ask me to move</option><option value="make-room">Make Room — move flexible actions</option></select></div></div><p class="muted">Due dates remain unchanged. Meetings and prep are protected. Outlook sync is not active.</p><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button>'+(editing?'<button type="button" class="btn" id="planNextWeek">Next week</button><button type="button" class="btn danger" id="planUnschedule">Unschedule</button>':"")+'<button class="btn primary" type="submit">Save Block</button></div></form>');
  const f=document.getElementById("planBlockForm");if(!f)return;
  const sync=()=>{const x=f.elements.type.value;f.elements.actionId.disabled=x!=="action";f.elements.title.disabled=x==="action";};
  f.elements.type.addEventListener("change",sync);sync();
  const stableUid=b.uid||uid();
  f.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f).entries());v.type=f.elements.type.value;v.uid=stableUid;v.noteId=b.noteId||"";v.actionId=v.type==="action"?v.actionId:"";v.title=v.type==="action"?"":v.title;withBusy(async()=>{
    if(b.type==="action"&&v.type!=="action")throw Error("Convert an action block by unscheduling it first.");
    await saveMoved(v,v.conflict==="make-room");closeSheet();toast("Block saved to Google Sheets");
  });};
  document.getElementById("planNextWeek")?.addEventListener("click",()=>{f.elements.date.value=dateShift(f.elements.date.value,7);});
  document.getElementById("planUnschedule")?.addEventListener("click",()=>{if(!confirm("Return this time block to Needs Scheduling? The action and due date will stay."))return;withBusy(async()=>{await eraseBlock(b);closeSheet();toast("Unscheduled");});});
}
async function autoSchedule(){
  await withBusy(async()=>{
    const items=backlog().filter(a=>Number(a.estimatedHours||1)<=8).slice(0,5);
    let count=0;
    for(const a of items){
      const hrs=validHours(Math.max(.25,Math.round(Number(a.estimatedHours||1)*4)/4));
      const slot=findGap(hrs,today(),START,[],[]);
      if(!slot)continue;
      await writeBlock({uid:uid(),type:"action",actionId:actionId(a),title:"",date:slot.date,start:slot.start,hours:hrs});
      count++;
    }
    toast(count?count+" action"+(count===1?"":"s")+" scheduled and saved":"No open slots found for these actions.");
  });
}
async function notFinished(b,remaining){
  await withBusy(async()=>{
    const a=getAction(b.actionId);if(!a)throw Error("Action not found.");
    const hours=validHours(remaining);
    const payload=Object.assign({},a,{actionId:a.actionId||"",row:a.row,estimatedHours:hours,repeats:a.repeats==="Yes",status:a.status});
    await bridge.call("saveAction",payload);
    const fresh=await bridge.call("getBootstrap");
    const saved=(fresh.actions||[]).find(x=>actionId(x)===actionId(a));
    if(!saved||Number(saved.estimatedHours)!==hours||saved.dueDate!==a.dueDate)throw Error("Remaining hours could not be verified. Time block is unchanged.");
    state.data=fresh;
    await eraseBlock(b);
    closeSheet();toast("Remaining work returned to Needs Scheduling");
  });
}
function review(b){
  if(!b||b.type!=="action")return blockForm(b);
  const a=getAction(b.actionId);if(!a)return;
  openSheet("Did you complete this task?",'<div class="completion-action"><strong>'+h(a.task)+'</strong><div class="meta"><span>'+h(fmtDate(b.date))+'</span><span>'+h(pretty(min(b.start)))+'</span><span>'+h(b.hours)+' hr scheduled</span></div></div><div class="form-group"><label>If not, how many hours remain?</label><input class="field" id="planRemaining" type="number" min=".25" max="8" step=".25" value="'+h(b.hours)+'"></div><div class="sheet-actions plan-review-actions"><button class="btn" data-close-sheet>Later</button><button class="btn" id="planNo">Not finished</button><button class="btn primary" id="planYes">Yes, completed</button></div>');
  document.getElementById("planNo").onclick=()=>notFinished(b,document.getElementById("planRemaining").value);
  document.getElementById("planYes").onclick=()=>openCompleteAction(a,()=>withBusy(async()=>{await eraseBlock(b);toast("Completed and removed from schedule")}));
}
function onClick(e){
  const el=e.target.closest("[data-plan-mode],[data-plan-offset],[data-plan-today],[data-plan-new],[data-plan-action],[data-plan-auto],[data-plan-edit],[data-plan-review],[data-plan-open-date],[data-plan-new-date]");
  if(!el)return;
  e.preventDefault();e.stopPropagation();
  if(el.dataset.planMode){state.calendarMode=el.dataset.planMode;render();return;}
  if(el.dataset.planOffset){const n=Number(el.dataset.planOffset);state.cursor=state.calendarMode==="month"?addMonths(state.cursor,n):addDays(state.cursor,n*(state.calendarMode==="week"?7:1));render();return;}
  if(el.hasAttribute("data-plan-today")){state.cursor=new Date();render();return;}
  if(el.dataset.planNew){blockForm({type:el.dataset.planNew,date:iso(state.cursor)});return;}
  if(el.dataset.planNewDate){blockForm({type:"action",date:el.dataset.planNewDate});return;}
  if(el.dataset.planAction){const a=getAction(el.dataset.planAction);blockForm({type:"action",actionId:actionId(a),date:iso(state.cursor),hours:Number(a.estimatedHours)||1});return;}
  if(el.hasAttribute("data-plan-auto")){autoSchedule();return;}
  if(el.dataset.planEdit){const b=blocks().find(x=>x.noteId===el.dataset.planEdit&&(!el.dataset.planOccurrence||x.occurrenceDate===el.dataset.planOccurrence));if(b)blockForm(b);return;}
  if(el.dataset.planReview){const b=blocks().find(x=>x.noteId===el.dataset.planReview);if(b)review(b);return;}
  if(el.dataset.planOpenDate){state.cursor=parseIso(el.dataset.planOpenDate);state.calendarMode="day";render();}
}
function install(){
  document.addEventListener("click",onClick);
  document.addEventListener("dragstart",e=>{const item=e.target.closest("[data-plan-drag]");if(item&&e.dataTransfer){e.dataTransfer.setData("text/plain",JSON.stringify({id:item.dataset.planDrag,origin:item.dataset.planOccurrence||""}));e.dataTransfer.effectAllowed="move";}});
  document.addEventListener("dragover",e=>{if(e.target.closest("[data-plan-date]"))e.preventDefault();});
  document.addEventListener("drop",e=>{
    const target=e.target.closest("[data-plan-date]");if(!target||!e.dataTransfer)return;
    e.preventDefault();
    let info;try{info=JSON.parse(e.dataTransfer.getData("text/plain"));}catch(e){return;}const b=blocks().find(x=>x.noteId===info.id&&(!info.origin||x.occurrenceDate===info.origin));if(!b)return;
    blockForm(Object.assign({},b,{date:target.dataset.planDate,start:target.dataset.planTime||b.start}));
  });
}
install();
window.plan35={todayPanel,calendarPanel,isPlannerNote,blocks,parentBlock,backlog,findGap,validateBlock,renderDay:calDay,writeBlock,eraseBlock,saveMoved,withBusy,conflicts};
})();

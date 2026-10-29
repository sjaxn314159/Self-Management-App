/* Forge Command V3.9 — automatic meeting time capture.
   The PWA has no server-side timer. Check while open (every 30 seconds) and
   catch up after reopening. A unique marker links each recurring occurrence
   to a normal Time Log record. Historic meetings before rollout are excluded. */
(function(global){
"use strict";
const START_DATE="2026-10-29",LOOKBACK_DAYS=90,MAX_PER_PASS=10;
let syncing=false,started=false;
const uncertain=new Set();
function dateString(d){
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function id(b){return String(b.uid||b.noteId||"");}
function marker(b){return "[Forge meeting: "+id(b)+":"+(b.occurrenceDate||b.date)+"]";}
function entryFor(b,entries){
  const key=marker(b);
  return (entries||[]).find(t=>String(t.description||"").includes(key))||null;
}
function localEnd(b){
  const match=/^(\d{4})-(\d\d)-(\d\d)$/.exec(b.date||"");
  const time=/^(\d\d):(\d\d)$/.exec(b.start||"");
  if(!match||!time||!(Number(b.hours)>0))return null;
  const start=new Date(+match[1],+match[2]-1,+match[3],+time[1],+time[2]);
  return new Date(start.getTime()+Number(b.hours)*3600000);
}
function due(data,now){
  if(!data)return [];
  const recent=new Date(now.getFullYear(),now.getMonth(),now.getDate()-LOOKBACK_DAYS);
  const from=dateString(recent)>START_DATE?dateString(recent):START_DATE;
  const to=dateString(now);
  if(to<from)return [];
  const raw=(data.notes||[]).filter(n=>String(n.tags||"").split(/[\s,]+/).includes("SMA35-SCHEDULE")).map(n=>{
    try{const b=JSON.parse(n.note||"{}");return {...b,noteId:n.noteId,uid:b.uid||n.noteId};}catch(e){return null;}
  }).filter(b=>b&&b.type==="meeting"&&b.date&&b.start&&Number(b.hours)>0);
  const blocks=global.AtlasRecurrence36?global.AtlasRecurrence36.expand(raw,from,to):raw.filter(b=>b.date>=from&&b.date<=to);
  return blocks.filter(b=>{
    const end=localEnd(b);
    return end&&end<=now&&!entryFor(b,data.timeEntries||[])&&!uncertain.has(marker(b));
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
}
async function syncOnce(opts){
  if(syncing||!opts||!opts.getData()||!opts.getBridge())return 0;
  if(!due(opts.getData(),new Date()).length)return 0;
  syncing=true;
  let logged=0;
  try{
    const bridge=opts.getBridge();
    let fresh=await bridge.call("getBootstrap");
    const candidates=due(fresh,new Date()).slice(0,MAX_PER_PASS);
    for(const b of candidates){
      const key=marker(b);
      if(entryFor(b,fresh.timeEntries||[])||uncertain.has(key))continue;
      const project=(fresh.projects||[]).find(p=>String(p.projectId)===String(b.projectId||""));
      const payload={
        date:b.date,hours:Number(b.hours),
        description:"Meeting: "+String(b.title||"Untitled meeting")+" "+key,
        actionId:"",projectId:b.projectId||"",goalId:b.goalId||project?.goalId||"",
        category:"Meeting",source:"Other"
      };
      // A failed or unverified write is never blindly retried in this session.
      uncertain.add(key);
      await bridge.call("saveTimeEntry",payload);
      fresh=await bridge.call("getBootstrap");
      if(!entryFor(b,fresh.timeEntries||[]))throw Error("Could not verify the meeting time entry.");
      uncertain.delete(key);
      logged++;
    }
    if(logged&&opts.onFresh)opts.onFresh(fresh);
  }catch(error){
    if(opts.onError)opts.onError(error);
  }finally{
    syncing=false;
  }
  return logged;
}
function start(opts){
  if(started)return;
  started=true;
  syncOnce(opts);
  global.setInterval(()=>syncOnce(opts),30000);
  global.addEventListener("focus",()=>syncOnce(opts));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncOnce(opts);});
}
global.ForgeMeetingLog39={marker,entryFor,localEnd,due,syncOnce,start};
})(window);

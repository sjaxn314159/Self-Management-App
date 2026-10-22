/* V3.5 scheduling engine — pure functions, no side effects.
   All timestamps are local ISO date-times. Meetings/prep/manual blocks are fixed.
   This module deliberately does not write to Sheets or Outlook. */
(function(root){
'use strict';
const minutes = iso => new Date(iso).getTime()/60000;
const timestamp = m => {const d=new Date(m*60000),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};
const overlaps=(a,b)=>minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);
function normalizeTask(t) {
 const estimated=Math.max(0,Number(t.estimatedMinutes)||0);
 const completed=Math.max(0,Number(t.completedMinutes)||0);
 return {...t,estimatedMinutes:estimated,completedMinutes:completed,remainingMinutes:Math.max(0,Number.isFinite(Number(t.remainingMinutes))&&t.remainingMinutes!==''&&t.remainingMinutes!=null?Number(t.remainingMinutes):estimated-completed)};
}
function needsScheduling(tasks,blocks,now=new Date()){
 const horizon=new Date(now.getTime()+30*86400000).toISOString().slice(0,10);
 const today=now.toISOString().slice(0,10);
 return tasks.filter(t=>String(t.status).toLowerCase()!=='done').map(normalizeTask).map(t=>{
   const allocated=blocks.filter(b=>String(b.actionId)===String(t.actionId)&&b.status!=='cancelled'&&minutes(b.end)>now.getTime()/60000).reduce((sum,b)=>sum+(minutes(b.end)-minutes(b.start)),0);
   return {...t,unscheduledMinutes:Math.max(0,t.remainingMinutes-allocated)};
 }).filter(t=>t.unscheduledMinutes>0 && (!t.dueDate||t.dueDate<=horizon||String(t.priority).toLowerCase()==='high'))
 .sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||(a.priority==='High'?-1:1));
}
function autoSchedule({tasks,blocks=[],workWindows=[],minimumBlockMinutes=30,now=new Date()}){
 const fixed=blocks.filter(b=>b.kind!=='auto' && b.status!=='cancelled');
 const existingAuto=blocks.filter(b=>b.kind==='auto' && b.status!=='cancelled');
 const current=now.getTime()/60000;
 const allBusy=[...fixed];
 const changes=[];
 const unscheduled=[];
 const pool=needsScheduling(tasks,fixed,now);
 // Restore auto blocks through the same scheduler whenever meetings change.
 for(const task of pool){
   let remaining=task.unscheduledMinutes;
   for(const w of workWindows){
     if(remaining<=0)break;
     let cursor=Math.max(minutes(w.start),current);
     const end=minutes(w.end);
     while(cursor+minimumBlockMinutes<=end && remaining>0){
       const blocker=allBusy.filter(b=>minutes(b.end)>cursor&&minutes(b.start)<end).sort((a,b)=>minutes(a.start)-minutes(b.start))[0];
       const freeEnd=Math.min(end,blocker?minutes(blocker.start):end);
       const free=Math.max(0,freeEnd-cursor);
       const length=Math.min(remaining,free);
       if(length>=minimumBlockMinutes || (remaining<minimumBlockMinutes && free>=remaining && remaining>0)){
         const block={actionId:task.actionId,kind:'auto',start:timestamp(cursor),end:timestamp(cursor+length)};
         changes.push(block);allBusy.push(block);remaining-=length;cursor+=length;
       } else if(blocker){cursor=Math.max(cursor,minutes(blocker.end));}
       else break;
     }
   }
   if(remaining>0)unscheduled.push({actionId:task.actionId,remainingMinutes:remaining});
 }
 return {blocks:[...fixed,...changes],scheduled:changes,unscheduled,displaced:existingAuto.filter(b=>!changes.some(c=>c.actionId===b.actionId&&c.start===b.start&&c.end===b.end))};
}
function reconcileMeetings(blocks,meetings){
 const protectedBlocks=blocks.filter(b=>b.kind==='meeting'||b.kind==='prep'||b.kind==='manual');
 const fixed=[...protectedBlocks.filter(b=>b.kind!=='meeting'),...meetings.map(m=>({...m,kind:'meeting'}))];
 const conflicts=fixed.filter(b=>b.kind!=='meeting'&&meetings.some(m=>overlaps(b,m)));
 return {fixed,conflicts,autoBlocksToReschedule:blocks.filter(b=>b.kind==='auto'&&meetings.some(m=>overlaps(b,m)))};
}
const api={normalizeTask,needsScheduling,autoSchedule,reconcileMeetings,overlaps};
if(typeof module==='object'&&module.exports)module.exports=api;
root.SelfManagementScheduler=api;
})(typeof globalThis!=='undefined'?globalThis:this);

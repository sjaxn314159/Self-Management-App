/* Forge Command V3.6: recurring fixed-block engine.
   Series are stored once in an existing Google Sheets Notes row. A recurring
   event is expanded for the visible date range, not materialized as hundreds
   of duplicate rows. Exceptions and future edits remain in that one record.
*/
(function(global){
"use strict";
const MS=86400000;
function date(s){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(String(s||""));if(!m)return null;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.toISOString().slice(0,10)===s?d:null;}
function iso(d){return d.toISOString().slice(0,10);}
function advance(s,n){const d=date(s);if(!d)throw Error("Invalid recurrence date");d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function diff(a,b){return Math.round((date(a)-date(b))/MS);}
function monday(s){const d=date(s);return advance(s,-((d.getUTCDay()+6)%7));}
function monthIndex(s){const d=date(s);return d.getUTCFullYear()*12+d.getUTCMonth();}
function clampDay(y,m,day){const max=new Date(Date.UTC(y,m+1,0)).getUTCDate();return Math.min(max,day);}
function weekday(s){return date(s).getUTCDay();}
function recurrence(rule,anchor){
  const frequency=String(rule.frequency||"weekly").toLowerCase();
  if(!["daily","weekly","biweekly","monthly","quarterly","annually"].includes(frequency))throw Error("Choose a repeat pattern.");
  let every=Math.floor(Number(rule.every||1));if(!Number.isFinite(every)||every<1||every>52)throw Error("Repeat every must be 1–52.");
  const days=Array.isArray(rule.weekdays)?[...new Set(rule.weekdays.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort((a,b)=>a-b):[];
  if(["weekly","biweekly"].includes(frequency)&&!days.length)days.push(weekday(anchor));
  if(rule.until&&(!date(rule.until)||rule.until<anchor))throw Error("Repeat end must be on or after the first occurrence.");
  return {frequency,every,weekdays:days,until:rule.until||"",exceptions:rule.exceptions||{},segments:Array.isArray(rule.segments)?rule.segments:[]};
}
function occurs(ds,anchor,rule){
  if(ds<anchor)return false;
  const f=rule.frequency,every=Number(rule.every)||1;
  if(f==="daily")return diff(ds,anchor)%every===0;
  if(f==="weekly"||f==="biweekly"){
    const weeks=diff(monday(ds),monday(anchor))/7;
    return weeks>=0&&weeks%(f==="biweekly"?every*2:every)===0&&rule.weekdays.includes(weekday(ds));
  }
  const step=f==="monthly"?every:f==="quarterly"?3*every:12*every;
  const delta=monthIndex(ds)-monthIndex(anchor);
  if(delta<0||delta%step!==0)return false;
  const d=date(anchor),x=date(ds);
  return x.getUTCDate()===clampDay(x.getUTCFullYear(),x.getUTCMonth(),d.getUTCDate());
}
function expandOne(record,from,to){
  if(!record.recurrence||record.type==="action"){
    return record.date>=from&&record.date<=to?[{...record,isRecurring:false}]:[];
  }
  const rule=recurrence(record.recurrence,record.date);
  const segments=[{
    effectiveDate:record.date,date:record.date,start:record.start,hours:record.hours,
    title:record.title,frequency:rule.frequency,every:rule.every,weekdays:rule.weekdays
  },...rule.segments].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const found=[],paddingFrom=from;
  for(let i=0;i<segments.length;i++){
    const seg=segments[i],next=segments[i+1],start=seg.date;
    if(!date(start))continue;
    const segRule={frequency:seg.frequency||rule.frequency,every:seg.every||rule.every,weekdays:seg.weekdays||rule.weekdays};
    let lo=start>paddingFrom?start:paddingFrom;
    const endLimit=rule.until&&rule.until<to?rule.until:to;
    const hi=next&&advance(next.effectiveDate,-1)<endLimit?advance(next.effectiveDate,-1):endLimit;
    if(lo>hi)continue;
    // Restrict each range to the requested visible interval (maximum 5 years).
    let count=0;
    for(let ds=lo;ds<=hi;ds=advance(ds,1)){
      if(++count>1830)break;
      if(!occurs(ds,start,segRule))continue;
      const change=rule.exceptions[ds];
      if(change&&change.skip)continue;
      const actual=change?{...seg,...change}:{...seg};
      const chosen=change&&change.date?change.date:ds;
      if(chosen<from||chosen>to)continue;
      found.push({...record,date:chosen,start:actual.start,hours:Number(actual.hours),title:actual.title,
        occurrenceDate:ds,isRecurring:true,seriesId:record.uid||record.noteId});
    }
  }
  // A moved occurrence can have its origin date outside the visible window.
  for(const [origin,change] of Object.entries(rule.exceptions)){
    if(!change||change.skip||!change.date||change.date<from||change.date>to||origin>=from&&origin<=to)continue;
    const seg=[...segments].reverse().find(x=>x.effectiveDate<=origin);
    if(!seg||origin<seg.date||rule.until&&origin>rule.until)continue;
    const segRule={frequency:seg.frequency||rule.frequency,every:seg.every||rule.every,weekdays:seg.weekdays||rule.weekdays};
    if(!occurs(origin,seg.date,segRule))continue;
    found.push({...record,date:change.date,start:change.start||seg.start,hours:Number(change.hours||seg.hours),title:change.title||seg.title,occurrenceDate:origin,isRecurring:true,seriesId:record.uid||record.noteId});
  }
  return found;
}
function expand(records,from,to){
  if(!date(from)||!date(to))throw Error("Invalid calendar range.");
  return records.flatMap(record=>expandOne(record,from,to)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
}
function own(record){return JSON.parse(JSON.stringify(record));}
function changeSeries(parent,occurrence,newBlock,scope,ruleFields){
  if(!parent.recurrence)throw Error("This is not a recurring series.");
  const out=own(parent),r=recurrence(out.recurrence,out.date),origin=occurrence.occurrenceDate||occurrence.date;
  if(scope==="one"){
    r.exceptions[origin]={date:newBlock.date,start:newBlock.start,hours:Number(newBlock.hours),title:newBlock.title};
  }else if(scope==="future"){
    if(newBlock.date<origin)throw Error("For future edits, the new starting date cannot be earlier than the selected occurrence.");
    // A new segment supersedes every later segment, without deleting past changes.
    r.segments=r.segments.filter(x=>x.effectiveDate<origin);
    for(const k of Object.keys(r.exceptions))if(k>=origin)delete r.exceptions[k];
    const n=recurrence(ruleFields,newBlock.date);
    r.segments.push({effectiveDate:origin,date:newBlock.date,start:newBlock.start,hours:Number(newBlock.hours),title:newBlock.title,frequency:n.frequency,every:n.every,weekdays:n.weekdays});
    r.until=n.until;
  }else if(scope==="all"){
    const n=recurrence(ruleFields,newBlock.date);
    out.date=newBlock.date;out.start=newBlock.start;out.hours=Number(newBlock.hours);out.title=newBlock.title;
    out.recurrence=n;
    return out;
  }else throw Error("Choose which meetings to edit.");
  out.recurrence=r;
  return out;
}
function removeSeries(parent,occurrence,scope){
  const out=own(parent),r=recurrence(out.recurrence,out.date),origin=occurrence.occurrenceDate||occurrence.date;
  if(scope==="all")return null;
  if(scope==="one"){r.exceptions[origin]={skip:true};out.recurrence=r;return out;}
  if(scope==="future"){
    if(origin<=out.date)return null;
    r.until=advance(origin,-1);
    r.segments=r.segments.filter(s=>s.effectiveDate<origin);
    for(const k of Object.keys(r.exceptions))if(k>=origin)delete r.exceptions[k];
    out.recurrence=r;return out;
  }
  throw Error("Choose which meetings to remove.");
}
function ruleSummary(record){
  if(!record.recurrence)return "";
  const r=record.recurrence,parts={daily:"Daily",weekly:"Weekly",biweekly:"Biweekly",monthly:"Monthly",quarterly:"Quarterly",annually:"Annually"};
  return "↻ "+(parts[r.frequency]||"Repeating")+(r.every>1?" · Every "+r.every:"");
}
global.AtlasRecurrence36={expand,expandOne,changeSeries,removeSeries,recurrence,ruleSummary,advance,occurs};
})(window);

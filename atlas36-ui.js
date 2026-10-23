/* Atlas Command 3.6 — recurrence editor, built around the V3.5 planner's
   existing verified Google Sheets save functions. */
(function(global){
"use strict";
const E=global.AtlasRecurrence36;
const WEEK=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const frequencies=[["daily","Daily"],["weekly","Weekly"],["biweekly","Biweekly"],["monthly","Monthly"],["quarterly","Quarterly"],["annually","Annually"]];
function html(s){return esc(s==null?"":s);}
function action(v){const p=global.plan35;return p&&p.parentBlock(v);}
function chosenDay(v){const p=parseIso(v||todayIso());return p?p.getDay():new Date().getDay();}
function formatRule(r){return r?E.ruleSummary({recurrence:r}):"";}
function plan(){return global.plan35;}
function formFields(v){
  const items=frequencies.map(([key,label])=>'<option value="'+key+'" '+(v.frequency===key?"selected":"")+'>'+label+'</option>').join("");
  const weekdays=WEEK.map((name,day)=>'<label class="atlas-day-choice"><input type="checkbox" name="day" value="'+day+'" '+((v.weekdays||[]).includes(day)?"checked":"")+'><span>'+name+'</span></label>').join("");
  return '<div class="atlas-repeat-fields" id="atlasRepeatFields"><div class="form-grid"><div class="form-group"><label>Pattern</label><select name="frequency">'+items+'</select></div><div class="form-group"><label>Repeat every</label><input class="field" type="number" name="every" min="1" max="52" value="'+html(v.every||1)+'"></div><div class="form-group full" id="atlasWeekdays"><label>Days of week</label><div class="atlas-weekdays">'+weekdays+'</div></div><div class="form-group"><label>End on (optional)</label><input class="field" type="date" name="until" value="'+html(v.until||"")+'"></div><div class="form-group"><label>End behavior</label><div class="atlas-repeat-hint">Leave the end date blank to repeat indefinitely.</div></div></div></div>';
}
function recurrenceFromForm(f,date){
  const names=[...f.querySelectorAll('input[name="day"]:checked')].map(x=>Number(x.value));
  return E.recurrence({frequency:f.elements.frequency.value,every:Number(f.elements.every.value),weekdays:names,until:f.elements.until.value},date);
}
function candidateIsOverlapping(a,b){
  if(a.date!==b.date)return false;
  if(a.noteId&&a.noteId===b.noteId&&a.occurrenceDate===b.occurrenceDate)return false;
  const as=parseTime(a.start),ae=as+Number(a.hours)*60,bs=parseTime(b.start),be=bs+Number(b.hours)*60;
  return as<be&&bs<ae;
}
function parseTime(s){const [h,m]=String(s).split(":").map(Number);return h*60+m;}
function checkFixedConflicts(updated,parentId,selectedOrigin){
  // Detect conflicts for 90 calendar days, including weekly repeats and the
  // scheduled action blocks already present. Auto-schedule will avoid these.
  const start=updated.date>=todayIso()?updated.date:todayIso();
  const end=E.advance(start,90);
  const candidates=E.expand([updated],start,end);
  const existing=plan().blocks().filter(x=>x.noteId!==parentId&&x.date>=start&&x.date<=end);
  const ownClash=[];
  for(let i=0;i<candidates.length;i++){
    const next=candidates[i];
    const hit=existing.find(x=>candidateIsOverlapping(next,x));
    if(hit)throw Error("Recurring time conflict on "+next.date+" at "+next.start+". Move the existing block before saving the series.");
    if(candidates.slice(0,i).some(x=>candidateIsOverlapping(next,x)))ownClash.push(next.date);
  }
  if(ownClash.length)throw Error("Repeating occurrences overlap after an exception on "+ownClash[0]+".");
}
function editor(b){
  b=b||{};const editing=!!b.noteId,record=editing?action(b.noteId):null,series=!!(record&&record.recurrence),kind=b.type==="prep"?"prep":"meeting";
  const r=record&&record.recurrence||{frequency:"weekly",every:1,weekdays:[chosenDay(b.date)],until:""};
  const start=b.date||iso(state.cursor),original=b.occurrenceDate||b.date;
  const scopeHtml=series?'<div class="form-group full"><label>Apply changes to</label><select name="scope"><option value="one">This occurrence only</option><option value="future">This and future occurrences</option><option value="all">Entire series</option></select></div>':"";
  openSheet(editing?"Edit "+(kind==="meeting"?"Meeting":"Protected Prep"):"New "+(kind==="meeting"?"Meeting":"Protected Prep"),'<form id="atlas36Form"><div class="form-grid"><div class="form-group full"><label>Type</label><select name="type"><option value="meeting" '+(kind==="meeting"?"selected":"")+'>Meeting</option><option value="prep" '+(kind==="prep"?"selected":"")+'>Protected prep</option></select></div><div class="form-group full"><label>Title</label><input class="field" name="title" required value="'+html(b.title||"")+'"></div><div class="form-group"><label>Date</label><input type="date" class="field" name="date" required value="'+html(start)+'"></div><div class="form-group"><label>Start</label><input type="time" class="field" name="start" step="900" required value="'+html(b.start||"09:00")+'"></div><div class="form-group"><label>Duration (hours)</label><input type="number" class="field" name="hours" required min=".25" max="8" step=".25" value="'+html(b.hours||1)+'"></div><div class="form-group"><label>Repeats</label><select name="repeats"><option value="no">Does not repeat</option><option value="yes" '+(series?"selected":"")+'>Repeats</option></select></div>'+scopeHtml+'</div>'+formFields(r)+'<p class="muted atlas-repeat-info" id="atlasRepeatHelp"></p><div class="sheet-actions atlas-edit-buttons"><button class="btn" type="button" data-close-sheet>Cancel</button>'+(editing?'<button class="btn danger" type="button" id="atlasDelete">Delete'+(series?"…":"")+'</button>':"")+'<button class="btn primary" type="submit">Save</button></div></form>');
  const f=document.getElementById("atlas36Form");const repeat=f.elements.repeats,scope=f.elements.scope;
  const adjust=()=>{
    const isRepeat=repeat.value==="yes";const one=series&&scope&&scope.value==="one";
    document.getElementById("atlasRepeatFields").classList.toggle("hidden",!isRepeat);
    document.getElementById("atlasWeekdays").classList.toggle("hidden",!["weekly","biweekly"].includes(f.elements.frequency.value));
    const disabled=series&&one;
    for(const x of f.querySelectorAll("#atlasRepeatFields input,#atlasRepeatFields select"))x.disabled=disabled;
    repeat.disabled=!!one;
    document.getElementById("atlasRepeatHelp").textContent=series&&one?"This occurrence changes only. The repeating pattern stays the same.":series&&scope&&scope.value==="future"?"Changes to the repeat pattern take effect from the selected occurrence onward.":isRepeat?"Meetings and protected prep reserve future times. No duplicate actions are created.":"This is a single protected time block.";
  };
  repeat.onchange=adjust;f.elements.frequency.onchange=adjust;
  if(scope)scope.onchange=()=>{
    if(scope.value==="all"&&record)f.elements.date.value=record.date;
    else f.elements.date.value=start;
    repeat.value=scope.value==="one"?"yes":(series?"yes":repeat.value);
    adjust();
  };
  adjust();
  f.onsubmit=e=>{
    e.preventDefault();
    plan().withBusy(async()=>{
      const v=Object.fromEntries(new FormData(f).entries());
      const fixed={type:v.type,title:v.title,date:v.date,start:v.start,hours:Number(v.hours),actionId:"",uid:record?.uid||b.uid||crypto.randomUUID(),noteId:record?.noteId||""};
      plan().validateBlock(fixed);
      if(series){
        if(fixed.type!==record.type)throw Error("To change a repeating series type, delete the series and create a new one.");
        const editScope=v.scope||"one";
        if(editScope==="one"){
          const revised=E.changeSeries(record,b,fixed,"one",r);
          checkFixedConflicts(revised,record.noteId,original);
          await plan().writeBlock(revised);
        }else{
          if(repeat.value!=="yes"&&editScope==="future")throw Error("To stop future occurrences use Delete → This and future.");
          const rule=repeat.value==="yes"?recurrenceFromForm(f,fixed.date):null;
          const revised=editScope==="all"&&rule===null?
            {...record,...fixed,recurrence:null}:
            E.changeSeries(record,b,fixed,editScope,rule||r);
          checkFixedConflicts(revised,record.noteId,original);
          await plan().writeBlock(revised);
        }
      }else{
        fixed.recurrence=repeat.value==="yes"?recurrenceFromForm(f,fixed.date):null;
        if(fixed.recurrence){
          checkFixedConflicts(fixed,fixed.noteId);
          await plan().writeBlock(fixed);
        }else{
          await plan().saveMoved(fixed,false);
        }
      }
      closeSheet();toast("Meeting / prep saved");
    });
  };
  document.getElementById("atlasDelete")?.addEventListener("click",()=>{
    if(!series){
      if(!confirm("Delete this protected time block?"))return;
      plan().withBusy(async()=>{await plan().eraseBlock(record||b);closeSheet();toast("Block removed");});
      return;
    }
    const removeScope=scope?.value||"one";
    const wording={one:"this occurrence",future:"this and all future occurrences",all:"the ENTIRE recurring series"};
    if(!confirm("Delete "+wording[removeScope]+"? This cannot be undone."))return;
    plan().withBusy(async()=>{
      const changed=E.removeSeries(record,b,removeScope);
      if(changed)await plan().writeBlock(changed);
      else await plan().eraseBlock(record);
      closeSheet();toast("Recurrence updated");
    });
  });
}
global.Atlas36UI={blockForm:editor,checkFixedConflicts};
})(window);

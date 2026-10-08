function bindView(){
  $$('[data-route]').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));
  $$('[data-edit-row]').forEach(b=>b.onclick=()=>openAction(state.data.actions.find(a=>String(a.row)===b.dataset.editRow)));
  $$('[data-complete-row]').forEach(b=>b.onclick=()=>busy(bridge.call('setActionStatus',Number(b.dataset.completeRow),'Done'),'Completed'));
  $$('[data-routine-id]').forEach(b=>{if(!b.disabled)b.onclick=()=>busy(bridge.call('markRoutineComplete',b.dataset.routineId,b.dataset.routineDate,''),'Routine complete')});
  $('#quickBtn')?.addEventListener('click',()=>{const v=$('#quickInput').value.trim();if(v)busy(bridge.call('quickCapture',v),'Captured')});
  $('#actionSearch')?.addEventListener('input',filterActions);$('#statusFilter')?.addEventListener('change',filterActions);$('#priorityFilter')?.addEventListener('change',filterActions);
  $$('[data-cal-mode]').forEach(b=>b.onclick=()=>{state.calendarMode=b.dataset.calMode;render()});
  $$('[data-cal-nav]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.calNav);state.cursor=state.calendarMode==='month'?addMonths(state.cursor,n):addDays(state.cursor,n*(state.calendarMode==='week'?7:1));render()});
  $('[data-cal-today]')?.addEventListener('click',()=>{state.cursor=new Date();render()});
  $('[data-new-daily]')?.addEventListener('click',openDailyForm);$('[data-new-brag]')?.addEventListener('click',openBragForm);$('[data-new-project]')?.addEventListener('click',openProjectForm);
  $('[data-new-note]')?.addEventListener('click',()=>openNoteForm());
  $('#noteSearch')?.addEventListener('input',filterNotes);
  $$('[data-edit-note]').forEach(b=>b.onclick=()=>openNoteForm((state.data.notes||[]).find(n=>n.noteId===b.dataset.editNote)));
  $$('[data-project]').forEach(b=>b.onclick=()=>openProjectDetail(b.dataset.project));
}
function filterActions(){const q=($('#actionSearch')?.value||'').toLowerCase(),s=$('#statusFilter')?.value,p=$('#priorityFilter')?.value;$$('#actionBody tr').forEach(r=>{r.style.display=((!q||r.dataset.search.includes(q))&&(s==='All Statuses'||r.dataset.status===s)&&(p==='All Priorities'||r.dataset.priority===p))?'':'none'});}

function openSheet(title,html){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('#sheet').classList.remove('hidden');$('#sheet').setAttribute('aria-hidden','false');bindSheet();}
function closeSheet(){$('#sheet').classList.add('hidden');$('#sheet').setAttribute('aria-hidden','true');}
function bindSheet(){$$('[data-close-sheet]').forEach(x=>x.onclick=closeSheet);$$('[data-more-route]').forEach(b=>b.onclick=()=>{closeSheet();setRoute(b.dataset.moreRoute)});}

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  data:null,
  route:'today',
  calendarMode: innerWidth < 801 ? 'day' : 'week',
  cursor:new Date(),
  selectedProject:null,
  selectedGoal:null
};

const nav = [
  ['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['goals','◎','Goals'],['time','◷','Time'],['projects','▣','Projects'],
  ['notes','✎','Notes'],['routines','↻','Routines'],['daily','▤','Daily Log'],['brag','☆','Brag Sheet']
];

class ApiClient {
  constructor(url,key){this.url=url;this.key=key;this.seq=1;this._token='';this._tokenDay='';}
  async readToken(){
    const day=new Date().toISOString().slice(0,10);
    if(this._token && this._tokenDay===day)return this._token;
    const bytes=new TextEncoder().encode(this.key+'|'+day);
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    this._token=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    this._tokenDay=day;
    return this._token;
  }
  async jsonp(action, params={}){
    const token=await this.readToken();
    return new Promise((resolve,reject)=>{
      const cb='__smcb'+Date.now()+'_'+(this.seq++);
      const q=new URLSearchParams({action,token,callback:cb,...params});
      const script=document.createElement('script');
      const timer=setTimeout(()=>done(new Error('API request timed out.')),action==='txn'?15000:45000);
      const done=(err,data)=>{clearTimeout(timer);delete window[cb];script.remove();err?reject(err):resolve(data)};
      window[cb]=payload=>payload&&payload.ok?done(null,payload.result):done(new Error((payload&&payload.error)||'API request failed'));
      script.onerror=()=>done(new Error('Could not reach Apps Script API.'));
      script.src=this.url+(this.url.includes('?')?'&':'?')+q.toString();
      document.head.appendChild(script);
    });
  }
  async post(action,...args){
    const requestId='REQ-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
    await fetch(this.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({key:this.key,action,args,requestId,source:'PWA'})});
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,900));
      try{
        const tx=await this.jsonp('txn',{requestId});
        if(tx && tx.status==='ok')return tx;
        if(tx && tx.status==='error')throw new Error(tx.error||'Write failed.');
      }catch(e){
        // A single slow status check is not proof that the write failed.
        if(!/API request timed out|Could not reach Apps Script API/i.test(e.message||''))throw e;
      }
    }
    throw new Error('The write could not be verified. Refresh before retrying to avoid duplicate changes.');
  }
  call(method,...args){
    if(method==='getBootstrap') return this.jsonp('bootstrap');
    if(method==='getProjectDetail') return this.jsonp('projectDetail',{projectId:args[0]});
    return this.post(method,...args);
  }
}

let bridge = null;

function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function iso(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
function parseIso(s){if(!s)return null;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3],12):null;}
function fmtDate(s,opts={month:'short',day:'numeric'}){const d=s instanceof Date?s:parseIso(s);return d?d.toLocaleDateString(undefined,opts):'';}
function todayIso(){return iso(new Date());}
function startWeek(d){const x=new Date(d);const day=x.getDay();const delta=(day===0?-6:1-day);x.setDate(x.getDate()+delta);x.setHours(12,0,0,0);return x;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x;}
function isDone(a){return String(a.status).toLowerCase()==='done';}
function priorityClass(p){return String(p||'').toLowerCase();}
function recurrenceLabel(a){if(String(a.repeats).toLowerCase()!=='yes')return'';return `${a.repeatPattern||'Repeats'}${Number(a.repeatEvery||1)>1?' · every '+a.repeatEvery:''}`;}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),2600);}
function releaseSavingButtons(){document.querySelectorAll('form[data-saving="1"]').forEach(form=>{form.dataset.saving='0';const b=form.querySelector('button[type="submit"],button:not([type])');if(b){b.disabled=false;b.textContent=b.dataset.originalSaveLabel||'Save';delete b.dataset.originalSaveLabel;}});}
function busy(promise,msg='Saved'){return promise.then(async r=>{toast(msg);await refresh();return r}).catch(e=>{toast(e.message);throw e}).finally(releaseSavingButtons);}

function dueRoutineOn(r,d){
  if(String(r.scheduled||'Yes').toLowerCase()==='no')return false;
  const f=String(r.frequency||'').toLowerCase();
  const dow=d.getDay();
  if(f==='daily')return dow>=1&&dow<=5;
  const first=new Date(d.getFullYear(),d.getMonth(),1,12);while(first.getDay()!==1)first.setDate(first.getDate()+1);
  if(f==='monthly')return iso(d)===iso(first);
  if(f==='quarterly')return [0,3,6,9].includes(d.getMonth())&&iso(d)===iso(first);
  if(f==='annually')return d.getMonth()===0&&iso(d)===iso(first);
  return false;
}
function routineDone(id,date){return (state.data.routineLog||[]).some(x=>String(x.routineId)===String(id)&&x.dueDate===date&&String(x.status).toLowerCase()==='done');}
function routinesForDate(d){const ds=iso(d);return (state.data.routines||[]).filter(r=>dueRoutineOn(r,d)).map(r=>({...r,done:routineDone(r.id,ds),dueDate:ds}));}
function actionsForDate(d){const ds=iso(d);return (state.data.actions||[]).filter(a=>a.dueDate===ds);}
function goalById(id){return (state.data.goals||[]).find(g=>String(g.goalId)===String(id))||null;}
function goalName(id){const g=goalById(id);return g?g.goal:'';}
function goalOptions(selected=''){return `<option value="">—</option>${(state.data.goals||[]).map(g=>`<option value="${esc(g.goalId)}" ${String(selected)===String(g.goalId)?'selected':''}>${esc(g.goal)}</option>`).join('')}`;}
function pct(v){v=Number(v||0);return Math.max(0,Math.min(100,isFinite(v)?v:0));}
function timeEntries(){return state.data.timeEntries||[];}
function fmtHours(v){const n=Math.round((Number(v)||0)*100)/100;return `${Number.isInteger(n)?n:n.toFixed(2).replace(/0$/,'')} hr`;}
function hoursFor(filter={}){return timeEntries().filter(t=>(!filter.actionId||t.actionId===filter.actionId)&&(!filter.projectId||t.projectId===filter.projectId)&&(!filter.goalId||t.goalId===filter.goalId)).reduce((sum,t)=>sum+(Number(t.hours)||0),0);}
function actionById(id){return (state.data.actions||[]).find(a=>String(a.actionId||a.row)===String(id))||null;}
function projectById(id){return (state.data.projects||[]).find(p=>String(p.projectId)===String(id))||null;}
function projectName(id){const p=projectById(id);return p?p.projectName:'';}

function canManage37(feature){return !!(state.data?.app?.capabilities?.[feature]);}
function projectOptions37(selected=''){return '<option value="">— No project —</option>'+(state.data.projects||[]).map(p=>'<option value="'+esc(p.projectId)+'" '+(String(selected)===String(p.projectId)?'selected':'')+'>'+esc(p.projectName)+'</option>').join('');}
function backendNotice37(feature){return canManage37(feature)?'':'<p class="backend-notice37">Deploy the V3.7 Apps Script backend to enable this feature. Existing data is unchanged.</p>';}
function actionDeleteButton37(a){
  if(!canManage37('deleteActions'))return '';
  return String(a.source)==='Project'?'<button class="link-btn danger-link37" disabled title="Synchronized project actions must be deleted in their project workbook.">Delete</button>':
    '<button class="link-btn danger-link37" data-delete-action="'+esc(a.actionId||'')+'">Delete</button>';
}
let deleting37=false;
async function deleteAction37(id){
  if(deleting37||!canManage37('deleteActions'))return;
  const a=actionById(id);if(!a)return toast('Action no longer exists.');
  if(a.source==='Project')return toast('Delete synchronized actions from the project workbook.');
  if(!a.actionId)return toast('Action ID is missing. Refresh and try again.');
  if(!confirm('Delete action "'+a.task+'"?\n\nIt will disappear from Forge Command and the calendar. Historical time logs and the original row remain in Google Sheets.'))return;
  deleting37=true;
  try{
    await bridge.call('deleteAction',a.actionId);
    const fresh=await bridge.call('getBootstrap');
    if((fresh.actions||[]).some(x=>String(x.actionId)===String(a.actionId)))throw new Error('Deletion could not be verified. Refresh before retrying.');
    state.data=fresh;render();closeSheet();toast('Action deleted');
  }catch(e){toast(e.message||String(e));}
  finally{deleting37=false;}
}
async function deleteProject37(id){
  if(deleting37||!canManage37('deleteProjects'))return;
  const p=projectById(id);if(!p)return toast('Project no longer exists.');
  const count=(state.data.actions||[]).filter(a=>String(a.projectId)===String(id)).length;
  if(!confirm('Delete project "'+p.projectName+'"?\n\nThe project disappears from Forge Command. Its separate Google Drive workbook is preserved. '+count+' linked action(s) will remain as unassigned history. The project can be restored from its row in the Projects sheet, but action links will need reassignment.'))return;
  deleting37=true;
  try{
    await bridge.call('deleteProject',p.projectId);
    const fresh=await bridge.call('getBootstrap');
    if((fresh.projects||[]).some(x=>String(x.projectId)===String(id)))throw new Error('Project deletion could not be verified. Refresh before retrying.');
    state.data=fresh;render();closeSheet();toast('Project removed; workbook preserved');
  }catch(e){toast(e.message||String(e));}
  finally{deleting37=false;}
}


function setRoute(route){state.route=route;render();window.scrollTo(0,0);}
function routeMeta(){
  const m={today:['COMMAND CENTER','Today'],actions:['EXECUTION','Action Items'],calendar:['TIME HORIZON','Calendar'],goals:['OUTCOMES','Goals'],time:['EFFORT','Time'],projects:['PORTFOLIO','Projects'],notes:['REFERENCE','Notes'],routines:['RHYTHM','Routines'],daily:['SYSTEM OF RECORD','Daily Log'],brag:['WINS','Brag Sheet']};
  return m[state.route]||m.today;
}
function renderNav(){
  $('#sideNav').innerHTML=nav.map(([r,i,l])=>`<button class="nav-btn ${state.route===r?'active':''}" data-route="${r}"><span class="nav-ico">${i}</span>${l}</button>`).join('');
  const bottom=[['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['more','•••','More']];
  $('#bottomNav').innerHTML=bottom.map(([r,i,l])=>`<button class="${(r==='more'?['goals','time','projects','notes','routines','daily','brag'].includes(state.route):state.route===r)?'active':''}" data-bottom="${r}"><span class="ico">${i}</span><span>${l}</span></button>`).join('');
}
function render(){
  const [eye,title]=routeMeta();$('#eyebrow').textContent=eye;$('#pageTitle').textContent=title;$('#pageDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  renderNav();
  const v=$('#view');
  if(state.route==='today')v.innerHTML=renderToday();
  if(state.route==='actions')v.innerHTML=renderActions();
  if(state.route==='calendar')v.innerHTML=renderCalendar();
  if(state.route==='goals')v.innerHTML=renderGoals();
  if(state.route==='time')v.innerHTML=renderTime();
  if(state.route==='notes')v.innerHTML=renderNotes();
  if(state.route==='routines')v.innerHTML=renderRoutines();
  if(state.route==='daily')v.innerHTML=renderDaily();
  if(state.route==='brag')v.innerHTML=renderBrag();
  if(state.route==='projects')v.innerHTML=renderProjects();
  bindView();
}

function renderToday(){
  const actions=(state.data.actions||[]),open=actions.filter(a=>!isDone(a)),today=todayIso(),due=open.filter(a=>a.dueDate===today),over=open.filter(a=>a.dueDate&&a.dueDate<today),routines=routinesForDate(new Date());
  const priority=[...over.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),...due,...open.filter(a=>!a.dueDate||a.dueDate>today).slice(0,4)].filter((a,i,arr)=>arr.findIndex(x=>String(x.actionId||x.row)===String(a.actionId||a.row))===i);
  const repeatPreview=upcomingRepeatPreview(open,today,90);
  const soon=open.filter(a=>a.dueDate&&a.dueDate>today&&a.dueDate<=iso(addDays(new Date(),7))).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,5);
  return `${window.plan35.todayPanel()}<div class="kpis">${kpi('OPEN ACTIONS',open.length,'Not yet done')}${kpi('DUE TODAY',due.length,'Actions due today')}${kpi('OVERDUE',over.length,'Needs attention')}${kpi('ROUTINES TODAY',routines.filter(r=>!r.done).length,'Personal operations rhythm')}</div>
    ${section('Priority Actions','Overdue and due-today items first.',priority.length?actionRows(priority,true):empty('Nothing urgent right now.'),'<button class="link-btn" data-route="actions">View all →</button>')}
    ${section('Quick Capture','Get it out of your head before your brain starts a side quest.',`<div class="quick"><input id="quickInput" class="field" placeholder="New action, idea, follow-up…"><button id="quickBtn" class="btn primary">Capture</button></div>`)}
    ${section("Today's Routines",'Repeating tasks from the Self Management Plan.',routineRows(routines),'<button class="link-btn" data-route="routines">All routines →</button>')}
    ${section('Coming Up','Next seven days.',soon.length?actionRows(soon):empty('No dated actions in the next seven days.'))}
    ${section('Recurring Preview','Next 90 days · planned dates only; future actions are created after completing the current occurrence.',repeatPreview.length?repeatPreview.map(x=>`<div class="repeat-preview-row"><div><strong>${esc(x.task)}</strong><div class="meta"><span>↻ ${esc(x.pattern)}</span><span>${esc(x.priority)}</span></div></div><span class="repeat-date">${esc(fmtDate(x.date,{month:'short',day:'numeric',year:'numeric'}))}</span></div>`).join(''):empty('No additional recurring dates in the next 90 days.'))}`;
}
function futureRepeatDate(isoDate,pattern,every){
  const d=parseIso(isoDate);if(!d)return '';
  const n=Math.max(1,Math.floor(Number(every)||1)),p=String(pattern||'');
  if(p==='Daily')d.setDate(d.getDate()+n);
  else if(p==='Weekdays'){let left=n;while(left){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)left--;}}
  else if(p==='Weekly')d.setDate(d.getDate()+7*n);
  else if(p==='Monthly'||p==='Quarterly'||p==='Annually'){
    const months=n*(p==='Monthly'?1:p==='Quarterly'?3:12),day=d.getDate();
    d.setDate(1);d.setMonth(d.getMonth()+months);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0,12).getDate();
    d.setDate(Math.min(day,last));
  }else return '';
  return iso(d);
}
function upcomingRepeatPreview(open,today,horizonDays){
  const until=iso(addDays(new Date(),horizonDays)),rows=[];
  open.filter(a=>String(a.repeats).toLowerCase()==='yes'&&a.dueDate).forEach(a=>{
    let next=a.dueDate;
    for(let i=0;i<100;i++){
      next=futureRepeatDate(next,a.repeatPattern,a.repeatEvery);
      if(!next||next>until||a.repeatEnd&&next>a.repeatEnd)break;
      if(next>today)rows.push({task:a.task,priority:a.priority,date:next,pattern:a.repeatPattern||'Repeat'});
    }
  });
  return rows.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,25);
}
function kpi(label,value,sub){return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;}
function section(title,sub,body,extra=''){return `<div class="card"><div class="card-head"><div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${extra}</div><div class="card-body">${body}</div></div>`;}
function empty(t){return `<div class="empty">${esc(t)}</div>`;}
function actionRows(list,highlightOverdue=false){return list.map(a=>`<div class="action-row${highlightOverdue&&!isDone(a)&&a.dueDate&&a.dueDate<todayIso()?' today-overdue':''}"><button class="check" data-complete-id="${esc(a.actionId||a.row)}" aria-label="Complete"></button><div class="action-main"><strong>${esc(a.task)}</strong><div class="meta"><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span>${a.category?`<span>${esc(a.category)}</span>`:''}${a.dueDate?`<span>${esc(fmtDate(a.dueDate))}</span>`:''}${recurrenceLabel(a)?`<span>↻ ${esc(recurrenceLabel(a))}</span>`:''}${a.projectId?`<span class="goal-link">▣ ${esc(projectName(a.projectId)||a.projectId)}</span>`:''}${a.goalId?`<span class="goal-link">◎ ${esc(goalName(a.goalId)||a.goalId)}</span>`:''}${a.estimatedHours?`<span>Est ${esc(fmtHours(a.estimatedHours))}</span>`:''}${window.AtlasSubActions38.progress(a)}${hoursFor({actionId:a.actionId})?`<span>${esc(fmtHours(hoursFor({actionId:a.actionId})))} actual</span>`:''}</div></div><div class="row-actions"><button class="link-btn" data-edit-id="${esc(a.actionId||a.row)}">Edit</button>${actionDeleteButton37(a)}</div></div>`).join('');}
function routineRows(list){if(!list.length)return empty('No routines due.');return list.map(r=>`<div class="action-row"><button class="check" ${r.done?'disabled':''} data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}" aria-label="Complete routine"></button><div class="action-main"><strong>${esc(r.task)}</strong><div class="meta"><span class="pill">${esc(r.frequency)}</span><span>${r.done?'Completed':'Due'}</span></div></div><div class="row-actions">${r.done?'✓':`<button class="btn" data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}">Complete</button>`}</div></div>`).join('');}

function renderActions(){
  const rows=(state.data.actions||[]).slice().sort((a,b)=>((isDone(a)?1:0)-(isDone(b)?1:0))||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  return `${backendNotice37('actionProjectLink')}<div class="filters"><input class="field search" id="actionSearch" placeholder="Search actions…"><select id="statusFilter"><option>All Statuses</option>${state.data.app.statuses.map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="priorityFilter"><option>All Priorities</option>${state.data.app.priorities.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
  <div class="card"><table class="action-table"><thead><tr><th>Action</th><th>Priority</th><th>Due</th><th>Project</th><th>Status</th><th></th></tr></thead><tbody id="actionBody">${actionTableRows(rows)}</tbody></table></div>`;
}
function actionTableRows(rows){
  return rows.map(a=>`<tr data-search="${esc((a.task+' '+a.notes+' '+a.category+' '+goalName(a.goalId)+' '+projectName(a.projectId)).toLowerCase())}" data-status="${esc(a.status)}" data-priority="${esc(a.priority)}">
  <td class="task-cell"><strong>${esc(a.task)}</strong>${window.AtlasSubActions38.progress(a)}<span>${esc(a.notes||a.category||'')}${a.goalId?' · Goal: '+esc(goalName(a.goalId)||a.goalId):''}${a.estimatedHours?' · Est '+esc(fmtHours(a.estimatedHours)):''}${hoursFor({actionId:a.actionId})?' · '+esc(fmtHours(hoursFor({actionId:a.actionId})))+' actual':''}</span></td>
  <td><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span></td><td>${a.dueDate?esc(fmtDate(a.dueDate)):'—'}</td>
  <td>${a.projectId?esc(projectName(a.projectId)||a.projectId):'—'}</td>
  <td>${esc(a.status)}</td><td class="action-controls37"><button class="link-btn" data-edit-id="${esc(a.actionId||a.row)}">Edit</button>${actionDeleteButton37(a)}</td></tr>`).join('');
}

function renderCalendar(){
  return window.plan35.calendarPanel();
  const mode=state.calendarMode, title=calendarTitle();
  return `<div class="card"><div class="card-head calendar-toolbar"><div><h3>${esc(title)}</h3><p>Actions + recurring routines</p></div><div class="seg"><button data-cal-mode="month" class="${mode==='month'?'active':''}">Month</button><button data-cal-mode="week" class="${mode==='week'?'active':''}">Week</button><button data-cal-mode="day" class="${mode==='day'?'active':''}">Day</button></div><div class="cal-nav"><button class="btn" data-cal-nav="-1">‹</button><button class="btn" data-cal-today>Today</button><button class="btn" data-cal-nav="1">›</button></div></div><div class="card-body">${mode==='month'?renderMonth():mode==='week'?renderWeek():renderDay()}</div></div>`;
}
function calendarTitle(){const d=state.cursor;if(state.calendarMode==='month')return d.toLocaleDateString(undefined,{month:'long',year:'numeric'});if(state.calendarMode==='day')return d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});const s=startWeek(d),e=addDays(s,6);return `${fmtDate(s,{month:'short',day:'numeric'})} – ${fmtDate(e,{month:'short',day:'numeric',year:'numeric'})}`;}
function renderMonth(){const d=state.cursor,first=new Date(d.getFullYear(),d.getMonth(),1,12),start=startWeek(first),cells=[];for(let i=0;i<42;i++){const x=addDays(start,i),acts=actionsForDate(x),r=routinesForDate(x),other=x.getMonth()!==d.getMonth(),today=iso(x)===todayIso();cells.push(`<div class="cal-cell calendar-month ${other?'other-month':''} ${(acts.length||r.length)?'has-items':''} ${today?'today-cell':''}"><div class="cal-day ${today?'today':''}"><span>${x.getDate()}</span> <small>${x.toLocaleDateString(undefined,{weekday:'short'})}</small></div>${acts.slice(0,2).map(a=>`<div class="cal-event">${esc(a.task)}</div>`).join('')}${r.length?`<div class="cal-routine">${r.length} routine${r.length===1?'':'s'} · ${r.filter(y=>y.done).length} done</div>`:''}</div>`)}return `<div class="cal-grid">${cells.join('')}</div>`;}
function renderWeek(){const s=startWeek(state.cursor);return `<div class="week-grid">${Array.from({length:7},(_,i)=>{const d=addDays(s,i),a=actionsForDate(d),r=routinesForDate(d);return `<div class="week-day"><h4>${d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</h4>${a.map(x=>`<div class="cal-event">${esc(x.task)}</div>`).join('')||'<div class="muted">No actions</div>'}${r.length?`<div class="cal-routine">${r.length} routines · ${r.filter(x=>x.done).length} done</div>`:''}</div>`}).join('')}</div>`;}
function renderDay(){const d=state.cursor,a=actionsForDate(d),r=routinesForDate(d);return `<div class="day-list">${a.length?`<h3>Actions</h3>${a.map(x=>`<div class="agenda-item"><strong>${esc(x.task)}</strong><div class="meta"><span class="pill ${priorityClass(x.priority)}">${esc(x.priority)}</span><span>${esc(x.status)}</span></div><button class="link-btn" data-edit-id="${esc(x.actionId||x.row)}">Edit</button></div>`).join('')}`:''}${r.length?`<h3>Routines</h3>${routineRows(r)}`:''}${!a.length&&!r.length?empty('Clear day.') :''}</div>`;}


function renderGoals(){
  const goals=(state.data.goals||[]).slice().sort((a,b)=>{const ac=a.status==='Complete'?1:0,bc=b.status==='Complete'?1:0;return ac-bc||(a.targetDate||'9999').localeCompare(b.targetDate||'9999')});
  if(!goals.length)return `${section('Goals','Outcomes that organize projects, actions, milestones and evidence.',empty('No goals yet.'),'<button class="btn primary" data-new-goal>+ New Goal</button>')}`;
  return `<div class="goal-grid">${goals.map(g=>{
    const milestones=(state.data.goalMilestones||[]).filter(m=>m.goalId===g.goalId),projects=(state.data.projects||[]).filter(p=>p.goalId===g.goalId),actions=(state.data.actions||[]).filter(a=>a.goalId===g.goalId&&!isDone(a));
    return `<button class="goal-card" data-goal="${esc(g.goalId)}"><div class="goal-card-top"><span class="pill ${priorityClass(g.priority)}">${esc(g.priority)}</span><span class="goal-health ${String(g.health||'green').toLowerCase()}">${esc(g.health||'Green')}</span></div><h3>${esc(g.goal)}</h3><div class="meta"><span>${esc(g.status||'Not Started')}</span><span>${esc(g.source||'Self')}</span>${g.reviewPeriod?`<span>${esc(g.reviewPeriod)}</span>`:''}${g.targetDate?`<span>Due ${esc(fmtDate(g.targetDate))}</span>`:''}</div><div class="progress"><div style="width:${pct(g.percentComplete)}%"></div></div><div class="goal-progress-row"><strong>${pct(g.percentComplete)}%</strong><span>${milestones.filter(m=>m.status==='Complete').length}/${milestones.length} milestones · ${projects.length} projects · ${actions.length} open actions</span></div></button>`;
  }).join('')}</div><button class="btn primary" data-new-goal>+ New Goal</button>`;
}
function linkedRow(title,meta=''){return `<div class="log-row"><strong>${esc(title)}</strong>${meta?`<div class="meta">${meta}</div>`:''}</div>`;}

function renderNotes(){
  const rows=(state.data.notes||[]).filter(n=>!window.plan35.isPlannerNote(n) && !window.AtlasSubActions38.isChecklistNote(n)).slice();
  return `<div class="card"><div class="card-head"><div><h3>Notes</h3><p>Just notes. No workflow required.</p></div><button class="btn primary" data-new-note>+ New Note</button></div>
    <div class="card-body"><div class="notes-toolbar"><input class="field" id="notesSearch" placeholder="Search notes…"></div>
    <div id="notesList">${rows.length?rows.map(n=>`<article class="note-card" data-note-search="${esc(((n.title||'')+' '+(n.note||'')+' '+(n.tags||'')+' '+(n.projectId||'')+' '+(n.goalId||'')).toLowerCase())}"><div class="note-card-head"><div><strong>${n.pinned==='Yes'?'📌 ':''}${esc(n.title||fmtDate(n.date)||'Note')}</strong><div class="meta"><span>${esc(fmtDate(n.date))}</span>${n.tags?`<span>${esc(n.tags)}</span>`:''}${n.projectId?`<span>${esc(n.projectId)}</span>`:''}${n.goalId?`<span>◎ ${esc(goalName(n.goalId)||n.goalId)}</span>`:''}</div></div><button class="link-btn" data-edit-note="${esc(n.noteId)}">Edit</button></div><div class="note-text">${esc(n.note).replace(/\n/g,'<br>')}</div></article>`).join(''):empty('No notes yet.')}</div></div></div>`;
}

function renderTime(){
  const entries=timeEntries().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||String(b.updated||b.added||'').localeCompare(String(a.updated||a.added||'')));
  const now=new Date(),weekStart=iso(startWeek(now)),monthPrefix=todayIso().slice(0,7);
  const week=entries.filter(t=>(t.date||'')>=weekStart),month=entries.filter(t=>(t.date||'').startsWith(monthPrefix));
  const sum=x=>x.reduce((s,t)=>s+(Number(t.hours)||0),0);
  const byGoal={};entries.forEach(t=>{const k=t.goalId||'Unlinked';byGoal[k]=(byGoal[k]||0)+(Number(t.hours)||0)});
  const byProject={};entries.forEach(t=>{const k=t.projectId||'Unlinked';byProject[k]=(byProject[k]||0)+(Number(t.hours)||0)});
  const rank=(obj,labelFn)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,h])=>`<div class="time-break-row"><span>${esc(labelFn(id)||id)}</span><strong>${esc(fmtHours(h))}</strong></div>`).join('')||empty('No time logged yet.');
  const recent=entries.slice(0,25).map(t=>`<button class="time-entry-row" data-edit-time="${esc(t.timeEntryId)}"><div><strong>${esc(t.description||'Time entry')}</strong><div class="meta"><span>${esc(fmtDate(t.date))}</span>${t.category?`<span>${esc(t.category)}</span>`:''}${t.actionId?`<span>${esc(t.actionId)}</span>`:''}${t.projectId?`<span>${esc(projectName(t.projectId)||t.projectId)}</span>`:''}${t.goalId?`<span>◎ ${esc(goalName(t.goalId)||t.goalId)}</span>`:''}</div></div><strong>${esc(fmtHours(t.hours))}</strong></button>`).join('')||empty('No time entries yet.');
  return `<div class="kpis">${kpi('THIS WEEK',fmtHours(sum(week)),'Logged effort')}${kpi('THIS MONTH',fmtHours(sum(month)),'Logged effort')}${kpi('ALL TIME',fmtHours(sum(entries)),'Since tracking began')}${kpi('ENTRIES',entries.length,'Time records')}</div>
    <div class="time-two-col">${section('By Goal','Where your effort is going.',rank(byGoal,id=>id==='Unlinked'?'Unlinked':goalName(id)))}${section('By Project','Project-level effort.',rank(byProject,id=>id==='Unlinked'?'Unlinked':projectName(id)))}</div>
    ${section('Recent Time','Tap an entry to edit it.',recent,'<button class="btn primary" data-new-time>+ Log Time</button>')}`;
}

function renderRoutines(){const d=new Date();const groups={Daily:[],Monthly:[],Quarterly:[],Annually:[]};(state.data.routines||[]).forEach(r=>(groups[r.frequency]||groups.Daily).push(r));return Object.entries(groups).map(([g,items])=>section(g, state.data.app.scheduleRules[g]||'', items.length?items.map(r=>`<div class="log-row"><strong>${esc(r.task)}</strong><div class="meta"><span>${esc(r.document||'')}</span></div></div>`).join(''):empty('None'))).join('');}
function renderDaily(){const rows=(state.data.dailyLog||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<div class="card"><div class="card-head"><div><h3>Daily Log</h3><p>What happened that may matter later.</p></div><button class="btn primary" data-new-daily>+ Log Entry</button></div><div class="card-body">${rows.length?rows.map(x=>`<div class="log-row"><strong>${esc(x.summary)}</strong><div class="meta"><span>${esc(fmtDate(x.date))}</span><span>${esc(x.type)}</span><span>${esc(x.significance)}</span>${x.projectId?`<span>${esc(x.projectId)}</span>`:''}${x.goalId?`<span>◎ ${esc(goalName(x.goalId)||x.goalId)}</span>`:''}</div>${x.details?`<div class="muted" style="margin-top:6px">${esc(x.details)}</div>`:''}</div>`).join(''):empty('No entries yet.')}</div></div>`;}
function renderBrag(){const rows=(state.data.brag||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<div class="card"><div class="card-head"><div><h3>Brag Sheet</h3><p>Wins worth remembering.</p></div><button class="btn primary" data-new-brag>+ Add Win</button></div><div class="card-body">${rows.length?rows.map(x=>`<div class="brag-row"><strong>${esc(x.accomplishment)}</strong><div class="meta"><span>${esc(fmtDate(x.date))}</span><span>${esc(x.category)}</span>${x.metric?`<span>${esc(x.metric)}</span>`:''}${x.goalId?`<span>◎ ${esc(goalName(x.goalId)||x.goalId)}</span>`:''}</div>${x.impact?`<div class="muted" style="margin-top:6px">${esc(x.impact)}</div>`:''}</div>`).join(''):empty('No wins yet.')}</div></div>`;}
function renderProjects(){
  const p=state.data.projects||[];
  const cards=p.map(x=>`<div class="project-tile project-card37">
    <button class="project-tile-open37" data-project="${esc(x.projectId)}">
      <h3>${esc(x.projectName)}</h3>
      <div class="meta"><span><i class="status-dot ${String(x.health).toLowerCase()}"></i>${esc(x.health)}</span><span>${esc(x.status)}</span></div>
      <div class="meta"><span>${esc(x.projectId)}</span>${x.targetDate?`<span>Target ${esc(fmtDate(x.targetDate))}</span>`:''}${x.goalId?`<span>◎ ${esc(goalName(x.goalId)||x.goalId)}</span>`:''}</div>
    </button>
    ${canManage37('deleteProjects')?`<button class="link-btn danger-link37 project-card-delete37" data-delete-project="${esc(x.projectId)}">Delete</button>`:''}
  </div>`).join('');
  return backendNotice37('deleteProjects')+`<div class="project-grid">${cards}${!p.length?empty('No projects yet.'):''}</div><button class="btn primary" data-new-project>+ New Project</button>`;
}
function renderMoreSheet(){openSheet('More',`<div class="more-grid">${nav.slice(3).map(([r,i,l])=>`<button class="more-card" data-more-route="${r}"><strong>${i} ${l}</strong><span>Open ${l}</span></button>`).join('')}</div>`);}

function bindView(){
  $$('[data-route]').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));
  $$('[data-edit-id]').forEach(b=>b.onclick=()=>openAction((state.data.actions||[]).find(a=>String(a.actionId||a.row)===String(b.dataset.editId))||{}));
  $$('[data-complete-id]').forEach(b=>b.onclick=()=>{const a=actionById(b.dataset.completeId);if(a)openCompleteAction(a)});
  $$('[data-routine-id]').forEach(b=>{if(!b.disabled)b.onclick=()=>busy(bridge.call('markRoutineComplete',b.dataset.routineId,b.dataset.routineDate,''),'Routine complete')});
  $('#quickBtn')?.addEventListener('click',()=>{const v=$('#quickInput').value.trim();if(v)busy(bridge.call('quickCapture',v),'Captured')});
  $('#actionSearch')?.addEventListener('input',filterActions);$('#statusFilter')?.addEventListener('change',filterActions);$('#priorityFilter')?.addEventListener('change',filterActions);
  $$('[data-cal-mode]').forEach(b=>b.onclick=()=>{state.calendarMode=b.dataset.calMode;render()});
  $$('[data-cal-nav]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.calNav);state.cursor=state.calendarMode==='month'?addMonths(state.cursor,n):addDays(state.cursor,n*(state.calendarMode==='week'?7:1));render()});
  $('[data-cal-today]')?.addEventListener('click',()=>{state.cursor=new Date();render()});
  $('[data-new-note]')?.addEventListener('click',()=>openNoteForm());$$('[data-edit-note]').forEach(b=>b.onclick=()=>openNoteForm((state.data.notes||[]).find(n=>n.noteId===b.dataset.editNote)||{}));
  $('[data-new-time]')?.addEventListener('click',()=>openTimeForm());$$('[data-edit-time]').forEach(b=>b.onclick=()=>openTimeForm(timeEntries().find(t=>t.timeEntryId===b.dataset.editTime)||{}));
  $('#notesSearch')?.addEventListener('input',()=>{const q=$('#notesSearch').value.toLowerCase();$$('[data-note-search]').forEach(n=>n.style.display=!q||n.dataset.noteSearch.includes(q)?'':'none')});
  $('[data-new-daily]')?.addEventListener('click',()=>openDailyForm());$('[data-new-brag]')?.addEventListener('click',()=>openBragForm());$('[data-new-project]')?.addEventListener('click',()=>openProjectForm());
  $$('[data-project]').forEach(b=>b.onclick=()=>openProjectDetail(b.dataset.project));
  $$('[data-delete-project]').forEach(b=>b.onclick=()=>deleteProject37(b.dataset.deleteProject));
  $$('[data-delete-action]').forEach(b=>b.onclick=()=>deleteAction37(b.dataset.deleteAction));
  $('[data-new-goal]')?.addEventListener('click',()=>openGoalForm());$$('[data-goal]').forEach(b=>b.onclick=()=>openGoalDetail(b.dataset.goal));
}
function filterActions(){const q=($('#actionSearch')?.value||'').toLowerCase(),s=$('#statusFilter')?.value,p=$('#priorityFilter')?.value;$$('#actionBody tr').forEach(r=>{r.style.display=((!q||r.dataset.search.includes(q))&&(s==='All Statuses'||r.dataset.status===s)&&(p==='All Priorities'||r.dataset.priority===p))?'':'none'});}
function filterNotes(){const q=($('#notesSearch')?.value||'').toLowerCase();$$('[data-note-search]').forEach(n=>n.style.display=!q||n.dataset.noteSearch.includes(q)?'':'none');}

function openSheet(title,html){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('.sheet-panel')?.classList.remove('wide');$('#sheet').classList.remove('hidden');$('#sheet').setAttribute('aria-hidden','false');bindSheet();}
function closeSheet(){$('#sheet').classList.add('hidden');$('#sheet').setAttribute('aria-hidden','true');}
function bindSheet(){
  $$('[data-close-sheet]').forEach(x=>x.onclick=closeSheet);
  $$('[data-more-route]').forEach(b=>b.onclick=()=>{closeSheet();setRoute(b.dataset.moreRoute)});
  $$('#sheetBody form').forEach(form=>{
    if(form.dataset.savingHook)return;
    form.dataset.savingHook='1';
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(form.dataset.saving==='1'){event.preventDefault();event.stopImmediatePropagation();return;}
      form.dataset.saving='1';
      const button=form.querySelector('button[type="submit"],button:not([type])');
      if(button){button.dataset.originalSaveLabel=button.textContent;button.textContent=/save|capture|complete/i.test(button.textContent)?'Saving…':'Working…';button.disabled=true;}
    },true);
  });
}

function openAction(a={}){const edit=!!(a.actionId||a.row);openSheet(edit?'Edit Action':'New Action',`<form id="actionForm"><div class="form-grid"><div class="form-group full"><label>Action</label><input class="field" name="task" required value="${esc(a.task||'')}"></div><div class="form-group"><label>Category</label><input class="field" name="category" value="${esc(a.category||'')}"></div><div class="form-group"><label>Priority</label><select name="priority">${state.data.app.priorities.map(x=>`<option ${a.priority===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Due date</label><input class="field" type="date" name="dueDate" value="${esc(a.dueDate||'')}"></div><div class="form-group"><label>Status</label><select name="status">${state.data.app.statuses.map(x=>`<option ${a.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Goal <span class="muted">(optional)</span></label><select name="goalId">${goalOptions(a.goalId||'')}</select></div><div class="form-group"><label>Project <span class="muted">(optional)</span></label><select name="projectId" ${!canManage37('actionProjectLink')||a.source==='Project'?'disabled':''}>${projectOptions37(a.projectId||'')}</select>${a.source==='Project'?'<span class="form-helper37">Synced from its project workbook.</span>':!canManage37('actionProjectLink')?'<span class="form-helper37">Requires the V3.7 backend update.</span>':''}</div><div class="form-group"><label>Estimated Hours <span class="muted">(optional)</span></label><input class="field" type="number" min="0" step="0.25" name="estimatedHours" value="${esc(a.estimatedHours||'')}"></div><div class="form-group full"><label>Notes</label><textarea name="notes">${esc(a.notes||'')}</textarea></div>${window.AtlasSubActions38.section()}<div class="form-group"><label>Repeats</label><select name="repeats"><option ${a.repeats!=='Yes'?'selected':''}>No</option><option ${a.repeats==='Yes'?'selected':''}>Yes</option></select></div><div class="form-group"><label>Pattern</label><select name="repeatPattern">${state.data.app.repeatPatterns.map(x=>`<option ${a.repeatPattern===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Repeat every</label><input class="field" type="number" min="1" name="repeatEvery" value="${esc(a.repeatEvery||1)}"></div><div class="form-group"><label>Repeat end</label><input class="field" type="date" name="repeatEnd" value="${esc(a.repeatEnd||'')}"></div></div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button>${edit&&a.source!=='Project'&&canManage37('deleteActions')?'<button type="button" class="btn danger" id="deleteAction37">Delete Action</button>':''}<button class="btn primary">Save</button></div></form>`);bindSheet();const checklist38=window.AtlasSubActions38.mount(a);let savedAction38=edit?a:null;let newWriteAttempt38=false;$('#actionForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),payload=Object.fromEntries(f.entries());if(savedAction38){payload.actionId=savedAction38.actionId||'';payload.row=savedAction38.row||'';}const priorIds38=new Set((state.data.actions||[]).map(x=>String(x.actionId||x.row)));(async()=>{try{if(!savedAction38&&newWriteAttempt38)throw new Error('Action creation needs verification. Refresh before retrying to prevent a duplicate.');if(!savedAction38)newWriteAttempt38=true;
    await bridge.call('saveAction',payload);
    const fresh=await bridge.call('getBootstrap');
    const saved=(fresh.actions||[]).find(x=>savedAction38?String(x.actionId||x.row)===String(savedAction38.actionId||savedAction38.row):!priorIds38.has(String(x.actionId||x.row))&&x.task===payload.task&&x.dueDate===payload.dueDate);
    if(!saved||saved.dueDate!==payload.dueDate||(canManage37('actionProjectLink')&&a.source!=='Project'&&String(saved.projectId||'')!==String(payload.projectId||'')))throw new Error('Save could not be confirmed. The form remains open. Check the action before trying again.');
    savedAction38=saved;state.data=fresh;await checklist38?.onActionSaved(saved);render();toast('Action saved');closeSheet();
  }catch(err){toast(err.message);const form=$('#actionForm');if(form){form.dataset.saving='0';const btn=form.querySelector('.sheet-actions button.primary');if(btn){btn.disabled=false;btn.textContent='Save';}}}
  })()};$('#deleteAction37')?.addEventListener('click',()=>deleteAction37(a.actionId));}

function openCompleteAction(a,after){
  const actual=hoursFor({actionId:a.actionId});
  openSheet('Complete Action',`<form id="completeActionForm"><div class="completion-action"><strong>${esc(a.task)}</strong><div class="meta">${a.estimatedHours?`<span>Estimated ${esc(fmtHours(a.estimatedHours))}</span>`:''}${actual?`<span>Already logged ${esc(fmtHours(actual))}</span>`:''}</div></div><div class="form-grid"><div class="form-group"><label>Hours spent <span class="muted">(optional)</span></label><input class="field" type="number" min="0" step="0.25" name="hours" placeholder="3.0"></div><div class="form-group"><label>Date</label><input class="field" type="date" name="date" value="${todayIso()}"></div><div class="form-group full"><label>Work note <span class="muted">(optional)</span></label><textarea name="description" placeholder="What did you spend the time doing?"></textarea></div></div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Complete Action</button></div></form>`);
  bindSheet();$('#completeActionForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());busy(bridge.call('completeActionWithTime',a.actionId||a.row,payload),'Action completed').then(()=>{closeSheet();if(after)after();})};
}
function openTimeForm(t={}){
  const edit=!!t.timeEntryId;
  openSheet(edit?'Edit Time':'Log Time',`<form id="timeForm"><div class="form-grid"><div class="form-group"><label>Date</label><input class="field" type="date" name="date" value="${esc(t.date||todayIso())}" required></div><div class="form-group"><label>Hours</label><input class="field" type="number" min="0.01" step="0.01" name="hours" value="${esc(t.hours||'')}" required placeholder="1.5"></div><div class="form-group full"><label>Description</label><input class="field" name="description" value="${esc(t.description||'')}" required placeholder="What did you work on?"></div><div class="form-group"><label>Category</label><input class="field" name="category" value="${esc(t.category||'')}" placeholder="CI, Admin, Meeting…"></div><div class="form-group"><label>Action <span class="muted">(optional)</span></label><select name="actionId"><option value="">—</option>${(state.data.actions||[]).map(a=>`<option value="${esc(a.actionId)}" ${t.actionId===a.actionId?'selected':''}>${esc(a.task)}</option>`).join('')}</select></div><div class="form-group"><label>Project <span class="muted">(optional)</span></label><select name="projectId"><option value="">—</option>${(state.data.projects||[]).map(p=>`<option value="${esc(p.projectId)}" ${t.projectId===p.projectId?'selected':''}>${esc(p.projectName)}</option>`).join('')}</select></div><div class="form-group"><label>Goal <span class="muted">(optional)</span></label><select name="goalId">${goalOptions(t.goalId||'')}</select></div></div><div class="sheet-actions">${edit?'<button type="button" class="btn danger" data-delete-time>Delete</button>':''}<button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save Time</button></div></form>`);
  bindSheet();$('#timeForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());const marker=String(t.description||'').match(/\[Forge block: [^\]]+\]/);if(marker&&!String(payload.description).includes(marker[0]))payload.description+=' '+marker[0];payload.source=t.source||'Manual';if(edit)payload.timeEntryId=t.timeEntryId;busy(bridge.call('saveTimeEntry',payload),'Time saved').then(closeSheet)};
  $('[data-delete-time]')?.addEventListener('click',()=>{if(confirm('Delete this time entry?'))busy(bridge.call('deleteTimeEntry',t.timeEntryId),'Time entry deleted').then(closeSheet)});
}

function openNoteForm(n={}){
  const edit=!!n.noteId;
  openSheet(edit?'Edit Note':'New Note',`<form id="noteForm"><div class="form-grid">
    <div class="form-group"><label>Date</label><input class="field" type="date" name="date" value="${esc(n.date||todayIso())}"></div>
    <div class="form-group"><label>Pinned</label><select name="pinned"><option ${n.pinned!=='Yes'?'selected':''}>No</option><option ${n.pinned==='Yes'?'selected':''}>Yes</option></select></div>
    <div class="form-group full"><label>Title <span class="muted">(optional)</span></label><input class="field" name="title" value="${esc(n.title||'')}"></div>
    <div class="form-group full"><label>Note</label><textarea name="note" style="min-height:220px" required>${esc(n.note||'')}</textarea></div>
    <div class="form-group"><label>Tags <span class="muted">(optional)</span></label><input class="field" name="tags" value="${esc(n.tags||'')}" placeholder="meeting, idea, reference"></div>
    <div class="form-group"><label>Project <span class="muted">(optional)</span></label><select name="projectId"><option value="">—</option>${(state.data.projects||[]).map(p=>`<option value="${esc(p.projectId)}" ${n.projectId===p.projectId?'selected':''}>${esc(p.projectName)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Goal <span class="muted">(optional)</span></label><select name="goalId">${goalOptions(n.goalId||'')}</select></div>
    </div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save Note</button></div></form>`);
  bindSheet();
  $('#noteForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());if(edit)payload.noteId=n.noteId;busy(bridge.call('saveNote',payload),'Note saved').then(closeSheet)};
}
function openDailyForm(d={}){openSheet('Log Entry',`<form id="dailyForm"><div class="form-grid"><div class="form-group"><label>Date</label><input class="field" type="date" name="date" value="${esc(d.date||todayIso())}"></div><div class="form-group"><label>Type</label><select name="type">${state.data.app.dailyTypes.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="form-group full"><label>Summary</label><input class="field" name="summary" required></div><div class="form-group full"><label>Details</label><textarea name="details"></textarea></div><div class="form-group"><label>People / Stakeholders</label><input class="field" name="people"></div><div class="form-group"><label>Project</label><select name="projectId"><option value="">—</option>${(state.data.projects||[]).map(p=>`<option value="${esc(p.projectId)}" ${d.projectId===p.projectId?'selected':''}>${esc(p.projectName)}</option>`).join('')}</select></div><div class="form-group"><label>Goal</label><select name="goalId">${goalOptions(d.goalId||'')}</select></div><div class="form-group"><label>Significance</label><select name="significance">${state.data.app.significance.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Follow-up needed</label><select name="followUpNeeded"><option>No</option><option>Yes</option></select></div><div class="form-group"><label>Follow-up date</label><input class="field" type="date" name="followUpDate"></div><div class="form-group"><label>Create action</label><select name="createAction"><option value="false">No</option><option value="true">Yes</option></select></div><div class="form-group"><label>Add to Brag Sheet</label><select name="addToBrag"><option value="false">No</option><option value="true">Yes</option></select></div></div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save</button></div></form>`);bindSheet();$('#dailyForm').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());p.createAction=p.createAction==='true';p.addToBrag=p.addToBrag==='true';busy(bridge.call('saveDailyLog',p),'Log saved').then(closeSheet)};}
function openBragForm(b={}){openSheet('Add Win',`<form id="bragForm"><div class="form-grid"><div class="form-group"><label>Date</label><input class="field" type="date" name="date" value="${esc(b.date||todayIso())}"></div><div class="form-group"><label>Category</label><select name="category">${state.data.app.bragCategories.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="form-group full"><label>Accomplishment</label><input class="field" name="accomplishment" required></div><div class="form-group full"><label>Impact / Result</label><textarea name="impact"></textarea></div><div class="form-group"><label>Metric / Value</label><input class="field" name="metric"></div><div class="form-group"><label>Project</label><select name="projectId"><option value="">—</option>${(state.data.projects||[]).map(p=>`<option value="${esc(p.projectId)}" ${b.projectId===p.projectId?'selected':''}>${esc(p.projectName)}</option>`).join('')}</select></div><div class="form-group"><label>Goal</label><select name="goalId">${goalOptions(b.goalId||'')}</select></div><div class="form-group full"><label>Recognition / Evidence</label><input class="field" name="recognition"></div><div class="form-group full"><label>Notes</label><textarea name="notes"></textarea></div></div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save</button></div></form>`);bindSheet();$('#bragForm').onsubmit=e=>{e.preventDefault();busy(bridge.call('saveBragEntry',Object.fromEntries(new FormData(e.target).entries())),'Win saved').then(closeSheet)};}
function openProjectForm(p={}){
  const edit=!!p.projectId;
  openSheet(edit?'Edit Project':'New Project',`<form id="projectForm"><div class="form-grid">
    <div class="form-group full"><label>Project name</label><input class="field" name="projectName" required value="${esc(p.projectName||'')}"></div>
    <div class="form-group"><label>Project lead</label><input class="field" name="projectLead" value="${esc(p.projectLead||'')}"></div>
    <div class="form-group"><label>Sponsor</label><input class="field" name="sponsor" value="${esc(p.sponsor||'')}"></div>
    ${edit?`<div class="form-group"><label>Status</label><select name="status">${state.data.app.projectStatuses.map(x=>`<option ${p.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Health</label><select name="health">${state.data.app.projectHealth.map(x=>`<option ${p.health===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>`:''}
    <div class="form-group"><label>Priority</label><select name="priority">${state.data.app.priorities.map(x=>`<option ${p.priority===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Goal <span class="muted">(optional)</span></label><select name="goalId">${goalOptions(p.goalId||'')}</select></div>
    <div class="form-group"><label>Start date</label><input class="field" type="date" name="startDate" value="${esc(p.startDate||todayIso())}"></div>
    <div class="form-group"><label>Target date</label><input class="field" type="date" name="targetDate" value="${esc(p.targetDate||'')}"></div>
    ${edit?`<div class="form-group"><label>Expected Savings</label><input class="field" name="expectedSavings" value="${esc(p.expectedSavings||'')}"></div><div class="form-group"><label>Estimated Cost</label><input class="field" name="estimatedCost" value="${esc(p.estimatedCost||'')}"></div><div class="form-group"><label>Next Milestone</label><input class="field" name="nextMilestone" value="${esc(p.nextMilestone||'')}"></div><div class="form-group"><label>Milestone Date</label><input class="field" type="date" name="milestoneDate" value="${esc(p.milestoneDate||'')}"></div>`:''}
    <div class="form-group full"><label>Notes</label><textarea name="notes">${esc(p.notes||'')}</textarea></div>
  </div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button>${edit&&canManage37('deleteProjects')?'<button class="btn danger" type="button" id="deleteProject37">Delete Project</button>':''}<button class="btn primary">${edit?'Save Project':'Create'}</button></div></form>`);
  bindSheet();$('#projectForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());if(edit){payload.projectId=p.projectId;busy(bridge.call('saveProject',payload),'Project saved').then(closeSheet)}else busy(bridge.call('createProject',payload),'Project created').then(closeSheet)};$('#deleteProject37')?.addEventListener('click',()=>deleteProject37(p.projectId));
}

function openGoalForm(g={}){
  const edit=!!g.goalId;
  openSheet(edit?'Edit Goal':'New Goal',`<form id="goalForm"><div class="form-grid">
    <div class="form-group full"><label>Goal</label><input class="field" name="goal" value="${esc(g.goal||'')}" required></div>
    <div class="form-group"><label>Source</label><select name="source">${state.data.app.goalSources.map(x=>`<option ${(g.source||'Self')===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Requested By</label><input class="field" name="requestedBy" value="${esc(g.requestedBy||'')}"></div>
    <div class="form-group"><label>Owner</label><input class="field" name="owner" value="${esc(g.owner||'')}"></div>
    <div class="form-group"><label>Review Period</label><input class="field" name="reviewPeriod" value="${esc(g.reviewPeriod||'')}" placeholder="2027 Annual Goals"></div>
    <div class="form-group"><label>Status</label><select name="status">${state.data.app.goalStatuses.map(x=>`<option ${g.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Health</label><select name="health">${state.data.app.goalHealth.map(x=>`<option ${g.health===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Priority</label><select name="priority">${state.data.app.priorities.map(x=>`<option ${(g.priority||'Medium')===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="form-group"><label>% Complete</label><input class="field" type="number" min="0" max="100" name="percentComplete" value="${pct(g.percentComplete)}"></div>
    <div class="form-group"><label>Start Date</label><input class="field" type="date" name="startDate" value="${esc(g.startDate||todayIso())}"></div>
    <div class="form-group"><label>Target Date</label><input class="field" type="date" name="targetDate" value="${esc(g.targetDate||'')}"></div>
    <div class="form-group full"><label>Success Measure</label><textarea name="successMeasure">${esc(g.successMeasure||'')}</textarea></div>
    <div class="form-group"><label>Target</label><input class="field" name="target" value="${esc(g.target||'')}"></div>
    <div class="form-group"><label>Current</label><input class="field" name="current" value="${esc(g.current||'')}"></div>
    <div class="form-group full"><label>Notes</label><textarea name="notes">${esc(g.notes||'')}</textarea></div>
  </div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save Goal</button></div></form>`);
  bindSheet();$('#goalForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());if(edit)payload.goalId=g.goalId;busy(bridge.call('saveGoal',payload),'Goal saved').then(closeSheet)};
}
function openMilestoneForm(goalId,m={}){
  const edit=!!m.milestoneId;
  openSheet(edit?'Edit Milestone':'New Milestone',`<form id="milestoneForm"><input type="hidden" name="goalId" value="${esc(goalId)}"><div class="form-grid"><div class="form-group full"><label>Milestone</label><input class="field" name="milestone" value="${esc(m.milestone||'')}" required></div><div class="form-group"><label>Target Date</label><input class="field" type="date" name="targetDate" value="${esc(m.targetDate||'')}"></div><div class="form-group"><label>Status</label><select name="status">${state.data.app.goalMilestoneStatuses.map(x=>`<option ${m.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group"><label>Weight % <span class="muted">(optional)</span></label><input class="field" type="number" min="0" max="100" name="weight" value="${esc(m.weight||'')}"></div><div class="form-group full"><label>Notes</label><textarea name="notes">${esc(m.notes||'')}</textarea></div></div><div class="sheet-actions"><button type="button" class="btn" data-close-sheet>Cancel</button><button class="btn primary">Save Milestone</button></div></form>`);
  bindSheet();$('#milestoneForm').onsubmit=e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target).entries());if(edit)payload.milestoneId=m.milestoneId;busy(bridge.call('saveGoalMilestone',payload),'Milestone saved').then(closeSheet)};
}
function openGoalDetail(id){
  const g=goalById(id);if(!g){toast('Goal not found.');return;}
  const milestones=(state.data.goalMilestones||[]).filter(m=>m.goalId===id).sort((a,b)=>(a.targetDate||'9999').localeCompare(b.targetDate||'9999'));
  const projects=(state.data.projects||[]).filter(p=>p.goalId===id),actions=(state.data.actions||[]).filter(a=>a.goalId===id),notes=(state.data.notes||[]).filter(n=>n.goalId===id),logs=(state.data.dailyLog||[]).filter(x=>x.goalId===id),wins=(state.data.brag||[]).filter(x=>x.goalId===id);
  const openActions=actions.filter(a=>!isDone(a)),goalHours=hoursFor({goalId:id});
  const milestoneHtml=milestones.length?milestones.map(m=>`<div class="goal-milestone"><button class="check" ${m.status==='Complete'?'disabled':''} data-milestone-complete="${esc(m.milestoneId)}" data-goal-id="${esc(id)}"></button><div><strong>${esc(m.milestone)}</strong><div class="meta"><span>${esc(m.status)}</span>${m.targetDate?`<span>Due ${esc(fmtDate(m.targetDate))}</span>`:''}${m.weight?`<span>${esc(m.weight)}% weight</span>`:''}</div></div><button class="link-btn" data-edit-milestone="${esc(m.milestoneId)}" data-goal-id="${esc(id)}">Edit</button></div>`).join(''):empty('No milestones yet.');
  openSheet(g.goal,`<div class="goal-detail-head"><div><div class="meta"><span>${esc(g.goalId)}</span><span>${esc(g.source)}</span>${g.requestedBy?`<span>Requested by ${esc(g.requestedBy)}</span>`:''}${g.reviewPeriod?`<span>${esc(g.reviewPeriod)}</span>`:''}</div><div class="progress large"><div style="width:${pct(g.percentComplete)}%"></div></div><div class="goal-progress-row"><strong>${pct(g.percentComplete)}% complete</strong><span>${esc(g.status)} · ${esc(g.health)} · ${esc(fmtHours(goalHours))} logged${g.targetDate?' · Due '+esc(fmtDate(g.targetDate)):''}</span></div></div><div class="inline-actions"><button class="btn" data-goal-time="${esc(id)}">+ Log Time</button><button class="btn" data-edit-goal="${esc(id)}">Edit Goal</button></div></div>
    ${section('Success Measure','What done looks like.',g.successMeasure?`<div class="goal-measure"><p>${esc(g.successMeasure)}</p><div class="goal-measure-grid"><div><span>Target</span><strong>${esc(g.target||'—')}</strong></div><div><span>Current</span><strong>${esc(g.current||'—')}</strong></div></div></div>`:empty('No success measure yet.'))}
    ${section('Milestones',`${milestones.filter(m=>m.status==='Complete').length} of ${milestones.length} complete`,milestoneHtml,`<button class="link-btn" data-new-milestone="${esc(id)}">+ Milestone</button>`)}
    ${section('Projects',`${projects.length} linked`,projects.length?projects.map(p=>`<button class="linked-button-row" data-goal-open-project="${esc(p.projectId)}"><strong>${esc(p.projectName)}</strong><div class="meta"><span>${esc(p.status)}</span>${p.targetDate?`<span>Due ${esc(fmtDate(p.targetDate))}</span>`:''}</div></button>`).join(''):empty('No projects linked.'),`<button class="link-btn" data-goal-project="${esc(id)}">+ Project</button>`)}
    ${section('Actions',`${openActions.length} open · ${actions.length} total`,actions.length?actionRows(actions.slice(0,12)):empty('No actions linked.'),`<button class="link-btn" data-goal-action="${esc(id)}">+ Action</button>`)}
    ${section('Evidence / Wins',`${wins.length} Brag Sheet entries`,wins.length?wins.slice(0,8).map(w=>linkedRow(w.accomplishment,`<span>${esc(fmtDate(w.date))}</span>${w.metric?`<span>${esc(w.metric)}</span>`:''}`)).join(''):empty('No wins linked yet.'),`<button class="link-btn" data-goal-win="${esc(id)}">+ Win</button>`)}
    ${section('Notes & History',`${notes.length} notes · ${logs.length} daily-log entries`,`${notes.slice(0,5).map(n=>linkedRow(n.title||n.note.slice(0,80),`<span>Note</span><span>${esc(fmtDate(n.date))}</span>`)).join('')}${logs.slice(0,5).map(l=>linkedRow(l.summary,`<span>${esc(l.type)}</span><span>${esc(fmtDate(l.date))}</span>`)).join('')}`||empty('No linked notes or daily-log entries.'),`<div class="inline-actions"><button class="link-btn" data-goal-note="${esc(id)}">+ Note</button><button class="link-btn" data-goal-log="${esc(id)}">+ Log Entry</button></div>`)}
    ${g.notes?section('Goal Notes','Context',`<div class="note-text">${esc(g.notes).replace(/\n/g,'<br>')}</div>`):''}`);
  $('.sheet-panel')?.classList.add('wide');
  bindSheet();
  $('[data-edit-goal]')?.addEventListener('click',()=>openGoalForm(g));$('[data-new-milestone]')?.addEventListener('click',()=>openMilestoneForm(id));
  $('[data-goal-time]')?.addEventListener('click',()=>openTimeForm({goalId:id,description:g.goal}));
  $$('[data-edit-milestone]').forEach(b=>b.onclick=()=>openMilestoneForm(id,milestones.find(m=>m.milestoneId===b.dataset.editMilestone)||{}));
  $$('[data-milestone-complete]').forEach(b=>{if(!b.disabled)b.onclick=()=>busy(bridge.call('setGoalMilestoneStatus',b.dataset.milestoneComplete,'Complete'),'Milestone complete').then(()=>openGoalDetail(id))});
  $('[data-goal-action]')?.addEventListener('click',()=>openAction({goalId:id}));$('[data-goal-project]')?.addEventListener('click',()=>openProjectForm({goalId:id}));$('[data-goal-note]')?.addEventListener('click',()=>openNoteForm({goalId:id}));$('[data-goal-log]')?.addEventListener('click',()=>openDailyForm({goalId:id}));$('[data-goal-win]')?.addEventListener('click',()=>openBragForm({goalId:id}));
  $$('[data-goal-open-project]').forEach(b=>b.onclick=()=>openProjectDetail(b.dataset.goalOpenProject));
  $$('[data-edit-id]').forEach(b=>b.onclick=()=>openAction((state.data.actions||[]).find(a=>String(a.actionId||a.row)===String(b.dataset.editId))||{}));
  $$('[data-complete-id]').forEach(b=>b.onclick=()=>{const a=actionById(b.dataset.completeId);if(a)openCompleteAction(a,()=>openGoalDetail(id))});
}

async function openProjectDetail(id){try{const d=await bridge.call('getProjectDetail',id),p=d.project||{},projectHours=hoursFor({projectId:p.projectId||id});openSheet(p.projectName||id,`<div class="project-detail-tools"><div class="meta"><span>${esc(p.projectId||id)}</span>${p.goalId?`<span>◎ ${esc(goalName(p.goalId)||p.goalId)}</span>`:''}<span>${esc(fmtHours(projectHours))} logged</span></div><div class="inline-actions"><button class="btn" data-project-time="${esc(p.projectId||id)}">+ Log Time</button><button class="btn" data-edit-project="${esc(p.projectId||id)}">Edit Project</button>${canManage37('deleteProjects')?`<button class="btn danger" data-delete-project-detail="${esc(p.projectId||id)}">Delete Project</button>`:''}</div></div><div class="kpis">${kpi('HEALTH',p.health||'—','')}${kpi('OPEN ACTIONS',(d.actions||[]).filter(a=>a.status!=='Complete').length,'')}${kpi('HOURS',fmtHours(projectHours),'Logged effort')}${kpi('EXPECTED SAVINGS',p.expectedSavings||'$0','')}</div>${section('Project Actions','Connected to the project workbook.',(d.actions||[]).length?(d.actions||[]).map(a=>`<div class="log-row"><strong>${esc(a.item||a.id)}</strong><div class="meta"><span>${esc(a.resp||'')}</span><span>${esc(a.currentDue||'')}</span><span>${esc(a.status||'Open')}</span></div></div>`).join(''):empty('No project actions.'))}${section('RAID','Risks, assumptions, issues and decisions.',(d.raid||[]).length?(d.raid||[]).map(r=>`<div class="log-row"><strong>${esc(r.type||'RAID')} · ${esc(r.id||'')}</strong><div>${esc(r.description||'')}</div></div>`).join(''):empty('No RAID items.'))}${p.workbookUrl?`<a class="btn primary" href="${esc(p.workbookUrl)}" target="_blank" rel="noopener">Open Workbook ↗</a>`:''}`);$('.sheet-panel')?.classList.add('wide');bindSheet();$('[data-edit-project]')?.addEventListener('click',()=>openProjectForm(p));$('[data-project-time]')?.addEventListener('click',()=>openTimeForm({projectId:p.projectId||id,goalId:p.goalId||'',description:p.projectName||id}));$('[data-delete-project-detail]')?.addEventListener('click',()=>deleteProject37(p.projectId||id));}catch(e){toast(e.message)}}

async function refresh(){state.data=await bridge.call('getBootstrap');render();}
async function boot(){
  const savedUrl=(window.SM_CONFIG||{}).apiUrl || localStorage.getItem('sm_api_url') || '';
  const savedKey=localStorage.getItem('sm_api_key') || '';
  if(!savedUrl || !savedKey){
    $('#boot').classList.add('hidden');$('#setup').classList.remove('hidden');
    $('#setupUrl').value=savedUrl;
    $('#setupForm').onsubmit=async e=>{
      e.preventDefault();
      const url=$('#setupUrl').value.trim(),key=$('#setupKey').value.trim();
      if(!url||!key)return;
      localStorage.setItem('sm_api_url',url);localStorage.setItem('sm_api_key',key);
      location.reload();
    };
    return;
  }
  try{
    bridge=new ApiClient(savedUrl,savedKey);
    state.data=await bridge.call('getBootstrap');
    $('#boot').classList.add('hidden');$('#app').classList.remove('hidden');render();
  }catch(e){
    $('#boot').innerHTML=`<div class="setup-card"><h2>Could not connect</h2><p>${esc(e.message)}</p><button id="resetConn" class="btn">Reset connection</button></div>`;
    setTimeout(()=>{$('#resetConn')?.addEventListener('click',()=>{localStorage.removeItem('sm_api_url');localStorage.removeItem('sm_api_key');location.reload()})},0);
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-route]');if(b)setRoute(b.dataset.route);
  const bn=e.target.closest('[data-bottom]');if(bn){bn.dataset.bottom==='more'?renderMoreSheet():setRoute(bn.dataset.bottom)}
});
$('#headerAdd').onclick=()=>openAction();$('#fab').onclick=()=>openAction();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
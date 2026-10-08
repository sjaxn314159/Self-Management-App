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
  ['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['goals','◎','Goals'],['projects','▣','Projects'],
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
      const timer=setTimeout(()=>done(new Error('API request timed out.')),20000);
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
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,450));
      const tx=await this.jsonp('txn',{requestId});
      if(tx && tx.status==='ok')return tx;
      if(tx && tx.status==='error')throw new Error(tx.error||'Write failed.');
    }
    throw new Error('The write could not be verified. Refresh before retrying.');
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
function busy(promise,msg='Saved'){return promise.then(async r=>{toast(msg);await refresh();return r}).catch(e=>{toast(e.message);throw e});}

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

function setRoute(route){state.route=route;render();window.scrollTo(0,0);}
function routeMeta(){
  const m={today:['COMMAND CENTER','Today'],actions:['EXECUTION','Action Items'],calendar:['TIME HORIZON','Calendar'],goals:['OUTCOMES','Goals'],projects:['PORTFOLIO','Projects'],notes:['REFERENCE','Notes'],routines:['RHYTHM','Routines'],daily:['SYSTEM OF RECORD','Daily Log'],brag:['WINS','Brag Sheet']};
  return m[state.route]||m.today;
}
function renderNav(){
  $('#sideNav').innerHTML=nav.map(([r,i,l])=>`<button class="nav-btn ${state.route===r?'active':''}" data-route="${r}"><span class="nav-ico">${i}</span>${l}</button>`).join('');
  const bottom=[['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['more','•••','More']];
  $('#bottomNav').innerHTML=bottom.map(([r,i,l])=>`<button class="${(r==='more'?['goals','projects','notes','routines','daily','brag'].includes(state.route):state.route===r)?'active':''}" data-bottom="${r}"><span class="ico">${i}</span><span>${l}</span></button>`).join('');
}
function render(){
  const [eye,title]=routeMeta();$('#eyebrow').textContent=eye;$('#pageTitle').textContent=title;$('#pageDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  renderNav();
  const v=$('#view');
  if(state.route==='today')v.innerHTML=renderToday();
  if(state.route==='actions')v.innerHTML=renderActions();
  if(state.route==='calendar')v.innerHTML=renderCalendar();
  if(state.route==='goals')v.innerHTML=renderGoals();
  if(state.route==='notes')v.innerHTML=renderNotes();
  if(state.route==='routines')v.innerHTML=renderRoutines();
  if(state.route==='daily')v.innerHTML=renderDaily();
  if(state.route==='brag')v.innerHTML=renderBrag();
  if(state.route==='projects')v.innerHTML=renderProjects();
  bindView();
}

function renderToday(){
  const actions=(state.data.actions||[]),open=actions.filter(a=>!isDone(a)),today=todayIso(),due=open.filter(a=>a.dueDate===today),over=open.filter(a=>a.dueDate&&a.dueDate<today),routines=routinesForDate(new Date());
  const priority=[...over,...due,...open.filter(a=>!a.dueDate||a.dueDate>today)].filter((a,i,arr)=>arr.findIndex(x=>x.row===a.row)===i).slice(0,4);
  const soon=open.filter(a=>a.dueDate&&a.dueDate>today&&a.dueDate<=iso(addDays(new Date(),7))).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,5);
  return `<div class="kpis">${kpi('OPEN ACTIONS',open.length,'Not yet done')}${kpi('DUE TODAY',due.length,'Actions due today')}${kpi('OVERDUE',over.length,'Needs attention')}${kpi('ROUTINES TODAY',routines.filter(r=>!r.done).length,'Self-management cadence')}</div>
    ${section('Priority Actions','Overdue and due-today items first.',priority.length?actionRows(priority):empty('Nothing urgent right now.'),'<button class="link-btn" data-route="actions">View all →</button>')}
    ${section('Quick Capture','Get it out of your head before your brain starts a side quest.',`<div class="quick"><input id="quickInput" class="field" placeholder="New action, idea, follow-up…"><button id="quickBtn" class="btn primary">Capture</button></div>`)}
    ${section("Today's Routines",'Repeating tasks from the Self Management Plan.',routineRows(routines),'<button class="link-btn" data-route="routines">All routines →</button>')}
    ${section('Coming Up','Next seven days.',soon.length?actionRows(soon):empty('No dated actions in the next seven days.'))}`;
}
function kpi(label,value,sub){return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;}
function section(title,sub,body,extra=''){return `<div class="card"><div class="card-head"><div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${extra}</div><div class="card-body">${body}</div></div>`;}
function empty(t){return `<div class="empty">${esc(t)}</div>`;}
function actionRows(list){return list.map(a=>`<div class="action-row"><button class="check" data-complete-id="${esc(a.actionId||a.row)}" aria-label="Complete"></button><div class="action-main"><strong>${esc(a.task)}</strong><div class="meta"><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span>${a.category?`<span>${esc(a.category)}</span>`:''}${a.dueDate?`<span>${esc(fmtDate(a.dueDate))}</span>`:''}${recurrenceLabel(a)?`<span>↻ ${esc(recurrenceLabel(a))}</span>`:''}${a.goalId?`<span class="goal-link">◎ ${esc(goalName(a.goalId)||a.goalId)}</span>`:''}</div></div><div class="row-actions"><button class="link-btn" data-edit-id="${esc(a.actionId||a.row)}">Edit</button></div></div>`).join('');}
function routineRows(list){if(!list.length)return empty('No routines due.');return list.map(r=>`<div class="action-row"><button class="check" ${r.done?'disabled':''} data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}" aria-label="Complete routine"></button><div class="action-main"><strong>${esc(r.task)}</strong><div class="meta"><span class="pill">${esc(r.frequency)}</span><span>${r.done?'Completed':'Due'}</span></div></div><div class="row-actions">${r.done?'✓':`<button class="btn" data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}">Complete</button>`}</div></div>`).join('');}

function renderActions(){
  const rows=(state.data.actions||[]).slice().sort((a,b)=>((isDone(a)?1:0)-(isDone(b)?1:0))||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  return `<div class="filters"><input class="field search" id="actionSearch" placeholder="Search actions…"><select id="statusFilter"><option>All Statuses</option>${state.data.app.statuses.map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="priorityFilter"><option>All Priorities</option>${state.data.app.priorities.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
  <div class="card"><table class="action-table"><thead><tr><th>Action</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="actionBody">${actionTableRows(rows)}</tbody></table></div>`;
}
function actionTableRows(rows){return rows.map(a=>`<tr data-search="${esc((a.task+' '+a.notes+' '+a.category+' '+goalName(a.goalId)).toLowerCase())}" data-status="${esc(a.status)}" data-priority="${esc(a.priority)}"><td class="task-cell"><strong>${esc(a.task)}</strong><span>${esc(a.notes||a.category||'')}${a.goalId?' · Goal: '+esc(goalName(a.goalId)||a.goalId):''}</span></td><td><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span></td><td>${a.dueDate?esc(fmtDate(a.dueDate)):'—'}</td><td>${esc(a.status)}</td><td><button class="link-btn" data-edit-id="${esc(a.actionId||a.row)}">Edit</button></td></tr>`).join('');}

function renderCalendar(){
  const mode=state.calendarMode, title=calendarTitle();
  return `<div class="card"><div class="card-head calendar-toolbar"><div><h3>${esc(title)}</h3><p>Actions + recurring routines</p></div><div class="seg"><button data-cal-mode="month" class="${mode==='month'?'active':''}">Month</button><button data-cal-mode="week" class="${mode==='week'?'active':''}">Week</button><button data-cal-mode="day" class="${mode==='day'?'active':''}">Day</button></div><div class="cal-nav"><button class="btn" data-cal-nav="-1">‹</button><button class="btn" data-cal-today>Today</button><button class="btn" data-cal-nav="1">›</button></div></div><div class="card-body">${mode==='month'?renderMonth():mode==='week'?renderWeek():renderDay()}</div></div>`;
}
function calendarTitle(){const d=state.cursor;if(state.calendarMode==='month')return d.toLocaleDateString(undefined,{month:'long',year:'numeric'});if(state.calendarMode==='day')return d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});const s=startWeek(d),e=addDays(s,6);return `${fmtDate(s,{month:'short',day:'numeric'})} – ${fmtDate(e,{month:'short',day:'numeric',year:'numeric'})}`;}
function renderMonth(){const d=state.cursor,first=new Date(d.getFullYear(),d.getMonth(),1,12),start=startWeek(first),cells=[];for(let i=0;i<42;i++){const x=addDays(start,i),acts=actionsForDate(x),r=routinesForDate(x),other=x.getMonth()!==d.getMonth(),today=iso(x)===todayIso();cells.push(`<div class="cal-cell calendar-month ${other?'other-month':''} ${(acts.length||r.length)?'has-items':''} ${today?'today-cell':''}"><div class="cal-day ${today?'today':''}"><span>${x.getDate()}</span> <small>${x.toLocaleDateString(undefined,{weekday:'short'})}</small></div>${acts.slice(0,2).map(a=>`<div class="cal-event">${esc(a.task)}</div>`).join('')}${r.length?`<div class="cal-routine">${r.length} routine${r.length===1?'':'s'} · ${r.filter(y=>y.done).length} done</div>`:''}</div>`)}return `<div class="cal-grid">${cells.join('')}</div>`;}
function renderWeek(){const s=startWeek(state.cursor);return `<div class="week-grid">${Array.from({length:7},(_,i)=>{const d=addDays(s,i),a=actionsForDate(d),r=routinesForDate(d);return `<div class="week-day"><h4>${d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</h4>${a.map(x=>`<div class="cal-event">${esc(x.task)}</div>`).join('')||'<div class="muted">No actions</div>'}${r.length?`<div class="cal-routine">${r.length} routines · ${r.filter(x=>x.done).length} done</div>`:''}</div>`}).join('')}</div>`;}
function renderDay(){const d=state.cursor,a=actionsForDate(d),r=routinesForDate(d);return `<div class="day-list">${a.length?`<h3>Actions</h3>${a.map(x=>`<div class="agenda-item"><strong>${esc(x.task)}</strong><div class="meta"><span class="pill ${priorityClass(x.priority)}">${esc(x.priority)}</span><span>${esc(x.status)}</span></div><button class="link-btn" data-edit-id="${esc(x.actionId||x.row)}">Edit</button></div>`).join('')}`:''}${r.length?`<h3>Routines</h3>${routineRows(r)}`:''}${!a.length&&!r.length?empty('Clear day.') :''}</div>`;}



const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  data:null,
  route:'today',
  calendarMode: innerWidth < 801 ? 'day' : 'week',
  cursor:new Date(),
  selectedProject:null
};

const nav = [
  ['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['routines','↻','Routines'],
  ['daily','▤','Daily Log'],['brag','☆','Brag Sheet'],['projects','▣','Projects']
];

class ApiClient {
  constructor(url,key){this.url=url;this.key=key;this.seq=1;}
  jsonp(action, params={}){
    return new Promise((resolve,reject)=>{
      const cb='__smcb'+Date.now()+'_'+(this.seq++);
      const q=new URLSearchParams({action,key:this.key,callback:cb,...params});
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
    await fetch(this.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({key:this.key,action,args})});
    return true;
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

function setRoute(route){state.route=route;render();window.scrollTo(0,0);}
function routeMeta(){
  const m={today:['COMMAND CENTER','Today'],actions:['EXECUTION','Action Items'],calendar:['TIME HORIZON','Calendar'],routines:['RHYTHM','Routines'],daily:['SYSTEM OF RECORD','Daily Log'],brag:['WINS','Brag Sheet'],projects:['PORTFOLIO','Projects']};
  return m[state.route]||m.today;
}
function renderNav(){
  $('#sideNav').innerHTML=nav.map(([r,i,l])=>`<button class="nav-btn ${state.route===r?'active':''}" data-route="${r}"><span class="nav-ico">${i}</span>${l}</button>`).join('');
  const bottom=[['today','⌂','Today'],['actions','☑','Actions'],['calendar','▣','Calendar'],['more','•••','More']];
  $('#bottomNav').innerHTML=bottom.map(([r,i,l])=>`<button class="${(r==='more'?['routines','daily','brag','projects'].includes(state.route):state.route===r)?'active':''}" data-bottom="${r}"><span class="ico">${i}</span><span>${l}</span></button>`).join('');
}
function render(){
  const [eye,title]=routeMeta();$('#eyebrow').textContent=eye;$('#pageTitle').textContent=title;$('#pageDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  renderNav();
  const v=$('#view');
  if(state.route==='today')v.innerHTML=renderToday();
  if(state.route==='actions')v.innerHTML=renderActions();
  if(state.route==='calendar')v.innerHTML=renderCalendar();
  if(state.route==='routines')v.innerHTML=renderRoutines();
  if(state.route==='daily')v.innerHTML=renderDaily();
  if(state.route==='brag')v.innerHTML=renderBrag();
  if(state.route==='projects')v.innerHTML=renderProjects();
  bindView();
}

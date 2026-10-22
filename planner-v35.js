/* V3.5 early-access planning pane: local-first until Apps Script schedule persistence exists.
   Leaves action editing, existing save verification and all backend calls unchanged. */
(function(){
'use strict';
const KEY='self-management-v35-blocks';
const S=()=>window.SelfManagementScheduler;
const $=q=>document.querySelector(q);
const id=a=>String(a.actionId||a.row||'');
const h=a=>Math.max(0,Math.round(Number(a.estimatedHours||0)*60));
const date=d=>{const x=new Date(d);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};
const local=d=>date(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const pretty=d=>new Date(d).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const initial=()=>({blocks:[],estimates:{},completed:{},workStart:9,workEnd:17});
let p;try{p=Object.assign(initial(),JSON.parse(localStorage.getItem(KEY))||{})}catch{p=initial()}
let selected=date(new Date()), mode='day';
const persist=()=>{localStorage.setItem(KEY,JSON.stringify(p));draw()};
const actions=()=>((window.state&&state.data&&state.data.actions)||[]).filter(a=>String(a.status).toLowerCase()!=='done');
const tasks=()=>actions().map(a=>({actionId:id(a),task:a.task,priority:a.priority,dueDate:a.dueDate,status:a.status,estimatedMinutes:p.estimates[id(a)]??h(a),completedMinutes:p.completed[id(a)]||0}));
const blocks=()=>p.blocks.filter(b=>actions().some(a=>id(a)===b.actionId)||b.kind==='meeting'||b.kind==='prep');
const remainingMinutes=a=>{const t=tasks().find(x=>x.actionId===id(a));return Math.max(0,(t?.estimatedMinutes||0)-(t?.completedMinutes||0))};
const horizon=()=>Array.from({length:35},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);const iso=date(d);return {iso,day:d.getDay()}}).filter(x=>x.day>0&&x.day<6).map(x=>({start:x.iso+'T'+String(p.workStart).padStart(2,'0')+':00',end:x.iso+'T'+String(p.workEnd).padStart(2,'0')+':00'}));
const agenda=()=>blocks().filter(b=>b.start.slice(0,10)===selected).sort((a,b)=>a.start.localeCompare(b.start));
const dueQueue=()=>S().needsScheduling(tasks(),blocks(),new Date()).filter(x=>x.estimatedMinutes>0);
const style=`<style id="v35style">
.v35now{padding:18px;background:#152d4b;color:#fff;border-radius:14px;margin:0 0 15px}.v35now .label{letter-spacing:.13em;font-size:11px;opacity:.8}.v35now strong{font-size:24px;display:block;margin:5px 0}.v35layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:15px}.v35panel{border:1px solid #dce2ec;border-radius:14px;background:white;padding:14px}.v35toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}.v35timeline{display:grid;grid-template-columns:55px minmax(0,1fr)}.v35clock{height:60px;border-top:1px solid #e1e7ef;color:#617188;font-size:12px;padding-top:3px}.v35track{position:relative;min-height:480px;background:repeating-linear-gradient(to bottom,#dde5ec 0px,#fff 1px,#fff 60px)}.v35event{position:absolute;left:5px;right:5px;text-align:left;overflow:hidden;background:#dbeaff;border:0;border-left:5px solid #3772ad;border-radius:7px;padding:5px 8px;cursor:pointer;color:#1a3756}.v35event.manual{background:#dff0e9;border-color:#298b6a}.v35event.prep{background:#fff0d7;border-color:#ba852e}.v35event.meeting{background:#eee3f6;border-color:#8753b1}.v35queueitem{border-top:1px solid #e1e6eb;padding:11px 0}.v35queueitem strong{display:block}.v35queueitem small{display:block;color:#64748b;margin:5px 0}.v35muted{color:#64748b;font-size:12px}.v35warning{padding:10px;border-radius:8px;background:#fff1d6;color:#734b0f}.v35pending{font-weight:650;color:#a4530b}.v35btn{border:1px solid #ccd5df;background:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;margin:3px}.v35btn.primary{background:#285e99;color:white;border-color:#285e99}.v35month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.v35date{border:1px solid #e2e8f0;background:#fff;padding:7px 3px;min-height:60px;cursor:pointer;overflow:hidden}.v35date.active{outline:2px solid #285e99}.v35week{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.v35day{padding:8px;border:1px solid #ddd;border-radius:8px;cursor:pointer}.v35day.active{background:#e5f0fa}.v35buttonrow{display:flex;gap:6px;flex-wrap:wrap}@media(max-width:850px){.v35layout{grid-template-columns:1fr}.v35week{grid-template-columns:repeat(5,minmax(0,1fr))}}
</style>`;
function auto(){const result=S().autoSchedule({tasks:tasks().filter(t=>t.estimatedMinutes>0),blocks:blocks(),workWindows:horizon(),now:new Date(),minimumBlockMinutes:15});p.blocks=result.blocks;persist();if(result.unscheduled.length)window.toast?.(result.unscheduled.length+' tasks still need time');}
function reslot(b){
 const what=prompt('Type one: COMPLETE, MORE, UNSCHEDULE, NEXT WEEK, MOVE','MORE');if(!what)return;
 const op=what.trim().toUpperCase();if(['UNSCHEDULE','NEXT WEEK','MOVE','MORE','COMPLETE'].includes(op)===false)return;
 if(op==='COMPLETE'){if(!confirm('Is the whole action completed?'))return;const a=actions().find(x=>id(x)===b.actionId);if(a){window.openCompleteAction?.(a)}return}
 const idx=p.blocks.indexOf(b);if(idx<0)return;
 if(op==='MORE'){const a=actions().find(x=>id(x)===b.actionId);if(!a)return;
   const n=Number(prompt('How many hours of work remain?',String(remainingMinutes(a)/60)));if(!Number.isFinite(n)||n<0)return;
   // Record spent scheduled time as completed effort; remaining amount is authoritative.
   p.estimates[id(a)]=Math.round(n*60)+(p.completed[id(a)]||0);
   p.blocks.splice(idx,1);persist();return;
 }
 if(op==='UNSCHEDULE'){p.blocks.splice(idx,1);persist();return}
 let start;
 if(op==='NEXT WEEK'){start=new Date(b.start);start.setDate(start.getDate()+7)}
 else {const input=prompt('New local start time, YYYY-MM-DDTHH:MM',b.start);if(!input||isNaN(new Date(input).getTime()))return;start=new Date(input)}
 const mins=(new Date(b.end)-new Date(b.start))/60000;
 const shifted={...b,start:local(start),end:local(new Date(start.getTime()+mins*60000)),kind:'manual'};
 p.blocks.splice(idx,1,shifted);persist();
}
function draw(){
 const root=$('#v35root');if(!root)return;
 const t=tasks(),future=blocks().filter(b=>new Date(b.end)>new Date()&&b.kind!=='meeting'&&b.kind!=='prep').sort((a,b)=>a.start.localeCompare(b.start)),first=future[0];
 const now=first?t.find(x=>x.actionId===first.actionId)?.task||'Action':'No scheduled action';
 root.innerHTML=style+`<div class="v35now"><div class="label">NOW / UP NEXT</div><strong>${window.esc(now)}</strong><div>${first?window.esc(pretty(first.start)+' – '+pretty(first.end)):'Choose Auto-Schedule to plan your work'}</div></div>
 <div class="v35layout"><div class="v35panel"><div class="v35toolbar"><button class="v35btn" id="v35prev">←</button><strong id="v35date"></strong><button class="v35btn" id="v35next">→</button><button class="v35btn" id="v35today">Today</button><button class="v35btn" data-view="day">Day</button><button class="v35btn" data-view="week">Week</button><button class="v35btn" data-view="month">Month</button></div><div id="v35calendar"></div></div>
 <aside class="v35panel"><h3>Needs Scheduling</h3><div class="v35muted">Due in 30 days; actions without an estimate need one before they can be placed.</div><button class="v35btn primary" id="v35auto">Auto-Schedule</button><div id="v35queue"></div><div class="v35warning">Early access: scheduled blocks stay on this device only. Outlook meetings are NOT synchronized. Enter fixed commitments manually here until sync is enabled.</div><button class="v35btn" id="v35meeting">+ Fixed meeting / prep</button></aside></div>`;
 $('#v35date').textContent=new Date(selected+'T12:00').toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
 const area=$('#v35calendar');
 if(mode==='month'){const first=new Date(selected+'T12:00');first.setDate(1);const cells=[];for(let i=0;i<35;i++){const d=new Date(first);d.setDate(1+i-first.getDay());const ds=date(d),count=blocks().filter(b=>b.start.slice(0,10)===ds).length;cells.push(`<button class="v35date ${ds===selected?'active':''}" data-day="${ds}"><b>${d.getDate()}</b><br><small>${count} blocks</small></button>`)}area.innerHTML='<div class="v35month">'+cells.join('')+'</div>'}
 else if(mode==='week'){const d=new Date(selected+'T12:00');const weekday=d.getDay();d.setDate(d.getDate()-((weekday+6)%7));area.innerHTML='<div class="v35week">'+Array.from({length:5},(_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);const ds=date(x);return `<button class="v35day ${selected===ds?'active':''}" data-day="${ds}"><strong>${x.toLocaleDateString([],{weekday:'short',day:'numeric'})}</strong><small><br>${blocks().filter(b=>b.start.slice(0,10)===ds).length} blocks</small></button>`}).join('')+'</div>'}
 else {area.innerHTML='<div class="v35timeline"><div>'+Array.from({length:8},(_,i)=>'<div class="v35clock">'+(i+9>12?i-3:i+9)+(i<3?' AM':' PM')+'</div>').join('')+'</div><div id="v35track" class="v35track"></div></div>';const track=$('#v35track');agenda().forEach(b=>{const s=new Date(b.start),e=new Date(b.end),y=(s.getHours()-9)*60+s.getMinutes(),height=(e-s)/60000;if(y>=480||y+height<=0)return;const btn=document.createElement('button');btn.className='v35event '+b.kind;btn.style.top=Math.max(0,y)+'px';btn.style.height=Math.max(17,Math.min(height,480-Math.max(0,y)))+'px';btn.textContent=pretty(b.start)+' · '+(b.title||t.find(x=>x.actionId===b.actionId)?.task||'Task');btn.onclick=()=>b.kind==='meeting'||b.kind==='prep'?alert('Protected commitment. Edit meeting imports manually for now.'):reslot(b);track.append(btn)})}
 area.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.day;mode='day';draw()});
 const q=dueQueue(),list=$('#v35queue');if(!q.length)list.innerHTML='<p class="v35muted">No estimated tasks awaiting scheduling.</p>';
 q.forEach(a=>{const div=document.createElement('div');div.className='v35queueitem';const title=document.createElement('strong');title.textContent=a.task;const sub=document.createElement('small');sub.textContent=(a.unscheduledMinutes/60).toFixed(2)+' h needed · due '+(a.dueDate||'not set');const btn=document.createElement('button');btn.className='v35btn';btn.textContent='Schedule';btn.onclick=auto;div.append(title,sub,btn);list.append(div)});
 const unestimated=actions().filter(a=>h(a)===0&&p.estimates[id(a)]==null);unestimated.slice(0,12).forEach(a=>{const div=document.createElement('div');div.className='v35queueitem';const label=document.createElement('strong');label.textContent=a.task;const btn=document.createElement('button');btn.className='v35btn';btn.textContent='+ Estimate';btn.onclick=()=>{const n=Number(prompt('Estimated hours?', '1'));if(!Number.isFinite(n)||n<=0)return;p.estimates[id(a)]=Math.round(n*60);persist()};div.append(label,btn);list.append(div)});
 $('#v35auto').onclick=auto;
 $('#v35meeting').onclick=()=>{const title=prompt('Meeting or preparation name');if(!title)return;const start=prompt('Start (YYYY-MM-DDTHH:MM)',selected+'T10:00');if(!start||isNaN(new Date(start).getTime()))return;const n=Number(prompt('Duration in minutes','30'));if(!(n>0))return;const kind=confirm('Is this protected meeting preparation? OK = prep, Cancel = meeting')?'prep':'meeting';p.blocks.push({title,kind,start,end:local(new Date(new Date(start).getTime()+n*60000))});persist()};
 $('#v35today').onclick=()=>{selected=date(new Date());draw()};
 $('#v35prev').onclick=()=>{const d=new Date(selected+'T12:00');if(mode==='month')d.setMonth(d.getMonth()-1);else d.setDate(d.getDate()-(mode==='week'?7:1));selected=date(d);draw()};
 $('#v35next').onclick=()=>{const d=new Date(selected+'T12:00');if(mode==='month')d.setMonth(d.getMonth()+1);else d.setDate(d.getDate()+(mode==='week'?7:1));selected=date(d);draw()};
 root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{mode=b.dataset.view;draw()});
}
window.V35Planner={render:()=>'<div id="v35root"></div>',draw,version:'early-access-local'};
const original=window.renderToday;
if(typeof original==='function'){window.renderToday=function(){return window.V35Planner.render()+'<details style="margin-top:15px"><summary>Previous Today dashboard</summary>'+original()+'</details>'}}
const bind=window.bindView;
if(typeof bind==='function'){window.bindView=function(){bind();if(typeof state!=='undefined'&&state.route==='today')draw()}}
})();
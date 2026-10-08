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
function actionRows(list){return list.map(a=>`<div class="action-row"><button class="check" data-complete-row="${a.row}" aria-label="Complete"></button><div class="action-main"><strong>${esc(a.task)}</strong><div class="meta"><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span>${a.category?`<span>${esc(a.category)}</span>`:''}${a.dueDate?`<span>${esc(fmtDate(a.dueDate))}</span>`:''}${recurrenceLabel(a)?`<span>↻ ${esc(recurrenceLabel(a))}</span>`:''}</div></div><div class="row-actions"><button class="link-btn" data-edit-row="${a.row}">Edit</button></div></div>`).join('');}
function routineRows(list){if(!list.length)return empty('No routines due.');return list.map(r=>`<div class="action-row"><button class="check" ${r.done?'disabled':''} data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}" aria-label="Complete routine"></button><div class="action-main"><strong>${esc(r.task)}</strong><div class="meta"><span class="pill">${esc(r.frequency)}</span><span>${r.done?'Completed':'Due'}</span></div></div><div class="row-actions">${r.done?'✓':`<button class="btn" data-routine-id="${esc(r.id)}" data-routine-date="${r.dueDate}">Complete</button>`}</div></div>`).join('');}

function renderActions(){
  const rows=(state.data.actions||[]).slice().sort((a,b)=>((isDone(a)?1:0)-(isDone(b)?1:0))||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  return `<div class="filters"><input class="field search" id="actionSearch" placeholder="Search actions…"><select id="statusFilter"><option>All Statuses</option>${state.data.app.statuses.map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="priorityFilter"><option>All Priorities</option>${state.data.app.priorities.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
  <div class="card"><table class="action-table"><thead><tr><th>Action</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="actionBody">${actionTableRows(rows)}</tbody></table></div>`;
}
function actionTableRows(rows){return rows.map(a=>`<tr data-search="${esc((a.task+' '+a.notes+' '+a.category).toLowerCase())}" data-status="${esc(a.status)}" data-priority="${esc(a.priority)}"><td class="task-cell"><strong>${esc(a.task)}</strong><span>${esc(a.notes||a.category||'')}</span></td><td><span class="pill ${priorityClass(a.priority)}">${esc(a.priority)}</span></td><td>${a.dueDate?esc(fmtDate(a.dueDate)):'—'}</td><td>${esc(a.status)}</td><td><button class="link-btn" data-edit-row="${a.row}">Edit</button></td></tr>`).join('');}


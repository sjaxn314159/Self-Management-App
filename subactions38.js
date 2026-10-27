/* Atlas Command V3.8 — Google Sheets-backed sub-action checklists.
   Uses the existing authenticated saveNote/getBootstrap API; no backend change.
   One tagged Notes record per Action ID. Recurring occurrences inherit an
   unchecked copy of the most recent prior checklist in their series. */
(function () {
  "use strict";
  const TAG = "ATLAS38-SUBACTIONS";
  const SCHEMA = 1;
  const $one = (root, selector) => root.querySelector(selector);
  const $all = (root, selector) => [...root.querySelectorAll(selector)];
  const actionId = a => String((a && (a.actionId || a.row)) || "");
  const uniqueId = () => (crypto.randomUUID ? crypto.randomUUID() : "SA-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const html = value => esc(value == null ? "" : value);
  function isChecklistNote(n) {
    return String((n && n.tags) || "").split(/[\s,]+/).includes(TAG);
  }
  function decode(n) {
    if (!isChecklistNote(n)) return null;
    try {
      const v = JSON.parse(n.note || "");
      if (!v || !v.actionId || !Array.isArray(v.items)) return null;
      return {
        uid: String(v.uid || ""),
        actionId: String(v.actionId),
        seriesId: String(v.seriesId || ""),
        occurrence: Number(v.occurrence) || 0,
        items: v.items.filter(x => x && String(x.text || "").trim()).map(x => ({
          id: String(x.id || uniqueId()),
          text: String(x.text).trim(),
          done: x.done === true
        }))
      };
    } catch (_) { return null; }
  }
  function findChecklist(a) {
    const id = actionId(a);
    const rows = (state.data && state.data.notes || []).map(n => ({ note: n, data: decode(n) })).filter(x => x.data);
    const exact = rows.find(x => x.data.actionId === id);
    if (exact) return { note: exact.note, data: exact.data, inherited: false };
    const seriesId = String(a.seriesId || "");
    const occurrence = Number(a.occurrence) || 0;
    if (seriesId && occurrence > 1) {
      const prev = rows.filter(x => x.data.seriesId === seriesId && x.data.occurrence > 0 && x.data.occurrence < occurrence)
        .sort((a,b) => b.data.occurrence - a.data.occurrence)[0];
      if (prev) return {
        note: null, inherited: true,
        data: { uid: uniqueId(), actionId: id, seriesId, occurrence,
          items: prev.data.items.map(x => ({id: uniqueId(), text: x.text, done: false})) }
      };
    }
    return { note: null, inherited: false, data: { uid: uniqueId(), actionId: id,
      seriesId: seriesId, occurrence: occurrence, items: [] } };
  }
  function progress(a) {
    if (!a || !actionId(a)) return "";
    const items = findChecklist(a).data.items;
    if (!items.length) return "";
    const done = items.filter(x => x.done).length;
    return '<span class="subactions38-count" title="Sub-actions completed">' + done + '/' + items.length + ' steps</span>';
  }
  function section() {
    return '<div class="form-group full subactions38" id="subactions38">' +
      '<div class="subactions38-heading"><label>Sub-Actions</label><span class="subactions38-progress">0 of 0 complete</span></div>' +
      '<div class="subactions38-track"><div class="subactions38-bar"></div></div>' +
      '<div class="subactions38-list"></div>' +
      '<div class="subactions38-add"><input type="text" class="field" id="subactions38New" placeholder="Add a sub-action..." maxlength="500" autocomplete="off">' +
      '<button type="button" class="btn" id="subactions38Add">+ Add</button></div>' +
      '<p class="subactions38-hint">Checklist items save individually; the main Action stays open until you complete it.</p>' +
      '<p class="subactions38-status" role="status"></p>' +
      '<p class="subactions38-error" role="alert" hidden></p>' +
      '</div>';
  }
  function mount(action) {
    const root = document.getElementById("subactions38");
    if (!root) return null;
    let parent = action || {};
    const match = findChecklist(parent);
    let note = match.note;
    let uid = match.data.uid || uniqueId();
    let items = match.data.items.map(x => ({...x}));
    let busy = false;
    let pending = Promise.resolve();
    let error = "";
    let createdAttempt = false;
    function paint() {
      if (!root.isConnected) return;
      const done = items.filter(x => x.done).length;
      $one(root, ".subactions38-progress").textContent = done + " of " + items.length + " complete";
      $one(root, ".subactions38-bar").style.width = (items.length ? Math.round(done / items.length * 100) : 0) + "%";
      const list = $one(root, ".subactions38-list");
      list.innerHTML = items.map((item, i) => '<div class="subactions38-row">' +
        '<input type="checkbox" data-sa-check="' + i + '" aria-label="Complete sub-action: ' + html(item.text) + '"' + (item.done ? ' checked' : '') + (busy ? ' disabled' : '') + '>' +
        '<input class="field subactions38-text' + (item.done ? ' subactions38-done' : '') + '" type="text" data-sa-text="' + i + '" maxlength="500" value="' + html(item.text) + '"' + (busy ? ' disabled' : '') + ' aria-label="Edit sub-action">' +
        '<div class="subactions38-move"><button type="button" class="subactions38-icon" data-sa-up="' + i + '" ' + (busy || i === 0 ? 'disabled' : '') + ' aria-label="Move up" title="Move up">↑</button>' +
        '<button type="button" class="subactions38-icon" data-sa-down="' + i + '" ' + (busy || i === items.length-1 ? 'disabled' : '') + ' aria-label="Move down" title="Move down">↓</button></div>' +
        '<button type="button" class="subactions38-icon subactions38-remove" data-sa-remove="' + i + '" ' + (busy ? 'disabled' : '') + ' aria-label="Remove sub-action" title="Remove">×</button></div>').join("");
      $one(root, "#subactions38Add").disabled = busy;
      $one(root, "#subactions38New").disabled = busy;
      $one(root, ".subactions38-status").textContent = busy ? "Saving sub-actions…" : (actionId(parent) ? "Changes save automatically." : "Checklist saves when you save this new Action.");
      const errEl = $one(root, ".subactions38-error");
      errEl.hidden = !error;
      errEl.textContent = error;
      $all(root, "[data-sa-check]").forEach(el => el.onchange = () => change(() => {items[Number(el.dataset.saCheck)].done = el.checked;}));
      $all(root, "[data-sa-text]").forEach(el => {
        el.onkeydown = event => {if(event.key === "Enter") {event.preventDefault();el.blur();}};
        el.onchange = () => {
          const value = el.value.trim();
          const i = Number(el.dataset.saText);
          if (!value) {el.value = items[i].text;return;}
          if (items[i].text !== value) change(() => {items[i].text = value;});
        };
      });
      $all(root, "[data-sa-up]").forEach(el => el.onclick = () => change(() => {
        const i = Number(el.dataset.saUp);
        if(i > 0) [items[i-1],items[i]] = [items[i],items[i-1]];
      }));
      $all(root, "[data-sa-down]").forEach(el => el.onclick = () => change(() => {
        const i = Number(el.dataset.saDown);
        if(i < items.length-1) [items[i],items[i+1]] = [items[i+1],items[i]];
      }));
      $all(root, "[data-sa-remove]").forEach(el => el.onclick = () => change(() => {items.splice(Number(el.dataset.saRemove), 1);}));
    }
    async function persist() {
      if (!actionId(parent)) return;
      if (!note && createdAttempt) throw new Error("The first checklist save is unverified. Refresh before retrying to prevent duplicates.");
      const data = {schemaVersion:SCHEMA,uid,actionId:actionId(parent),seriesId:String(parent.seriesId || ""),
        occurrence:Number(parent.occurrence) || 0,items:items.map(x=>({...x}))};
      const encoded = JSON.stringify(data);
      if (encoded.length > 45000) throw new Error("Checklist is too large for a Google Sheets cell.");
      const payload = {noteId:note ? note.noteId : "", date: todayIso(),
        title:"Sub-actions · " + String(parent.task || "Action"), note:encoded, tags:TAG,
        pinned:"No", goalId:String(parent.goalId || ""),projectId:String(parent.projectId || "")};
      if (!note) createdAttempt = true;
      await bridge.call("saveNote",payload);
      if (note) {
        const updated = {...note,...payload,noteId:note.noteId};
        state.data.notes = (state.data.notes || []).map(n => n.noteId === note.noteId ? updated : n);
        note = updated;
      } else {
        const fresh = await bridge.call("getBootstrap");
        const actual = (fresh.notes || []).find(n => {const v=decode(n);return v && v.uid === uid && v.actionId === actionId(parent);});
        if (!actual) throw new Error("Checklist save was acknowledged but its record could not be located. Refresh before retrying.");
        state.data = fresh;
        note = actual;
      }
      render();
    }
    function change(fn) {
      if (busy) return;
      const before = items.map(x=>({...x}));
      fn();
      error = "";
      if (!actionId(parent)) { paint(); return; }
      busy = true; paint();
      pending = (async () => {
        try {await persist();}
        catch (e) {items = before;error = "Sub-action wasn't confirmed: " + (e.message || String(e)) + " Refresh before retrying if the connection was interrupted.";}
        finally {busy = false; paint();}
      })();
    }
    function add() {
      if (busy) return;
      const input = $one(root, "#subactions38New");
      const value = (input.value || "").trim();
      if (!value) return;
      input.value = "";
      change(() => items.push({id:uniqueId(),text:value,done:false}));
      if (!busy) input.focus();
    }
    $one(root, "#subactions38Add").onclick = add;
    $one(root, "#subactions38New").onkeydown = event => {if(event.key === "Enter") {event.preventDefault();add();}};
    paint();
    return {
      async onActionSaved(saved) {
        await pending;
        if (error) throw new Error(error);
        parent = saved;
        // New Actions may contain draft items. Existing checklists autosave on each edit.
        if (!note && items.length) {
          if (createdAttempt) throw new Error("Checklist needs a refresh before retrying; the Action itself was saved.");
          busy = true; paint();
          try { await persist();error=""; }
          catch(e){error = "Action saved, but checklist could not be verified: " + (e.message || String(e));throw new Error(error);}
          finally {busy=false;paint();}
        }
      }
    };
  }
  window.AtlasSubActions38 = { section, mount, progress, isChecklistNote };
})();

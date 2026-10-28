const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
test('Forge Command V3.8.4 assets and cache labels are updated',()=>{
  assert.match(html,/V3\.8\.4/);
  assert.match(html,/app\.js\?v=3\.8\.4/);
});
test('action form includes existing project list and unassigned option',()=>{
  assert.match(app,/function projectOptions37\(/);
  assert.match(app,/state\.data\.projects\|\|\[\]/);
  assert.match(app,/name="projectId"/);
  assert.match(app,/No project/);
});
test('project and action deletes are gated by backend capabilities',()=>{
  assert.match(app,/canManage37\('deleteActions'\)/);
  assert.match(app,/canManage37\('deleteProjects'\)/);
  assert.match(app,/canManage37\('actionProjectLink'\)/);
});
test('action soft delete requires confirmation and verified refresh',()=>{
  assert.match(app,/function deleteAction37\(/);
  assert.match(app,/bridge\.call\('deleteAction',a\.actionId\)/);
  assert.match(app,/Action deletion could not be verified|Deletion could not be verified/);
  assert.match(app,/Original row|original row/);
});
test('project removal preserves workbooks and confirms removal',()=>{
  assert.match(app,/function deleteProject37\(/);
  assert.match(app,/bridge\.call\('deleteProject',p\.projectId\)/);
  assert.match(app,/workbook is preserved/);
  assert.match(app,/Project deletion could not be verified/);
});
test('projects view uses independent buttons, not nested interactive buttons',()=>{
  assert.match(app,/class="project-tile-open37"/);
  assert.match(app,/class="project-tile project-card37"/);
  assert.match(app,/data-delete-project/);
  assert.match(app,/data-delete-action/);
  assert.match(css,/\.danger-link37/);
});

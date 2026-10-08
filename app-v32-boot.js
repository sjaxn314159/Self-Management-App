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

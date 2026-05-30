import React, { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Package, ArrowLeftRight, Users, Wrench, History, Plus, Trash2, Pencil, LogOut, UserCog, RefreshCw, Database, Search } from "lucide-react";

const DB_KEY = "almox_database_v3";
const RECORD_ID = "fosso_aod_villares";
const TABLE_NAME = "almox_database";

// RESET DEFINITIVO DA BASE ONLINE
// Ao alterar esta versão, o sistema descarta dados antigos e cria uma base limpa no Supabase.
const ONLINE_BASE_VERSION = "FOSSO_AOD_ONLINE_LIMPO_V1";

function nowBR(){
  return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
}
function todayISO(){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const g=t=>p.find(x=>x.type===t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function brDate(v){
  if(!v) return "-";
  const [y,m,d]=String(v).split("-");
  if(!y||!m||!d) return v;
  return `${d}/${m}/${String(y).slice(-2)}`;
}
function hash(v){
  let h=0; const s=`TPCONS_${v}`;
  for(let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0;
  return `h_${Math.abs(h)}`;
}

const initialUsers=[
  {id:1,nome:"Andre Paulo",login:"admin",senhaHash:hash("admin1"),perfil:"ADMIN",status:"Ativo"},
  {id:2,nome:"Almoxarife",login:"Almoxarife",senhaHash:hash("fossoaod"),perfil:"EDITOR",status:"Ativo"}
];
const emptyWork={id:1,nomeObra:"CONSTRUÇÃO DO FOSSO AOD",cliente:"VILLARES METALS",status:"Ativa",itemsBase:[],collaborators:[],movements:[]};
function initialDb(){return {version:Date.now(),baseVersion:ONLINE_BASE_VERSION,updatedAt:nowBR(),updatedBy:"Sistema ONLINE",obra:emptyWork,users:initialUsers};}
function getCfg(){return {enabled:localStorage.getItem("almox_supabase_enabled")==="true",url:localStorage.getItem("almox_supabase_url")||"",key:localStorage.getItem("almox_supabase_anon_key")||""};}
function onlineReady(){const c=getCfg(); return !!(c.enabled&&c.url&&c.key);}
function readLocal(){
  const saved=JSON.parse(localStorage.getItem(DB_KEY)||"null");
  if(saved?.obra&&saved?.users) return saved;
  const db=initialDb(); localStorage.setItem(DB_KEY,JSON.stringify(db)); return db;
}
function saveLocal(db){
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
function normalizeDb(db){
  const base=db?.obra?db:initialDb();
  return {
    ...base,
    baseVersion: base.baseVersion || ONLINE_BASE_VERSION,
    obra:{...emptyWork,...(base.obra||{}),itemsBase:base.obra?.itemsBase||[],collaborators:base.obra?.collaborators||[],movements:base.obra?.movements||[]},
    users:(base.users&&base.users.length?base.users:initialUsers)
  };
}
function mergeUniqueById(a=[],b=[]){
  const map=new Map();
  [...a,...b].forEach(x=>{ if(x&&x.id!==undefined&&x.id!==null) map.set(String(x.id),x); });
  return [...map.values()];
}
function mergeDb(localDb,onlineDb){
  if(!onlineDb?.obra) return localDb;
  if(!localDb?.obra) return onlineDb;
  const localObra=localDb.obra||emptyWork;
  const onlineObra=onlineDb.obra||emptyWork;
  const merged={
    ...onlineDb,
    ...localDb,
    version:Date.now(),
    updatedAt:nowBR(),
    updatedBy:"Mesclagem ONLINE",
    users:mergeUniqueById(onlineDb.users||[],localDb.users||[]),
    obra:{
      ...onlineObra,
      ...localObra,
      itemsBase:mergeUniqueById(onlineObra.itemsBase||[],localObra.itemsBase||[]),
      collaborators:mergeUniqueById(onlineObra.collaborators||[],localObra.collaborators||[]),
      movements:mergeUniqueById(onlineObra.movements||[],localObra.movements||[]),
    }
  };
  return merged;
}
function hasLocalData(db){
  const o=db?.obra||{};
  return (o.itemsBase||[]).length>0 || (o.collaborators||[]).length>0 || (o.movements||[]).length>0;
}
async function fetchOnline(){
  if(!onlineReady()) return null;
  const c=getCfg();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const r=await fetch(`${c.url}/rest/v1/${TABLE_NAME}?id=eq.${RECORD_ID}&select=data`,{headers:{apikey:c.key,Authorization:`Bearer ${c.key}`},signal:controller.signal});
    clearTimeout(timer);
    if(!r.ok){
      const txt=await r.text();
      window.__almoxSupabaseError=`Leitura Supabase HTTP ${r.status}: ${txt}`;
      return null;
    }
    const rows=await r.json();
    const data=rows?.[0]?.data||null;
    if(!data) return null;
    window.__almoxSupabaseError="";
    return normalizeDb(data);
  }catch(e){
    clearTimeout(timer);
    window.__almoxSupabaseError="Falha de conexão com Supabase. No preview do ChatGPT/Canvas, chamadas externas podem ser bloqueadas. Publique o sistema em um link real para sincronizar online.";
    return null;
  }
}
async function pushOnline(db){
  if(!onlineReady()){
    window.__almoxSupabaseError = "Supabase não configurado.";
    return false;
  }

  const c=getCfg();
  const clean={...normalizeDb(db),baseVersion:ONLINE_BASE_VERSION,version:Date.now()};
  const headers={
    apikey:c.key,
    Authorization:`Bearer ${c.key}`,
    "Content-Type":"application/json",
    Prefer:"resolution=merge-duplicates,return=representation"
  };

  async function tryRequest(label, body){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(`${c.url}/rest/v1/${TABLE_NAME}?on_conflict=id`,{
        method:"POST",
        headers,
        body:JSON.stringify(body),
        signal:controller.signal
      });
      clearTimeout(timer);
      if(!r.ok){
        const txt=await r.text();
        throw new Error(`${label}: HTTP ${r.status} - ${txt}`);
      }
      return true;
    }catch(e){
      clearTimeout(timer);
      window.__almoxSupabaseError = e?.message || String(e);
      console.error("Erro Supabase", e);
      return false;
    }
  }

  // 1ª tentativa: objeto simples
  let ok=await tryRequest("POST objeto", {id:RECORD_ID,data:clean});
  if(ok) return true;

  // 2ª tentativa: array, aceito em algumas configurações do PostgREST
  ok=await tryRequest("POST array", [{id:RECORD_ID,data:clean}]);
  return ok;
}
async function getOnlineDbOrCreateClean(){
  if(!onlineReady()) return normalizeDb(readLocal());
  const online=await fetchOnline();
  if(online?.obra && online.baseVersion===ONLINE_BASE_VERSION) return normalizeDb(online);
  const clean=initialDb();
  const ok=await pushOnline(clean);
  if(ok){saveLocal(clean); return clean;}
  return normalizeDb(readLocal());
}
function can(user,perm){
  if(!user) return false;
  if(user.perfil==="ADMIN") return true;
  const editor=["view","item.create","item.edit","mov.create","mov.edit","col.create","col.edit"];
  return editor.includes(perm);
}
function balanceItems(items,movs){
  return items.map(i=>{
    const ms=movs.filter(m=>Number(m.itemId)===Number(i.id));
    const ent=ms.filter(m=>m.tipo==="Entrada").reduce((s,m)=>s+Number(m.qtd||0),0);
    const ret=ms.filter(m=>m.tipo==="Retirada").reduce((s,m)=>s+Number(m.qtd||0),0);
    const dev=ms.filter(m=>m.tipo==="Devolução").reduce((s,m)=>s+Number(m.qtd||0),0);
    const bai=ms.filter(m=>["Baixa","Perda"].includes(m.tipo)).reduce((s,m)=>s+Number(m.qtd||0),0);
    const saldo=Number(i.inicial||0)+ent-ret+dev-bai;
    const status=saldo<=0?"Sem Estoque":(Number(i.minimo||0)>0&&saldo<=Number(i.minimo)?"Estoque Baixo":"Disponível");
    return {...i,entradas:ent,retiradas:ret,devolucoes:dev,baixas:bai,saldo,status};
  });
}
function returnedMap(movs){const m={}; movs.filter(x=>x.tipo==="Devolução"&&x.retiradaRefId).forEach(x=>{m[x.retiradaRefId]=(m[x.retiradaRefId]||0)+Number(x.qtd||0)}); return m;}
function diffDays(a,b){if(!a||!b) return 0; const A=new Date(`${a}T00:00:00`),B=new Date(`${b}T00:00:00`); return Math.round((A-B)/86400000);}

export default function App(){
  const [db,setDb]=useState(()=>readLocal());
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("Painel");
  const [syncMsg,setSyncMsg]=useState("");
  const [syncOpen,setSyncOpen]=useState(false);

  async function reload(){
    const next=onlineReady()?await getOnlineDbOrCreateClean():normalizeDb(readLocal());
    saveLocal(next);
    setDb(next);
    setSyncMsg(`${onlineReady()?"ONLINE":"LOCAL"} recarregado em ${nowBR()}`);
  }
  useEffect(()=>{
    reload();
    const t=setInterval(reload, onlineReady()?2000:3000);
    window.addEventListener("focus", reload);
    return()=>{
      clearInterval(t);
      window.removeEventListener("focus", reload);
    };
  },[]);

  async function write(patch,by=user?.login||"Sistema"){
    const base=onlineReady()?await getOnlineDbOrCreateClean():normalizeDb(db);
    const next=normalizeDb({...base,...patch,baseVersion:ONLINE_BASE_VERSION,version:Date.now(),updatedAt:nowBR(),updatedBy:by});
    setDb(next);
    saveLocal(next);
    if(onlineReady()){
      const ok=await pushOnline(next);
      if(!ok){setSyncMsg("ERRO: não foi possível salvar no Supabase."); return;}
      const onlineAfter=await fetchOnline();
      const confirmed=normalizeDb(onlineAfter?.obra?onlineAfter:next);
      setDb(confirmed);
      saveLocal(confirmed);
      setSyncMsg(`ONLINE salvo por ${by} em ${confirmed.updatedAt}`);
    }else{
      setSyncMsg(`LOCAL salvo por ${by} em ${next.updatedAt}`);
    }
  }
  async function updateObra(patch){
    try{
      const onlineBase = onlineReady()
        ? await getOnlineDbOrCreateClean()
        : normalizeDb(db);

      const nextDb = normalizeDb({
        ...onlineBase,
        obra: {
          ...onlineBase.obra,
          ...patch
        },
        updatedAt: nowBR(),
        updatedBy: user?.login || "Sistema",
        version: Date.now(),
        baseVersion: ONLINE_BASE_VERSION
      });

      setDb(nextDb);
      saveLocal(nextDb);

      if(onlineReady()){
        const ok = await pushOnline(nextDb);

        if(!ok){
          console.error("Falha ao salvar online", window.__almoxSupabaseError);
          setSyncMsg(`ERRO AO SALVAR ONLINE: ${window.__almoxSupabaseError || "sem detalhe"}`);
          return;
        }

        const confirm = await fetchOnline();

        if(confirm?.obra){
          const confirmedDb = normalizeDb(confirm);
          setDb(confirmedDb);
          saveLocal(confirmedDb);
        }

        setSyncMsg(`ONLINE salvo em ${nowBR()}`);
      }else{
        setSyncMsg(`LOCAL salvo em ${nowBR()}`);
      }
    }catch(e){
      console.error(e);
      setSyncMsg(`ERRO GERAL DE SINCRONIZAÇÃO: ${e?.message || "sem detalhe"}`);
    }
  }
  async function login(login,senha){
    try{
      const base=onlineReady()?await getOnlineDbOrCreateClean():normalizeDb(readLocal());
      const safeBase=normalizeDb(base);
      saveLocal(safeBase);
      let u=(safeBase.users||[]).find(x=>String(x.login)===String(login)&&x.senhaHash===hash(senha)&&x.status!=="Inativo");

      // Segurança: se a base online estiver sem usuários, permite os usuários iniciais e regrava a base.
      if(!u){
        const fallback=initialUsers.find(x=>String(x.login)===String(login)&&x.senhaHash===hash(senha));
        if(fallback){
          const repaired={...safeBase,users:mergeUniqueById(safeBase.users||[],initialUsers),updatedAt:nowBR(),updatedBy:"Reparo de usuários"};
          saveLocal(repaired);
          if(onlineReady()) await pushOnline(repaired);
          setDb(repaired);
          setUser(fallback);
          return {ok:true};
        }
      }

      if(!u) return {error:"Usuário ou senha inválidos."};
      setDb(safeBase); setUser(u);
      return {ok:true};
    }catch(e){
      console.warn(e);
      return {error:"Erro ao entrar. Verifique a internet ou configure novamente o banco online."};
    }
  }
  if(!user) return <Login onLogin={login}/>;
  return <Main db={db} user={user} page={page} setPage={setPage} updateObra={updateObra} write={write} logout={()=>setUser(null)} reload={reload} syncMsg={syncMsg} syncOpen={syncOpen} setSyncOpen={setSyncOpen}/>;
}

function Login({onLogin}){
  const [l,setL]=useState("");
  const [s,setS]=useState("");
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  async function entrar(){
    if(loading) return;
    setMsg("");
    setLoading(true);
    const result=await onLogin(l,s);
    if(result?.error) setMsg(result.error);
    setLoading(false);
  }
  return <div className="min-h-screen bg-[#06213c] flex items-center justify-center p-6"><div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"><p className="text-xs tracking-[.35em] text-slate-500">TPCONS</p><h1 className="font-serif text-3xl font-black mb-6">Almoxarifado Online</h1><input className="w-full border rounded-xl p-3 mb-3" placeholder="Usuário" value={l} onChange={e=>setL(e.target.value)}/><input className="w-full border rounded-xl p-3 mb-4" placeholder="Senha" type="password" value={s} onChange={e=>setS(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")entrar()}}/>{msg&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>}<button onClick={entrar} disabled={loading} className="w-full bg-[#0b2a47] text-white rounded-xl p-3 font-bold disabled:opacity-60">{loading?"Entrando...":"Entrar"}</button><p className="mt-4 text-xs text-slate-500">Usuários iniciais: admin / admin1 ou Almoxarife / fossoaod</p></div></div>
}

function Main({db,user,page,setPage,updateObra,write,logout,reload,syncMsg,syncOpen,setSyncOpen}){
  const obra=db.obra||emptyWork; const itemsBase=obra.itemsBase||[]; const collaborators=obra.collaborators||[]; const movements=obra.movements||[];
  const items=useMemo(()=>balanceItems(itemsBase,movements),[itemsBase,movements]);
  const retMap=useMemo(()=>returnedMap(movements),[movements]);
  const pages=[["Painel",LayoutDashboard],["Itens",Package],["Movimentações",ArrowLeftRight],["Colaboradores",Users],["Ferramentas Retidas",Wrench],["Histórico",History],...(user.perfil==="ADMIN"?[["Usuários",UserCog]]:[])];
  return <div className="min-h-screen bg-[#fbfaf8] text-slate-900"><aside className="fixed left-0 top-0 h-full w-64 bg-[#06213c] p-4 text-white"><div className="mb-6"><b>TPCONS</b><br/>Almoxarifado</div><div className="mb-3 rounded-lg bg-white/10 p-3 text-sm"><b>{user.nome}</b><br/><span className="rounded bg-white text-[#06213c] px-2 text-xs">{user.perfil}</span></div><button onClick={logout} className="mb-4 w-full rounded-lg bg-red-500/20 p-2 flex gap-2"><LogOut size={16}/>Sair</button>{pages.map(([n,Icon])=><button key={n} onClick={()=>setPage(n)} className={`w-full flex gap-2 items-center rounded-lg p-3 text-left ${page===n?"bg-white/10":""}`}><Icon size={17}/>{n}</button>)}</aside><main className="ml-64 p-8"><div className="rounded-2xl border bg-white p-4 mb-6"><div className="flex justify-between gap-3"><div><p className="text-xs tracking-[.3em] text-slate-500">OBRA ATUAL</p><b>OBRA:</b> {obra.nomeObra}<br/><b>CLIENTE:</b> {obra.cliente}<br/><span className="text-xs text-slate-500">Última sincronização: {db.updatedAt||"-"} • {db.updatedBy||"-"} • Modo {onlineReady()?"ONLINE ATIVO - SUPABASE":"LOCAL"}</span>{syncMsg&&<div className="text-emerald-700 text-sm font-semibold">{syncMsg}</div>}</div><div className="flex gap-2 items-start"><button onClick={reload} className="border rounded-xl px-4 py-3 flex gap-2"><RefreshCw size={16}/>Atualizar</button>{(user.perfil==="ADMIN" || !onlineReady())&&<button onClick={()=>setSyncOpen(true)} className="bg-emerald-600 text-white rounded-xl px-4 py-3 flex gap-2"><Database size={16}/>Configurar online</button>}</div></div>{!onlineReady()&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">Modo LOCAL. Para sincronizar computadores, configure o banco online.</div>}</div>{page==="Painel"&&<Painel items={items} movements={movements}/>} {page==="Itens"&&<Itens items={items} itemsBase={itemsBase} updateObra={updateObra} user={user}/>} {page==="Colaboradores"&&<Cols collaborators={collaborators} movements={movements} updateObra={updateObra} user={user}/>} {page==="Movimentações"&&<Movs items={items} collaborators={collaborators} movements={movements} updateObra={updateObra} user={user} retMap={retMap}/>} {page==="Histórico"&&<Movs items={items} collaborators={collaborators} movements={movements} updateObra={updateObra} user={user} retMap={retMap}/>} {page==="Ferramentas Retidas"&&<Retidas items={items} collaborators={collaborators} movements={movements} retMap={retMap}/>} {page==="Usuários"&&<Usuarios db={db} write={write} user={user}/>}</main>{syncOpen&&<SyncModal onClose={()=>setSyncOpen(false)} reload={reload}/>}</div>;
}

function Painel({items,movements}){return <section><p className="text-xs tracking-[.35em] text-slate-500">PAINEL</p><h1 className="font-serif text-4xl font-black mb-6">Visão geral do almoxarifado</h1><div className="grid grid-cols-6 gap-4"><Card t="Total de itens" v={items.length}/><Card t="Ferramentas" v={items.filter(i=>i.tipo==="Ferramenta Retornável").length}/><Card t="Materiais" v={items.filter(i=>i.tipo==="Material de Consumo").length}/><Card t="Equipamentos" v={items.filter(i=>i.tipo==="Equipamento").length}/><Card t="Estoque baixo" v={items.filter(i=>i.status==="Estoque Baixo").length}/><Card t="Sem estoque" v={items.filter(i=>i.status==="Sem Estoque").length}/></div><div className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-serif text-2xl font-bold">Últimas movimentações</h2><SimpleMovTable movements={[...movements].sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,8)} items={items}/></div></section>}
function Card({t,v}){return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-widest text-slate-500">{t}</p><b className="font-serif text-3xl mt-4 block">{v}</b></div>}
function Header({title,btn,onClick}){return <div className="mb-6 flex justify-between items-center"><h1 className="font-serif text-4xl font-black">{title}</h1>{btn&&<button onClick={onClick} className="rounded-xl bg-[#0b2a47] text-white px-5 py-3 flex gap-2"><Plus size={18}/>{btn}</button>}</div>}

function Itens({items,itemsBase,updateObra,user}){const [open,setOpen]=useState(false); const [edit,setEdit]=useState(null); function del(id){if(user.perfil!=="ADMIN")return; updateObra({itemsBase:itemsBase.filter(i=>Number(i.id)!==Number(id))});} return <section><Header title="Itens do Estoque" btn={can(user,"item.create")?"Cadastrar item":null} onClick={()=>{setEdit(null);setOpen(true)}}/><Table headers={["Código","Descrição","Tipo","Inicial","Saldo","Status","Ações"]}>{items.map(i=><tr key={i.id} className="border-t"><td className="p-3 font-mono">{i.codigo}</td><td className="p-3 font-bold">{i.descricao}</td><td className="p-3">{i.tipo}</td><td className="p-3">{i.inicial}</td><td className="p-3 font-bold">{i.saldo} {i.unidade}</td><td className="p-3">{i.status}</td><td className="p-3 flex gap-2">{can(user,"item.edit")&&<button onClick={()=>{setEdit(i);setOpen(true)}} className="border rounded-lg px-3 py-2"><Pencil size={15}/></button>}{user.perfil==="ADMIN"&&<button onClick={()=>del(i.id)} className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2"><Trash2 size={15}/></button>}</td></tr>)}</Table>{open&&<ItemModal item={edit} itemsBase={itemsBase} updateObra={updateObra} onClose={()=>setOpen(false)}/>}</section>}
function ItemModal({item,itemsBase,updateObra,onClose}){const [f,setF]=useState(item||{tipo:"Ferramenta Retornável",codigo:"",descricao:"",unidade:"UN",inicial:0,minimo:0,localizacao:"Almoxarifado"}); function save(){const obj={...f,id:item?.id||Date.now(),descricao:String(f.descricao||"").toUpperCase(),inicial:Number(f.inicial||0),minimo:Number(f.minimo||0)}; updateObra({itemsBase:item?itemsBase.map(i=>i.id===item.id?obj:i):[...itemsBase,obj]}); onClose();} return <Modal title={item?"Editar item":"Cadastrar item"} onClose={onClose} onSave={save}><Grid><Input label="Código" v={f.codigo} set={v=>setF({...f,codigo:v})}/><label>Tipo<select className="mt-1 w-full border rounded-lg p-3" value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}><option>Ferramenta Retornável</option><option>Material de Consumo</option><option>Equipamento</option></select></label><Input label="Descrição" v={f.descricao} set={v=>setF({...f,descricao:v})}/><Input label="Unidade" v={f.unidade} set={v=>setF({...f,unidade:v})}/><Input label="Estoque inicial" type="number" v={f.inicial} set={v=>setF({...f,inicial:v})}/><Input label="Estoque mínimo" type="number" v={f.minimo} set={v=>setF({...f,minimo:v})}/></Grid></Modal>}

function Cols({collaborators,movements,updateObra,user}){const [open,setOpen]=useState(false); const [edit,setEdit]=useState(null); function del(id){if(user.perfil!=="ADMIN")return; updateObra({collaborators:collaborators.filter(c=>Number(c.id)!==Number(id)),movements:movements.filter(m=>Number(m.colaboradorId)!==Number(id)&&Number(m.despachadoPorId)!==Number(id))});} return <section><Header title="Colaboradores" btn={can(user,"col.create")?"Novo colaborador":null} onClick={()=>{setEdit(null);setOpen(true)}}/><Table headers={["Nome","Função","Matrícula/CPF","Ações"]}>{collaborators.map(c=><tr key={c.id} className="border-t"><td className="p-3 font-bold">{c.nome}</td><td className="p-3">{c.funcao}</td><td className="p-3">{c.matricula}</td><td className="p-3 flex gap-2">{can(user,"col.edit")&&<button onClick={()=>{setEdit(c);setOpen(true)}} className="border rounded-lg px-3 py-2"><Pencil size={15}/></button>}{user.perfil==="ADMIN"&&<button onClick={()=>del(c.id)} className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2"><Trash2 size={15}/></button>}</td></tr>)}</Table>{open&&<ColModal col={edit} collaborators={collaborators} updateObra={updateObra} onClose={()=>setOpen(false)}/>}</section>}
function ColModal({col,collaborators,updateObra,onClose}){const [f,setF]=useState(col||{nome:"",funcao:"",matricula:""}); function save(){const obj={...f,id:col?.id||Date.now()}; updateObra({collaborators:col?collaborators.map(c=>c.id===col.id?obj:c):[...collaborators,obj]}); onClose();} return <Modal title={col?"Editar colaborador":"Novo colaborador"} onClose={onClose} onSave={save}><Input label="Nome" v={f.nome} set={v=>setF({...f,nome:v})}/><Input label="Função" v={f.funcao} set={v=>setF({...f,funcao:v})}/><Input label="Matrícula/CPF" v={f.matricula} set={v=>setF({...f,matricula:v})}/></Modal>}

function Movs({items,collaborators,movements,updateObra,user,retMap}){const [open,setOpen]=useState(false); const [edit,setEdit]=useState(null); const sorted=[...movements].sort((a,b)=>String(b.data).localeCompare(String(a.data))||Number(b.id)-Number(a.id)); function del(id){if(user.perfil!=="ADMIN")return; updateObra({movements:movements.filter(m=>Number(m.id)!==Number(id)&&Number(m.retiradaRefId)!==Number(id))});} return <section><Header title="Movimentações" btn={can(user,"mov.create")?"Nova movimentação":null} onClick={()=>{setEdit(null);setOpen(true)}}/><Table headers={["Data","Código","Item","Tipo","Qtd","Colaborador","Responsável","Previsão","Dev. Real","Atraso","Ações"]}>{sorted.map(m=>{const i=items.find(x=>x.id===m.itemId),c=collaborators.find(x=>x.id===m.colaboradorId),r=collaborators.find(x=>x.id===m.despachadoPorId),ret=movements.find(x=>Number(x.id)===Number(m.retiradaRefId)); const prev=m.tipo==="Devolução"?(ret?.previsao||m.previsaoOriginal||""):m.previsao; const atraso=m.tipo==="Devolução"&&prev?(diffDays(m.dataDevolucaoReal,prev)>0?`Atrasou ${diffDays(m.dataDevolucaoReal,prev)} dia(s)`:"No prazo"):"-"; return <tr key={m.id} className="border-t"><td className="p-3">{brDate(m.data)}</td><td className="p-3 font-mono">{i?.codigo}</td><td className="p-3 font-bold">{i?.descricao}</td><td className="p-3">{m.tipo}</td><td className="p-3">{m.qtd}</td><td className="p-3">{c?.nome||"-"}</td><td className="p-3">{r?.nome||"-"}</td><td className="p-3">{brDate(prev)}</td><td className="p-3">{brDate(m.dataDevolucaoReal)}</td><td className="p-3">{atraso}</td><td className="p-3 flex gap-2">{can(user,"mov.edit")&&<button onClick={()=>{setEdit(m);setOpen(true)}} className="border rounded-lg px-3 py-2"><Pencil size={15}/></button>}{user.perfil==="ADMIN"&&<button onClick={()=>del(m.id)} className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2"><Trash2 size={15}/></button>}</td></tr>})}</Table>{open&&<MovModal mov={edit} items={items} collaborators={collaborators} movements={movements} updateObra={updateObra} onClose={()=>setOpen(false)} retMap={retMap}/>}</section>}
function MovModal({mov,items,collaborators,movements,updateObra,onClose,retMap}){const [f,setF]=useState(mov||{tipo:"Retirada",data:todayISO(),dataDevolucaoReal:todayISO(),itemId:"",qtd:1,colaboradorId:"",despachadoPorId:"",retiradaRefId:"",previsao:"",obs:""}); const item=items.find(i=>Number(i.id)===Number(f.itemId)); const pending=movements.filter(m=>m.tipo==="Retirada"&&(Number(m.qtd)-Number(retMap[m.id]||0)>0)); function save(){const isDev=f.tipo==="Devolução"; const ret=movements.find(m=>Number(m.id)===Number(f.retiradaRefId)); const obj={...f,id:mov?.id||Date.now(),itemId:Number(f.itemId),qtd:Number(f.qtd),colaboradorId:f.colaboradorId?Number(f.colaboradorId):"",despachadoPorId:f.despachadoPorId?Number(f.despachadoPorId):"",retiradaRefId:isDev?Number(f.retiradaRefId):"",dataDevolucaoReal:isDev?f.dataDevolucaoReal:"",previsao:f.tipo==="Retirada"?f.previsao:"",previsaoOriginal:isDev?(ret?.previsao||""):""}; updateObra({movements:mov?movements.map(m=>m.id===mov.id?obj:m):[...movements,obj]}); onClose();} return <Modal title={mov?"Editar movimentação":"Nova movimentação"} onClose={onClose} onSave={save}><Grid><label>Tipo<select className="mt-1 w-full border rounded-lg p-3" value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}><option>Entrada</option><option>Retirada</option><option>Devolução</option><option>Baixa</option><option>Perda</option></select></label><Input label="Data" type="date" v={f.data} set={v=>setF({...f,data:v})}/>{f.tipo==="Devolução"&&<Input label="Data devolução real" type="date" v={f.dataDevolucaoReal} set={v=>setF({...f,dataDevolucaoReal:v})}/>}</Grid>{f.tipo==="Devolução"&&<label className="block mt-3">Retirada em aberto<select className="mt-1 w-full border rounded-lg p-3" value={f.retiradaRefId} onChange={e=>{const r=movements.find(m=>Number(m.id)===Number(e.target.value)); setF({...f,retiradaRefId:e.target.value,itemId:r?.itemId||"",colaboradorId:r?.colaboradorId||"",previsao:r?.previsao||"",qtd:r?Number(r.qtd)-Number(retMap[r.id]||0):1})}}><option value="">Selecione</option>{pending.map(p=>{const it=items.find(i=>i.id===p.itemId); return <option key={p.id} value={p.id}>{brDate(p.data)} - {it?.codigo} {it?.descricao} - saldo {Number(p.qtd)-Number(retMap[p.id]||0)}</option>})}</select></label>}<Grid><label>Item<select className="mt-1 w-full border rounded-lg p-3" value={f.itemId} onChange={e=>setF({...f,itemId:e.target.value})}><option value="">Selecione</option>{items.map(i=><option key={i.id} value={i.id}>{i.codigo} - {i.descricao} | saldo {i.saldo}</option>)}</select></label><Input label="Quantidade" type="number" v={f.qtd} set={v=>setF({...f,qtd:v})}/><label>Colaborador<select className="mt-1 w-full border rounded-lg p-3" value={f.colaboradorId} onChange={e=>setF({...f,colaboradorId:e.target.value})}><option value="">Selecione</option>{collaborators.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label><label>{f.tipo==="Devolução"?"Recebido por":"Despachado por"}<select className="mt-1 w-full border rounded-lg p-3" value={f.despachadoPorId} onChange={e=>setF({...f,despachadoPorId:e.target.value})}><option value="">Selecione</option>{collaborators.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>{f.tipo==="Retirada"&&<Input label="Previsão devolução" type="date" v={f.previsao} set={v=>setF({...f,previsao:v})}/>}</Grid><label className="block mt-3">Observações<textarea className="mt-1 w-full border rounded-lg p-3" value={f.obs||""} onChange={e=>setF({...f,obs:e.target.value})}/></label></Modal>}
function Retidas({items,collaborators,movements,retMap}){const rows=movements.filter(m=>m.tipo==="Retirada").map(m=>{const i=items.find(x=>x.id===m.itemId),c=collaborators.find(x=>x.id===m.colaboradorId); const dev=retMap[m.id]||0; return {...m,item:i,col:c,devolvido:dev,saldo:Number(m.qtd)-Number(dev)}}).filter(r=>r.saldo>0); return <section><Header title="Ferramentas Retidas"/><Table headers={["Código","Item","Colaborador","Retirado","Devolvido","Saldo","Data","Previsão","Situação"]}>{rows.map(r=>{const atraso=r.previsao&&diffDays(todayISO(),r.previsao)>0; return <tr key={r.id} className="border-t"><td className="p-3 font-mono">{r.item?.codigo}</td><td className="p-3 font-bold">{r.item?.descricao}</td><td className="p-3">{r.col?.nome}</td><td className="p-3">{r.qtd}</td><td className="p-3">{r.devolvido}</td><td className="p-3 font-bold">{r.saldo}</td><td className="p-3">{brDate(r.data)}</td><td className="p-3">{brDate(r.previsao)}</td><td className="p-3">{!r.previsao?"Sem prazo":atraso?"Atrasada":"No prazo"}</td></tr>})}</Table></section>}
function Usuarios({db,write,user}){const [users,setUsers]=useState(db.users||[]); const [f,setF]=useState({nome:"",login:"",senha:"",perfil:"VISUALIZADOR",status:"Ativo"}); function save(){const novo={id:Date.now(),nome:f.nome,login:f.login,senhaHash:hash(f.senha),perfil:f.perfil,status:f.status}; const list=[...users,novo]; setUsers(list); write({users:list},user.login);} function del(id){const list=users.filter(u=>u.id!==id); setUsers(list); write({users:list},user.login);} return <section><Header title="Administração de Usuários"/><div className="rounded-2xl border bg-white p-5 mb-5 grid grid-cols-5 gap-3"><Input label="Nome" v={f.nome} set={v=>setF({...f,nome:v})}/><Input label="Login" v={f.login} set={v=>setF({...f,login:v})}/><Input label="Senha" type="password" v={f.senha} set={v=>setF({...f,senha:v})}/><label>Perfil<select className="mt-1 w-full border rounded-lg p-3" value={f.perfil} onChange={e=>setF({...f,perfil:e.target.value})}><option>ADMIN</option><option>EDITOR</option><option>VISUALIZADOR</option></select></label><button onClick={save} className="self-end bg-[#0b2a47] text-white rounded-lg p-3">Criar</button></div><Table headers={["Nome","Login","Perfil","Status","Ações"]}>{users.map(u=><tr key={u.id} className="border-t"><td className="p-3">{u.nome}</td><td className="p-3">{u.login}</td><td className="p-3">{u.perfil}</td><td className="p-3">{u.status}</td><td className="p-3">{u.login!=="admin"&&<button onClick={()=>del(u.id)} className="text-red-700"><Trash2 size={16}/></button>}</td></tr>)}</Table></section>}
function SyncModal({onClose,reload}){
  const cur=getCfg();
  const [url,setUrl]=useState(cur.url||"https://qltkepywsfvwwoorooit.supabase.co");
  const [key,setKey]=useState(cur.key||"sb_publishable_M7B7NLCNR5RvdNl2oINabw_FK2lUph3");
  const [msg,setMsg]=useState("");
  const [saving,setSaving]=useState(false);

  async function save(){
    if(saving) return;
    const cleanUrl=String(url||"").trim().replace(/\/$/,"");
    const cleanKey=String(key||"").trim();
    if(!cleanUrl){setMsg("Informe a URL do Supabase."); return;}
    if(!cleanKey){setMsg("Informe a chave pública publishable / anon."); return;}

    setSaving(true);
    setMsg("Conectando ao Supabase...");

    localStorage.setItem("almox_supabase_enabled","true");
    localStorage.setItem("almox_supabase_url",cleanUrl);
    localStorage.setItem("almox_supabase_anon_key",cleanKey);

    try{
      const online=await fetchOnline();

      if(online?.obra){
        const base=normalizeDb(online);
        saveLocal(base);
        setMsg("ONLINE confirmado. Este computador já está usando a base existente do Supabase.");
        setTimeout(()=>{onClose(); reload();},700);
        return;
      }

      const clean=initialDb();
      saveLocal(clean);
      const ok=await pushOnline(clean);
      if(!ok){
        setMsg(`Não foi possível gravar no Supabase. Detalhe: ${window.__almoxSupabaseError || "sem detalhe retornado"}`);
        setSaving(false);
        return;
      }

      const confirm=await fetchOnline();
      if(!confirm?.obra){
        setMsg("Gravou, mas não conseguiu ler do Supabase. Confira as políticas RLS da tabela.");
        setSaving(false);
        return;
      }

      setMsg("ONLINE ativado com base limpa no Supabase. Recarregando...");
      setTimeout(()=>{onClose(); reload();},700);
    }catch(e){
      console.warn(e);
      setMsg(`Erro Supabase: ${e?.message || 'Falha ao conectar'}`);
      setSaving(false);
    }
  }

  return <Modal title="Configurar banco online" onClose={onClose} onSave={save} saveText={saving?"Conectando...":"Salvar e ativar ONLINE"}>
    <Input label="URL do Supabase" v={url} set={setUrl}/>
    <label className="block mt-3">Chave pública publishable / anon<textarea className="mt-1 w-full border rounded-lg p-3 h-28 font-mono" value={key} onChange={e=>setKey(e.target.value)} placeholder="sb_publishable_..."/></label>
    {msg&&<div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{msg}</div>}
  </Modal>
}
function Table({headers,children}){return <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50"><tr>{headers.map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
function SimpleMovTable({movements,items}){return <Table headers={["Data","Tipo","Item","Qtd"]}>{movements.map(m=>{const i=items.find(x=>x.id===m.itemId); return <tr key={m.id} className="border-t"><td className="p-3">{brDate(m.data)}</td><td className="p-3">{m.tipo}</td><td className="p-3">{i?.descricao}</td><td className="p-3">{m.qtd}</td></tr>})}</Table>}
function Modal({title,children,onClose,onSave,saveText="Salvar"}){return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-7 shadow-2xl"><div className="flex justify-between items-start mb-5"><h2 className="font-serif text-3xl font-black">{title}</h2><button onClick={onClose}>✕</button></div>{children}<div className="mt-5 flex justify-end gap-3"><button onClick={onClose} className="border rounded-xl px-5 py-3">Cancelar</button><button onClick={onSave} className="bg-[#0b2a47] text-white rounded-xl px-5 py-3">{saveText}</button></div></div></div>}
function Grid({children}){return <div className="grid grid-cols-2 gap-3 mt-3">{children}</div>}
function Input({label,v,set,type="text"}){return <label className="block">{label}<input className="mt-1 w-full border rounded-lg p-3" type={type} value={v||""} onChange={e=>set(e.target.value)}/></label>}


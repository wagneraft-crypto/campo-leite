/* App de campo — WM e TR - Paquetá (mesma área, rebanhos separados). Telas estáticas; dados vão para a caixa postal no Google do Wagner.
   Sem sinal: guarda no celular (fila) e envia depois, sem duplicar (cada lançamento tem um código único). */
"use strict";
const VERSAO = "1.4.0";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
const TEMAS = [
  ["auto", "Automático (segue o celular)", ["#f4f1e8", "#24402f", "#141a16", "#8fc79e"]],
  ["verde-branco", "Verde e branco", ["#ffffff", "#f6f8f5", "#24402f", "#2f6b45"]],
  ["azul-branco", "Azul França e branco", ["#ffffff", "#f4f7fc", "#0055a4", "#d63a2f"]],
  ["terra", "Sertão (terra e creme)", ["#fffdf8", "#f7f1e6", "#6e3b17", "#8a4b1f"]],
  ["verde-escuro", "Noite verde (escuro)", ["#141a16", "#1e2621", "#1b2a20", "#8fc79e"]],
  ["azul-marinho", "Azul-marinho (escuro)", ["#0f1a2b", "#16243a", "#0b1422", "#2f6fd6"]],
  ["grafite", "Grafite (escuro)", ["#1f1f1f", "#2a2a2a", "#191919", "#1a73e8"]],
  ["contraste", "Alto contraste (sol forte)", ["#ffffff", "#000000", "#ffffff", "#0000c8"]],
];
const CORES_TOPO = { "verde-branco": "#24402f", "azul-branco": "#0055a4", terra: "#6e3b17", "verde-escuro": "#1b2a20", "azul-marinho": "#0b1422", grafite: "#191919", contraste: "#000000" };
function aplicarTema(t) {
  if (!TEMAS.some(x => x[0] === t)) t = "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-tema"); else document.documentElement.setAttribute("data-tema", t);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", CORES_TOPO[t] || "#24402f");
}

/* ---------------------------------------------------------------- armazenamento local (sempre com try/catch) */
const guarda = {
  ler(k, padrao) { try { const v = localStorage.getItem("campo_" + k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } },
  gravar(k, v) { try { localStorage.setItem("campo_" + k, JSON.stringify(v)); return true; } catch { return false; } },
  tirar(k) { try { localStorage.removeItem("campo_" + k); } catch { } },
};

aplicarTema(guarda.ler("tema", "auto"));

/* ---------------------------------------------------------------- utilidades */
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const agoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const brData = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
const numero = s => { let t = String(s ?? "").trim().replace(/\s/g, ""); if (!t) return null; t = t.replace(",", "."); const v = Number(t); return isNaN(v) ? null : v; };
const virgula = v => String(v).replace(".", ",");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
function aviso(t, ms = 3200) { const el = $("#aviso"); el.textContent = t; el.style.display = "block"; clearTimeout(aviso.t); aviso.t = setTimeout(() => el.style.display = "none", ms); }
function exigir(c, m) { if (!c) throw new Error(m); }

/* ---------------------------------------------------------------- caixa postal */
function endereco() {
  /* só para teste no próprio notebook (127.0.0.1): caixa postal simulada */
  if (["127.0.0.1", "localhost"].includes(location.hostname) && guarda.ler("endpoint_url", "")) return guarda.ler("endpoint_url", "");
  const id = guarda.ler("endpoint", ""); return id ? `https://script.google.com/macros/s/${id}/exec` : "";
}
async function api(acao, corpo = {}) {
  const url = endereco();
  if (!url) throw new Error("App sem endereço da fazenda. Abra o link de convite que o Wagner mandou.");
  let r;
  try {
    r = await fetch(url, { method: "POST", body: JSON.stringify({ acao, ...corpo }), redirect: "follow" });
  } catch { const e = new Error("Sem conexão com a internet."); e.semRede = true; throw e; }
  let j;
  try { j = await r.json(); } catch { const e = new Error("A caixa postal não respondeu direito. Tente de novo em instantes."); e.semRede = true; throw e; }
  if (!j.ok) {
    if (j.codigo === "sessao") { sair(false); }
    throw new Error(j.erro || "Erro na caixa postal.");
  }
  return j;
}

/* ---------------------------------------------------------------- sessão */
const sessao = () => guarda.ler("sessao", null);
function sair(perguntar = true) {
  if (perguntar && fila().length && !confirm(`Ainda há ${fila().length} lançamento(s) esperando sinal neste celular. Se sair, eles continuam guardados e vão quando você entrar de novo. Sair?`)) return;
  guarda.tirar("sessao"); guarda.tirar("resumo");
  ir("entrar");
}

/* ---------------------------------------------------------------- fila (offline) */
const fila = () => guarda.ler("fila", []);
function enfileirar(tipo, dados) {
  const f = fila();
  if (TIPOS_COM_PROP.includes(tipo)) { exigir(prop(), "Escolha a propriedade (WM ou TR - Paquetá) no Início."); dados = { ...dados, propriedade: prop() }; }
  f.push({ id: uid(), tipo, dados, criado_em: new Date().toISOString(), versao: VERSAO });
  if (!guarda.gravar("fila", f)) throw new Error("Memória do celular cheia: não consegui guardar. Envie o que está pendente com sinal.");
  atualizarEstado();
  enviarFila();
}
let enviando = false;
async function enviarFila() {
  const s = sessao();
  if (enviando || !s || !navigator.onLine) { atualizarEstado(); return; }
  const f = fila();
  if (!f.length) { atualizarEstado(); return; }
  enviando = true; atualizarEstado();
  try {
    const lote = f.slice(0, 20);
    const r = await api("enviar", { token: s.token, itens: lote });
    const certos = new Set(r.resultados.filter(x => x.ok).map(x => x.id));
    const ruins = r.resultados.filter(x => !x.ok);
    guarda.gravar("fila", fila().filter(x => !certos.has(x.id) && !ruins.some(y => y.id === x.id)));
    if (ruins.length) aviso(`${ruins.length} lançamento(s) recusado(s) pela caixa postal: ${ruins.map(x => x.erro).join(", ")}`, 6000);
    else aviso(`Enviado${certos.size > 1 ? "s" : ""} ✔ (${certos.size})`);
    if ((location.hash.slice(1) || "inicio") === "inicio") mostrar("inicio");
    if (fila().length) setTimeout(enviarFila, 500);
  } catch (e) {
    if (!e.semRede) aviso(e.message, 6000);
  } finally { enviando = false; atualizarEstado(); }
}
function atualizarEstado() {
  const n = fila().length, el = $("#estado-rede");
  el.innerHTML = !navigator.onLine ? `<span class="off">sem sinal</span>${n ? ` <span class="pend">${n} guardado${n > 1 ? "s" : ""}</span>` : ""}`
    : n ? `<span class="pend">${enviando ? "enviando…" : n + " a enviar"}</span>` : "";
  const s = sessao(); $("#quem").textContent = s ? `${s.nome}${s.papel === "dono" ? " · dono" : ""}` : "Fazenda WM";
}
addEventListener("online", enviarFila);
addEventListener("offline", atualizarEstado);
setInterval(enviarFila, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { enviarFila(); } });

/* ---------------------------------------------------------------- resumo (publicado pelo notebook) */
async function carregarResumo(forcar = false) {
  const s = sessao();
  if (!s) return null;
  const cache = guarda.ler("resumo", null);
  if (!forcar && cache && Date.now() - (cache._lido || 0) < 5 * 60000) return cache;
  try {
    const r = await api("resumo", { token: s.token });
    const res = r.resumo || { vazio: true };
    res._lido = Date.now();
    guarda.gravar("resumo", res);
    return res;
  } catch (e) {
    if (cache) return cache;
    if (e.semRede) return { vazio: true, semRede: true };
    throw e;
  }
}
/* propriedade: WM (confinado) ou TR (TR - Paquetá, a pasto). Escolhida no Início. */
const PROPS = { WM: { nome: "WM", titulo: "WM (confinado)", cor: "#1f6f43" }, TR: { nome: "TR - Paquetá", titulo: "TR - Paquetá (a pasto)", cor: "#9a4f12" } };
const prop = () => { const p = guarda.ler("prop", ""); return PROPS[p] ? p : ""; };
const TIPOS_COM_PROP = ["leite", "trato", "ocorrencia"];
const animais = r => { const p = prop(); if (!r || !p) return []; const pp = r.propriedades && r.propriedades[p]; return pp ? (pp.animais || []) : (p === "WM" ? (r.animais || []) : []); };
/* Números da propriedade escolhida. Sem "propriedades" (caixa postal antiga), só a WM tem números — nunca mostrar
   os da WM quando a escolhida é a TR. */
const dadosProp = r => {
  const p = prop(); if (!r || !p) return null;
  if (r.propriedades && r.propriedades[p] && "producao" in r.propriedades[p]) return r.propriedades[p];
  return p === "WM" ? { animais: r.animais || [], producao: r.producao || [], alertas: r.alertas || [], financeiro: r.financeiro || null } : { animais: animais(r), producao: [], alertas: [], financeiro: null, antigo: true };
};
const rotAnimal = a => (a.codigo || a.brinco) + (a.nome ? " — " + a.nome : "");
const lactantes = r => animais(r).filter(a => a.categoria === "vaca" && a.estado !== "seca");

/* ---------------------------------------------------------------- navegação */
const TELAS = {};
function ir(tela, extra) { history.pushState({ tela }, "", "#" + tela); mostrar(tela, extra); }
async function mostrar(tela, extra) {
  window.scrollTo(0, 0);
  if (!guarda.ler("endpoint", "") && tela !== "convite") tela = "semconvite";
  else if (!sessao() && !["convite", "entrar", "semconvite"].includes(tela)) tela = "entrar";
  app.innerHTML = `<div class="carregando">Carregando…</div>`;
  try { await (TELAS[tela] || TELAS.inicio)(extra); }
  catch (e) { app.innerHTML = `<div class="erro">${esc(e.message)}</div><button class="btn larga" id="tentar">Tentar de novo</button>`; $("#tentar").onclick = () => mostrar(tela, extra); }
  atualizarEstado();
}
addEventListener("popstate", e => mostrar((e.state && e.state.tela) || "inicio"));
const voltar = () => `<button class="voltar" id="voltar">‹ Voltar</button>`;
function ligarVoltar() { const b = $("#voltar"); if (b) b.onclick = () => ir("inicio"); }

/* ---------------------------------------------------------------- telas: acesso */
TELAS.semconvite = async () => {
  app.innerHTML = `<h1>Bem-vindo</h1><div class="cartao"><p>Para usar o app, abra o <b>link de convite</b> que o Wagner mandou (WhatsApp).</p>
    <p class="sub">O link já traz o endereço da fazenda e o seu código de acesso.</p></div>`;
};

TELAS.convite = async ({ codigo } = {}) => {
  let info;
  try { info = await api("convite_info", { codigo }); }
  catch (e) { app.innerHTML = `<h1>Convite</h1><div class="erro">${esc(e.message)}</div><button class="btn larga" id="ja">Já tenho cadastro: entrar</button>`; $("#ja").onclick = () => ir("entrar"); return; }
  app.innerHTML = `<h1>Olá, ${esc(info.nome)}!</h1>
    <p class="sub">Crie seu acesso ao app de campo (WM e TR - Paquetá). Você vai entrar com o seu CPF e a senha que criar agora.</p>
    <form id="f" class="cartao" autocomplete="on">
      <label for="cpf">Seu CPF</label><input id="cpf" name="cpf" inputmode="numeric" autocomplete="username" placeholder="000.000.000-00" required>
      <label for="s1">Crie uma senha</label><input id="s1" type="password" autocomplete="new-password" minlength="6" required>
      <p class="nota">Pelo menos 6 letras ou números. Não use a mesma senha do banco.</p>
      <label for="s2">Repita a senha</label><input id="s2" type="password" autocomplete="new-password" minlength="6" required>
      <button class="btn prim larga">Criar meu acesso</button><div id="msg"></div></form>`;
  mascaraCpf($("#cpf"));
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const msg = $("#msg"); msg.innerHTML = "";
    try {
      exigir($("#s1").value === $("#s2").value, "As duas senhas não são iguais.");
      exigir($("#s1").value.length >= 6, "A senha precisa ter pelo menos 6 caracteres.");
      const r = await api("cadastrar", { codigo, cpf: $("#cpf").value, senha: $("#s1").value });
      guarda.gravar("sessao", { token: r.token, nome: r.nome, papel: r.papel });
      aviso("Acesso criado ✔"); ir("inicio");
    } catch (er) { msg.innerHTML = `<div class="erro">${esc(er.message)}</div>`; }
  };
};

TELAS.entrar = async () => {
  app.innerHTML = `<h1>Entrar</h1>
    <form id="f" class="cartao" autocomplete="on">
      <label for="cpf">CPF</label><input id="cpf" inputmode="numeric" autocomplete="username" placeholder="000.000.000-00" required>
      <label for="senha">Senha</label><input id="senha" type="password" autocomplete="current-password" required>
      <button class="btn prim larga">Entrar</button><div id="msg"></div></form>
    <p class="sub">Esqueceu a senha? Peça ao Wagner um novo convite.</p>`;
  mascaraCpf($("#cpf"));
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const msg = $("#msg"); msg.innerHTML = "";
    try {
      const r = await api("entrar", { cpf: $("#cpf").value, senha: $("#senha").value });
      guarda.gravar("sessao", { token: r.token, nome: r.nome, papel: r.papel });
      ir("inicio"); enviarFila();
    } catch (er) { msg.innerHTML = `<div class="erro">${esc(er.message)}</div>`; }
  };
};
function mascaraCpf(inp) {
  inp.addEventListener("input", () => {
    const d = inp.value.replace(/\D/g, "").slice(0, 11);
    inp.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  });
}

/* ---------------------------------------------------------------- tela: início */
TELAS.inicio = async () => {
  const s = sessao();
  const r = await carregarResumo();
  const dono = s.papel === "dono";
  const feitas = new Set(guarda.ler("tarefas_feitas", []));
  const tarefas = (r.tarefas || []).filter(t => t.situacao !== "feita");
  const dp = dadosProp(r) || { producao: [], alertas: [] };
  const alertas = dp.alertas || [];
  const prod = (dp.producao || []).slice(-5).reverse();
  const nomeP = prop() ? PROPS[prop()].nome : "";
  app.innerHTML = `
    <h1>${saudacao()}, ${esc(s.nome.split(" ")[0])}</h1>
    <div class="prop-sel">${Object.entries(PROPS).map(([k, p]) => `<button data-prop="${k}" class="${prop() === k ? "on" : ""}" style="${prop() === k ? `background:${p.cor};border-color:${p.cor};color:#fff` : `border-color:${p.cor}`}">${esc(p.nome)}</button>`).join("")}</div>
    <p class="sub">${prop() ? "Lançamentos vão para <b>" + esc(PROPS[prop()].titulo) + "</b>." : "<b>Escolha acima para qual propriedade vai lançar.</b>"}</p>
    <p class="sub">${r.gerado_em ? "Dados da fazenda atualizados em " + esc(r.gerado_em) : r.semRede ? "Sem sinal: os lançamentos ficam guardados e vão depois." : "O resumo da fazenda aparece depois que o notebook sincronizar."}</p>
    <div class="grade">
      <button class="botao-grande" data-ir="leite"><span class="ic">🥛</span><b>Leite</b><small>medição do dia</small></button>
      <button class="botao-grande" data-ir="trato"><span class="ic">🌵</span><b>Trato</b><small>palma, ração, bagaço</small></button>
      <button class="botao-grande" data-ir="ocorrencia"><span class="ic">🐄</span><b>Ocorrência</b><small>cio, parto, doente, remédio</small></button>
      <button class="botao-grande" data-ir="chuva"><span class="ic">🌧️</span><b>Chuva</b><small>pluviômetro</small></button>
      ${dono ? `<button class="botao-grande" data-ir="consulta"><span class="ic">📊</span><b>Consulta</b><small>rebanho, fichas, leite, dinheiro</small></button>
      <button class="botao-grande" data-ir="comprovante"><span class="ic">🧾</span><b>Comprovante</b><small>foto ou PDF de pagamento</small></button>
      <button class="botao-grande" data-ir="ajustes"><span class="ic">⚙️</span><b>Avisos</b><small>e-mail e Telegram</small></button>` : ""}
    </div>
    ${fila().length ? `<div class="cartao" style="margin-top:12px"><b>${fila().length} lançamento(s) guardado(s) neste celular</b><p class="sub">Vão sozinhos quando tiver sinal.</p><button class="btn peq" id="enviar-ja">Enviar agora</button></div>` : ""}
    <h2>Minhas tarefas</h2>
    <div class="cartao">${tarefas.length ? tarefas.map(t => `<div class="tarefa ${feitas.has(t.id) ? "feita" : ""}"><div><b>${esc(t.texto)}</b><small class="sub">${t.prazo ? "até " + esc(t.prazo) : ""}${dono && t.para ? " · " + esc(t.para) : ""}</small></div>
      ${feitas.has(t.id) ? `<small class="sub">feita ✔</small>` : `<button class="btn peq" data-concluir="${esc(t.id)}">Concluir</button>`}</div>`).join("") : `<p class="sub">Nenhuma tarefa.</p>`}</div>
    <h2>Avisos${nomeP ? " — " + esc(nomeP) : ""}</h2>
    <div class="cartao">${alertas.length ? alertas.map(a => `<div class="alerta"><span class="ponto p-${esc(a.nivel || "azul")}"></span><div><b>${esc(a.titulo)}</b><small>${esc(a.detalhe || "")}</small></div></div>`).join("") : `<p class="sub">Nada para avisar.</p>`}</div>
    ${prod.length ? `<h2>Leite dos últimos dias${nomeP ? " — " + esc(nomeP) : ""}</h2><div class="cartao"><table class="tab">${prod.map(p => `<tr><td>${esc(p.data)}</td><td class="n"><b>${p.litros != null ? esc(virgula(p.litros)) + " L" : esc(virgula(p.kg)) + " kg (leiteiro)"}</b></td></tr>`).join("")}</table></div>` : ""}
    ${dono && dp.financeiro ? `<h2>Dinheiro — ${esc(nomeP)} (${esc(dp.financeiro.mes || "")})</h2><div class="cartao">${(dp.financeiro.linhas || []).map(l => `<div class="resumo-linha"><span>${esc(l[0])}</span><b>${esc(l[1])}</b></div>`).join("")}</div>` : ""}
    ${dono && dp.antigo ? `<p class="sub">Os números da ${esc(nomeP)} aparecem depois que a caixa postal for atualizada (versão 1.3).</p>` : ""}
    <div class="rodape"><button id="atualizar">Atualizar</button> · <button id="aparencia">Aparência</button> · <button id="sair">Sair</button><br>versão ${VERSAO}</div>`;
  $$("[data-ir]").forEach(b => b.onclick = () => ir(b.dataset.ir));
  $$("[data-prop]").forEach(b => b.onclick = () => { guarda.gravar("prop", b.dataset.prop); mostrar("inicio"); });
  $$("[data-concluir]").forEach(b => b.onclick = () => {
    const t = tarefas.find(x => x.id === b.dataset.concluir);
    if (!confirm(`Marcar como feita: "${t.texto}"?`)) return;
    enfileirar("tarefa_concluida", { tarefa_id: t.id, texto: t.texto, data: hoje() });
    guarda.gravar("tarefas_feitas", [...feitas, t.id]); mostrar("inicio");
  });
  const ej = $("#enviar-ja"); if (ej) ej.onclick = () => { enviarFila(); aviso(navigator.onLine ? "Enviando…" : "Ainda sem sinal."); };
  $("#atualizar").onclick = async () => { await carregarResumo(true); mostrar("inicio"); };
  $("#sair").onclick = () => sair(true);
  $("#aparencia").onclick = () => ir("aparencia");
};
/* ---------------------------------------------------------------- consulta do dono (só leitura) */
const GRUPOS_C = { lactacao: "Em lactação", seca: "Secas", indefinida: "Vacas sem situação", novilhas: "Novilhas", bezerras: "Bezerras", bezerros: "Bezerros", garrotes: "Garrotes", touros: "Touros", bois: "Bois", machos: "Touro e garrotes", outros: "Outros", planejada: "A chegar" };
const MARCAS_C = { preparto: "Pré-parto", prenhes: "Prenhes", cobertas: "Cobertas", vazias: "Vazias", abertas: "Paridas sem serviço" };
const noFiltroC = (a, f) => f === "todos" || a.grupo === f || (a.tags || []).includes(f);
const prazoC = n => n == null ? "" : n === 0 ? " (hoje)" : n > 0 ? ` (em ${n} d)` : ` (há ${-n} d)`;
/* WhatsApp só para celular (11 dígitos com 9 na 3ª posição, depois de tirar o 55) */
function zapC(t) { let d = String(t || "").replace(/\D/g, ""); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d.length === 11 && d[2] === "9" ? "https://wa.me/55" + d : ""; }
const real = v => v == null || v === "" ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num1 = (v, d = 1) => v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const linhaR = (k, v) => `<div class="resumo-linha"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
const tabC = (linhas, cols, vazio = "Nada registrado.") => !linhas || !linhas.length ? `<p class="sub">${vazio}</p>` :
  `<div class="rolagem"><table class="tab"><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join("")}</tr>${linhas.map(l => `<tr>${cols.map(c => `<td>${esc(l[c[0]] ?? "")}</td>`).join("")}</tr>`).join("")}</table></div>`;
const barras = (pts, unid) => { const max = Math.max(...pts.map(p => p.v || 0), 1); return `<div class="barras">${pts.map(p => `<div class="barra-l"><span>${esc(p.r)}</span><i style="width:${Math.round((p.v || 0) / max * 100)}%"></i><b>${p.v == null ? "—" : esc(num1(p.v))}${unid}</b></div>`).join("")}</div>`; };
function blocoQualidadeC(q) {
  if (!q || !(q.meses || []).length) return "";
  const v = (m, k, d) => m[k] == null ? "—" : num1(m[k], d) + ((m.fora || []).includes(k) ? " ✖" : "");
  return `<h2>Qualidade do leite (laticínio)</h2><div class="cartao">${tabC(q.meses.slice(0, 6).map(m => ({ mes: m.mes, ccs: v(m, "ccs_mil", 0), cbt: v(m, "cbt_mil", 0), gord: v(m, "gordura_pct", 2), prot: v(m, "proteina_pct", 2), geo: m.geo_ccs != null ? num1(m.geo_ccs, 0) : "—" })), [["mes", "Mês"], ["ccs", "CCS mil"], ["cbt", "CBT mil"], ["gord", "Gord. %"], ["prot", "Prot. %"], ["geo", "CCS 3 m"]])}
    <p class="nota">✖ = fora da meta (IN 76/77). "CCS 3 m" = média geométrica de 3 meses, a conta da norma.</p>
    ${(q.ccs_altas || []).length ? `<b>Vacas com CCS acima de ${esc(num1(q.meta_ccs_vaca, 0))} mil</b>${q.ccs_altas.map(x => linhaR(x.codigo, num1(x.ccs_mil, 0) + " mil · " + x.data_br)).join("")}<p class="nota">Provável mastite subclínica: CMT e veterinário.</p>` : ""}</div>`;
}
function blocoConcentradoC(k) {
  if (!k || !(k.vacas || []).length) return "";
  const lo = k.lote || {};
  return `<h2>Ração na ordenha (${esc(k.ini)} a ${esc(k.fim)})</h2><div class="cartao">${linhaR("Lote", `${num1(lo.kg_dia)} kg/dia · ${num1(lo.kg_vaca_dia)} kg/vaca`)}${linhaR("Leite por kg de ração", lo.litros_por_kg != null ? num1(lo.litros_por_kg, 2) + " L" : "—")}
    ${tabC(k.vacas.map(x => ({ v: x.codigo, l: num1(x.litros_dia), k: num1(x.kg_dia), r: x.litros_por_kg != null ? num1(x.litros_por_kg, 2) : "—" })), [["v", "Vaca"], ["l", "L/dia"], ["k", "kg/dia"], ["r", "L por kg"]])}</div>`;
}
async function dadosConsulta() {
  const s = sessao(); if (!s || s.papel !== "dono") throw new Error("A consulta é só para o dono.");
  if (!prop()) throw new Error("Escolha a propriedade no Início.");
  const r = await carregarResumo();
  const dp = dadosProp(r);
  if (!dp || !dp.consulta) throw new Error(dp && dp.antigo ? "A caixa postal ainda é a versão antiga. Peça ao Claude para atualizar a caixa postal (1.3)." : "A consulta aparece depois que o notebook sincronizar.");
  return { r, c: dp.consulta };
}
TELAS.consulta = async () => {
  const { r, c } = await dadosConsulta();
  const aba = guarda.ler("consulta_aba", "resumo");
  const ABAS = [["resumo", "Resumo"], ["rebanho", "Rebanho"], ["leite", "Leite"], ["dinheiro", "Dinheiro"], c.estoque ? ["estoque", "Estoque"] : ["gestao", "Acerto"], ...(c.contatos ? [["contatos", "Contatos"]] : [])];
  const p = PROPS[prop()];
  let corpo = "";
  if (aba === "resumo") {
    const k = c.kpis || {};
    corpo = `<div class="cartao">${linhaR("Animais", k.animais ?? "—")}${linhaR("Vacas em lactação", k.lactacao ?? "—")}${linhaR("Último leite", k.ultimo_dia ? k.ultimo_dia + " — " + num1(k.ultimo_litros) + " L" : "—")}${linhaR("Média 7 dias", k.media7 != null ? num1(k.media7) + " L/dia" : "—")}${linhaR("Receita do mês", real(k.receita_mes))}${linhaR("Custo operacional do mês", real(k.coe_mes))}</div>
      <h2>Avisos</h2><div class="cartao">${(c.alertas || []).length ? c.alertas.map(a => `<div class="alerta"><span class="ponto p-${esc(a.nivel || "azul")}"></span><div><b>${esc(a.titulo)}${a.data ? " · " + esc(a.data) : ""}</b><small>${esc(a.detalhe || "")}</small></div></div>`).join("") : `<p class="sub">Nada para avisar.</p>`}</div>
      ${(c.indices_lista || []).length ? [...new Set(c.indices_lista.map(x => x.grupo))].map(g => `<h2>Índices — ${esc(g)}</h2><div class="cartao">${c.indices_lista.filter(x => x.grupo === g).map(x => `<div class="resumo-linha"><span>${esc(x.nome)}<small class="sub" style="display:block">${esc(x.base)}${x.pequena ? " · base pequena" : ""}</small></span><b>${x.valor == null ? "—" : esc(num1(x.valor, ["%", "dias"].includes(x.unidade) ? 0 : 1)) + (x.unidade === "%" ? "%" : x.unidade ? " " + esc(x.unidade) : "")}</b></div>`).join("")}</div>`).join("") + `<p class="nota">A conta de cada índice está na Central (Rebanho). Com poucos animais, os números mudam muito a cada evento.</p>` : c.indices ? `<h2>Índices reprodutivos</h2><div class="cartao">${linhaR("Intervalo entre partos", c.indices.iep_dias ? num1(c.indices.iep_dias, 0) + " dias" : "—")}${linhaR("Prenhez nos diagnósticos", c.indices.taxa_prenhez != null ? num1(c.indices.taxa_prenhez, 0) + "%" : "—")}${linhaR("Idade ao 1º parto", c.indices.idade_1parto_meses ? num1(c.indices.idade_1parto_meses) + " meses" : "—")}</div>` : ""}`;
  } else if (aba === "rebanho") {
    const f = guarda.ler("consulta_grupo", "todos"), b = guarda.ler("consulta_busca", "");
    const cont = {}; (c.rebanho || []).forEach(a => { cont[a.grupo] = (cont[a.grupo] || 0) + 1; (a.tags || []).forEach(t => cont[t] = (cont[t] || 0) + 1); });
    const sa = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const lista = (c.rebanho || []).filter(a => noFiltroC(a, f) && (!b || sa(`${a.brinco} ${a.codigo} ${a.nome} ${a.mae || ""}`).includes(sa(b))));
    corpo = `<input id="busca-c" placeholder="Brinco, nome ou mãe" value="${esc(b)}">
      <div class="chips"><button data-g="todos" class="${f === "todos" ? "on" : ""}">Todos ${(c.rebanho || []).length}</button>${Object.entries(GRUPOS_C).filter(([g]) => cont[g]).map(([g, n]) => `<button data-g="${g}" class="${f === g ? "on" : ""}">${n} ${cont[g]}</button>`).join("")}</div>
      ${Object.keys(MARCAS_C).some(g => cont[g]) ? `<div class="chips"><span class="sub">Reprodução:</span>${Object.entries(MARCAS_C).filter(([g]) => cont[g]).map(([g, n]) => `<button data-g="${g}" class="${f === g ? "on" : ""}">${n} ${cont[g]}</button>`).join("")}</div>` : ""}
      <div class="cartao">${lista.length ? lista.map(a => `<button class="item-animal" data-ficha="${esc(a.brinco)}"><div><b>${esc(a.codigo)}${a.nome ? " " + esc(a.nome) : ""}</b><small>${esc([a.fisico ? "brinco " + a.fisico : "sem brinco", a.categoria, GRUPOS_C[a.grupo] && a.grupo !== "novilhas" && a.grupo !== "bezerras" && a.grupo !== "bezerros" ? GRUPOS_C[a.grupo] : "", a.n_lact ? a.n_lact + "ª lact." : "", a.del != null ? "DEL " + a.del : "", a.dea != null ? "DEA " + a.dea + (c.meta_dea && a.dea > c.meta_dea ? " ●" : "") : "", a.mae ? "mãe " + a.mae : ""].filter(Boolean).join(" · "))}</small>${a.repro === "prenhe" ? `<small>Prenhe${a.dias_gestacao != null ? " há " + a.dias_gestacao + " d" : ""}${a.parto_previsto ? " · parto " + esc(a.parto_previsto) + esc(prazoC(a.dias_parto)) : ""}</small>` : a.repro === "coberta" ? `<small>Coberta — aguardando diagnóstico</small>` : a.repro === "vazia" ? `<small>Vazia</small>` : ""}${a.proximo ? `<small class="${a.proximo.atrasado ? "atrasado" : ""}">${esc(a.proximo.data)} · ${esc(a.proximo.tipo)}${esc(prazoC(a.dias_prox))}</small>` : ""}${a.carencia_ate ? `<small class="atrasado">Leite em carência até ${esc(a.carencia_ate)}</small>` : ""}</div><span class="lado">${a.media7 != null ? esc(num1(a.media7)) + " L" : a.idade_meses != null ? a.idade_meses + " m" : ""} ›</span></button>`).join("") : `<p class="sub">Nenhum animal.</p>`}</div>`;
  } else if (aba === "leite") {
    const d = (c.leite && c.leite.diario) || [];
    corpo = `<h2>Dia a dia (últimos ${d.length})</h2><div class="cartao">${d.length ? barras(d.slice().reverse().map(x => ({ r: brData(x.d).slice(0, 5), v: x.litros != null ? x.litros : x.kg })), "") + `<p class="nota">Litros medidos; quando só há a pesagem do leiteiro, mostra os kg.</p>` : `<p class="sub">Sem leite lançado.</p>`}</div>
      <h2>Por mês</h2><div class="cartao">${tabC(((c.leite && c.leite.mensal) || []).slice().reverse().map(m => ({ ...m, litros: num1(m.litros, 0), media: num1(m.media), kg: m.kg ? num1(m.kg, 0) : "—" })), [["mes", "Mês"], ["litros", "Litros"], ["media", "Média/dia"], ["kg", "Kg leiteiro"]])}</div>
      ${blocoQualidadeC(c.leite && c.leite.qualidade)}${blocoConcentradoC(c.leite && c.leite.concentrado)}
      ${(c.leite && c.leite.marcos || []).length ? `<h2>Marcos de manejo</h2><div class="cartao">${c.leite.marcos.slice().reverse().map(m => linhaR(brData(m.d), m.txt)).join("")}</div>` : ""}`;
  } else if (aba === "dinheiro") {
    const fz = c.financeiro || {};
    corpo = `<div class="cartao">${fz.rotulo ? `<p class="sub">${esc(fz.rotulo)}</p>` : ""}${linhaR("Receitas", real(fz.receita))}${linhaR("Custo operacional (COE)", real(fz.coe))}${linhaR("Investimentos", real(fz.inv))}${linhaR("Resultado", real(fz.resultado))}${fz.custo_litro != null ? linhaR("Custo por litro", real(fz.custo_litro)) : ""}${fz.margem_litro != null ? linhaR("Margem por litro", real(fz.margem_litro)) : ""}</div>
      <h2>Por centro de custo</h2><div class="cartao">${(fz.por_centro || []).map(x => linhaR(x.nome || x.centro, "desp. " + real(x.desp) + (x.rec ? " · rec. " + real(x.rec) : ""))).join("") || `<p class="sub">Nada no período.</p>`}</div>
      <h2>Contas em aberto</h2><div class="cartao">${(fz.contas || []).filter(x => x.situacao !== "paga").map(x => `<div class="alerta"><span class="ponto p-${x.dias != null && x.dias < 0 ? "vermelho" : x.dias != null && x.dias <= 7 ? "amarelo" : "azul"}"></span><div><b>${x.tipo === "receber" ? "A receber" : "A pagar"} ${esc(real(x.saldo))}</b><small>${esc(x.descricao || "")}${x.pessoa ? " · " + esc(x.pessoa) : ""} · vence ${esc(x.vencimento)}</small></div></div>`).join("") || `<p class="sub">Nenhuma.</p>`}</div>
      ${(fz.fluxo || []).length ? `<h2>Fluxo de caixa</h2><div class="cartao">${tabC(fz.fluxo.slice().reverse().map(x => ({ mes: x.mes, e: real(x.entradas), s: real(x.saidas), a: real(x.acumulado) })), [["mes", "Mês"], ["e", "Entradas"], ["s", "Saídas"], ["a", "Acumulado"]])}</div>` : ""}`;
  } else if (aba === "contatos") {
    const b = guarda.ler("contato_busca", "");
    const sa = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const lst = (c.contatos || []).filter(x => !b || sa(`${x.nome} ${x.empresa} ${x.cidade} ${x.categoria} ${x.observacao}`).includes(sa(b)));
    const fone = t => { const z = zapC(t); return `<a href="tel:${esc(String(t).replace(/[^\d+]/g, ""))}">${esc(t)}</a>${z ? ` · <a href="${z}" target="_blank" rel="noopener">WhatsApp</a>` : ""}`; };
    corpo = `<input id="busca-ct" placeholder="Nome, loja, cidade…" value="${esc(b)}">
      <div class="cartao">${lst.length ? lst.map(x => `<div class="contato"><b>${esc(x.empresa || x.nome)}</b>${x.empresa && x.nome ? `<small>${esc(x.nome)}</small>` : ""}<small>${esc([x.categoria_nome || x.categoria, x.cidade, x.propriedade && x.propriedade !== "ambas" ? x.propriedade : ""].filter(Boolean).join(" · "))}</small>
        ${x.telefone ? `<div>${fone(x.telefone)}</div>` : ""}${x.telefone2 ? `<div>${fone(x.telefone2)}</div>` : ""}${x.email ? `<div><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div>` : ""}${x.observacao ? `<small>${esc(x.observacao)}</small>` : ""}</div>`).join("") : `<p class="sub">${(c.contatos || []).length ? "Nada nesta busca." : "Nenhum contato cadastrado (cadastre na Central)."}</p>`}</div>`;
  } else if (aba === "estoque") {
    const e = c.estoque || {};
    corpo = `<div class="cartao">${(e.itens || []).map(i => `<div class="alerta"><span class="ponto p-${i.situacao === "pedir agora" ? "vermelho" : i.situacao === "pedir em breve" ? "amarelo" : "azul"}"></span><div><b>${esc(i.insumo)}</b><small>${i.saldo != null ? esc(num1(i.saldo, 0)) + " kg" : "sem saldo"}${i.dias != null ? " · dá para " + esc(num1(i.dias, 0)) + " dias" : ""} · ${esc(i.situacao)}</small></div></div>`).join("") || `<p class="sub">Sem insumos.</p>`}</div>
      ${e.pedido && e.pedido.itens && e.pedido.itens.length ? `<h2>Pedido sugerido</h2><div class="cartao">${e.pedido.itens.map(x => linhaR(x.insumo, (x.embalagens || x.qtd || "") + " " + (x.embalagem || "kg"))).join("")}${linhaR("Total", real(e.pedido.total))}</div>` : ""}`;
  } else {
    const g = c.gestao || {};
    corpo = `<h2>Acerto com o Bob</h2><div class="cartao"><p>${esc((g.acerto && g.acerto.texto) || "—")}</p></div>
      <h2>Partos recentes</h2><div class="cartao">${tabC((g.partos || []).slice().reverse(), [["data_br", "Data"], ["vaca", "Vaca"], ["detalhe", "Cria"]])}</div>
      <h2>Movimentações</h2><div class="cartao">${tabC((g.movs || []).slice().reverse(), [["data_br", "Data"], ["codigo", "Animal"], ["tipo", "Tipo"], ["observacao", "Obs."]])}</div>`;
  }
  app.innerHTML = `${voltar()}<div class="faixa-prop" style="background:${p.cor}">Consulta: <b>${esc(p.titulo)}</b></div>
    <p class="sub">Só leitura · dados de ${esc(r.gerado_em || "—")} (do notebook). Para lançar, use os botões do Início.</p>
    <div class="chips abas">${ABAS.map(([k, n]) => `<button data-aba="${k}" class="${aba === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}`;
  ligarVoltar();
  $$("[data-aba]").forEach(x => x.onclick = () => { guarda.gravar("consulta_aba", x.dataset.aba); TELAS.consulta(); });
  $$("[data-g]").forEach(x => x.onclick = () => { guarda.gravar("consulta_grupo", x.dataset.g); TELAS.consulta(); });
  $$("[data-ficha]").forEach(x => x.onclick = () => ir("ficha", { brinco: x.dataset.ficha }));
  const bc = $("#busca-c"); if (bc) bc.onchange = () => { guarda.gravar("consulta_busca", bc.value.trim()); TELAS.consulta(); };
  const bt = $("#busca-ct"); if (bt) bt.onchange = () => { guarda.gravar("contato_busca", bt.value.trim()); TELAS.consulta(); };
};
TELAS.ficha = async ({ brinco } = {}) => {
  const { c } = await dadosConsulta();
  brinco = brinco || guarda.ler("consulta_ficha", "");
  guarda.gravar("consulta_ficha", brinco);
  const f = (c.fichas || {})[brinco];
  if (!f) throw new Error("Ficha não encontrada nesta propriedade.");
  const a = f.cadastro || {};
  const cad = [["Código", a.codigo], ["Brinco físico", a.brinco_fisico], ["Categoria", a.categoria], ["Sexo", a.sexo === "F" ? "Fêmea" : a.sexo === "M" ? "Macho" : a.sexo], ["Raça", [a.raca, a.grau_sangue].filter(Boolean).join(" ")], ["Pelagem", a.pelagem], ["Nascimento", a.nascimento ? a.nascimento + (a.nasc_estimado ? " (estimada)" : "") : ""], ["Idade estimada", a.idade_estimada], ["Mãe", a.mae], ["Pai", a.pai], ["Crias", a.crias], ["Registro", a.registro], ["Origem", a.origem], ["Entrada", a.data_entrada], ["Peso", a.peso_kg && a.peso_kg + " kg"], ["ECC", a.ecc]].filter(x => x[1]);
  app.innerHTML = `<button class="voltar" id="voltar-c">‹ Consulta</button><h1>${esc(a.codigo)} ${esc(a.nome || "")}</h1>
    <p class="sub">${esc([f.estado, ...(f.linhas || [])].filter(Boolean).join(" · "))}</p>
    ${f.carne_ate ? `<div class="erro">Carência da carne até ${esc(f.carne_ate)}</div>` : ""}
    ${(f.alertas || []).length ? `<h2>Próximos passos</h2><div class="cartao">${f.alertas.map(x => `<div class="alerta"><span class="ponto p-${x.atrasado ? "vermelho" : "azul"}"></span><div><b>${esc(x.tipo)} · ${esc(x.data)}</b><small>${esc(x.texto)}</small></div></div>`).join("")}</div>` : ""}
    ${(f.leite30 || []).length ? `<h2>Leite (30 dias)</h2><div class="cartao">${barras(f.leite30.slice().reverse().map(x => ({ r: x.curta || x.data, v: x.litros })), " L")}</div>` : ""}
    <h2>Cadastro</h2><div class="cartao">${cad.map(([k, v]) => linhaR(k, v)).join("")}${a.observacoes ? `<p class="sub">${esc(a.observacoes)}</p>` : ""}</div>
    ${(f.lactacoes || []).length ? `<h2>Lactações</h2><div class="cartao">${tabC(f.lactacoes, [["n", "Nº"], ["inicio", "Início"], ["del", "DEL"], ["litros", "Litros"], ["media", "Média"]])}</div>` : ""}
    <h2>Reprodução</h2><div class="cartao">${tabC((f.repro || []).slice().reverse(), [["data_br", "Data"], ["evento", "Evento"], ["detalhe", "Detalhe"], ["resultado", "Resultado"]])}</div>
    <h2>Sanidade</h2><div class="cartao">${tabC((f.sanidade || []).slice().reverse(), [["data_br", "Data"], ["tipo", "Tipo"], ["produto", "Produto"], ["liberacao_leite_br", "Leite liberado"]])}</div>
    ${(f.ccs || []).length ? `<h2>CCS individual</h2><div class="cartao">${tabC(f.ccs.map(x => ({ d: x.data_br, v: num1(x.ccs, 0) + " mil" + (x.alta ? " ✖" : "") })), [["d", "Data"], ["v", "CCS"]])}</div>` : ""}
    ${(f.pesagens || []).length ? `<h2>Pesagens</h2><div class="cartao">${tabC(f.pesagens.slice().reverse(), [["data_br", "Data"], ["peso", "Kg"], ["metodo", "Método"]])}</div>` : ""}
    ${f.memoria ? `<h2>Ficha (contexto)</h2><div class="cartao pre">${esc(f.memoria.replace(/^#.*\n/, "").trim())}</div>` : ""}`;
  $("#voltar-c").onclick = () => ir("consulta");
};

function saudacao() { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }

/* ---------------------------------------------------------------- aparência (temas) */
TELAS.aparencia = async () => {
  const atual = guarda.ler("tema", "auto");
  app.innerHTML = `${voltar()}<h1>Aparência</h1><p class="sub">Escolha as cores do app neste celular.</p>
    <div class="temas">${TEMAS.map(([id, nome, cores]) => `<button class="tema-op ${atual === id ? "on" : ""}" data-tema="${id}"><span class="amostra">${cores.map(c => `<span style="background:${c}"></span>`).join("")}</span><span><b>${esc(nome)}</b>${atual === id ? "<br><small class='sub'>em uso</small>" : ""}</span></button>`).join("")}</div>`;
  ligarVoltar();
  $$("[data-tema]").forEach(b => b.onclick = () => { guarda.gravar("tema", b.dataset.tema); aplicarTema(b.dataset.tema); TELAS.aparencia(); });
};
TELAS.semconvite_aparencia = TELAS.aparencia;

/* ---------------------------------------------------------------- formulário genérico */
function faixaProp() { const p = PROPS[prop()]; return p ? `<div class="faixa-prop" style="background:${p.cor}">Lançando para: <b>${esc(p.titulo)}</b> <button type="button" class="link" id="trocar-prop">trocar</button></div>` : ""; }
function escolherProp(depois) {
  app.innerHTML = `<h1>Para qual propriedade?</h1><p class="sub">Os dados de uma nunca entram na outra. Dá para trocar depois no Início.</p>
    <div class="grade">${Object.entries(PROPS).map(([k, p]) => `<button class="botao-grande" data-p="${k}" style="border-color:${p.cor}"><span class="ic" style="color:${p.cor}">■</span><b>${esc(p.nome)}</b><small>${k === "TR" ? "gado a pasto" : "gado confinado"}</small></button>`).join("")}</div>`;
  $$("[data-p]").forEach(b => b.onclick = () => { guarda.gravar("prop", b.dataset.p); aviso("Agora: " + PROPS[b.dataset.p].titulo); depois(); });
}
function formulario(titulo, corpoHtml, coletar, resumoTxt, tipo, depois) {
  if (TIPOS_COM_PROP.includes(tipo) && !prop()) return escolherProp(() => mostrar(location.hash.slice(1) || "inicio"));
  const comProp = TIPOS_COM_PROP.includes(tipo);
  app.innerHTML = `${voltar()}${comProp ? faixaProp() : ""}<h1>${titulo}</h1><form id="f" class="cartao" novalidate>${corpoHtml}<button class="btn prim larga">Revisar</button><div id="msg"></div></form>`;
  ligarVoltar();
  const tp = $("#trocar-prop"); if (tp) tp.onclick = () => escolherProp(() => mostrar(location.hash.slice(1) || "inicio"));
  const f = $("#f");
  f.onsubmit = e => {
    e.preventDefault();
    $("#msg").innerHTML = "";
    let dados;
    try { dados = coletar(f); } catch (er) { $("#msg").innerHTML = `<div class="erro">${esc(er.message)}</div>`; return; }
    app.innerHTML = `${comProp ? faixaProp() : ""}<h1>Confira</h1><div class="cartao pre">${comProp ? "PROPRIEDADE: " + esc(PROPS[prop()].titulo) + "\n\n" : ""}${esc(resumoTxt(dados))}</div>
      <div class="linha-botoes"><button class="btn" id="corrigir">Corrigir</button><button class="btn prim" id="confirmar">Confirmar e enviar</button></div>`;
    $("#corrigir").onclick = () => { formulario(titulo, corpoHtml, coletar, resumoTxt, tipo, depois); preencher($("#f"), dados); if (depois) depois($("#f")); };
    $("#confirmar").onclick = () => {
      try { enfileirar(tipo, dados); } catch (er) { aviso(er.message, 6000); return; }
      app.innerHTML = `<div class="ok"><b>${navigator.onLine ? "Enviando…" : "Guardado no celular."}</b><p>${navigator.onLine ? "Você recebe a confirmação em instantes." : "Vai sozinho quando tiver sinal. Pode continuar lançando."}</p></div>
        <div class="linha-botoes"><button class="btn" id="outro">Lançar outro</button><button class="btn prim" id="inicio">Início</button></div>`;
      $("#outro").onclick = () => mostrar(location.hash.slice(1) || "inicio");
      $("#inicio").onclick = () => ir("inicio");
    };
  };
  if (depois) depois(f);
}
function preencher(f, dados) {
  Object.entries(dados).forEach(([k, v]) => {
    if (k === "vacas" || k === "concentrado") { Object.entries(v).forEach(([b, l]) => { const i = f.querySelector(`[name="${k === "vacas" ? "v" : "c"}_${b}"]`); if (i) i.value = l; }); return; }
    if (Array.isArray(v)) { v.forEach(x => { const c = f.querySelector(`[name="${k}"][value="${x}"]`); if (c) c.checked = true; }); return; }
    const el = f.querySelector(`[name="${k}"]`);
    if (!el) return;
    if (el.type === "radio") { const c = f.querySelector(`[name="${k}"][value="${v}"]`); if (c) c.checked = true; }
    else el.value = v;
  });
}
const val = (f, n) => (f.querySelector(`[name="${n}"]`)?.value || "").trim();
const marcado = (f, n) => (f.querySelector(`[name="${n}"]:checked`) || {}).value || "";
const marcados = (f, n) => $$(`[name="${n}"]:checked`, f).map(c => c.value);
const campoData = (rot = "Data") => `<label>${rot}</label><input type="date" name="data" value="${hoje()}" max="${hoje()}" required>`;
const radios = (nome, ops, sel = "") => `<div class="opcoes">${ops.map(([v, n]) => `<label><input type="radio" name="${nome}" value="${esc(v)}" ${v === sel ? "checked" : ""}>${esc(n)}</label>`).join("")}</div>`;
const checks = (nome, ops) => `<div class="opcoes">${ops.map(([v, n]) => `<label><input type="checkbox" name="${nome}" value="${esc(v)}">${esc(n)}</label>`).join("")}</div>`;
const optAnimais = (lista, rot = "Escolha o animal") => `<option value="">${rot}…</option>` + lista.map(a => `<option value="${esc(a.brinco)}">${esc(rotAnimal(a))}${a.categoria !== "vaca" ? " (" + esc(a.categoria) + ")" : ""}</option>`).join("");
function dataOk(d) { exigir(/^\d{4}-\d{2}-\d{2}$/.test(d), "Informe a data."); exigir(d <= hoje(), "A data não pode ser no futuro."); return d; }

/* ---------------------------------------------------------------- leite */
TELAS.leite = async () => {
  const r = await carregarResumo();
  const vacas = lactantes(r);
  const duas = (r.ordenhas_por_dia || 1) > 1;
  const comConc = prop() === "WM";
  formulario("Leite do dia", `${campoData("Data da ordenha")}
    ${duas ? `<label>Qual ordenha</label>${radios("ordenha", [["1", "Manhã"], ["2", "Tarde"]], new Date().getHours() < 12 ? "1" : "2")}` : ""}
    <label>Litros por vaca${comConc ? " e ração (kg) dada na ordenha" : ""}</label>
    ${vacas.length ? `<div class="vacas">${vacas.map(a => `<label><span><b>${esc(a.codigo || a.brinco)}</b> ${esc(a.nome || "")}</span><input name="v_${esc(a.brinco)}" inputmode="decimal" placeholder="litros">${comConc ? `<input name="c_${esc(a.brinco)}" inputmode="decimal" placeholder="ração kg" class="conc">` : ""}</label>`).join("")}</div><p class="nota">Deixe em branco a vaca que não ordenhou.${comConc ? " Ração: só se pesou o concentrado de cada vaca (opcional)." : ""}</p>`
      : `<p class="nota">A lista de vacas aparece depois que o notebook sincronizar. Por enquanto, lance o total do tanque.</p>`}
    <label>Total do tanque (litros)</label><input name="total" inputmode="decimal" placeholder="se mediu">
    <label>Observação</label><input name="obs" placeholder="vaca que não ordenhou, leite separado…">`,
    f => {
      const d = { data: dataOk(val(f, "data")), ordenha: duas ? marcado(f, "ordenha") || "1" : "1", vacas: {}, concentrado: {}, total: "", obs: val(f, "obs") };
      d.ordenha_nome = duas ? (d.ordenha === "1" ? "manhã" : "tarde") : "ordenha do dia";
      for (const a of vacas) {
        const v = val(f, "v_" + a.brinco), c = comConc ? val(f, "c_" + a.brinco) : "";
        if (c) { const k = numero(c); exigir(k != null && k >= 0 && k <= 30, `Ração da ${a.brinco} não parece certa: "${c}" (0 a 30 kg).`); exigir(v, `Informe os litros da ${a.brinco} (a ração vai junto com o leite).`); d.concentrado[a.brinco] = virgula(k); }
        if (v) { const n = numero(v); exigir(n != null && n >= 0 && n <= 80, `Litros da ${a.brinco} não parecem certos: "${v}".`); d.vacas[a.brinco] = virgula(n); }
      }
      if (!Object.keys(d.concentrado).length) delete d.concentrado;
      const t = val(f, "total"); if (t) { const n = numero(t); exigir(n != null && n > 0 && n <= 5000, "Total do tanque inválido."); d.total = virgula(n); }
      exigir(Object.keys(d.vacas).length || d.total, "Informe os litros de pelo menos uma vaca ou o total do tanque.");
      return d;
    },
    d => { const vs = Object.entries(d.vacas); const soma = vs.reduce((s, [, v]) => s + numero(v), 0);
      const cc = d.concentrado || {};
      return `Data: ${brData(d.data)} (${d.ordenha_nome})\n` + vs.map(([b, v]) => `Vaca ${b}: ${v} L${cc[b] ? " · ração " + cc[b] + " kg" : ""}`).join("\n") + (vs.length ? `\nSoma: ${virgula(Math.round(soma * 10) / 10)} L` : "") + (d.total ? `\nTanque: ${d.total} L` : "") + (d.obs ? `\nObs.: ${d.obs}` : ""); },
    "leite");
};

/* ---------------------------------------------------------------- trato */
TELAS.trato = async () => {
  const r = await carregarResumo();
  const lotes = (r.lotes && r.lotes.length ? r.lotes : ["Vacas em lactação", "Vacas secas", "Bezerras", "Novilhas"]);
  const produtos = r.produtos_trato && r.produtos_trato.length ? r.produtos_trato : ["palma forrageira", "bagaço de cana", "ração (mistura)"];
  formulario("Trato", `<label>Data e hora</label><input type="datetime-local" name="quando" value="${agoraLocal()}" max="${agoraLocal()}" required>
    <label>Lote</label>${radios("lote", lotes.map(l => [l, l]), lotes[0])}
    <label>Produto</label><select name="produto" required><option value="">Escolha…</option>${produtos.map(p => `<option>${esc(p)}</option>`).join("")}<option value="outro">Outro (escrever)</option></select>
    <div id="bl-outro" style="display:none"><label>Qual produto</label><input name="produto_outro"></div>
    <label>Quantidade</label><input name="quantidade" inputmode="decimal" required placeholder="ex.: 350">
    <label>Unidade</label>${radios("unidade", [["kg", "kg"], ["saco", "saco"], ["carrinho", "carrinho de mão"], ["balde", "balde"]], "kg")}
    <label>Observação</label><input name="obs" placeholder="opcional">`,
    f => {
      const q = val(f, "quando"); exigir(q && q.slice(0, 10) <= hoje(), "Data/hora inválida.");
      const prod = val(f, "produto") === "outro" ? val(f, "produto_outro") : val(f, "produto");
      exigir(prod, "Escolha o produto.");
      const n = numero(val(f, "quantidade")); exigir(n != null && n > 0 && n < 100000, "Quantidade inválida.");
      return { data: q.slice(0, 10), hora: q.slice(11, 16), lote: marcado(f, "lote"), produto: prod, quantidade: virgula(n), unidade: marcado(f, "unidade") || "kg", obs: val(f, "obs") };
    },
    d => `Data: ${brData(d.data)} às ${d.hora}\nLote: ${d.lote}\nProduto: ${d.produto}\nQuantidade: ${d.quantidade} ${d.unidade}${d.obs ? "\nObs.: " + d.obs : ""}`,
    "trato",
    f => { const s = f.querySelector("[name=produto]"); s.onchange = () => { $("#bl-outro").style.display = s.value === "outro" ? "" : "none"; }; s.onchange(); });
};

/* ---------------------------------------------------------------- ocorrência */
const OCORRENCIAS = [["cio", "Cio"], ["parto", "Parto"], ["doente", "Vaca doente"], ["remedio", "Remédio aplicado"]];
TELAS.ocorrencia = async () => {
  const r = await carregarResumo();
  const lista = animais(r);
  formulario("Ocorrência", `<label>O que aconteceu</label>${radios("ocorrencia", OCORRENCIAS)}
    ${campoData()}
    <label>Animal</label>${lista.length ? `<select name="brinco" required>${optAnimais(lista)}</select>` : `<input name="brinco" inputmode="numeric" placeholder="número do brinco" required>`}
    <div data-oc="cio"><label>Quando viu</label>${radios("periodo", [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]])}
      <label>O que viu</label>${checks("sinais_cio", [["parada", "Parada para montar"], ["montando", "Montando nas outras"], ["muco", "Muco claro"], ["inquieta", "Inquieta / berrando"]])}</div>
    <div data-oc="parto"><label>Nasceu</label>${radios("cria", [["bezerra", "Bezerra"], ["bezerro", "Bezerro"], ["gemeos", "Gêmeos"], ["morto", "Nasceu morto"]])}
      <label>Como foi</label>${radios("ajuda", [["sozinha", "Sozinha"], ["ajuda", "Precisou de ajuda"]])}
      <label>Placenta saiu?</label>${radios("placenta", [["sim", "Sim"], ["nao", "Ainda não"]])}
      <label>Cria mamou o colostro?</label>${radios("colostro", [["sim", "Sim"], ["nao", "Ainda não"]])}</div>
    <div data-oc="doente"><label>O que tem</label>${checks("sinais", [["nao_come", "Não come"], ["febre", "Febre / quente"], ["manca", "Mancando"], ["leite_alterado", "Leite com grumo"], ["diarreia", "Diarreia"], ["caida", "Caída / fraca"]])}</div>
    <div data-oc="remedio"><label>Remédio (nome da caixa)</label><input name="produto">
      <label>Quanto aplicou</label><input name="dose" placeholder="ex.: 10 ml">
      <label>Como aplicou</label><select name="via"><option value="">Escolha…</option><option>Injeção no músculo</option><option>Injeção na veia</option><option>Injeção debaixo do couro</option><option>Dentro do úbere (bisnaga)</option><option>Pela boca</option><option>Derramado no lombo</option><option>Na pele / ferida</option></select>
      <label>Carência do LEITE (dias, da bula)</label><input name="carencia" inputmode="numeric" placeholder="ex.: 4">
      <label>Carência da CARNE (dias, da bula)</label><input name="carencia_carne" inputmode="numeric" placeholder="ex.: 30">
      <p class="nota">Não sabe a carência? Deixe em branco: o Wagner confere antes de lançar. Leite dessa vaca fora do tanque até lá.</p></div>
    <label>Observação</label><textarea name="obs" placeholder="detalhes"></textarea>`,
    f => {
      const oc = marcado(f, "ocorrencia"); exigir(oc, "Escolha o que aconteceu.");
      const d = { ocorrencia: oc, data: dataOk(val(f, "data")), brinco: val(f, "brinco"), obs: val(f, "obs") };
      exigir(d.brinco, "Escolha o animal.");
      if (oc === "cio") { d.periodo = marcado(f, "periodo"); d.sinais_cio = marcados(f, "sinais_cio"); }
      if (oc === "parto") { d.cria = marcado(f, "cria"); exigir(d.cria, "Diga o que nasceu."); d.ajuda = marcado(f, "ajuda"); d.placenta = marcado(f, "placenta"); d.colostro = marcado(f, "colostro"); }
      if (oc === "doente") { d.sinais = marcados(f, "sinais"); exigir(d.sinais.length || d.obs, "Diga o que a vaca tem."); }
      if (oc === "remedio") {
        d.produto = val(f, "produto"); exigir(d.produto, "Informe o nome do remédio.");
        d.dose = val(f, "dose"); d.via = val(f, "via"); d.carencia = val(f, "carencia"); d.carencia_carne = val(f, "carencia_carne");
        if (d.carencia) exigir(/^\d{1,3}$/.test(d.carencia), "Carência do leite em dias (número)."); if (d.carencia_carne) exigir(/^\d{1,3}$/.test(d.carencia_carne), "Carência da carne em dias (número).");
      }
      return d;
    },
    d => {
      const nome = Object.fromEntries(OCORRENCIAS)[d.ocorrencia];
      let t = `${nome} — animal ${d.brinco}\nData: ${brData(d.data)}`;
      if (d.ocorrencia === "cio") t += `${d.periodo ? "\nQuando: " + d.periodo : ""}${d.sinais_cio.length ? "\nSinais: " + d.sinais_cio.join(", ") : ""}`;
      if (d.ocorrencia === "parto") t += `\nNasceu: ${d.cria}${d.ajuda ? "\nParto: " + d.ajuda : ""}${d.placenta ? "\nPlacenta saiu: " + d.placenta : ""}${d.colostro ? "\nMamou colostro: " + d.colostro : ""}`;
      if (d.ocorrencia === "doente") t += `\nSinais: ${d.sinais.join(", ")}`;
      if (d.ocorrencia === "remedio") t += `\nRemédio: ${d.produto}${d.dose ? " — " + d.dose : ""}${d.via ? "\nVia: " + d.via : ""}\nCarência leite: ${d.carencia ? d.carencia + " dias" : "não informada (Wagner confere)"}${d.carencia_carne ? "\nCarência carne: " + d.carencia_carne + " dias" : ""}`;
      return t + (d.obs ? "\nObs.: " + d.obs : "");
    },
    "ocorrencia",
    f => { const atual = () => { const oc = marcado(f, "ocorrencia"); $$("[data-oc]", f).forEach(b => b.style.display = b.dataset.oc === oc ? "" : "none"); }; $$("[name=ocorrencia]", f).forEach(x => x.onchange = atual); atual(); });
};

/* ---------------------------------------------------------------- chuva */
TELAS.chuva = async () => {
  formulario("Chuva", `${campoData("Data da leitura")}<label>Milímetros no pluviômetro</label><input name="mm" inputmode="decimal" required placeholder="ex.: 12">
    <p class="nota">Leia e esvazie o pluviômetro sempre no mesmo horário.</p><label>Observação</label><input name="obs" placeholder="opcional">`,
    f => { const n = numero(val(f, "mm")); exigir(n != null && n >= 0 && n <= 400, "Milímetros inválidos."); return { data: dataOk(val(f, "data")), mm: virgula(n), obs: val(f, "obs") }; },
    d => `Data: ${brData(d.data)}\nChuva: ${d.mm} mm${d.obs ? "\nObs.: " + d.obs : ""}`, "chuva");
};

/* ---------------------------------------------------------------- comprovante (dono) */
TELAS.comprovante = async () => {
  if (sessao().papel !== "dono") return ir("inicio");
  app.innerHTML = `${voltar()}<h1>Comprovante</h1><form id="f" class="cartao">
    <label>Foto ou PDF</label><input type="file" name="arq" accept="image/*,application/pdf" required>
    <label>Pago com</label>${radios("pago_com", [["caixa", "Dinheiro da fazenda"], ["meu", "Meu dinheiro (vira aporte)"]], "caixa")}
    <label>Observação</label><input name="obs" placeholder="ex.: diária do Coroa, frete do bagaço">
    <p class="nota">O comprovante é lido no notebook (valor, data, quem recebeu). O que não ficar claro vai para "A conferir".</p>
    <button class="btn prim larga">Enviar</button><div id="msg"></div></form>`;
  ligarVoltar();
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const msg = $("#msg"); msg.innerHTML = `<p class="sub">Preparando…</p>`;
    try {
      const arq = $("[name=arq]").files[0]; exigir(arq, "Escolha a foto ou o PDF.");
      let mime = arq.type, b64;
      if (mime.startsWith("image/")) { ({ mime, b64 } = await reduzirImagem(arq)); }
      else { exigir(mime === "application/pdf", "Envie foto ou PDF."); exigir(arq.size <= 8e6, "PDF maior que 8 MB."); b64 = await paraBase64(arq); }
      exigir(navigator.onLine, "Sem sinal: comprovante só vai com internet. Tente quando tiver sinal.");
      msg.innerHTML = `<p class="sub">Enviando…</p>`;
      await api("comprovante", { token: sessao().token, id: uid(), mime, base64: b64, dados: { pago_com: marcado($("#f"), "pago_com"), obs: val($("#f"), "obs"), enviado_em: new Date().toISOString() } });
      app.innerHTML = `<div class="ok"><b>Comprovante enviado ✔</b><p>Será lido quando o notebook sincronizar.</p></div><button class="btn prim larga" id="inicio">Início</button>`;
      $("#inicio").onclick = () => ir("inicio");
    } catch (er) { msg.innerHTML = `<div class="erro">${esc(er.message)}</div>`; }
  };
};
function paraBase64(blob) { return new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = falha; fr.readAsDataURL(blob); }); }
async function reduzirImagem(arq) {
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("Não consegui abrir a foto.")); i.src = url; });
    const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.8));
    return { mime: "image/jpeg", b64: await paraBase64(blob) };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------------------------------------------------------- ajustes (dono): Telegram */
TELAS.ajustes = async () => {
  if (sessao().papel !== "dono") return ir("inicio");
  const r = await carregarResumo(true);
  app.innerHTML = `${voltar()}<h1>Avisos</h1>
    <div class="cartao"><b>E-mail</b><p class="sub">Ligado: cada envio do app gera um e-mail para você.</p></div>
    <div class="cartao"><b>Telegram ${r.telegram ? "— ligado ✔" : ""}</b>
      <p class="sub">1) No Telegram, procure <b>@BotFather</b>, mande <b>/newbot</b>, escolha um nome (ex.: Fazenda WM Avisos) e um usuário terminado em "bot".<br>
      2) Copie o <b>token</b> que ele mandar (números, dois-pontos e letras) e cole aqui.</p>
      <label>Token do robô</label><input id="tok" autocomplete="off" placeholder="123456789:AA…">
      <button class="btn prim larga" id="salvar">Salvar token</button>
      <p class="sub" style="margin-top:14px">3) Abra o seu robô no Telegram, toque em <b>Iniciar</b> e depois:</p>
      <button class="btn larga" id="vincular">Ligar avisos neste Telegram</button><div id="msg"></div></div>`;
  ligarVoltar();
  const msg = $("#msg");
  $("#salvar").onclick = async () => { msg.innerHTML = ""; try { const j = await api("telegram_config", { token: sessao().token, bot_token: $("#tok").value }); $("#tok").value = ""; msg.innerHTML = `<div class="ok">Token aceito: robô ${esc(j.robo)}. Agora faça o passo 3.</div>`; } catch (e) { msg.innerHTML = `<div class="erro">${esc(e.message)}</div>`; } };
  $("#vincular").onclick = async () => { msg.innerHTML = ""; try { await api("telegram_vincular", { token: sessao().token }); msg.innerHTML = `<div class="ok">Pronto! Você deve ter recebido uma mensagem de teste no Telegram.</div>`; guarda.tirar("resumo"); } catch (e) { msg.innerHTML = `<div class="erro">${esc(e.message)}</div>`; } };
};

/* ---------------------------------------------------------------- início do app */
(function iniciar() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) {
    const id = h.get("c").replace(/[^A-Za-z0-9_-]/g, "");
    guarda.gravar("endpoint", id);
    const codigo = (h.get("k") || "").replace(/[^A-Za-z0-9]/g, "");
    history.replaceState({ tela: codigo ? "convite" : "entrar" }, "", codigo ? "#convite" : "#entrar");
    if (codigo) { mostrar("convite", { codigo }); } else mostrar("entrar");
  } else {
    const t = location.hash.slice(1) || "inicio";
    history.replaceState({ tela: t }, "", "#" + t);
    mostrar(t === "convite" ? "entrar" : t);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
  enviarFila();
})();

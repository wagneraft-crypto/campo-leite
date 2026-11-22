/* App de campo — Fazenda Paquetá. Telas estáticas; dados vão para a caixa postal no Google do Wagner.
   Sem sinal: guarda no celular (fila) e envia depois, sem duplicar (cada lançamento tem um código único). */
"use strict";
const VERSAO = "1.1.0";
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
  const s = sessao(); $("#quem").textContent = s ? `${s.nome}${s.papel === "dono" ? " · dono" : ""}` : "App de campo";
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
const animais = r => (r && r.animais) || [];
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
    <p class="sub">Crie seu acesso ao app de campo da Fazenda Paquetá. Você vai entrar com o seu CPF e a senha que criar agora.</p>
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
  const alertas = r.alertas || [];
  const prod = (r.producao || []).slice(-5).reverse();
  app.innerHTML = `
    <h1>${saudacao()}, ${esc(s.nome.split(" ")[0])}</h1>
    <p class="sub">${r.gerado_em ? "Dados da fazenda atualizados em " + esc(r.gerado_em) : r.semRede ? "Sem sinal: os lançamentos ficam guardados e vão depois." : "O resumo da fazenda aparece depois que o notebook sincronizar."}</p>
    <div class="grade">
      <button class="botao-grande" data-ir="leite"><span class="ic">🥛</span><b>Leite</b><small>medição do dia</small></button>
      <button class="botao-grande" data-ir="trato"><span class="ic">🌵</span><b>Trato</b><small>palma, ração, bagaço</small></button>
      <button class="botao-grande" data-ir="ocorrencia"><span class="ic">🐄</span><b>Ocorrência</b><small>cio, parto, doente, remédio</small></button>
      <button class="botao-grande" data-ir="chuva"><span class="ic">🌧️</span><b>Chuva</b><small>pluviômetro</small></button>
      ${dono ? `<button class="botao-grande" data-ir="comprovante"><span class="ic">🧾</span><b>Comprovante</b><small>foto ou PDF de pagamento</small></button>
      <button class="botao-grande" data-ir="ajustes"><span class="ic">⚙️</span><b>Avisos</b><small>e-mail e Telegram</small></button>` : ""}
    </div>
    ${fila().length ? `<div class="cartao" style="margin-top:12px"><b>${fila().length} lançamento(s) guardado(s) neste celular</b><p class="sub">Vão sozinhos quando tiver sinal.</p><button class="btn peq" id="enviar-ja">Enviar agora</button></div>` : ""}
    <h2>Minhas tarefas</h2>
    <div class="cartao">${tarefas.length ? tarefas.map(t => `<div class="tarefa ${feitas.has(t.id) ? "feita" : ""}"><div><b>${esc(t.texto)}</b><small class="sub">${t.prazo ? "até " + esc(t.prazo) : ""}${dono && t.para ? " · " + esc(t.para) : ""}</small></div>
      ${feitas.has(t.id) ? `<small class="sub">feita ✔</small>` : `<button class="btn peq" data-concluir="${esc(t.id)}">Concluir</button>`}</div>`).join("") : `<p class="sub">Nenhuma tarefa.</p>`}</div>
    <h2>Avisos da fazenda</h2>
    <div class="cartao">${alertas.length ? alertas.map(a => `<div class="alerta"><span class="ponto p-${esc(a.nivel || "azul")}"></span><div><b>${esc(a.titulo)}</b><small>${esc(a.detalhe || "")}</small></div></div>`).join("") : `<p class="sub">Nada para avisar.</p>`}</div>
    ${prod.length ? `<h2>Leite dos últimos dias</h2><div class="cartao"><table class="tab">${prod.map(p => `<tr><td>${esc(p.data)}</td><td class="n"><b>${esc(virgula(p.litros))} L</b></td></tr>`).join("")}</table></div>` : ""}
    ${dono && r.financeiro ? `<h2>Dinheiro (${esc(r.financeiro.mes || "")})</h2><div class="cartao">${(r.financeiro.linhas || []).map(l => `<div class="resumo-linha"><span>${esc(l[0])}</span><b>${esc(l[1])}</b></div>`).join("")}</div>` : ""}
    <div class="rodape"><button id="atualizar">Atualizar</button> · <button id="aparencia">Aparência</button> · <button id="sair">Sair</button><br>versão ${VERSAO}</div>`;
  $$("[data-ir]").forEach(b => b.onclick = () => ir(b.dataset.ir));
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
function formulario(titulo, corpoHtml, coletar, resumoTxt, tipo, depois) {
  app.innerHTML = `${voltar()}<h1>${titulo}</h1><form id="f" class="cartao" novalidate>${corpoHtml}<button class="btn prim larga">Revisar</button><div id="msg"></div></form>`;
  ligarVoltar();
  const f = $("#f");
  f.onsubmit = e => {
    e.preventDefault();
    $("#msg").innerHTML = "";
    let dados;
    try { dados = coletar(f); } catch (er) { $("#msg").innerHTML = `<div class="erro">${esc(er.message)}</div>`; return; }
    app.innerHTML = `<h1>Confira</h1><div class="cartao pre">${esc(resumoTxt(dados))}</div>
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
    if (k === "vacas") { Object.entries(v).forEach(([b, l]) => { const i = f.querySelector(`[name="v_${b}"]`); if (i) i.value = l; }); return; }
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
const optAnimais = (lista, rot = "Escolha o animal") => `<option value="">${rot}…</option>` + lista.map(a => `<option value="${esc(a.brinco)}">${esc(a.brinco)}${a.nome ? " — " + esc(a.nome) : ""}${a.categoria !== "vaca" ? " (" + esc(a.categoria) + ")" : ""}</option>`).join("");
function dataOk(d) { exigir(/^\d{4}-\d{2}-\d{2}$/.test(d), "Informe a data."); exigir(d <= hoje(), "A data não pode ser no futuro."); return d; }

/* ---------------------------------------------------------------- leite */
TELAS.leite = async () => {
  const r = await carregarResumo();
  const vacas = lactantes(r);
  const duas = (r.ordenhas_por_dia || 1) > 1;
  formulario("Leite do dia", `${campoData("Data da ordenha")}
    ${duas ? `<label>Qual ordenha</label>${radios("ordenha", [["1", "Manhã"], ["2", "Tarde"]], new Date().getHours() < 12 ? "1" : "2")}` : ""}
    <label>Litros por vaca</label>
    ${vacas.length ? `<div class="vacas">${vacas.map(a => `<label><span><b>${esc(a.brinco)}</b> ${esc(a.nome || "")}</span><input name="v_${esc(a.brinco)}" inputmode="decimal" placeholder="litros"></label>`).join("")}</div><p class="nota">Deixe em branco a vaca que não ordenhou.</p>`
      : `<p class="nota">A lista de vacas aparece depois que o notebook sincronizar. Por enquanto, lance o total do tanque.</p>`}
    <label>Total do tanque (litros)</label><input name="total" inputmode="decimal" placeholder="se mediu">
    <label>Observação</label><input name="obs" placeholder="vaca que não ordenhou, leite separado…">`,
    f => {
      const d = { data: dataOk(val(f, "data")), ordenha: duas ? marcado(f, "ordenha") || "1" : "1", vacas: {}, total: "", obs: val(f, "obs") };
      d.ordenha_nome = duas ? (d.ordenha === "1" ? "manhã" : "tarde") : "ordenha do dia";
      for (const a of vacas) { const v = val(f, "v_" + a.brinco); if (v) { const n = numero(v); exigir(n != null && n >= 0 && n <= 80, `Litros da ${a.brinco} não parecem certos: "${v}".`); d.vacas[a.brinco] = virgula(n); } }
      const t = val(f, "total"); if (t) { const n = numero(t); exigir(n != null && n > 0 && n <= 5000, "Total do tanque inválido."); d.total = virgula(n); }
      exigir(Object.keys(d.vacas).length || d.total, "Informe os litros de pelo menos uma vaca ou o total do tanque.");
      return d;
    },
    d => { const vs = Object.entries(d.vacas); const soma = vs.reduce((s, [, v]) => s + numero(v), 0);
      return `Data: ${brData(d.data)} (${d.ordenha_nome})\n` + vs.map(([b, v]) => `Vaca ${b}: ${v} L`).join("\n") + (vs.length ? `\nSoma: ${virgula(Math.round(soma * 10) / 10)} L` : "") + (d.total ? `\nTanque: ${d.total} L` : "") + (d.obs ? `\nObs.: ${d.obs}` : ""); },
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
      <p class="sub">1) No Telegram, procure <b>@BotFather</b>, mande <b>/newbot</b>, escolha um nome (ex.: Fazenda Paquetá Avisos) e um usuário terminado em "bot".<br>
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

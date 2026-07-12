/* ============================================================
   v1.1 — busca por CPF/WhatsApp ignora pontuação (compara só números)
   EVVO — MÓDULO ALUNOS (painel da academia)
   Migrado fielmente do HealFit Gestão (CRUD, validação de CPF,
   filtros, busca, cálculo de mensalidade). A geração de fatura
   (⚡) fica para a fase do Financeiro, quando a integração Asaas
   por academia estiver pronta.
   ============================================================ */
let AC_ALUNOS = [];
let AC_PLANOS = [];
let AC_PERSONAIS = [];
let acAluFiltro = 'todos';
let acAluEditId = null;

/* ---------------- CARREGAR ---------------- */
async function carregarAlunosAc() {
  const tb = document.getElementById('ac-alunos-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  const [{ data: planos }, { data: personais }, { data: alunos, error }] = await Promise.all([
    db.from('planos').select('*').eq('ativo', true).order('valor'),
    db.from('personais').select('*').eq('ativo', true).order('nome'),
    db.from('vw_alunos_completo').select('*').order('nome'),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  AC_PLANOS = planos || [];
  AC_PERSONAIS = personais || [];
  AC_ALUNOS = alunos || [];

  if (!AC_PLANOS.length) {
    tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum plano cadastrado ainda — fale com o suporte Evvo para configurar os planos da sua academia.</td></tr>';
    return;
  }
  renderAlunosAc();
}

/* ---------------- RENDER ---------------- */
function filtraAlunoAc(f, el) {
  acAluFiltro = f;
  document.querySelectorAll('#v-ac-alunos .fchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAlunosAc();
}

function renderAlunosAc() {
  const qTexto = (document.getElementById('ac-alu-q').value || '').toLowerCase();
  const qNumeros = qTexto.replace(/\D/g, ''); // versão só com números, para bater CPF/WhatsApp sem pontuação
  const lista = AC_ALUNOS
    .filter(a =>
      (a.nome || '').toLowerCase().includes(qTexto) ||
      (qNumeros && (a.cpf || '').replace(/\D/g, '').includes(qNumeros)) ||
      (qNumeros && (a.whatsapp || '').replace(/\D/g, '').includes(qNumeros))
    )
    .filter(a => acAluFiltro === 'todos' ? true
      : acAluFiltro === 'com' ? a.personal_id != null
      : acAluFiltro === 'sem' ? a.personal_id == null
      : acAluFiltro === 'inativos' ? a.ativo === false : a.ativo !== false)
    .filter(a => acAluFiltro === 'inativos' ? true : a.ativo !== false);

  document.getElementById('ac-alunos-sub').textContent =
    `${AC_ALUNOS.filter(a => a.ativo !== false).length} ativos · ${AC_ALUNOS.filter(a => a.ativo === false).length} inativos`;

  const tb = document.getElementById('ac-alunos-rows');
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum aluno encontrado.</td></tr>'; return; }

  tb.innerHTML = lista.map((a, i) => {
    const valorBase = a.valor_personalizado ?? a.valor_plano;
    const total = Number(valorBase) + Number(a.valor_personal || 0);
    const tagPers = a.personal
      ? `<span class="tag-p">🏋 ${esc(a.personal)}</span>`
      : '<span style="color:var(--muted);font-size:13px">—</span>';
    const situacao = a.ativo === false
      ? '<span class="badge b-off">Inativo</span>'
      : a.forma_cobranca === 'cartao_recorrente'
        ? '<span class="badge b-info">Cartão recorrente</span>'
        : '<span class="badge b-ok">Fatura</span>';
    return `
    <tr>
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div>
        <div><div class="nm">${esc(a.nome)}</div><div class="loc">${esc(a.whatsapp || a.cpf || '')}</div></div></div></td>
      <td>${esc(a.plano)}<div class="loc">venc. dia ${a.dia_vencimento}</div></td>
      <td>${tagPers}</td>
      <td><b>${brl(total)}</b>${a.valor_personalizado != null ? '<div class="loc">valor personalizado</div>' : ''}${a.valor_personal > 0 ? `<div class="loc">${brl(valorBase)} + ${brl(a.valor_personal)} personal</div>` : ''}</td>
      <td>${situacao}</td>
      <td><div class="acts">
        <button class="icon-btn" title="Gerar fatura" onclick="gerarFaturaAc(${a.id})">⚡</button>
        <button class="icon-btn" title="Editar" onclick="abrirAlunoAc(${a.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirAlunoAc(${a.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ---------------- NOVO / EDITAR ---------------- */
function abrirAlunoAc(id) {
  acAluEditId = id;
  const a = id ? AC_ALUNOS.find(x => x.id === id) : null;
  document.getElementById('ac-ma-title').textContent = a ? 'Editar aluno' : 'Novo aluno';

  document.getElementById('ac-ma-plano').innerHTML =
    AC_PLANOS.map(p => `<option value="${p.id}">${esc(p.nome)} — ${brl(p.valor)}</option>`).join('');
  document.getElementById('ac-ma-pid').innerHTML =
    '<option value="">Sem personal</option>' +
    AC_PERSONAIS.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');

  document.getElementById('ac-ma-nome').value = a?.nome || '';
  document.getElementById('ac-ma-cpf').value = a?.cpf || '';
  document.getElementById('ac-ma-zap').value = a?.whatsapp || '';
  document.getElementById('ac-ma-email').value = a?.email || '';
  document.getElementById('ac-ma-nasc').value = a?.data_nascimento || '';
  document.getElementById('ac-ma-plano-ini').value = a?.data_inicio_plano || '';
  document.getElementById('ac-ma-plano-venc').value = a?.data_vencimento_plano || '';
  document.getElementById('ac-ma-plano').value = a?.plano_id || (AC_PLANOS[0]?.id ?? '');
  document.getElementById('ac-ma-valor-custom').value = a?.valor_personalizado ?? '';
  document.getElementById('ac-ma-endereco').value = a?.endereco || '';
  document.getElementById('ac-ma-numero').value = a?.numero || '';
  document.getElementById('ac-ma-bairro').value = a?.bairro || '';
  document.getElementById('ac-ma-cep').value = a?.cep || '';
  document.getElementById('ac-ma-cidade').value = a?.cidade || '';
  document.getElementById('ac-ma-estado').value = a?.estado || '';
  document.getElementById('ac-ma-dia').value = a?.dia_vencimento || 5;
  document.getElementById('ac-ma-pid').value = a?.personal_id || '';
  document.getElementById('ac-ma-pval').value = a?.valor_personal || 0;
  document.getElementById('ac-ma-forma').value = a?.forma_cobranca || 'fatura';
  document.getElementById('ac-ma-cartao').checked = a?.permite_cartao === true;
  document.getElementById('ac-ma-ativo').checked = a ? a.ativo !== false : true;

  acMaCalc();
  openModal('m-aluno-ac');
}

function acMaCalc() {
  const planoId = Number(document.getElementById('ac-ma-plano').value);
  const plano = AC_PLANOS.find(p => p.id === planoId);
  const customStr = document.getElementById('ac-ma-valor-custom').value;
  const temCustom = customStr !== '';
  const base = temCustom ? (parseFloat(customStr) || 0) : Number(plano?.valor || 0);
  const temPers = document.getElementById('ac-ma-pid').value !== '';
  const pv = temPers ? (parseFloat(document.getElementById('ac-ma-pval').value) || 0) : 0;
  document.getElementById('ac-ma-pval').disabled = !temPers;
  if (!temPers) document.getElementById('ac-ma-pval').value = 0;
  const rotuloBase = temCustom ? `${brl(base)} (valor personalizado, plano ${plano?.nome || ''} ignorado)` : `${brl(base)} academia`;
  document.getElementById('ac-ma-nota').textContent = temPers && pv > 0
    ? `Fatura do aluno: ${brl(base + pv)} — ${rotuloBase} + ${brl(pv)} personal (repasse automático).`
    : `Fatura do aluno: ${brl(base)}${temCustom ? ' (valor personalizado)' : ' (academia)'} — sem personal vinculado.`;
}

function acMaCalcVencimentoPlano() {
  const ini = document.getElementById('ac-ma-plano-ini').value;
  const hint = document.getElementById('ac-ma-plano-hint');
  if (!ini) {
    hint.textContent = 'Preenchendo o início, calculamos o vencimento sozinhos com base na duração do plano escolhido — mas você pode ajustar na mão se precisar.';
    return;
  }
  const planoId = Number(document.getElementById('ac-ma-plano').value);
  const plano = AC_PLANOS.find(p => p.id === planoId);
  const meses = plano?.periodicidade_meses || 1;
  const vencStr = calcVencimentoPlano(ini, meses);
  document.getElementById('ac-ma-plano-venc').value = vencStr;
  hint.textContent = `Calculado: início em ${fmt(ini)} + ${meses} mês(es) do plano "${plano?.nome || ''}" = vencimento em ${fmt(vencStr)}. Pode ajustar na mão se precisar.`;
}

/* ---------------- RENOVAÇÃO RÁPIDA DE PLANO (chamada do Dashboard/Relatórios) ---------------- */
let acRvpAlunoId = null;
let acRvpPlanos = [];

async function abrirRenovarPlanoAc(alunoId) {
  const [{ data: aluno, error }, { data: planos }] = await Promise.all([
    db.from('alunos').select('id, nome, plano_id').eq('id', alunoId).single(),
    db.from('planos').select('*').eq('ativo', true).order('valor'),
  ]);
  if (error || !aluno) { toast('Não achei esse aluno.'); return; }

  acRvpAlunoId = alunoId;
  acRvpPlanos = planos || [];
  document.getElementById('ac-rvp-nome').value = aluno.nome;
  document.getElementById('ac-rvp-plano').innerHTML = acRvpPlanos
    .map(p => `<option value="${p.id}" ${p.id === aluno.plano_id ? 'selected' : ''}>${esc(p.nome)} — ${brl(p.valor)}</option>`).join('');
  document.getElementById('ac-rvp-ini').value = new Date().toISOString().slice(0, 10);
  acRenovarCalc();
  openModal('m-renovar-plano-ac');
}

function acRenovarCalc() {
  const ini = document.getElementById('ac-rvp-ini').value;
  const planoId = Number(document.getElementById('ac-rvp-plano').value);
  const plano = acRvpPlanos.find(p => p.id === planoId);
  if (!ini || !plano) return;
  const meses = plano.periodicidade_meses || 1;
  const venc = calcVencimentoPlano(ini, meses);
  document.getElementById('ac-rvp-venc').value = venc;
  document.getElementById('ac-rvp-hint').textContent =
    `Início em ${fmt(ini)} + ${meses} mês(es) do plano "${plano.nome}" = vencimento em ${fmt(venc)}.`;
}

async function salvarRenovacaoPlanoAc() {
  const ini = document.getElementById('ac-rvp-ini').value;
  const venc = document.getElementById('ac-rvp-venc').value;
  const planoId = Number(document.getElementById('ac-rvp-plano').value);
  if (!ini || !venc) { toast('Confirme a data de início.'); return; }

  const { error } = await db.from('alunos').update({
    plano_id: planoId,
    data_inicio_plano: ini,
    data_vencimento_plano: venc,
  }).eq('id', acRvpAlunoId);

  if (error) { toast('Erro ao renovar: ' + error.message); return; }
  closeModal('m-renovar-plano-ac');
  toast('Plano renovado ✓');

  // Atualiza a tela atual (Dashboard ou Relatórios), se a função existir
  if (typeof carregarDashboardAc === 'function' && document.getElementById('v-ac-dashboard')?.classList.contains('active')) {
    carregarDashboardAc();
  }
  if (typeof gerarRelatorioAtual === 'function' && document.getElementById('v-ac-relatorios')?.classList.contains('active')) {
    gerarRelatorioAtual();
  }
}

async function salvarAlunoAc() {
  const nome = document.getElementById('ac-ma-nome').value.trim();
  if (!nome) { toast('Informe o nome do aluno.'); return; }

  const cpf = document.getElementById('ac-ma-cpf').value.trim();
  if (cpf && !validarCPFAc(cpf)) { toast('CPF inválido — confira os números digitados.'); return; }
  if (!cpf) {
    if (!confirm('Aluno sem CPF: não será possível gerar cobranças para ele até cadastrar o CPF (exigência do emissor).\n\nSalvar mesmo assim?')) return;
  }

  const pid = document.getElementById('ac-ma-pid').value;
  const registro = {
    academia_id: MEU_ACADEMIA_ID,
    nome,
    cpf: cpf || null,
    whatsapp: document.getElementById('ac-ma-zap').value.trim() || null,
    email: document.getElementById('ac-ma-email').value.trim() || null,
    data_nascimento: document.getElementById('ac-ma-nasc').value || null,
    data_inicio_plano: document.getElementById('ac-ma-plano-ini').value || null,
    data_vencimento_plano: document.getElementById('ac-ma-plano-venc').value || null,
    plano_id: Number(document.getElementById('ac-ma-plano').value),
    valor_personalizado: document.getElementById('ac-ma-valor-custom').value !== ''
      ? parseFloat(document.getElementById('ac-ma-valor-custom').value) : null,
    endereco: document.getElementById('ac-ma-endereco').value.trim() || null,
    numero: document.getElementById('ac-ma-numero').value.trim() || null,
    bairro: document.getElementById('ac-ma-bairro').value.trim() || null,
    cep: document.getElementById('ac-ma-cep').value.replace(/\D/g, '') || null,
    cidade: document.getElementById('ac-ma-cidade').value.trim() || null,
    estado: document.getElementById('ac-ma-estado').value.trim().toUpperCase() || null,
    dia_vencimento: Number(document.getElementById('ac-ma-dia').value),
    personal_id: pid ? Number(pid) : null,
    valor_personal: pid ? (parseFloat(document.getElementById('ac-ma-pval').value) || 0) : 0,
    forma_cobranca: document.getElementById('ac-ma-forma').value,
    permite_cartao: document.getElementById('ac-ma-cartao').checked,
    ativo: document.getElementById('ac-ma-ativo').checked,
  };

  const btn = document.getElementById('ac-ma-salvar');
  btn.disabled = true;

  let error;
  if (acAluEditId) {
    delete registro.academia_id; // não reenvia em update (imutável)
    ({ error } = await db.from('alunos').update(registro).eq('id', acAluEditId));
  } else {
    ({ error } = await db.from('alunos').insert(registro));
  }

  btn.disabled = false;
  if (error) {
    toast(error.code === '23505' ? 'Já existe um aluno com esse CPF na sua academia.' : 'Erro ao salvar: ' + error.message);
    return;
  }
  closeModal('m-aluno-ac');
  toast(acAluEditId ? 'Aluno atualizado ✓' : 'Aluno cadastrado ✓');
  carregarAlunosAc();
}

/* ---------------- EXCLUIR ---------------- */
async function excluirAlunoAc(id) {
  const a = AC_ALUNOS.find(x => x.id === id);
  if (!a) return;

  const { count } = await db.from('mensalidades')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', id).eq('status', 'pago');

  if (count > 0) {
    if (confirm(`${a.nome} tem ${count} pagamento(s) no histórico.\n\nExcluir apagaria esse histórico.\n\nRecomendado: INATIVAR o aluno (para de gerar fatura, histórico preservado).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('alunos').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Aluno inativado ✓ — histórico preservado.');
      carregarAlunosAc();
    }
    return;
  }

  if (!confirm(`Excluir o aluno ${a.nome}?`)) return;
  const { error } = await db.from('alunos').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Aluno excluído ✓');
  carregarAlunosAc();
}

/* ---------------- VALIDAÇÃO DE CPF ---------------- */
function validarCPFAc(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/* ---------------- FATURA IMEDIATA (Edge Function) ---------------- */
async function gerarFaturaAc(id) {
  const a = AC_ALUNOS.find(x => x.id === id);
  if (!a) return;
  if (a.ativo === false) { toast('Aluno inativo — reative antes de gerar fatura.'); return; }
  if (!a.cpf) { toast('Cadastre o CPF do aluno antes de gerar a fatura (exigência do banco emissor).'); return; }

  // Se já existe fatura em aberto (pendente/atrasada), REABRE o modal dela
  const { data: aberta } = await db.from('mensalidades')
    .select('*')
    .eq('aluno_id', id)
    .in('status', ['pendente', 'atrasado'])
    .order('vencimento', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aberta) { mostrarFaturaAc(a, aberta); return; }

  if (!confirm(`Gerar a fatura do mês para ${a.nome}?`)) return;

  toast('Gerando fatura no Asaas…');
  const { data, error } = await db.functions.invoke('criar-cobranca-avulsa', {
    body: { aluno_id: id },
  });

  if (error) {
    let msg = error.message;
    try { const body = await error.context?.json?.(); if (body?.erro) msg = body.erro; } catch (_) {}
    toast('Não gerou: ' + msg);
    return;
  }
  if (data?.erro) { toast('Não gerou: ' + data.erro); return; }

  mostrarFaturaAc(a, data.mensalidade);
  carregarAlunosAc();
}

/* ---------------- RESULTADO: PDF / PIX / WHATSAPP ---------------- */
function mostrarFaturaAc(aluno, m) {
  document.getElementById('ac-mf-aluno').textContent = aluno.nome;
  const statusTxt = m.status === 'atrasado' ? ' · EM ATRASO' : '';
  document.getElementById('ac-mf-info').textContent =
    `${brl(m.valor_total ?? (Number(m.valor_academia) + Number(m.valor_personal)))} · vencimento ${fmt(m.vencimento)}${statusTxt}`;

  const links = document.getElementById('ac-mf-links');
  const zap = (aluno.whatsapp || '').replace(/\D/g, '');
  const linkPagina = m.token_publico
    ? `${EVVO_CONFIG.PAGINA_FATURA}?t=${m.token_publico}`
    : m.url_fatura;
  const msg = encodeURIComponent(
    `*${document.getElementById('ac-nome-academia').textContent.toUpperCase()} - FATURA*\n\n` +
    `Olá, ${aluno.nome.split(' ')[0]}!\n` +
    `Sua fatura já está disponível:\n\n` +
    `Valor: *${brl(m.valor_total ?? (Number(m.valor_academia) + Number(m.valor_personal)))}*\n` +
    `Vencimento: ${fmt(m.vencimento)}\n\n` +
    `Pague por boleto ou PIX no link:\n${linkPagina}\n\n` +
    `Qualquer dúvida é só chamar!`
  );

  links.innerHTML = `
    ${linkPagina ? `<a class="btn btn-primary" href="${linkPagina}" target="_blank">🔗 Abrir página da fatura</a>` : ''}
    ${zap ? `<a class="btn btn-primary" style="background:var(--ok)" href="https://wa.me/55${zap}?text=${msg}" target="_blank">💬 Enviar no WhatsApp do aluno</a>`
          : '<div class="hint">Aluno sem WhatsApp cadastrado.</div>'}
    ${(m.url_boleto || m.url_fatura) ? `<a class="btn btn-ghost" href="${m.url_boleto || m.url_fatura}" target="_blank">📄 PDF do boleto</a>` : ''}
    ${m.pix_copia_cola ? `<div class="hint" style="max-width:none">PIX copia-e-cola (clique para copiar):</div>
      <div class="linha-copiavel" style="font-family:'JetBrains Mono',monospace;font-size:11.5px;background:var(--card2);border:1px dashed var(--line);border-radius:10px;padding:11px 13px;word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent).then(()=>toast('PIX copiado ✓'))">${esc(m.pix_copia_cola)}</div>` : ''}
  `;
  openModal('m-fatura-ac');
}

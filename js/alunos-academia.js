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
let AC_MODALIDADES_LISTA = [];
let AC_EXTRAS_POR_ALUNO = {};
let AC_ALERTA_FATURA_ATIVO = true;
let AC_ALERTA_FATURA_DIAS = 10;
let AC_ALUNOS_COM_FATURA_MES = new Set();
let acAluFiltro = 'todos';
let acAluEditId = null;

/* ---------------- CARREGAR ---------------- */
async function carregarAlunosAc() {
  const tb = document.getElementById('ac-alunos-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  const hoje = new Date();
  const competenciaAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

  const [{ data: planos }, { data: personais }, { data: alunos, error }, { data: modalidades }, { data: extras }, { data: cfgAlerta }, { data: mensalidadesMes }] = await Promise.all([
    db.from('planos').select('*').eq('ativo', true).order('valor'),
    db.from('personais').select('*').eq('ativo', true).order('nome'),
    db.from('vw_alunos_completo').select('*').order('nome'),
    db.from('modalidades').select('*').eq('ativo', true).order('nome'),
    db.from('matriculas_extras').select('*, modalidades(nome)').eq('ativo', true),
    db.from('config').select('chave, valor').in('chave', ['alerta_fatura_ativo', 'alerta_fatura_dias']),
    db.from('mensalidades').select('aluno_id').eq('competencia', competenciaAtual),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  AC_PLANOS = planos || [];
  AC_PERSONAIS = personais || [];
  AC_ALUNOS = alunos || [];
  AC_MODALIDADES_LISTA = modalidades || [];
  AC_EXTRAS_POR_ALUNO = {};
  (extras || []).forEach(e => {
    if (!AC_EXTRAS_POR_ALUNO[e.aluno_id]) AC_EXTRAS_POR_ALUNO[e.aluno_id] = [];
    AC_EXTRAS_POR_ALUNO[e.aluno_id].push(e);
  });

  const mapaAlerta = {};
  (cfgAlerta || []).forEach(c => { mapaAlerta[c.chave] = c.valor; });
  AC_ALERTA_FATURA_ATIVO = mapaAlerta['alerta_fatura_ativo'] !== 'false';
  AC_ALERTA_FATURA_DIAS = parseInt(mapaAlerta['alerta_fatura_dias']) || 10;
  AC_ALUNOS_COM_FATURA_MES = new Set((mensalidadesMes || []).map(m => m.aluno_id));

  if (!AC_PLANOS.length) {
    tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum plano cadastrado ainda — fale com o suporte Evvo para configurar os planos da sua academia.</td></tr>';
    return;
  }
  renderAlunosAc();
}

function corModalidade(modalidadeId) {
  const idx = AC_MODALIDADES_LISTA.findIndex(m => m.id === modalidadeId);
  return corDe(idx >= 0 ? idx : 0);
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

  const ordem = document.getElementById('ac-alu-ordem')?.value || 'nome';
  if (ordem === 'dia_vencimento') {
    lista.sort((a, b) => (Number(a.dia_vencimento) || 99) - (Number(b.dia_vencimento) || 99) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  } else {
    lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }

  document.getElementById('ac-alunos-sub').textContent =
    `${AC_ALUNOS.filter(a => a.ativo !== false).length} ativos · ${AC_ALUNOS.filter(a => a.ativo === false).length} inativos`;

  const tb = document.getElementById('ac-alunos-rows');
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum aluno encontrado.</td></tr>'; return; }

  tb.innerHTML = lista.map((a, i) => {
    const valorBase = a.valor_personalizado ?? a.valor_plano;
    const extrasDoAluno = AC_EXTRAS_POR_ALUNO[a.id] || [];
    const totalExtras = extrasDoAluno.reduce((s, e) => {
      const planoExtra = AC_PLANOS.find(p => p.id === e.plano_id);
      return s + Number(e.valor_personalizado ?? planoExtra?.valor ?? 0);
    }, 0);
    const total = Number(valorBase) + Number(a.valor_personal || 0) + totalExtras;
    const tagPers = a.personal
      ? `<span class="tag-p">🏋 ${esc(a.personal)}</span>`
      : '<span style="color:var(--muted);font-size:13px">—</span>';
    const situacao = a.ativo === false
      ? '<span class="badge b-off">Inativo</span>'
      : a.forma_cobranca === 'cartao_recorrente'
        ? '<span class="badge b-info">Cartão recorrente</span>'
        : '<span class="badge b-ok">Fatura</span>';

    const planoPrincipal = AC_PLANOS.find(p => p.id === a.plano_id);
    const modalidadesDoAluno = [];
    if (planoPrincipal?.modalidade_id) {
      const mod = AC_MODALIDADES_LISTA.find(m => m.id === planoPrincipal.modalidade_id);
      if (mod) modalidadesDoAluno.push(mod);
    }
    (AC_EXTRAS_POR_ALUNO[a.id] || []).forEach(e => {
      modalidadesDoAluno.push({ id: e.modalidade_id, nome: e.modalidades?.nome || '?' });
    });
    const badgesModalidade = modalidadesDoAluno.map(m => {
      const cor = corModalidade(m.id);
      return `<span style="display:inline-block;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;margin:3px 4px 0 0;background:${cor}1f;color:${cor}">${esc(m.nome)}</span>`;
    }).join('');

    // Alerta: dentro da janela configurada (ou já vencido) e ainda sem
    // fatura gerada na competência atual.
    let alertaFatura = '';
    if (AC_ALERTA_FATURA_ATIVO && a.ativo !== false && a.dia_vencimento && !AC_ALUNOS_COM_FATURA_MES.has(a.id)) {
      const hoje = new Date();
      const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), a.dia_vencimento);
      const diasRestantes = Math.round((alvo - hojeSoData) / 86400000);
      if (diasRestantes < 0) {
        alertaFatura = `<div style="font-size:10px;font-weight:700;color:var(--late);margin-top:1px">Venceu há ${-diasRestantes} dia(s), sem fatura gerada</div>`;
      } else if (diasRestantes <= AC_ALERTA_FATURA_DIAS) {
        alertaFatura = `<div style="font-size:10px;font-weight:700;color:var(--warn);margin-top:1px">Faltam ${diasRestantes} dia(s) para o vencimento</div>`;
      }
    }

    return `
    <tr>
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div>
        <div><div class="nm">${esc(a.nome)}</div><div class="loc">${esc(a.whatsapp || a.cpf || '')}</div>${badgesModalidade ? `<div>${badgesModalidade}</div>` : ''}</div></div></td>
      <td>${esc(a.plano)}<div class="loc">venc. dia ${a.dia_vencimento}</div>${alertaFatura}</td>
      <td>${tagPers}</td>
      <td><b>${brl(total)}</b>${a.valor_personalizado != null ? '<div class="loc">valor personalizado</div>' : ''}${
        (() => {
          const partes = [];
          if (a.valor_personal > 0 || totalExtras > 0) partes.push(brl(valorBase));
          if (a.valor_personal > 0) partes.push(`${brl(a.valor_personal)} personal`);
          if (totalExtras > 0) partes.push(`${brl(totalExtras)} modalidade(s) extra`);
          return partes.length > 1 ? `<div class="loc">${partes.join(' + ')}</div>` : '';
        })()
      }</td>
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

  const clienteDesdeWrap = document.getElementById('ac-ma-cliente-desde-wrap');
  if (a?.created_at) {
    clienteDesdeWrap.style.display = 'block';
    document.getElementById('ac-ma-cliente-desde').value = String(a.created_at).slice(0, 10);
  } else {
    clienteDesdeWrap.style.display = 'none';
  }

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

  document.getElementById('ac-ma-modalidade').innerHTML =
    '<option value="">— Sem modalidade —</option>' +
    AC_MODALIDADES_LISTA.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');

  const planoAtual = a ? AC_PLANOS.find(p => p.id === a.plano_id) : null;
  document.getElementById('ac-ma-modalidade').value = planoAtual?.modalidade_id || '';
  acMaFiltrarPlanos(a?.plano_id);
  if (a) document.getElementById('ac-ma-plano-venc').value = a.data_vencimento_plano || '';

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
  renderExtrasNoModalAc(id);
  openModal('m-aluno-ac');
}

function renderExtrasNoModalAc(alunoId) {
  const wrap = document.getElementById('ac-ma-extras-lista');
  const btn = document.getElementById('ac-ma-extra-btn');
  if (!alunoId) {
    wrap.innerHTML = '<div class="loc">Salve o aluno primeiro pra poder adicionar modalidades extras.</div>';
    return;
  }
  const extras = AC_EXTRAS_POR_ALUNO[alunoId] || [];
  if (!extras.length) {
    wrap.innerHTML = '<div class="loc">Nenhuma modalidade extra ainda.</div>';
    return;
  }
  wrap.innerHTML = extras.map(e => {
    const cor = corModalidade(e.modalidade_id);
    const plano = AC_PLANOS.find(p => p.id === e.plano_id);
    const valor = e.valor_personalizado ?? plano?.valor;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
        <span style="width:8px;height:8px;border-radius:50%;background:${cor};flex:none"></span>
        <div style="flex:1">
          <b>${esc(e.modalidades?.nome || '?')}</b> · ${esc(plano?.nome || '—')}
          <div class="loc">vence ${fmt(e.data_vencimento)}${valor != null ? ' · ' + brl(valor) : ''}</div>
        </div>
        <button class="icon-btn del" title="Remover modalidade extra" onclick="excluirMatriculaExtraAc(${e.id}, ${alunoId})">🗑</button>
      </div>`;
  }).join('');
}

function acMaFiltrarPlanos(planoParaManter) {
  const modId = document.getElementById('ac-ma-modalidade').value;
  const filtrados = ordenarPlanos(modId
    ? AC_PLANOS.filter(p => p.modalidade_id === Number(modId))
    : AC_PLANOS.filter(p => !p.modalidade_id));

  document.getElementById('ac-ma-plano').innerHTML = filtrados.length
    ? filtrados.map(p => `<option value="${p.id}">${esc(rotuloPlano(p))}</option>`).join('')
    : '<option value="">Nenhum plano nessa modalidade</option>';

  const manterId = planoParaManter && filtrados.some(p => p.id === planoParaManter) ? planoParaManter : (filtrados[0]?.id ?? '');
  document.getElementById('ac-ma-plano').value = manterId;
  acMaCalc();
  acMaCalcVencimentoPlano();
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
  acRvpPlanos = ordenarPlanos(planos || []);
  document.getElementById('ac-rvp-nome').value = aluno.nome;
  document.getElementById('ac-rvp-plano').innerHTML = acRvpPlanos
    .map(p => `<option value="${p.id}" ${p.id === aluno.plano_id ? 'selected' : ''}>${esc(rotuloPlano(p))}</option>`).join('');
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
  const nome = normalizarNomeProprio(document.getElementById('ac-ma-nome').value.trim());
  if (!nome) { toast('Informe o nome do aluno.'); return; }

  const cpf = document.getElementById('ac-ma-cpf').value.trim();
  if (cpf && !validarCpfCnpjAc(cpf)) { toast('CPF/CNPJ inválido — confira os números digitados.'); return; }
  if (!cpf) {
    if (!confirm('Aluno sem CPF/CNPJ: não será possível gerar cobranças para ele até cadastrar (exigência do emissor).\n\nSalvar mesmo assim?')) return;
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
    const novaDataCadastro = document.getElementById('ac-ma-cliente-desde').value;
    if (novaDataCadastro) registro.created_at = novaDataCadastro;
    ({ error } = await db.from('alunos').update(registro).eq('id', acAluEditId));
  } else {
    ({ error } = await db.from('alunos').insert(registro));
  }

  btn.disabled = false;
  if (error) {
    toast(error.code === '23505' ? 'Já existe um aluno com esse CPF/CNPJ na sua academia.' : 'Erro ao salvar: ' + error.message);
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

/* ---------------- BUSCA DE ENDEREÇO POR CEP (ViaCEP) ---------------- */
let acMaCepTimeout = null;
function acMaBuscarCep() {
  const input = document.getElementById('ac-ma-cep');
  const status = document.getElementById('ac-ma-cep-status');
  const cep = input.value.replace(/\D/g, '');

  clearTimeout(acMaCepTimeout);
  if (cep.length !== 8) { status.textContent = ''; return; }

  status.textContent = 'Buscando endereço…';
  acMaCepTimeout = setTimeout(async () => {
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dado = await resp.json();
      if (dado.erro) { status.textContent = 'CEP não encontrado — preencha manualmente.'; return; }

      document.getElementById('ac-ma-endereco').value = dado.logradouro || '';
      document.getElementById('ac-ma-bairro').value = dado.bairro || '';
      document.getElementById('ac-ma-cidade').value = dado.localidade || '';
      document.getElementById('ac-ma-estado').value = dado.uf || '';
      status.textContent = 'Endereço preenchido ✓ — confira o número.';
      document.getElementById('ac-ma-numero').focus();
    } catch {
      status.textContent = 'Não consegui buscar agora — preencha manualmente.';
    }
  }, 500);
}

/* ---------------- VALIDAÇÃO DE CPF/CNPJ ---------------- */
function validarCPFAc(cpf) {
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

function validarCNPJAc(cnpj) {
  cnpj = String(cnpj).replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcDigito = (base, pesos) => {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += Number(base[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calcDigito(cnpj, [5,4,3,2,9,8,7,6,5,4,3,2]);
  if (d1 !== Number(cnpj[12])) return false;
  const d2 = calcDigito(cnpj, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return d2 === Number(cnpj[13]);
}

// Aceita CPF (11 dígitos) ou CNPJ (14 dígitos), validando o formato certo conforme o tamanho.
function validarCpfCnpjAc(valor) {
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos.length === 11) return validarCPFAc(digitos);
  if (digitos.length === 14) return validarCNPJAc(digitos);
  return false;
}

/* ---------------- FATURA IMEDIATA (Edge Function) ---------------- */
async function gerarFaturaAc(id) {
  const a = AC_ALUNOS.find(x => x.id === id);
  if (!a) return;
  if (a.ativo === false) { toast('Aluno inativo — reative antes de gerar fatura.'); return; }
  if (!a.cpf) { toast('Cadastre o CPF/CNPJ do aluno antes de gerar a fatura (exigência do banco emissor).'); return; }

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

  toast('Gerando fatura…');
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

/* ---------------- MATRÍCULA EXTRA (modalidade adicional) ---------------- */
function abrirMatriculaExtraAc() {
  if (!acAluEditId) { toast('Salve o aluno primeiro pra poder adicionar uma modalidade extra.'); return; }
  if (!AC_MODALIDADES_LISTA.length) { toast('Cadastre uma modalidade em Configurações antes.'); return; }

  document.getElementById('ac-mex-modalidade').innerHTML = AC_MODALIDADES_LISTA
    .map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  acMexPopularPlanos();
  document.getElementById('ac-mex-inicio').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ac-mex-valor-custom').value = '';
  acMexCalc();
  openModal('m-matricula-extra-ac');
}

function acMexPopularPlanos() {
  const modId = Number(document.getElementById('ac-mex-modalidade').value);
  const planosFiltrados = ordenarPlanos(AC_PLANOS.filter(p => p.modalidade_id === modId));
  document.getElementById('ac-mex-plano').innerHTML = planosFiltrados.length
    ? planosFiltrados.map(p => `<option value="${p.id}">${esc(rotuloPlano(p))}</option>`).join('')
    : '<option value="">Nenhum plano cadastrado nessa modalidade</option>';
}

function acMexCalc() {
  const ini = document.getElementById('ac-mex-inicio').value;
  const planoId = Number(document.getElementById('ac-mex-plano').value);
  const plano = AC_PLANOS.find(p => p.id === planoId);
  const hint = document.getElementById('ac-mex-hint');
  if (!ini || !plano) { hint.textContent = 'Escolha a modalidade, o plano e a data de início.'; return; }
  const meses = plano.periodicidade_meses || 1;
  const venc = calcVencimentoPlano(ini, meses);
  document.getElementById('ac-mex-vencimento').value = venc;
  hint.textContent = `Início em ${fmt(ini)} + ${meses} mês(es) do plano "${plano.nome}" = vencimento em ${fmt(venc)}. Entra somado na próxima fatura mensal do aluno.`;
}

async function salvarMatriculaExtraAc() {
  const modalidade_id = Number(document.getElementById('ac-mex-modalidade').value);
  const plano_id = Number(document.getElementById('ac-mex-plano').value);
  const data_inicio = document.getElementById('ac-mex-inicio').value;
  const data_vencimento = document.getElementById('ac-mex-vencimento').value;
  const valorStr = document.getElementById('ac-mex-valor-custom').value;

  if (!modalidade_id) { toast('Selecione a modalidade.'); return; }
  if (!plano_id) { toast('Selecione um plano válido dessa modalidade.'); return; }
  if (!data_inicio) { toast('Informe a data de início.'); return; }

  const { error } = await db.from('matriculas_extras').insert({
    academia_id: MEU_ACADEMIA_ID,
    aluno_id: acAluEditId,
    modalidade_id, plano_id,
    valor_personalizado: valorStr !== '' ? parseFloat(valorStr) : null,
    data_inicio, data_vencimento,
  });
  if (error) { toast('Erro ao adicionar: ' + error.message); return; }
  closeModal('m-matricula-extra-ac');
  toast('Modalidade extra adicionada ✓');

  await carregarAlunosAc();
  renderExtrasNoModalAc(acAluEditId);
}

async function excluirMatriculaExtraAc(id, alunoId) {
  if (!confirm('Remover essa modalidade extra do aluno?\n\nO histórico de faturas passadas não é afetado — só deixa de entrar nas próximas.')) return;
  const { error } = await db.from('matriculas_extras').update({ ativo: false }).eq('id', id);
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Modalidade extra removida ✓');
  await carregarAlunosAc();
  renderExtrasNoModalAc(alunoId);
}

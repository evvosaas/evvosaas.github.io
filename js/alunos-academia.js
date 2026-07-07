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
    const total = Number(a.valor_plano) + Number(a.valor_personal || 0);
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
      <td><b>${brl(total)}</b>${a.valor_personal > 0 ? `<div class="loc">${brl(a.valor_plano)} + ${brl(a.valor_personal)} personal</div>` : ''}</td>
      <td>${situacao}</td>
      <td><div class="acts">
        <button class="icon-btn" title="Gerar fatura (em breve)" disabled style="opacity:.4;cursor:not-allowed">⚡</button>
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
  document.getElementById('ac-ma-plano').value = a?.plano_id || (AC_PLANOS[0]?.id ?? '');
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
  const base = Number(plano?.valor || 0);
  const temPers = document.getElementById('ac-ma-pid').value !== '';
  const pv = temPers ? (parseFloat(document.getElementById('ac-ma-pval').value) || 0) : 0;
  document.getElementById('ac-ma-pval').disabled = !temPers;
  if (!temPers) document.getElementById('ac-ma-pval').value = 0;
  document.getElementById('ac-ma-nota').textContent = temPers && pv > 0
    ? `Fatura do aluno: ${brl(base + pv)} — ${brl(base)} academia + ${brl(pv)} personal (repasse automático).`
    : `Fatura do aluno: ${brl(base)} (academia) — sem personal vinculado.`;
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
    plano_id: Number(document.getElementById('ac-ma-plano').value),
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

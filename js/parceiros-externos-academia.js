/* ============================================================
   EVVO — MÓDULO PARCEIROS EXTERNOS (painel da academia)
   Cadastro de profissionais parceiros (avaliador físico, nutricionista,
   etc.) que recebem via cobrança avulsa — sem vínculo mensal fixo com
   o aluno, diferente de Personais. O lançamento de cobrança avulsa
   em si (e o repasse) é uma fase futura; aqui é só o cadastro do
   parceiro.
   ============================================================ */
let AC_PARC_LIST = [];
let acParcEditId = null;

/* ---------------- CARREGAR ---------------- */
async function carregarParceirosAc() {
  const grid = document.getElementById('ac-parc-grid');
  grid.innerHTML = '<div class="carregando" style="grid-column:1/-1">Carregando…</div>';

  const [{ data: parceiros, error }, { data: cobrancas }] = await Promise.all([
    db.from('parceiros_externos').select('*').order('nome'),
    db.from('cobrancas_avulsas')
      .select('*, alunos(nome), parceiros_externos(nome)')
      .order('data_cobranca', { ascending: false })
      .limit(50),
  ]);
  if (error) { grid.innerHTML = `<div class="vazio" style="grid-column:1/-1">Erro: ${esc(error.message)}</div>`; return; }
  AC_PARC_LIST = parceiros || [];

  if (!AC_PARC_LIST.length) {
    grid.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhum parceiro externo cadastrado. Use "+ Novo parceiro externo".</div>';
  } else {
    grid.innerHTML = AC_PARC_LIST.map((p, i) => `
      <div class="pers-card">
        <div class="pers-acts">
          <button class="icon-btn" title="Editar" onclick="abrirParceiroAc(${p.id})">✎</button>
          <button class="icon-btn del" title="Excluir" onclick="excluirParceiroAc(${p.id})">🗑</button>
        </div>
        <div class="pers-top">
          <div class="av" style="background:${corDe(i)}">${ini(p.nome)}</div>
          <div><div class="nm">${esc(p.nome)}</div>
            <div class="cref">${p.tipo ? esc(p.tipo) : ''}${p.chave_pix ? ' · PIX: ' + esc(p.chave_pix) : ''}</div></div>
        </div>
        ${p.whatsapp ? `<div class="loc" style="margin-top:8px;font-size:12px;color:var(--muted)">WhatsApp: ${esc(p.whatsapp)}</div>` : ''}
        ${p.ativo === false ? '<div style="margin-top:10px"><span class="badge b-off">Inativo</span></div>' : ''}
      </div>`).join('');
  }

  /* ---------- Histórico de cobranças avulsas ---------- */
  const tb = document.getElementById('ac-cobav-rows');
  const linhas = cobrancas || [];
  if (!linhas.length) {
    tb.innerHTML = '<tr><td colspan="8" class="vazio">Nenhuma cobrança avulsa lançada ainda.</td></tr>';
  } else {
    tb.innerHTML = linhas.map(c => `
      <tr>
        <td>${fmt(c.data_cobranca)}</td>
        <td>${esc(c.alunos?.nome || '—')}</td>
        <td>${esc(c.parceiros_externos?.nome || '—')}</td>
        <td>${esc(c.descricao)}</td>
        <td><b>${brl(c.valor_total)}</b></td>
        <td>${brl(c.valor_parceiro)}</td>
        <td>${brl(c.valor_liquido_academia)}</td>
        <td>${c.status_repasse === 'pago' ? '<span class="badge b-info">Repassado</span>' : '<span class="badge b-off">Repasse pendente</span>'}</td>
      </tr>`).join('');
  }
}

/* ---------------- NOVO / EDITAR ---------------- */
function abrirParceiroAc(id) {
  acParcEditId = id;
  const p = id ? AC_PARC_LIST.find(x => x.id === id) : null;
  document.getElementById('ac-mpe-title').textContent = p ? 'Editar parceiro externo' : 'Novo parceiro externo';
  document.getElementById('ac-mpe-nome').value = p?.nome || '';
  document.getElementById('ac-mpe-tipo').value = p?.tipo || '';
  document.getElementById('ac-mpe-zap').value = p?.whatsapp || '';
  document.getElementById('ac-mpe-pix').value = p?.chave_pix || '';
  document.getElementById('ac-mpe-ativo').checked = p ? p.ativo !== false : true;

  // Sugestões de tipo, baseadas nos parceiros já cadastrados (evita grafias diferentes)
  const tipos = [...new Set(AC_PARC_LIST.map(x => x.tipo).filter(Boolean))];
  document.getElementById('ac-mpe-tipo-sugestoes').innerHTML = tipos.map(t => `<option value="${esc(t)}">`).join('');

  openModal('m-parceiro-ac');
}

async function salvarParceiroAc() {
  const nome = document.getElementById('ac-mpe-nome').value.trim();
  if (!nome) { toast('Informe o nome do parceiro.'); return; }
  const registro = {
    nome,
    tipo: document.getElementById('ac-mpe-tipo').value.trim() || null,
    whatsapp: document.getElementById('ac-mpe-zap').value.trim() || null,
    chave_pix: document.getElementById('ac-mpe-pix').value.trim() || null,
    ativo: document.getElementById('ac-mpe-ativo').checked,
  };
  let error;
  if (acParcEditId) {
    ({ error } = await db.from('parceiros_externos').update(registro).eq('id', acParcEditId));
  } else {
    registro.academia_id = MEU_ACADEMIA_ID;
    ({ error } = await db.from('parceiros_externos').insert(registro));
  }
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-parceiro-ac');
  toast(acParcEditId ? 'Parceiro atualizado ✓' : 'Parceiro cadastrado ✓');
  carregarParceirosAc();
}

/* ---------------- EXCLUIR / INATIVAR ---------------- */
async function excluirParceiroAc(id) {
  const p = AC_PARC_LIST.find(x => x.id === id);
  if (!p) return;

  const { count: temCobrancas } = await db.from('cobrancas_avulsas')
    .select('id', { count: 'exact', head: true })
    .eq('parceiro_externo_id', id);

  if (temCobrancas > 0) {
    if (confirm(`${p.nome} tem ${temCobrancas} cobrança(s) avulsa(s) no histórico.\n\nExcluir apagaria esse histórico — por segurança, o sistema INATIVA o parceiro (some das listas, histórico preservado).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('parceiros_externos').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Parceiro inativado ✓ — histórico preservado.');
      carregarParceirosAc();
    }
    return;
  }

  if (!confirm(`Excluir o parceiro ${p.nome}?`)) return;
  const { error } = await db.from('parceiros_externos').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Parceiro excluído ✓');
  carregarParceirosAc();
}

/* ---------------- NOVA COBRANÇA AVULSA (Fase 3 — lançamento manual) ---------------- */
function acCaCalc() {
  const total = parseFloat(document.getElementById('ac-ca-total').value) || 0;
  const parc = parseFloat(document.getElementById('ac-ca-parcval').value) || 0;
  document.getElementById('ac-ca-liquido').value = brl(Math.max(total - parc, 0));
}

async function abrirCobrancaAvulsaAc() {
  const parceirosAtivos = AC_PARC_LIST.filter(p => p.ativo !== false);
  if (!parceirosAtivos.length) { toast('Cadastre um parceiro externo antes de lançar uma cobrança.'); return; }

  const [{ data: alunos }] = await Promise.all([
    db.from('alunos').select('id, nome').eq('ativo', true).order('nome'),
  ]);

  document.getElementById('ac-ca-aluno').innerHTML = (alunos || [])
    .map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  document.getElementById('ac-ca-parceiro').innerHTML = parceirosAtivos
    .map(p => `<option value="${p.id}">${esc(p.nome)}${p.tipo ? ' — ' + esc(p.tipo) : ''}</option>`).join('');

  document.getElementById('ac-ca-desc').value = '';
  document.getElementById('ac-ca-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ac-ca-total').value = '';
  document.getElementById('ac-ca-parcval').value = '0';
  acCaCalc();
  openModal('m-cobranca-avulsa');
}

async function salvarCobrancaAvulsaAc() {
  const aluno_id = Number(document.getElementById('ac-ca-aluno').value);
  const parceiro_externo_id = Number(document.getElementById('ac-ca-parceiro').value);
  const descricao = document.getElementById('ac-ca-desc').value.trim();
  const data_cobranca = document.getElementById('ac-ca-data').value;
  const valor_total = parseFloat(document.getElementById('ac-ca-total').value) || 0;
  const valor_parceiro = parseFloat(document.getElementById('ac-ca-parcval').value) || 0;

  if (!aluno_id) { toast('Selecione o aluno.'); return; }
  if (!parceiro_externo_id) { toast('Selecione o parceiro externo.'); return; }
  if (!descricao) { toast('Informe a descrição.'); return; }
  if (!data_cobranca) { toast('Informe a data.'); return; }
  if (valor_total <= 0) { toast('Informe um valor total válido.'); return; }
  if (valor_parceiro > valor_total) { toast('O valor do parceiro não pode ser maior que o valor total.'); return; }

  const { error } = await db.from('cobrancas_avulsas').insert({
    academia_id: MEU_ACADEMIA_ID,
    aluno_id,
    parceiro_externo_id,
    descricao,
    data_cobranca,
    valor_total,
    valor_parceiro,
    origem: 'manual',
    status: 'pago',
    pago_em: new Date().toISOString(),
    status_repasse: 'pendente',
  });
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-cobranca-avulsa');
  toast('Cobrança avulsa registrada ✓');
  carregarParceirosAc();
}

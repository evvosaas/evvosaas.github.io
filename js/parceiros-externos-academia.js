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

  const { data: parceiros, error } = await db.from('parceiros_externos').select('*').order('nome');
  if (error) { grid.innerHTML = `<div class="vazio" style="grid-column:1/-1">Erro: ${esc(error.message)}</div>`; return; }
  AC_PARC_LIST = parceiros || [];

  if (!AC_PARC_LIST.length) {
    grid.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhum parceiro externo cadastrado. Use "+ Novo parceiro externo".</div>';
    return;
  }

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

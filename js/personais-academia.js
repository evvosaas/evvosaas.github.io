/* ============================================================
   EVVO — MÓDULO PERSONAIS (painel da academia)
   Migrado fielmente do HealFit Gestão: CRUD, filtro de período,
   cards de devido/repassado/saldo, registrar repasse, detalhe
   das faturas com personal e histórico de repasses pagos.
   ============================================================ */
let AC_PERS_LIST = [];
let acPersEditId = null;

/* ---------------- CARREGAR ---------------- */
function acPersPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('ac-pers-ini');
  const elFim = document.getElementById('ac-pers-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarPersonaisAc() {
  acPersPeriodoPadrao();
  const pIni = document.getElementById('ac-pers-ini').value;
  const pFim = document.getElementById('ac-pers-fim').value;

  const grid = document.getElementById('ac-pers-grid');
  grid.innerHTML = '<div class="carregando" style="grid-column:1/-1">Carregando…</div>';

  const [
    { data: personais, error: e1 },
    { data: alunosAtivos },
    { data: devidos },
    { data: repassesPagos },
    { data: faturasPeriodo },
  ] = await Promise.all([
    db.from('personais').select('*').order('nome'),
    db.from('alunos').select('personal_id, valor_personal').eq('ativo', true).not('personal_id', 'is', null),
    db.rpc('fn_repasses_devidos', { p_academia_id: MEU_ACADEMIA_ID, p_ini: pIni, p_fim: pFim }),
    db.from('repasses').select('personal_id, valor').eq('status', 'pago')
      .gte('periodo_ini', pIni).lte('periodo_fim', pFim),
    db.from('mensalidades')
      .select('valor_personal, vencimento, pago_em, status, personal_id, alunos(nome), personais(nome)')
      .gt('valor_personal', 0)
      .or(`and(status.eq.pago,pago_em.gte.${pIni}T00:00:00,pago_em.lte.${pFim}T23:59:59),and(status.in.(pendente,atrasado),vencimento.gte.${pIni},vencimento.lte.${pFim})`)
      .order('vencimento'),
  ]);

  if (e1) { grid.innerHTML = `<div class="vazio" style="grid-column:1/-1">Erro: ${esc(e1.message)}</div>`; return; }
  AC_PERS_LIST = personais || [];

  /* ---------- Cards por personal ---------- */
  const ativos = AC_PERS_LIST.filter(p => p.ativo !== false);
  if (!ativos.length) {
    grid.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhum personal cadastrado. Use "+ Novo personal".</div>';
  } else {
    grid.innerHTML = ativos.map((p, i) => {
      const meusAlunos = (alunosAtivos || []).filter(a => a.personal_id === p.id);
      const previsto = meusAlunos.reduce((s, a) => s + Number(a.valor_personal || 0), 0);
      const devido = Number((devidos || []).find(d => d.personal_id === p.id)?.valor_total || 0);
      const jaPago = (repassesPagos || []).filter(r => r.personal_id === p.id)
        .reduce((s, r) => s + Number(r.valor), 0);
      const saldo = Math.max(devido - jaPago, 0);
      return `
      <div class="pers-card">
        <div class="pers-acts">
          <button class="icon-btn" title="Editar" onclick="abrirPersonalAc(${p.id})">✎</button>
          <button class="icon-btn del" title="Excluir" onclick="excluirPersonalAc(${p.id})">🗑</button>
        </div>
        <div class="pers-top">
          <div class="av" style="background:${corDe(i)}">${ini(p.nome)}</div>
          <div><div class="nm">${esc(p.nome)}</div>
            <div class="cref">${p.cref ? 'CREF ' + esc(p.cref) : ''}${p.chave_pix ? ' · PIX: ' + esc(p.chave_pix) : ''}</div></div>
        </div>
        <div class="pers-stats">
          <div><div class="l">Alunos</div><div class="v">${meusAlunos.length}</div></div>
          <div><div class="l">Devido no período</div><div class="v">${brl(devido)}</div></div>
          <div><div class="l">Saldo a pagar</div><div class="v" style="color:var(--info)">${brl(saldo)}</div></div>
        </div>
        ${jaPago > 0 ? `<div class="loc" style="margin-top:8px;font-size:12px;color:var(--muted)">Já repassado no período: ${brl(jaPago)}</div>` : ''}
        <div class="pers-foot">
          <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center"
            ${saldo <= 0 ? 'disabled style="flex:1;justify-content:center;opacity:.5;cursor:not-allowed"' : ''}
            onclick="registrarRepasseAc(${p.id}, ${saldo})">💸 Pagar repasse ${saldo > 0 ? '(' + brl(saldo) + ')' : ''}</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- Detalhe: faturas com personal no período ---------- */
  const tb = document.getElementById('ac-pers-rep-rows');
  const linhas = (faturasPeriodo || []);
  let totalLiberado = 0;
  if (!linhas.length) {
    tb.innerHTML = '<tr><td colspan="5" class="vazio">Nenhuma fatura com personal no período.</td></tr>';
  } else {
    tb.innerHTML = linhas.map((m, i) => {
      const liberado = m.status === 'pago';
      if (liberado) totalLiberado += Number(m.valor_personal);
      return `
      <tr>
        <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(m.personais?.nome)}</div>
          <div class="nm">${esc(m.personais?.nome || '—')}</div></div></td>
        <td>${esc(m.alunos?.nome || '—')}</td>
        <td><b>${brl(m.valor_personal)}</b></td>
        <td>${stBadgeAc(m.status)}</td>
        <td>${liberado
          ? '<span class="badge b-info">Liberado p/ repasse</span>'
          : '<span class="badge b-off">Aguardando pagamento</span>'}</td>
      </tr>`;
    }).join('');
  }
  document.getElementById('ac-pers-rep-total').textContent = 'Liberado no período: ' + brl(totalLiberado);

  /* ---------- Histórico de repasses pagos ---------- */
  const { data: hist } = await db.from('repasses')
    .select('*, personais(nome)')
    .order('created_at', { ascending: false })
    .limit(10);
  const tbh = document.getElementById('ac-pers-hist-rows');
  if (!hist || !hist.length) {
    tbh.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum repasse registrado ainda.</td></tr>';
  } else {
    tbh.innerHTML = hist.map(r => `
      <tr>
        <td><b>${esc(r.personais?.nome || '—')}</b></td>
        <td>${fmt(r.periodo_ini)} — ${fmt(r.periodo_fim)}</td>
        <td><b>${brl(r.valor)}</b></td>
        <td>${r.pago_em ? fmt(String(r.pago_em).slice(0, 10)) : '—'}</td>
        <td>${esc(r.observacao || '')}</td>
      </tr>`).join('');
  }
}

/* ---------------- REGISTRAR REPASSE ---------------- */
async function registrarRepasseAc(personalId, valor) {
  const p = AC_PERS_LIST.find(x => x.id === personalId);
  if (!p || valor <= 0) return;
  const pIni = document.getElementById('ac-pers-ini').value;
  const pFim = document.getElementById('ac-pers-fim').value;

  const chave = p.chave_pix ? `\n\nChave PIX de ${p.nome}: ${p.chave_pix}` : '\n\n(Personal sem chave PIX cadastrada — edite o cadastro.)';
  if (!confirm(`Registrar repasse de ${brl(valor)} para ${p.nome}?\n\nPeríodo: ${fmt(pIni)} a ${fmt(pFim)}${chave}\n\nFaça a transferência no seu banco e confirme aqui para registrar.`)) return;

  const { error } = await db.from('repasses').insert({
    academia_id: MEU_ACADEMIA_ID,
    personal_id: personalId,
    periodo_ini: pIni,
    periodo_fim: pFim,
    valor,
    status: 'pago',
    pago_em: new Date().toISOString(),
    observacao: 'Registrado pelo painel',
  });
  if (error) { toast('Erro ao registrar: ' + error.message); return; }
  toast(`Repasse de ${brl(valor)} registrado para ${p.nome} ✓`);
  carregarPersonaisAc();
}

/* ---------------- NOVO / EDITAR ---------------- */
function abrirPersonalAc(id) {
  acPersEditId = id;
  const p = id ? AC_PERS_LIST.find(x => x.id === id) : null;
  document.getElementById('ac-mp-title').textContent = p ? 'Editar personal' : 'Novo personal';
  document.getElementById('ac-mp-nome').value = p?.nome || '';
  document.getElementById('ac-mp-cref').value = p?.cref || '';
  document.getElementById('ac-mp-cpf').value = p?.cpf || '';
  document.getElementById('ac-mp-zap').value = p?.whatsapp || '';
  document.getElementById('ac-mp-pix').value = p?.chave_pix || '';
  document.getElementById('ac-mp-ativo').checked = p ? p.ativo !== false : true;
  openModal('m-pers-ac');
}

async function salvarPersonalAc() {
  const nome = document.getElementById('ac-mp-nome').value.trim();
  if (!nome) { toast('Informe o nome do personal.'); return; }
  const registro = {
    nome,
    cref: document.getElementById('ac-mp-cref').value.trim() || null,
    cpf: document.getElementById('ac-mp-cpf').value.trim() || null,
    whatsapp: document.getElementById('ac-mp-zap').value.trim() || null,
    chave_pix: document.getElementById('ac-mp-pix').value.trim() || null,
    ativo: document.getElementById('ac-mp-ativo').checked,
  };
  let error;
  if (acPersEditId) {
    ({ error } = await db.from('personais').update(registro).eq('id', acPersEditId));
  } else {
    registro.academia_id = MEU_ACADEMIA_ID;
    ({ error } = await db.from('personais').insert(registro));
  }
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-pers-ac');
  toast(acPersEditId ? 'Personal atualizado ✓' : 'Personal cadastrado ✓');
  carregarPersonaisAc();
}

/* ---------------- EXCLUIR / INATIVAR ---------------- */
async function excluirPersonalAc(id) {
  const p = AC_PERS_LIST.find(x => x.id === id);
  if (!p) return;

  const { count: alunosVinc } = await db.from('alunos')
    .select('id', { count: 'exact', head: true })
    .eq('personal_id', id).eq('ativo', true);

  if (alunosVinc > 0) {
    alert(`${p.nome} tem ${alunosVinc} aluno(s) ativo(s) vinculado(s).\n\nDesvincule os alunos antes de excluir.`);
    return;
  }

  const { count: temRepasses } = await db.from('repasses')
    .select('id', { count: 'exact', head: true })
    .eq('personal_id', id);

  if (temRepasses > 0) {
    if (confirm(`${p.nome} tem ${temRepasses} repasse(s) no histórico financeiro.\n\nExcluir apagaria esse histórico — por segurança, o sistema INATIVA o personal (some das listas, histórico preservado).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('personais').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Personal inativado ✓ — histórico preservado.');
      carregarPersonaisAc();
    }
    return;
  }

  if (!confirm(`Excluir o personal ${p.nome}?`)) return;
  const { error } = await db.from('personais').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Personal excluído ✓');
  carregarPersonaisAc();
}

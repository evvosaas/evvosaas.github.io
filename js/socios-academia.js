/* ============================================================
   EVVO — MÓDULO PARTICIPAÇÃO DOS SÓCIOS (painel da academia)
   Migrado fielmente do HealFit Gestão: base = valor efetivamente
   recebido − personais; despesas informativas; fechar período
   (snapshot imutável); histórico de fechamentos.
   ============================================================ */
let AC_SOCIOS = [];
let AC_PART_ATUAL = null;

/* ---------------- CARREGAR ---------------- */
function acSocPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('ac-soc-ini');
  const elFim = document.getElementById('ac-soc-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarSociosAc() {
  acSocPeriodoPadrao();
  const pIni = document.getElementById('ac-soc-ini').value;
  const pFim = document.getElementById('ac-soc-fim').value;
  document.getElementById('ac-soc-periodo-lbl').textContent = fmt(pIni) + ' — ' + fmt(pFim);

  const [{ data: socios }, { data: part, error: eP }, { data: fech }] = await Promise.all([
    db.from('socios').select('*').is('vigencia_fim', null).order('percentual', { ascending: false }),
    db.rpc('fn_participacao', { p_academia_id: MEU_ACADEMIA_ID, p_ini: pIni, p_fim: pFim }),
    db.from('fechamentos').select('*').order('periodo_ini', { ascending: false }).limit(12),
  ]);

  AC_SOCIOS = socios || [];
  AC_PART_ATUAL = (part && part[0]) || null;

  /* ---------- Base de cálculo ---------- */
  if (eP || !AC_PART_ATUAL) {
    document.getElementById('ac-soc-erro').textContent = 'Erro ao calcular: ' + (eP?.message || 'sem dados');
  } else {
    const p = AC_PART_ATUAL;
    document.getElementById('ac-c-bruto').textContent = brl(p.bruto_recebido);
    document.getElementById('ac-c-repasse').textContent = '− ' + brl(p.total_personais);
    document.getElementById('ac-c-avulsos').textContent = '+ ' + brl(p.avulsas_liquido || 0);
    document.getElementById('ac-c-base').textContent = brl(p.base_distribuicao);
    document.getElementById('ac-c-despesas').textContent = brl(p.despesas_periodo);
  }

  /* ---------- Barra e legenda ---------- */
  document.getElementById('ac-soc-bar').innerHTML =
    AC_SOCIOS.map((s, i) => `<div style="width:${s.percentual}%;background:${corDe(i)}"></div>`).join('');
  document.getElementById('ac-soc-legend').innerHTML =
    AC_SOCIOS.map((s, i) => `<span><span class="sw" style="background:${corDe(i)}"></span>${esc(s.nome)} · ${Number(s.percentual)}%</span>`).join('');

  /* ---------- Distribuição por sócio ---------- */
  const base = Number(AC_PART_ATUAL?.base_distribuicao || 0);
  document.getElementById('ac-soc-rows').innerHTML = AC_SOCIOS.length
    ? AC_SOCIOS.map((s, i) => `
      <tr>
        <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(s.nome)}</div><div class="nm">${esc(s.nome)}</div></div></td>
        <td><b>${Number(s.percentual)}%</b></td>
        <td style="font-family:'Archivo';font-weight:800;font-size:16px">${brl(base * Number(s.percentual) / 100)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="vazio">Nenhum sócio cadastrado.</td></tr>';

  /* ---------- Histórico de fechamentos ---------- */
  const tbf = document.getElementById('ac-fech-rows');
  if (!fech || !fech.length) {
    tbf.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum período fechado ainda. Use "Fechar período" para gravar o primeiro.</td></tr>';
  } else {
    tbf.innerHTML = fech.map(f => {
      const dist = (f.distribuicao || []).map(d =>
        `${esc(d.socio)} (${Number(d.percentual)}%): <b>${brl(d.valor)}</b>`).join(' · ');
      return `
      <tr>
        <td><b>${fmt(f.periodo_ini)} — ${fmt(f.periodo_fim)}</b></td>
        <td>${brl(f.bruto_recebido)}</td>
        <td>${brl(f.base_distribuicao)}</td>
        <td style="font-size:12.5px">${dist}</td>
        <td><span class="badge b-ok">Fechado</span><div class="loc">${fmt(String(f.created_at).slice(0,10))}</div></td>
      </tr>`;
    }).join('');
  }
}

/* ---------------- FECHAR PERÍODO ---------------- */
async function fecharPeriodoAc() {
  const pIni = document.getElementById('ac-soc-ini').value;
  const pFim = document.getElementById('ac-soc-fim').value;
  if (!AC_PART_ATUAL) { toast('Aguarde o cálculo carregar.'); return; }

  const p = AC_PART_ATUAL;
  const resumo = (AC_SOCIOS || []).map(s =>
    `${s.nome}: ${brl(Number(p.base_distribuicao) * Number(s.percentual) / 100)}`).join('\n');

  if (!confirm(`FECHAR o período ${fmt(pIni)} — ${fmt(pFim)}?\n\nBase de distribuição: ${brl(p.base_distribuicao)}\n${resumo}\n\nO fechamento grava um registro PERMANENTE para consulta — mudanças futuras de percentuais ou lançamentos não alteram períodos fechados.`)) return;

  const { error } = await db.rpc('fn_fechar_periodo', { p_academia_id: MEU_ACADEMIA_ID, p_ini: pIni, p_fim: pFim });
  if (error) {
    toast(error.code === '23505'
      ? 'Este período já foi fechado — veja no histórico.'
      : 'Erro ao fechar: ' + error.message);
    return;
  }
  toast('Período fechado e gravado no histórico ✓');
  carregarSociosAc();
}

/* ---------------- EDITAR PERCENTUAIS ---------------- */
function abrirSociosAc() {
  const grid = document.getElementById('ac-ms-grid');
  if (!AC_SOCIOS.length) {
    grid.innerHTML = `<div class="full" style="text-align:center;color:var(--muted);padding:20px 0">
      Nenhum sócio cadastrado ainda. Adicione o primeiro abaixo.
      <div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="acAdicionarSocioSlot()">+ Adicionar sócio</button></div>
    </div>`;
  } else {
    grid.innerHTML = AC_SOCIOS.map((s, i) => `
      <div><label>Sócio ${i + 1}</label><input id="ac-ms-n${i}" value="${esc(s.nome)}"></div>
      <div style="display:flex;gap:8px;align-items:end">
        <div style="flex:1"><label>Percentual (%)</label><input id="ac-ms-p${i}" type="number" min="0" max="100" step="0.5" value="${Number(s.percentual)}" oninput="acSocSoma()"></div>
        <button class="icon-btn del" title="Remover sócio" onclick="removerSocioAc(${i})" style="margin-bottom:1px">🗑</button>
      </div>`).join('')
      + `<div class="full" style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="acAdicionarSocioSlot()">+ Adicionar sócio</button></div>`;
    acSocSoma();
  }
  openModal('m-socios-ac');
}

async function removerSocioAc(index) {
  const s = AC_SOCIOS[index];
  if (!s) return;

  // Sócio novo (ainda nem salvo no banco): só remove da lista local
  if (!s.id) {
    AC_SOCIOS.splice(index, 1);
    abrirSociosAc();
    return;
  }

  // Sócio já salvo: verifica se aparece em algum fechamento histórico
  const { data: fechamentos } = await db.from('fechamentos').select('distribuicao');
  const apareceEmFechamento = (fechamentos || []).some(f =>
    (f.distribuicao || []).some(d => d.socio === s.nome));

  if (apareceEmFechamento) {
    if (!confirm(`${s.nome} já aparece em fechamentos anteriores — excluir de verdade apagaria essa referência no histórico.\n\nRecomendado: ENCERRAR a vigência dele (sai da divisão a partir de hoje, mas o histórico continua intacto).\n\nOK = Encerrar vigência | Cancelar = não fazer nada`)) return;
    const { error } = await db.from('socios').update({ vigencia_fim: new Date().toISOString().slice(0, 10) }).eq('id', s.id);
    if (error) { toast('Erro: ' + error.message); return; }
    toast(`${s.nome} não participa mais da divisão — histórico preservado.`);
  } else {
    if (!confirm(`Remover ${s.nome}? Ele nunca apareceu em nenhum fechamento, então a exclusão é definitiva.`)) return;
    const { error } = await db.from('socios').delete().eq('id', s.id);
    if (error) { toast('Erro: ' + error.message); return; }
    toast(`${s.nome} removido ✓`);
  }
  carregarSociosAc();
  AC_SOCIOS.splice(index, 1);
  abrirSociosAc();
}

function acAdicionarSocioSlot() {
  AC_SOCIOS.push({ id: null, nome: '', percentual: 0 });
  abrirSociosAc();
}

function acSocSoma() {
  let soma = 0;
  AC_SOCIOS.forEach((_, i) => { soma += parseFloat(document.getElementById('ac-ms-p' + i)?.value) || 0; });
  const nota = document.getElementById('ac-ms-nota');
  soma = Math.round(soma * 100) / 100;
  nota.textContent = soma === 100
    ? '✓ Soma fechada em 100%.'
    : `A soma está em ${soma}% — precisa fechar em 100%.`;
  nota.style.color = soma === 100 ? 'var(--ok)' : 'var(--late)';
}

async function salvarSociosAc() {
  let soma = 0;
  const novos = AC_SOCIOS.map((s, i) => {
    const nome = document.getElementById('ac-ms-n' + i).value.trim();
    const pct = parseFloat(document.getElementById('ac-ms-p' + i).value) || 0;
    soma += pct;
    return { id: s.id, nome, percentual: pct };
  });
  if (novos.some(n => !n.nome)) { toast('Todo sócio precisa de um nome.'); return; }
  if (Math.round(soma * 100) / 100 !== 100) { toast('A soma dos percentuais precisa ser 100%.'); return; }

  for (const n of novos) {
    if (n.id) {
      const { error } = await db.from('socios').update({ nome: n.nome, percentual: n.percentual }).eq('id', n.id);
      if (error) { toast('Erro ao salvar: ' + error.message); return; }
    } else {
      const { error } = await db.from('socios').insert({
        academia_id: MEU_ACADEMIA_ID, nome: n.nome, percentual: n.percentual,
      });
      if (error) { toast('Erro ao criar sócio: ' + error.message); return; }
    }
  }
  closeModal('m-socios-ac');
  toast('Percentuais atualizados ✓ (fechamentos anteriores não mudam)');
  carregarSociosAc();
}

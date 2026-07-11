/* ============================================================
   EVVO — DASHBOARD DA ACADEMIA
   Migrado fielmente do HealFit Gestão. RLS filtra automaticamente
   por academia_id — nenhuma query precisa filtrar manualmente.
   ============================================================ */
async function carregarDashboardAc() {
  const hoje = new Date();
  const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Valor EFETIVAMENTE recebido no mês:
  // (a) mensalidades — tabela pagamentos (baixas parciais contam pelo valor real que entrou)
  // (b) cobranças avulsas de Parceiros Externos, pagas no mês
  // (c) Outras Receitas (recorrentes ou avulsas), pagas no mês — 100% líquido, sem repasse
  const [{ data: pagos, error: e1 }, { data: avulsas, error: e1b }, { data: outras, error: e1c }] = await Promise.all([
    db.from('pagamentos')
      .select('valor, mensalidades(valor_personal)')
      .gte('pago_em', iniMes + 'T00:00:00')
      .lte('pago_em', fimMes + 'T23:59:59'),
    db.from('cobrancas_avulsas')
      .select('valor_total, valor_parceiro')
      .eq('status', 'pago')
      .gte('pago_em', iniMes + 'T00:00:00')
      .lte('pago_em', fimMes + 'T23:59:59'),
    db.from('outras_receitas')
      .select('valor')
      .eq('status', 'pago')
      .gte('pago_em', iniMes + 'T00:00:00')
      .lte('pago_em', fimMes + 'T23:59:59'),
  ]);

  if (!e1 && !e1b && !e1c) {
    const brutoMens = (pagos || []).reduce((s, p) => s + Number(p.valor), 0);
    const repasseMens = (pagos || []).reduce((s, p) => s + Number(p.mensalidades?.valor_personal || 0), 0);
    const brutoAvulso = (avulsas || []).reduce((s, a) => s + Number(a.valor_total), 0);
    const repasseAvulso = (avulsas || []).reduce((s, a) => s + Number(a.valor_parceiro), 0);
    const brutoOutras = (outras || []).reduce((s, o) => s + Number(o.valor), 0);
    const bruto = brutoMens + brutoAvulso + brutoOutras;
    const repasse = repasseMens + repasseAvulso;
    document.getElementById('ack-bruto').textContent = brl(bruto);
    document.getElementById('ack-academia').textContent = brl(bruto - repasse);
    document.getElementById('ack-repasse').textContent = brl(repasse);
  }

  // Atrasados (todos)
  const { data: atrasados } = await db.from('mensalidades')
    .select('valor_total').eq('status', 'atrasado');
  const totAtraso = (atrasados || []).reduce((s, m) => s + Number(m.valor_total), 0);
  document.getElementById('ack-atraso').textContent = brl(totAtraso);
  document.getElementById('ack-atraso-qtd').textContent = `${(atrasados || []).length} fatura(s) vencida(s)`;

  // ---------- Planos vencendo ou vencidos (roda ANTES da seção abaixo, que tem returns antecipados) ----------
  const { data: cfgPlano } = await db.from('config')
    .select('valor').eq('chave', 'alerta_vencimento_plano_dias').maybeSingle();
  const diasAlerta = parseInt(cfgPlano?.valor) || 30;

  const hojeStr = hoje.toISOString().slice(0, 10);
  const limiteStr = new Date(hoje.getTime() + diasAlerta * 86400000).toISOString().slice(0, 10);

  const { data: planosVencendo, error: e3 } = await db.from('vw_alunos_completo')
    .select('id, nome, plano, data_vencimento_plano')
    .eq('ativo', true)
    .not('data_vencimento_plano', 'is', null)
    .lte('data_vencimento_plano', limiteStr)
    .order('data_vencimento_plano', { ascending: true })
    .limit(10);

  const tbPlano = document.getElementById('ac-dash-planos-rows');
  if (e3) {
    tbPlano.innerHTML = `<tr><td colspan="5" class="vazio">Erro ao carregar: ${esc(e3.message)}</td></tr>`;
  } else if (!planosVencendo || !planosVencendo.length) {
    tbPlano.innerHTML = `<tr><td colspan="5" class="vazio">Nenhum plano vencendo nos próximos ${diasAlerta} dias. 🎉</td></tr>`;
  } else {
    tbPlano.innerHTML = planosVencendo.map((a, i) => {
      const diffDias = Math.round((new Date(a.data_vencimento_plano) - new Date(hojeStr)) / 86400000);
      const situacao = diffDias < 0
        ? `<span class="badge b-late">Vencido há ${Math.abs(diffDias)} dia(s)</span>`
        : diffDias === 0
          ? '<span class="badge b-late">Vence hoje</span>'
          : `<span class="badge b-warn">Vence em ${diffDias} dia(s)</span>`;
      return `<tr>
        <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div><div class="nm">${esc(a.nome)}</div></div></td>
        <td>${esc(a.plano || '—')}</td>
        <td>${fmt(a.data_vencimento_plano)}</td>
        <td>${situacao}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="abrirRenovarPlanoAc(${a.id})">🔄 Renovar</button></td>
      </tr>`;
    }).join('');
  }

  // Vencimentos próximos + atrasos
  const { data: lista, error: e2 } = await db.from('vw_financeiro')
    .select('aluno, vencimento, valor_total, status')
    .in('status', ['pendente', 'atrasado'])
    .order('vencimento', { ascending: true })
    .limit(8);

  const tb = document.getElementById('ac-dash-rows');
  if (e2) { tb.innerHTML = `<tr><td colspan="4" class="vazio">Erro ao carregar: ${esc(e2.message)}</td></tr>`; return; }
  if (!lista || !lista.length) {
    tb.innerHTML = '<tr><td colspan="4" class="vazio">Nenhuma fatura pendente ou atrasada. 🎉</td></tr>'; return;
  }
  tb.innerHTML = lista.map((m, i) => `
    <tr>
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(m.aluno)}</div><div class="nm">${esc(m.aluno)}</div></div></td>
      <td>${fmt(m.vencimento)}</td>
      <td><b>${brl(m.valor_total)}</b></td>
      <td>${stBadgeAc(m.status)}</td>
    </tr>`).join('');
}

/* Badge de status — mesmo padrão do HealFit, com as classes já existentes no style.css */
function stBadgeAc(s) {
  if (s === 'pago') return '<span class="badge b-ok">Pago</span>';
  if (s === 'pendente') return '<span class="badge b-warn">Pendente</span>';
  if (s === 'atrasado') return '<span class="badge b-late">Atrasado</span>';
  if (s === 'cancelado') return '<span class="badge b-off">Cancelado</span>';
  return `<span class="badge b-warn">${esc(s)}</span>`;
}

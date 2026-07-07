/* ============================================================
   EVVO — DASHBOARD DA ACADEMIA
   Migrado fielmente do HealFit Gestão. RLS filtra automaticamente
   por academia_id — nenhuma query precisa filtrar manualmente.
   ============================================================ */
async function carregarDashboardAc() {
  const hoje = new Date();
  const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Valor EFETIVAMENTE recebido no mês (tabela pagamentos — baixas parciais
  // contam pelo valor real que entrou), com o personal da fatura.
  const { data: pagos, error: e1 } = await db.from('pagamentos')
    .select('valor, mensalidades(valor_personal)')
    .gte('pago_em', iniMes + 'T00:00:00')
    .lte('pago_em', fimMes + 'T23:59:59');

  if (!e1) {
    const bruto = (pagos || []).reduce((s, p) => s + Number(p.valor), 0);
    const repasse = (pagos || []).reduce((s, p) => s + Number(p.mensalidades?.valor_personal || 0), 0);
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

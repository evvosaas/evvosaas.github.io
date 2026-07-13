/* ============================================================
   EVVO — MÓDULO CONFIGURAÇÕES (painel da academia)
   Migrado fielmente do HealFit Gestão: planos, controles da
   geração automática. NOVO no Evvo: guia de conexão Asaas
   (API Key + Webhook com token 32+ caracteres) — cada academia
   configura a própria conta.
   ============================================================ */
let AC_PLANOS_CFG = [];
let AC_MODALIDADES = [];
let acModalidadeEditId = null;
let acPlanoEditId = null;

/* ---------------- CARREGAR ---------------- */
let acAcordeaoAberto = new Set();

async function carregarConfigAc() {
  const acordeao = document.getElementById('ac-modalidades-acordeao');
  acordeao.innerHTML = '<div class="carregando" style="padding:20px">Carregando…</div>';

  const [{ data: planos, error }, { data: cfg }, { data: contagens }, { data: academia }, { data: modalidades }, { data: matriculasExtras }] = await Promise.all([
    db.from('planos').select('*').order('valor'),
    db.from('config').select('*'),
    db.from('alunos').select('plano_id').eq('ativo', true),
    db.from('academias').select('*').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('modalidades').select('*').order('nome'),
    db.from('matriculas_extras').select('modalidade_id').eq('ativo', true),
  ]);

  if (error) { acordeao.innerHTML = `<div class="vazio" style="padding:20px">Erro: ${esc(error.message)}</div>`; return; }
  AC_PLANOS_CFG = planos || [];
  AC_MODALIDADES = modalidades || [];

  const qtdPor = {};
  (contagens || []).forEach(a => { qtdPor[a.plano_id] = (qtdPor[a.plano_id] || 0) + 1; });
  const alunosExtraPorModalidade = {};
  (matriculasExtras || []).forEach(m => { alunosExtraPorModalidade[m.modalidade_id] = (alunosExtraPorModalidade[m.modalidade_id] || 0) + 1; });
  const rotuloPeriodicidade = m => m === 1 ? 'Mensal' : m === 3 ? 'Trimestral' : m === 6 ? 'Semestral' : m === 12 ? 'Anual' : `${m} meses`;

  const linhasPlano = lista => lista.length ? `
    <table style="margin-top:0">
      <thead><tr><th>Plano</th><th>Valor mensal</th><th>Duração</th><th>Frequência</th><th>Alunos ativos</th><th style="text-align:right">Ações</th></tr></thead>
      <tbody>${lista.map(p => `
        <tr>
          <td><b>${esc(p.nome)}</b>${p.ativo === false ? ' <span class="badge b-off">Inativo</span>' : ''}</td>
          <td><b>${brl(p.valor)}</b>/mês</td>
          <td>${rotuloPeriodicidade(p.periodicidade_meses || 1)}</td>
          <td>${p.frequencia_semanal ? p.frequencia_semanal + 'x/semana' : '—'}</td>
          <td>${qtdPor[p.id] || 0} aluno(s)</td>
          <td><div class="acts">
            <button class="icon-btn" title="Editar" onclick="abrirPlanoAc(${p.id})">✎</button>
            <button class="icon-btn del" title="Excluir" onclick="excluirPlanoAc(${p.id})">🗑</button>
          </div></td>
        </tr>`).join('')}</tbody>
    </table>` : '<div class="vazio" style="padding:14px 20px">Nenhum plano nessa modalidade ainda.</div>';

  const gruposModalidade = AC_MODALIDADES.map((m, i) => {
    const planosDaModalidade = AC_PLANOS_CFG.filter(p => p.modalidade_id === m.id).sort((a, b) => {
      const comboA = a.nome.toLowerCase().includes('combo') ? 1 : 0;
      const comboB = b.nome.toLowerCase().includes('combo') ? 1 : 0;
      if (comboA !== comboB) return comboA - comboB;
      const perA = a.periodicidade_meses || 1, perB = b.periodicidade_meses || 1;
      if (perA !== perB) return perA - perB;
      return (a.frequencia_semanal || 0) - (b.frequencia_semanal || 0);
    });
    const aberto = acAcordeaoAberto.has(`m${m.id}`);
    return `
    <div class="acordeao-item">
      <div class="acordeao-head" style="--acordeao-cor:${corDe(i)}" onclick="toggleAcordeaoModalidade('m${m.id}')">
        <span class="acordeao-seta">${aberto ? '▾' : '▸'}</span>
        <b>${esc(m.nome)}</b>${m.ativo === false ? ' <span class="badge b-off">Inativa</span>' : ''}
        <span class="loc" style="margin-left:8px">${planosDaModalidade.length} plano(s) · ${alunosExtraPorModalidade[m.id] || 0} matrícula(s) extra</span>
        <div class="acts" style="margin-left:auto" onclick="event.stopPropagation()">
          <button class="icon-btn" title="Editar modalidade" onclick="abrirModalidadeAc(${m.id})">✎</button>
          <button class="icon-btn del" title="Excluir modalidade" onclick="excluirModalidadeAc(${m.id})">🗑</button>
        </div>
      </div>
      ${aberto ? `<div class="acordeao-body">${linhasPlano(planosDaModalidade)}</div>` : ''}
    </div>`;
  }).join('');

  const orfaos = AC_PLANOS_CFG.filter(p => !p.modalidade_id);
  let grupoOrfaos = '';
  if (orfaos.length) {
    const abertoOrfaos = acAcordeaoAberto.has('sem-modalidade');
    grupoOrfaos = `
      <div class="acordeao-item">
        <div class="acordeao-head" style="--acordeao-cor:#b7bac2" onclick="toggleAcordeaoModalidade('sem-modalidade')">
          <span class="acordeao-seta">${abertoOrfaos ? '▾' : '▸'}</span>
          <b>Sem modalidade</b>
          <span class="loc" style="margin-left:8px">${orfaos.length} plano(s)</span>
        </div>
        ${abertoOrfaos ? `<div class="acordeao-body">${linhasPlano(orfaos)}</div>` : ''}
      </div>`;
  }

  acordeao.innerHTML = (AC_MODALIDADES.length ? gruposModalidade : '<div class="vazio" style="padding:20px">Nenhuma modalidade cadastrada ainda.</div>')
    + grupoOrfaos;

  /* ---------- Alerta de vencimento de plano ---------- */
  const mapa = {};
  (cfg || []).forEach(c => { mapa[c.chave] = c.valor; });
  document.getElementById('ac-cfg-dias-plano').value = mapa['alerta_vencimento_plano_dias'] || '30';

  /* ---------- Integração Asaas ---------- */
  renderIntegracaoAc(academia);
}

function toggleAcordeaoModalidade(chave) {
  if (acAcordeaoAberto.has(chave)) acAcordeaoAberto.delete(chave);
  else acAcordeaoAberto.add(chave);
  carregarConfigAc();
}

async function salvarDiasVencimentoPlanoAc() {
  const dias = parseInt(document.getElementById('ac-cfg-dias-plano').value) || 30;
  if (dias < 1 || dias > 90) { toast('Use um valor entre 1 e 90 dias.'); return; }

  const { data, error: eUpd } = await db.from('config')
    .update({ valor: String(dias), updated_at: new Date().toISOString() })
    .eq('academia_id', MEU_ACADEMIA_ID).eq('chave', 'alerta_vencimento_plano_dias')
    .select();

  let error = eUpd;
  if (!error && (!data || data.length === 0)) {
    ({ error } = await db.from('config').insert({
      academia_id: MEU_ACADEMIA_ID, chave: 'alerta_vencimento_plano_dias', valor: String(dias),
    }));
  }
  toast(error ? 'Erro: ' + error.message : `Vamos avisar com ${dias} dia(s) de antecedência do vencimento do plano ✓`);
}

/* ---------------- PLANOS: NOVO / EDITAR ---------------- */
function abrirPlanoAc(id, modalidadePreSelecionada) {
  acPlanoEditId = id;
  const p = id ? AC_PLANOS_CFG.find(x => x.id === id) : null;
  document.getElementById('ac-mpl-title').textContent = p ? 'Editar plano' : 'Novo plano';
  document.getElementById('ac-mpl-nome').value = p?.nome || '';
  document.getElementById('ac-mpl-valor').value = p ? Number(p.valor).toFixed(2) : '';
  document.getElementById('ac-mpl-periodicidade').value = p?.periodicidade_meses || 1;
  document.getElementById('ac-mpl-frequencia').value = p?.frequencia_semanal || '';
  document.getElementById('ac-mpl-ativo').checked = p ? p.ativo !== false : true;

  const modalidadesAtivas = AC_MODALIDADES.filter(m => m.ativo !== false);
  const idPreSelecionar = p?.modalidade_id ?? modalidadePreSelecionada ?? '';
  document.getElementById('ac-mpl-modalidade').innerHTML = '<option value="">— nenhuma —</option>' +
    modalidadesAtivas.map(m => `<option value="${m.id}" ${idPreSelecionar === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');

  openModal('m-plano-ac');
}

async function salvarPlanoAc() {
  const nome = document.getElementById('ac-mpl-nome').value.trim();
  const valor = parseFloat(document.getElementById('ac-mpl-valor').value) || 0;
  if (!nome) { toast('Informe o nome do plano.'); return; }
  if (valor <= 0) { toast('Informe um valor válido.'); return; }

  const registro = {
    nome, valor,
    periodicidade_meses: parseInt(document.getElementById('ac-mpl-periodicidade').value) || 1,
    modalidade_id: document.getElementById('ac-mpl-modalidade').value || null,
    frequencia_semanal: document.getElementById('ac-mpl-frequencia').value ? parseInt(document.getElementById('ac-mpl-frequencia').value) : null,
    ativo: document.getElementById('ac-mpl-ativo').checked,
  };

  let error;
  if (acPlanoEditId) {
    ({ error } = await db.from('planos').update(registro).eq('id', acPlanoEditId));
  } else {
    registro.academia_id = MEU_ACADEMIA_ID;
    ({ error } = await db.from('planos').insert(registro));
  }

  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-plano-ac');
  toast(acPlanoEditId
    ? 'Plano atualizado ✓ — novas faturas usam o valor novo; as já emitidas não mudam.'
    : 'Plano criado ✓');
  carregarConfigAc();
}

/* ---------------- PLANOS: EXCLUIR ---------------- */
async function excluirPlanoAc(id) {
  const p = AC_PLANOS_CFG.find(x => x.id === id);
  if (!p) return;

  const [{ count: countAlunos }, { count: countExtras }] = await Promise.all([
    db.from('alunos').select('id', { count: 'exact', head: true }).eq('plano_id', id),
    db.from('matriculas_extras').select('id', { count: 'exact', head: true }).eq('plano_id', id),
  ]);

  if (countAlunos > 0) {
    alert(`O plano "${p.nome}" tem ${countAlunos} aluno(s) vinculado(s) como plano principal.\n\nMova os alunos para outro plano antes de excluir — ou apenas INATIVE o plano (✎ → desmarcar "ativo").`);
    return;
  }
  if (countExtras > 0) {
    alert(`O plano "${p.nome}" está sendo usado em ${countExtras} matrícula(s) extra (modalidade extra de algum aluno).\n\nRemova essas matrículas extras antes de excluir — ou apenas INATIVE o plano (✎ → desmarcar "ativo").`);
    return;
  }
  if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
  const { error } = await db.from('planos').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Plano excluído ✓');
  carregarConfigAc();
}

/* ---------------- INTEGRAÇÃO ASAAS (guia + chave + webhook) ---------------- */
const URL_WEBHOOK_EVVO = 'https://fwlhibjkobkhckhpndmi.supabase.co/functions/v1/webhook-asaas';

function renderIntegracaoAc(academia) {
  const box = document.getElementById('ac-integracao-box');
  const temChave = !!academia?.asaas_api_key;
  const temToken = !!academia?.asaas_webhook_token;

  box.innerHTML = `
    <div style="padding:18px 20px;display:flex;flex-direction:column;gap:20px">

      <div>
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
          <span class="badge ${temChave ? 'b-ok' : 'b-warn'}">${temChave ? '✓' : '1'}</span>
          Passo 1 — Chave da API do Asaas
        </div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.6">
          No painel Asaas da sua academia: <b>Configurações → Integrações → Chaves de API</b>.
        </p>
        <ol style="font-size:13px;color:var(--ink);line-height:1.9;margin:0 0 14px 18px;padding:0">
          <li>Clique em <b>"Gerar chave de API"</b></li>
          <li>Dê um nome para a chave (ex.: "Evvo") — data/hora de expiração são opcionais, pode deixar em branco</li>
          <li><b>Não marque</b> a opção de saque via API (Pix/Ted/Pague Contas) — o Evvo não precisa disso</li>
          <li>Clique em <b>Avançar</b> — o Asaas vai pedir um <b>código por SMS</b> no seu celular cadastrado; clique em "Enviar código", digite o código recebido e confirme</li>
          <li>Copie a chave gerada (começa com <code>$aact_</code>) e cole no campo abaixo</li>
        </ol>
        ${temChave
          ? `<div class="chave-box"><span>••••••••${esc(academia.asaas_api_key.slice(-4))}</span>
              <div class="chave-acts"><button class="icon-btn" onclick="editarChaveAsaasAc()">✎</button></div></div>`
          : `<div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="ac-nova-api-key" placeholder="Cole a API Key do Asaas" style="flex:1;min-width:220px;padding:10px 13px;border:1.5px solid var(--line);border-radius:10px;font-size:13.5px">
              <button class="btn btn-primary btn-sm" onclick="salvarChaveAsaasAc()">Salvar</button>
            </div>`}
      </div>

      <div style="border-top:1px dashed var(--line);padding-top:18px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
          <span class="badge ${temToken ? 'b-ok' : 'b-warn'}">${temToken ? '✓' : '2'}</span>
          Passo 2 — Webhook (avisa quando um aluno paga)
        </div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.6">
          No painel Asaas: <b>Configurações → Webhooks → Adicionar Webhook</b>. Preencha assim:
        </p>
        <ol style="font-size:13px;color:var(--ink);line-height:2;margin:0 0 14px 18px;padding:0">
          <li><b>URL do Webhook</b> — cole exatamente esta:
            <div onclick="navigator.clipboard.writeText('${URL_WEBHOOK_EVVO}').then(()=>toast('URL copiada ✓'))"
                 style="font-family:'JetBrains Mono',monospace;font-size:11.5px;background:var(--card2);border:1px dashed var(--line);border-radius:8px;padding:9px 11px;word-break:break-all;cursor:pointer;margin-top:4px">
              ${URL_WEBHOOK_EVVO} <span style="color:var(--brand);font-weight:700">(clique para copiar)</span>
            </div>
          </li>
          <li><b>Versão da API:</b> v3</li>
          <li><b>Token de autenticação:</b> use o gerado abaixo (mínimo 32 caracteres — exigência do Asaas)</li>
          <li><b>Tipo de envio:</b> Sequencial</li>
          <li><b>Eventos:</b> marque apenas <code>PAYMENT_RECEIVED</code>, <code>PAYMENT_CONFIRMED</code>, <code>PAYMENT_OVERDUE</code> e <code>PAYMENT_DELETED</code></li>
          <li>Clique em <b>Salvar</b> lá no Asaas</li>
          <li style="color:var(--brand);font-weight:700">Importante: cole esse MESMO token no campo abaixo e clique em "Salvar" AQUI no Evvo também — sem isso, o sistema não reconhece o aviso de pagamento do Asaas</li>
        </ol>
        ${temToken
          ? `<div class="chave-box"><span>••••••••${esc(academia.asaas_webhook_token.slice(-4))}</span>
              <div class="chave-acts"><button class="icon-btn" onclick="editarTokenWebhookAc()">✎</button></div></div>`
          : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <input id="ac-novo-token" placeholder="Token (mín. 32 caracteres)" style="flex:1;min-width:220px;padding:10px 13px;border:1.5px solid var(--line);border-radius:10px;font-size:13.5px;font-family:'JetBrains Mono',monospace">
              <button class="btn btn-ghost btn-sm" onclick="gerarTokenAc()">🎲 Gerar</button>
              <button class="btn btn-primary btn-sm" onclick="salvarTokenWebhookAc()">Salvar</button>
            </div>`}
      </div>

      <div style="border-top:1px dashed var(--line);padding-top:14px;font-size:12px;color:var(--muted)">
        Dúvidas na configuração? Fale com o suporte Evvo.
      </div>
    </div>
  `;
}

function gerarTokenAc() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  document.getElementById('ac-novo-token').value = token;
  navigator.clipboard.writeText(token).then(() => toast('Token gerado e copiado ✓ — cole no Asaas e depois clique em Salvar aqui.'));
}

async function salvarChaveAsaasAc() {
  const chave = document.getElementById('ac-nova-api-key').value.trim();
  if (!chave) { toast('Cole a chave antes de salvar.'); return; }
  const { error } = await db.rpc('fn_academia_atualizar_asaas', { p_api_key: chave });
  toast(error ? 'Erro: ' + error.message : 'Chave Asaas salva ✓');
  carregarConfigAc();
}

function editarChaveAsaasAc() {
  db.from('academias').select('*').eq('id', MEU_ACADEMIA_ID).single().then(({ data }) => {
    renderIntegracaoAc({ ...data, asaas_api_key: null });
  });
}

async function salvarTokenWebhookAc() {
  const token = document.getElementById('ac-novo-token').value.trim();
  if (!token) { toast('Cole ou gere o token antes de salvar.'); return; }
  if (token.length < 32) { toast('O token precisa ter no mínimo 32 caracteres (exigência do Asaas).'); return; }
  const { error } = await db.rpc('fn_academia_atualizar_asaas', { p_webhook_token: token });
  toast(error ? 'Erro: ' + error.message : 'Token do webhook salvo ✓');
  carregarConfigAc();
}

function editarTokenWebhookAc() {
  db.from('academias').select('*').eq('id', MEU_ACADEMIA_ID).single().then(({ data }) => {
    renderIntegracaoAc({ ...data, asaas_webhook_token: null });
  });
}

/* ---------------- MODALIDADES ---------------- */
function abrirModalidadeAc(id) {
  acModalidadeEditId = id;
  const m = id ? AC_MODALIDADES.find(x => x.id === id) : null;
  document.getElementById('ac-mmd-title').textContent = m ? 'Editar modalidade' : 'Nova modalidade';
  document.getElementById('ac-mmd-nome').value = m?.nome || '';
  document.getElementById('ac-mmd-ativo').checked = m ? m.ativo !== false : true;
  openModal('m-modalidade-ac');
}

async function salvarModalidadeAc() {
  const nome = normalizarNomeProprio(document.getElementById('ac-mmd-nome').value.trim());
  if (!nome) { toast('Informe o nome da modalidade.'); return; }

  const registro = { nome, ativo: document.getElementById('ac-mmd-ativo').checked };
  let error;
  if (acModalidadeEditId) {
    ({ error } = await db.from('modalidades').update(registro).eq('id', acModalidadeEditId));
  } else {
    registro.academia_id = MEU_ACADEMIA_ID;
    ({ error } = await db.from('modalidades').insert(registro));
  }
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-modalidade-ac');
  toast(acModalidadeEditId ? 'Modalidade atualizada ✓' : 'Modalidade cadastrada ✓');
  carregarConfigAc();
}

async function excluirModalidadeAc(id) {
  const m = AC_MODALIDADES.find(x => x.id === id);
  if (!m) return;

  const [{ count: temPlanos }, { count: temMatriculas }] = await Promise.all([
    db.from('planos').select('id', { count: 'exact', head: true }).eq('modalidade_id', id),
    db.from('matriculas_extras').select('id', { count: 'exact', head: true }).eq('modalidade_id', id),
  ]);

  if ((temPlanos || 0) > 0 || (temMatriculas || 0) > 0) {
    if (confirm(`"${m.nome}" já tem ${temPlanos || 0} plano(s) e ${temMatriculas || 0} matrícula(s) vinculados.\n\nPor segurança, o sistema INATIVA em vez de excluir (nada é perdido).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('modalidades').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Modalidade inativada ✓');
      carregarConfigAc();
    }
    return;
  }

  if (!confirm(`Excluir a modalidade "${m.nome}"?`)) return;
  const { error } = await db.from('modalidades').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Modalidade excluída ✓');
  carregarConfigAc();
}

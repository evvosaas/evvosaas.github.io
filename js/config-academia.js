/* ============================================================
   EVVO — MÓDULO CONFIGURAÇÕES (painel da academia)
   Migrado fielmente do HealFit Gestão: planos, controles da
   geração automática. NOVO no Evvo: guia de conexão Asaas
   (API Key + Webhook com token 32+ caracteres) — cada academia
   configura a própria conta.
   ============================================================ */
let AC_PLANOS_CFG = [];
let acPlanoEditId = null;

/* ---------------- CARREGAR ---------------- */
async function carregarConfigAc() {
  const tb = document.getElementById('ac-planos-rows');
  tb.innerHTML = '<tr><td colspan="5" class="carregando">Carregando…</td></tr>';

  const [{ data: planos, error }, { data: cfg }, { data: contagens }, { data: academia }] = await Promise.all([
    db.from('planos').select('*').order('valor'),
    db.from('config').select('*'),
    db.from('alunos').select('plano_id').eq('ativo', true),
    db.from('academias').select('*').eq('id', MEU_ACADEMIA_ID).single(),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="5" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  AC_PLANOS_CFG = planos || [];

  /* ---------- Planos ---------- */
  const qtdPor = {};
  (contagens || []).forEach(a => { qtdPor[a.plano_id] = (qtdPor[a.plano_id] || 0) + 1; });

  tb.innerHTML = AC_PLANOS_CFG.length ? AC_PLANOS_CFG.map(p => `
    <tr>
      <td><b>${esc(p.nome)}</b>${p.ativo === false ? ' <span class="badge b-off">Inativo</span>' : ''}</td>
      <td><b>${brl(p.valor)}</b></td>
      <td>${p.periodicidade_meses === 1 ? 'Mensal' : 'A cada ' + p.periodicidade_meses + ' meses'}</td>
      <td>${qtdPor[p.id] || 0} aluno(s)</td>
      <td><div class="acts">
        <button class="icon-btn" title="Editar" onclick="abrirPlanoAc(${p.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirPlanoAc(${p.id})">🗑</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhum plano cadastrado.</td></tr>';

  /* ---------- Controles da geração ---------- */
  const mapa = {};
  (cfg || []).forEach(c => { mapa[c.chave] = c.valor; });
  document.getElementById('ac-cfg-pausa').checked = mapa['geracao_faturas_pausada'] === 'true';
  document.getElementById('ac-cfg-dias').value = mapa['dias_antes_vencimento_gerar'] || '10';
  const lbl = document.getElementById('ac-cfg-pausa-lbl');
  if (mapa['geracao_faturas_pausada'] === 'true') {
    lbl.textContent = 'Status atual: PAUSADA — o cron diário NÃO emite novas faturas.';
    lbl.style.color = 'var(--late)';
  } else {
    lbl.textContent = 'Status atual: ATIVA — faturas são emitidas automaticamente todos os dias, respeitando a antecedência abaixo.';
    lbl.style.color = 'var(--ok)';
  }

  /* ---------- Integração Asaas ---------- */
  renderIntegracaoAc(academia);
}

/* ---------------- CONTROLES DA GERAÇÃO ---------------- */
async function salvarPausaAc() {
  const pausado = document.getElementById('ac-cfg-pausa').checked;
  if (pausado && !confirm('PAUSAR a geração automática de faturas?\n\nEnquanto pausada, nenhum aluno recebe cobrança nova.')) {
    document.getElementById('ac-cfg-pausa').checked = false;
    return;
  }
  const { error } = await db.from('config')
    .update({ valor: String(pausado), updated_at: new Date().toISOString() })
    .eq('academia_id', MEU_ACADEMIA_ID).eq('chave', 'geracao_faturas_pausada');
  toast(error ? 'Erro: ' + error.message : (pausado ? 'Geração pausada ⏸' : 'Geração reativada ▶'));
  carregarConfigAc();
}

async function salvarDiasAc() {
  const dias = parseInt(document.getElementById('ac-cfg-dias').value) || 10;
  if (dias < 1 || dias > 30) { toast('Use um valor entre 1 e 30 dias.'); return; }
  const { error } = await db.from('config')
    .update({ valor: String(dias), updated_at: new Date().toISOString() })
    .eq('academia_id', MEU_ACADEMIA_ID).eq('chave', 'dias_antes_vencimento_gerar');
  toast(error ? 'Erro: ' + error.message : `Faturas passam a ser geradas ${dias} dia(s) antes do vencimento ✓`);
}

/* ---------------- PLANOS: NOVO / EDITAR ---------------- */
function abrirPlanoAc(id) {
  acPlanoEditId = id;
  const p = id ? AC_PLANOS_CFG.find(x => x.id === id) : null;
  document.getElementById('ac-mpl-title').textContent = p ? 'Editar plano' : 'Novo plano';
  document.getElementById('ac-mpl-nome').value = p?.nome || '';
  document.getElementById('ac-mpl-valor').value = p ? Number(p.valor).toFixed(2) : '';
  document.getElementById('ac-mpl-per').value = p?.periodicidade_meses || 1;
  document.getElementById('ac-mpl-ativo').checked = p ? p.ativo !== false : true;
  openModal('m-plano-ac');
}

async function salvarPlanoAc() {
  const nome = document.getElementById('ac-mpl-nome').value.trim();
  const valor = parseFloat(document.getElementById('ac-mpl-valor').value) || 0;
  if (!nome) { toast('Informe o nome do plano.'); return; }
  if (valor <= 0) { toast('Informe um valor válido.'); return; }

  const registro = {
    nome, valor,
    periodicidade_meses: parseInt(document.getElementById('ac-mpl-per').value) || 1,
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

  const { count } = await db.from('alunos')
    .select('id', { count: 'exact', head: true }).eq('plano_id', id);

  if (count > 0) {
    alert(`O plano "${p.nome}" tem ${count} aluno(s) vinculado(s).\n\nMova os alunos para outro plano antes de excluir — ou apenas INATIVE o plano (✎ → desmarcar "ativo").`);
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
  const { error } = await db.from('academias').update({ asaas_api_key: chave }).eq('id', MEU_ACADEMIA_ID);
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
  const { error } = await db.from('academias').update({ asaas_webhook_token: token }).eq('id', MEU_ACADEMIA_ID);
  toast(error ? 'Erro: ' + error.message : 'Token do webhook salvo ✓');
  carregarConfigAc();
}

function editarTokenWebhookAc() {
  db.from('academias').select('*').eq('id', MEU_ACADEMIA_ID).single().then(({ data }) => {
    renderIntegracaoAc({ ...data, asaas_webhook_token: null });
  });
}

/* ============================================================
   EVVO MASTER — MÓDULO ACADEMIAS
   v1.2 — grava e exibe o e-mail de login da academia no detalhe
   ============================================================ */
let ACADEMIAS = [];
let acadEditId = null;
let acadDetalheId = null;
let acadFiltroStatus = 'todas';

/* ---------------- VISÃO GERAL ---------------- */
async function carregarVisaoGeral() {
  const { data: academias, error } = await db.from('academias').select('*').order('nome');
  if (error) { toast('Erro ao carregar: ' + error.message); return; }
  ACADEMIAS = academias || [];

  const ativas = ACADEMIAS.filter(a => a.status === 'ativa');
  const mrr = ativas.reduce((s, a) => s + Number(a.valor_mensalidade || 0), 0);

  document.getElementById('h-academias-ativas').textContent = ativas.length;
  document.getElementById('h-mrr').textContent = brl(mrr);

  // Alunos somando todas (só conta se tiver pelo menos 1 academia — senão 0)
  let totalAlunos = 0;
  if (ACADEMIAS.length) {
    const { count } = await db.from('alunos').select('id', { count: 'exact', head: true }).eq('ativo', true);
    totalAlunos = count || 0;
  }
  document.getElementById('h-alunos').textContent = totalAlunos;

  const tb = document.getElementById('home-rows');
  const semStatus = ACADEMIAS.filter(a => a.status !== 'ativa');
  if (!semStatus.length) {
    tb.innerHTML = '<tr><td colspan="4" class="vazio">Todas as academias estão ativas. 🎉</td></tr>';
  } else {
    tb.innerHTML = semStatus.map((a, i) => `
      <tr onclick="abrirDetalhe(${a.id})" style="cursor:pointer">
        <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div>
          <div><div class="nm">${esc(a.nome)}</div><div class="loc">${esc(a.cidade_uf || '')}</div></div></div></td>
        <td>${esc(a.plano_evvo)} · ${brl(a.valor_mensalidade)}</td>
        <td>dia ${a.dia_vencimento_evvo}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>`).join('');
  }
}

function statusBadge(s) {
  if (s === 'ativa') return '<span class="badge b-ok">Ativa</span>';
  if (s === 'inativa') return '<span class="badge b-off">Inativa</span>';
  return '<span class="badge b-warn">Configurando</span>';
}

/* ---------------- LISTAGEM ---------------- */
async function carregarAcademias() {
  const tb = document.getElementById('acad-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  const { data, error } = await db.from('academias').select('*').order('nome');
  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  ACADEMIAS = data || [];
  renderAcademias();
}

function filtraAcadStatus(s, el) {
  acadFiltroStatus = s;
  document.querySelectorAll('#v-academias .fchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAcademias();
}

function renderAcademias() {
  const q = (document.getElementById('acad-q')?.value || '').toLowerCase();
  const lista = ACADEMIAS
    .filter(a => (a.nome || '').toLowerCase().includes(q))
    .filter(a => acadFiltroStatus === 'todas' ? true : a.status === acadFiltroStatus);

  document.getElementById('acad-sub').textContent =
    `${ACADEMIAS.filter(a => a.status === 'ativa').length} ativas · ${ACADEMIAS.filter(a => a.status !== 'ativa').length} outras`;

  const tb = document.getElementById('acad-rows');
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma academia encontrada.</td></tr>'; return; }

  tb.innerHTML = lista.map((a, i) => `
    <tr onclick="abrirDetalhe(${a.id})" style="cursor:pointer">
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div>
        <div><div class="nm">${esc(a.nome)}</div><div class="loc">${esc(a.cidade_uf || '')}</div></div></div></td>
      <td>${esc(a.responsavel || '—')}</td>
      <td>${esc(a.plano_evvo)}<div class="loc">${brl(a.valor_mensalidade)}/mês</div></td>
      <td>${a.asaas_api_key ? '<span class="badge b-ok">Conectado</span>' : '<span class="badge b-warn">Sem chave</span>'}</td>
      <td>${statusBadge(a.status)}</td>
      <td><div class="acts"><button class="icon-btn" title="Abrir">→</button></div></td>
    </tr>`).join('');
}

/* ---------------- NOVA / EDITAR (dados básicos) ---------------- */
function abrirAcademia(id) {
  acadEditId = id;
  const a = id ? ACADEMIAS.find(x => x.id === id) : null;
  document.getElementById('ma-title').textContent = a ? 'Editar academia' : 'Nova academia';
  document.getElementById('ma-nome').value = a?.nome || '';
  document.getElementById('ma-cidade').value = a?.cidade_uf || '';
  document.getElementById('ma-cpfcnpj').value = a?.cpf_cnpj || '';
  document.getElementById('ma-resp').value = a?.responsavel || '';
  document.getElementById('ma-zap').value = a?.whatsapp || '';
  document.getElementById('ma-plano').value = a?.plano_evvo || 'Básico';
  document.getElementById('ma-valor').value = a ? Number(a.valor_mensalidade).toFixed(2) : '149.00';
  document.getElementById('ma-dia').value = a?.dia_vencimento_evvo || 5;
  document.getElementById('ma-ambiente').value =
    a?.asaas_base_url === 'https://api.asaas.com/v3' ? 'producao' : 'sandbox';

  // login só aparece na criação (depois vira um processo de convite)
  const blocoLogin = document.getElementById('ma-bloco-login');
  if (a) { blocoLogin.style.display = 'none'; }
  else {
    blocoLogin.style.display = 'block';
    document.getElementById('ma-usuario').value = '';
    document.getElementById('ma-email').value = '';
    document.getElementById('ma-senha').value = '';
  }
  openModal('m-academia');
}

async function salvarAcademia() {
  const nome = document.getElementById('ma-nome').value.trim();
  if (!nome) { toast('Informe o nome da academia.'); return; }

  const registro = {
    nome,
    cidade_uf: document.getElementById('ma-cidade').value.trim() || null,
    cpf_cnpj: document.getElementById('ma-cpfcnpj').value.trim() || null,
    responsavel: document.getElementById('ma-resp').value.trim() || null,
    whatsapp: document.getElementById('ma-zap').value.trim() || null,
    plano_evvo: document.getElementById('ma-plano').value,
    valor_mensalidade: parseFloat(document.getElementById('ma-valor').value) || 0,
    dia_vencimento_evvo: parseInt(document.getElementById('ma-dia').value) || 5,
    asaas_base_url: document.getElementById('ma-ambiente').value === 'producao'
      ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3',
  };

  const btn = document.getElementById('ma-salvar');
  btn.disabled = true;

  if (acadEditId) {
    const { error } = await db.from('academias').update(registro).eq('id', acadEditId);
    btn.disabled = false;
    if (error) { toast('Erro ao salvar: ' + error.message); return; }
    closeModal('m-academia');
    toast('Academia atualizada ✓');
    carregarAcademias();
    return;
  }

  // criação: precisa de login simples + e-mail real + senha (Supabase Auth)
  const usuario = document.getElementById('ma-usuario').value.trim().toLowerCase().replace(/\s+/g, '');
  const email = document.getElementById('ma-email').value.trim();
  const senha = document.getElementById('ma-senha').value;
  if (!usuario || !email || !senha) {
    btn.disabled = false;
    toast('Informe o login simples, o e-mail real e a senha inicial da academia.');
    return;
  }

  registro.status = 'configurando';
  registro.usuario_login = usuario;
  registro.email_login = email;
  const { data: academia, error: e1 } = await db.from('academias').insert(registro).select().single();
  if (e1) {
    btn.disabled = false;
    toast(e1.code === '23505' ? 'Esse login já está em uso — escolha outro nome.' : 'Erro ao criar academia: ' + e1.message);
    return;
  }

  // cria o login da academia via Edge Function (precisa de privilégio admin,
  // por isso não dá para criar auth.users direto do navegador)
  const { data, error: e2 } = await db.functions.invoke('criar-login-academia', {
    body: { email, senha, academia_id: academia.id, nome: registro.nome },
  });
  btn.disabled = false;

  if (e2 || data?.erro) {
    toast('Academia criada, mas o login falhou: ' + (data?.erro || e2.message) + '. Você pode criar o acesso manualmente em Authentication.');
  } else {
    toast('Academia criada com login pronto ✓');
  }
  closeModal('m-academia');
  carregarAcademias();
}

/* ---------------- DETALHE ---------------- */
async function abrirDetalhe(id) {
  acadDetalheId = id;
  const a = ACADEMIAS.find(x => x.id === id) || (await db.from('academias').select('*').eq('id', id).single()).data;
  if (!a) return;

  document.getElementById('det-nome').textContent = a.nome;
  document.getElementById('det-loc').textContent = `${a.cidade_uf || '—'} · responsável: ${a.responsavel || '—'}`;
  document.getElementById('det-cpfcnpj').textContent = a.cpf_cnpj || '—';
  const ehProducao = a.asaas_base_url === 'https://api.asaas.com/v3';
  document.getElementById('det-ambiente').innerHTML = ehProducao
    ? '<span class="badge b-late">⚠ Produção — cobranças reais</span>'
    : '<span class="badge b-off">Sandbox — testes</span>';
  document.getElementById('det-avatar').textContent = ini(a.nome);
  document.getElementById('det-status').innerHTML = statusBadge(a.status);

  document.getElementById('det-whatsapp').textContent = a.whatsapp || '—';
  document.getElementById('det-usuario-login').textContent = a.usuario_login || '—';
  document.getElementById('det-email-login').textContent = a.email_login || '—';
  document.getElementById('det-alunos').textContent = '—';
  document.getElementById('det-criado').textContent = fmt(String(a.created_at).slice(0, 10));

  // contagem de alunos desta academia
  db.from('alunos').select('id', { count: 'exact', head: true }).eq('academia_id', id).eq('ativo', true)
    .then(({ count }) => { document.getElementById('det-alunos').textContent = count ?? '—'; });

  renderChaveAsaas(a);

  document.getElementById('det-plano-valor').textContent = brl(a.valor_mensalidade);
  document.getElementById('det-plano-nome').textContent = a.plano_evvo;
  document.getElementById('det-plano-dia').textContent = a.dia_vencimento_evvo;

  go('detalhe', null);
}

/* ---------------- CHAVE ASAAS (mascarada + editável) ---------------- */
function renderChaveAsaas(a) {
  const box = document.getElementById('det-chave-box');
  const tem = !!a.asaas_api_key;
  const mascarada = tem ? '••••••••' + a.asaas_api_key.slice(-4) : null;

  const logInfo = a.asaas_key_alterada_em
    ? `<div class="loc" style="margin-top:4px">alterada por ${a.asaas_key_alterada_por === 'master' ? 'você' : 'academia'} em ${fmt(String(a.asaas_key_alterada_em).slice(0,10))}</div>`
    : '';

  box.innerHTML = tem ? `
    <div class="chave-box">
      <span id="chave-texto">${mascarada}</span>
      <div class="chave-acts">
        <button class="icon-btn" title="Revelar" onclick="revelarChave(${a.id})">👁</button>
        <button class="icon-btn" title="Editar" onclick="editarChave()">✎</button>
        <button class="icon-btn del" title="Remover" onclick="removerChave(${a.id})">🗑</button>
      </div>
      <div id="chave-revelada-box"></div>
    </div>${logInfo}
  ` : `
    <div class="chave-box">
      <span style="color:var(--muted)">Nenhuma chave cadastrada</span>
      <div class="chave-acts"><button class="icon-btn" title="Adicionar" onclick="editarChave()">+</button></div>
    </div>
  `;
}

async function revelarChave(id) {
  const { data } = await db.from('academias').select('asaas_api_key').eq('id', id).single();
  if (!data?.asaas_api_key) return;
  const alvo = document.getElementById('chave-revelada-box');
  alvo.innerHTML = `<div class="chave-revelada" title="Clique para copiar" onclick="navigator.clipboard.writeText('${data.asaas_api_key}').then(()=>toast('Chave copiada ✓'))">${esc(data.asaas_api_key)}</div>`;
  toast('Chave revelada — clique nela para copiar.');
}

function editarChave() {
  const box = document.getElementById('det-chave-box');
  box.innerHTML = `
    <div class="chave-editando" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input id="nova-chave" placeholder="Cole a API Key do Asaas da academia">
      <button class="btn btn-primary btn-sm" onclick="salvarChave()">Salvar</button>
      <button class="btn btn-ghost btn-sm" onclick="abrirDetalhe(${acadDetalheId})">Cancelar</button>
    </div>
  `;
}

async function salvarChave() {
  const chave = document.getElementById('nova-chave').value.trim();
  if (!chave) { toast('Cole a chave antes de salvar.'); return; }
  const { error } = await db.from('academias').update({ asaas_api_key: chave }).eq('id', acadDetalheId);
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Chave Asaas salva ✓');
  const { data } = await db.from('academias').select('*').eq('id', acadDetalheId).single();
  const idx = ACADEMIAS.findIndex(x => x.id === acadDetalheId);
  if (idx >= 0) ACADEMIAS[idx] = data;
  renderChaveAsaas(data);
}

async function removerChave(id) {
  if (!confirm('Remover a chave Asaas desta academia? Ela para de conseguir gerar cobranças até cadastrar uma nova.')) return;
  const { error } = await db.from('academias').update({ asaas_api_key: null }).eq('id', id);
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Chave removida ✓');
  const { data } = await db.from('academias').select('*').eq('id', id).single();
  const idx = ACADEMIAS.findIndex(x => x.id === id);
  if (idx >= 0) ACADEMIAS[idx] = data;
  renderChaveAsaas(data);
}

/* ---------------- AÇÕES RÁPIDAS DO DETALHE ---------------- */
async function toggleStatusAcademia() {
  const a = ACADEMIAS.find(x => x.id === acadDetalheId);
  if (!a) return;
  const novo = a.status === 'ativa' ? 'inativa' : 'ativa';
  const msg = novo === 'inativa'
    ? 'Inativar esta academia? O acesso dela ao painel será bloqueado.'
    : 'Reativar esta academia?';
  if (!confirm(msg)) return;
  const { error } = await db.from('academias').update({ status: novo }).eq('id', acadDetalheId);
  if (error) { toast('Erro: ' + error.message); return; }
  toast(novo === 'inativa' ? 'Academia inativada ✓' : 'Academia reativada ✓');
  abrirDetalhe(acadDetalheId);
}

async function resetarSenhaAcademia() {
  const email = prompt('Confirme o e-mail de login desta academia para enviar a redefinição de senha:');
  if (!email) return;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://evvosaas.github.io/',
  });
  toast(error ? 'Erro: ' + error.message : 'E-mail de redefinição enviado ✓');
}

/* ---------------- DEFINIR SENHA MANUALMENTE (sem e-mail) ---------------- */
function abrirDefinirSenhaAc() {
  document.getElementById('ds-nova-senha').value = '';
  openModal('m-definir-senha');
}

function gerarSenhaTemporariaAc() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const senha = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  document.getElementById('ds-nova-senha').value = senha;
  navigator.clipboard.writeText(senha).then(() => toast('Senha gerada e copiada ✓'));
}

async function salvarSenhaManualAc() {
  const nova = document.getElementById('ds-nova-senha').value.trim();
  if (!nova || nova.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.'); return; }

  const { data, error } = await db.functions.invoke('admin-definir-senha', {
    body: { academia_id: acadDetalheId, nova_senha: nova },
  });
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Erro: ' + msg);
    return;
  }
  closeModal('m-definir-senha');
  toast('Senha definida ✓ — a academia vai precisar trocá-la no próximo login.');
}

/* ---------------- EXCLUIR ACADEMIA (definitivo) ---------------- */
async function excluirAcademiaCompleta() {
  const a = ACADEMIAS.find(x => x.id === acadDetalheId);
  if (!a) return;

  const digitado = prompt(`Esta ação é IRREVERSÍVEL: apaga a academia "${a.nome}", o login dela, e TODOS os dados (alunos, faturas, financeiro, tudo).\n\nDigite o nome exato da academia para confirmar:`);
  if (digitado !== a.nome) {
    if (digitado !== null) toast('Nome não confere — exclusão cancelada.');
    return;
  }

  toast('Excluindo academia…');
  const { data, error } = await db.functions.invoke('excluir-academia', {
    body: { academia_id: a.id },
  });
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Erro ao excluir: ' + msg);
    return;
  }
  toast(`Academia "${a.nome}" excluída ✓`);
  go('academias', document.querySelectorAll('.nav-item')[1]);
}

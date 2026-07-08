/* ============================================================
   EVVO MASTER — APP: conexão, login, sessão, navegação, helpers
   ============================================================ */
const db = supabase.createClient(EVVO_CONFIG.SUPABASE_URL, EVVO_CONFIG.SUPABASE_ANON);

// Detecta quando alguém chega pelo link de "redefinir senha" (e-mail do
// Supabase). Precisa ser registrado cedo, pois o evento pode disparar
// assim que a página carrega, antes do boot() rodar.
db.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('tela-login').style.display = 'none';
    document.getElementById('app-master').style.display = 'none';
    document.getElementById('app-academia').style.display = 'none';
    openModal('m-redefinir-senha');
  }
});

async function salvarNovaSenhaRecuperacao() {
  const nova = document.getElementById('rs-nova-senha').value;
  if (!nova || nova.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.'); return; }
  const { error } = await db.auth.updateUser({ password: nova });
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Senha atualizada ✓ Faça login com a nova senha.');
  closeModal('m-redefinir-senha');
  await db.auth.signOut();
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('tela-login').style.display = 'flex';
}

/* ---------------- HELPERS GLOBAIS ---------------- */
const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmt = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
const ini = n => String(n || 'EV').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const cores = ['#ff5a2b', '#8a4bd6', '#2b6bd9', '#c73e6b', '#12a150', '#c67c00', '#5f8a1c'];
const corDe = i => cores[i % cores.length];
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let tt;
function toast(msg) {
  document.getElementById('toast-msg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3600);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ---------------- LOGIN / SESSÃO ---------------- */
// Login único: aceita e-mail (contém "@") ou um nome de usuário simples
// (ex: "powerbody"), que é resolvido para o e-mail real via RPC pública
// antes de autenticar. Depois do login, o papel (master/academia) decide
// para qual painel a pessoa vai — mesma URL para todo mundo.
async function fazerLogin() {
  const btn = document.getElementById('lg-btn');
  const erro = document.getElementById('lg-erro');
  erro.style.display = 'none';
  btn.disabled = true; btn.textContent = 'ENTRANDO…';

  const digitado = document.getElementById('lg-email').value.trim();
  const pass = document.getElementById('lg-pass').value;
  if (!digitado || !pass) {
    erro.textContent = 'Preencha usuário/e-mail e senha.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }

  let email = digitado;
  if (!digitado.includes('@')) {
    const { data: emailResolvido, error: eResolve } = await db.rpc('fn_resolver_login', { p_usuario: digitado });
    if (eResolve || !emailResolvido) {
      erro.textContent = 'Usuário não encontrado.'; erro.style.display = 'block';
      btn.disabled = false; btn.textContent = 'ENTRAR'; return;
    }
    email = emailResolvido;
  }

  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) {
    erro.textContent = 'Usuário/e-mail ou senha incorretos.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }

  await resolverEntrada();
}

async function sair() {
  await db.auth.signOut();
  location.reload();
}

async function boot() {
  document.getElementById('lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
  const { data: { session } } = await db.auth.getSession();
  if (session) await resolverEntrada();
}

// Depois de autenticado, decide o painel pelo papel do usuário
async function resolverEntrada() {
  const { data: { user } } = await db.auth.getUser();
  const { data: perfil } = await db.from('perfis')
    .select('role, nome, academia_id, precisa_trocar_senha').eq('id', user.id).maybeSingle();

  if (!perfil) {
    document.getElementById('lg-erro').textContent = 'Usuário sem perfil configurado. Fale com o suporte.';
    document.getElementById('lg-erro').style.display = 'block';
    await db.auth.signOut();
    return;
  }

  if (perfil.role === 'master') { entrarMaster(perfil.nome); return; }

  // Academia: bloqueia o acesso se não estiver ativa (pausada pelo master)
  const { data: academiaCheck } = await db.from('academias')
    .select('status').eq('id', perfil.academia_id).maybeSingle();
  if (academiaCheck?.status !== 'ativa') {
    document.getElementById('tela-login').style.display = 'flex';
    document.getElementById('lg-erro').textContent =
      'Sua academia está temporariamente inativa. Entre em contato com o suporte do Evvo.';
    document.getElementById('lg-erro').style.display = 'block';
    document.getElementById('lg-btn').disabled = false;
    document.getElementById('lg-btn').textContent = 'ENTRAR';
    await db.auth.signOut();
    return;
  }

  entrarAcademia(perfil);
}

function entrarMaster(nome) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app-master').style.display = 'block';
  document.getElementById('user-nome').textContent = nome || 'Master';
  document.getElementById('user-ini').textContent = ini(nome);
  carregarVisaoGeral();
}

let MEU_ACADEMIA_ID = null;

async function entrarAcademia(perfil) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app-academia').style.display = 'block';
  MEU_ACADEMIA_ID = perfil.academia_id;

  const { data: academia } = await db.from('academias').select('nome').eq('id', perfil.academia_id).maybeSingle();
  document.getElementById('ac-nome-academia').textContent = academia?.nome || 'sua academia';
  document.getElementById('ac-nome-sidebar').textContent = academia?.nome || 'Academia';
  document.getElementById('ac-user-ini').textContent = ini(academia?.nome);
  document.getElementById('ac-saudacao-dash').textContent = `Olá, ${academia?.nome || 'tudo bem'}! 👊`;
  document.getElementById('ac-data-hoje').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('ac-saudacao').textContent = `Olá, ${perfil.nome || 'bem-vindo(a)'}!`;

  // Primeiro acesso: bloqueia com modal até trocar a senha
  if (perfil.precisa_trocar_senha) { openModal('m-primeiro-acesso'); }

  carregarDashboardAc();
}

async function trocarSenhaAcademia() {
  const nova = document.getElementById('ac-nova-senha').value;
  if (!nova || nova.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.'); return; }

  const { error: e1 } = await db.auth.updateUser({ password: nova });
  if (e1) { toast('Erro ao trocar senha: ' + e1.message); return; }

  const { error: e2 } = await db.rpc('fn_marcar_senha_trocada');
  if (e2) { toast('Senha trocada, mas houve um erro ao liberar o acesso: ' + e2.message); return; }

  toast('Senha definida ✓');
  document.getElementById('ac-nova-senha').value = '';
  closeModal('m-primeiro-acesso');
}

/* ---------------- NAVEGAÇÃO — PAINEL DA ACADEMIA ---------------- */
function goAc(v, el) {
  document.querySelectorAll('#app-academia .view').forEach(x => x.classList.remove('active'));
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('#app-academia .nav-item').forEach(x => x.classList.remove('active'));
  if (el) el.classList.add('active');

  if (v === 'ac-dashboard') carregarDashboardAc();
  if (v === 'ac-alunos')    carregarAlunosAc();
  if (v === 'ac-personais') carregarPersonaisAc();
  if (v === 'ac-financeiro') carregarFinanceiroAc();
  if (v === 'ac-despesas')   carregarDespesasAc();
  if (v === 'ac-socios')     carregarSociosAc();
  if (v === 'ac-config')     carregarConfigAc();
  if (v === 'ac-relatorios') carregarRelatoriosAc();
  window.scrollTo(0, 0);
}

/* ---------------- NAVEGAÇÃO ---------------- */
function go(v, el) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  if (el) el.classList.add('active');

  if (v === 'home')       carregarVisaoGeral();
  if (v === 'academias')  carregarAcademias();
  if (v === 'receitas')   carregarReceitas();
  window.scrollTo(0, 0);
}

boot();

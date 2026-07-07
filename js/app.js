/* ============================================================
   EVVO MASTER — APP: conexão, login, sessão, navegação, helpers
   ============================================================ */
const db = supabase.createClient(EVVO_CONFIG.SUPABASE_URL, EVVO_CONFIG.SUPABASE_ANON);

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
async function fazerLogin() {
  const btn = document.getElementById('lg-btn');
  const erro = document.getElementById('lg-erro');
  erro.style.display = 'none';
  btn.disabled = true; btn.textContent = 'ENTRANDO…';

  const email = document.getElementById('lg-email').value.trim();
  const pass = document.getElementById('lg-pass').value;
  if (!email || !pass) {
    erro.textContent = 'Preencha e-mail e senha.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) {
    erro.textContent = 'E-mail ou senha incorretos.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR'; return;
  }

  // Confirma que é MASTER antes de deixar entrar (uma academia não deveria
  // conseguir logar aqui, mas essa é a segunda trava, depois da RLS)
  const { data: { user } } = await db.auth.getUser();
  const { data: perfil } = await db.from('perfis').select('role, nome').eq('id', user.id).maybeSingle();
  if (!perfil || perfil.role !== 'master') {
    erro.textContent = 'Este acesso é restrito ao administrador do Evvo.'; erro.style.display = 'block';
    btn.disabled = false; btn.textContent = 'ENTRAR';
    await db.auth.signOut();
    return;
  }

  entrar(perfil.nome);
}

async function sair() {
  await db.auth.signOut();
  location.reload();
}

async function boot() {
  document.getElementById('lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    const { data: perfil } = await db.from('perfis').select('role, nome').eq('id', session.user.id).maybeSingle();
    if (perfil && perfil.role === 'master') { entrar(perfil.nome); return; }
    await db.auth.signOut();
  }
}

function entrar(nome) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  document.getElementById('user-nome').textContent = nome || 'Master';
  document.getElementById('user-ini').textContent = ini(nome);

  carregarVisaoGeral();
}

/* ---------------- NAVEGAÇÃO ---------------- */
function go(v, el) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('v-' + v).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  if (el) el.classList.add('active');

  if (v === 'home')       carregarVisaoGeral();
  if (v === 'academias')  carregarAcademias();
  window.scrollTo(0, 0);
}

boot();

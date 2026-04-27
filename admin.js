// ============================================================
// ADMIN.JS — AGUIAS DE CRISTO | Pizza Camp
// ============================================================

const SUPABASE_URL = 'https://ukuapolecardpsrmqxum.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ── Formatação monetária BR (1.999,99) ──────────────────────
function brl(value) {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let chartDash = null;
let chartRel  = null;
let todosOsPedidos = [];

// ─────────────────────────────────────────
// 1. LOGIN — display puro, sem Tailwind
// ─────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass  = document.getElementById('adminPass').value.trim();
    const errEl = document.getElementById('loginError');

    if (pass === 'sempreavante') {
        document.getElementById('loginOverlay').style.display  = 'none';
        document.getElementById('mainDashboard').style.opacity = '1';
        init();
    } else {
        errEl.style.display = 'block';
        setTimeout(() => { errEl.style.display = 'none'; }, 3000);
    }
});

// ─────────────────────────────────────────
// 2. INICIALIZAÇÃO
// ─────────────────────────────────────────
async function init() {
    showSection('dash');
    await carregarDados();
    iniciarRealtime();
}

// ─────────────────────────────────────────
// 3. DADOS CENTRAL
// ─────────────────────────────────────────
async function carregarDados() {
    try {
        const [resPedidos, resPizzas] = await Promise.all([
            _supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
            _supabase.from('pizzas').select('*').order('name', { ascending: true })
        ]);
        todosOsPedidos = resPedidos.data || [];
        const pizzas   = resPizzas.data  || [];

        renderizarKPIs(todosOsPedidos);
        renderizarGraficoDash(todosOsPedidos);
        renderizarRanking(todosOsPedidos);
        renderizarPedidos(todosOsPedidos);
        renderizarInventario(pizzas);
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
}

// ─────────────────────────────────────────
// 4. KPIs DASHBOARD
// ─────────────────────────────────────────
function renderizarKPIs(pedidos) {
    const receita   = pedidos.reduce((a, p) => a + Number(p.total || 0), 0);
    const pagos     = pedidos.filter(p => p.status === 'Pago').length;
    const pendentes = pedidos.filter(p => p.status !== 'Pago').length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('receitaBruta', brl(receita));
    set('totalPedidos',   pedidos.length);
    set('totalPendentes', pendentes);
    set('totalPagos',     pagos);
}

// ─────────────────────────────────────────
// 5. GRÁFICO DONUT — DASHBOARD
// ─────────────────────────────────────────
function renderizarGraficoDash(pedidos) {
    const ctx = document.getElementById('chartFlavors');
    if (!ctx) return;
    const contagem = contarSabores(pedidos);
    if (chartDash) chartDash.destroy();
    const labels = Object.keys(contagem);
    if (!labels.length) return;
    const cores = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
    chartDash = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: Object.values(contagem), backgroundColor: cores.slice(0, labels.length), borderWidth: 0, hoverOffset: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11, weight: '700' } } } }
        }
    });
}

// ─────────────────────────────────────────
// 6. RANKING — últimos 5
// ─────────────────────────────────────────
function renderizarRanking(pedidos) {
    const el = document.getElementById('rankingTableBody');
    if (!el) return;
    if (!pedidos.length) { el.innerHTML = `<p style="text-align:center;color:#4b5563;font-size:13px;padding:1rem">Nenhum pedido ainda.</p>`; return; }
    el.innerHTML = pedidos.slice(0, 5).map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .5rem;border-bottom:1px solid rgba(255,255,255,.05)">
            <div style="flex:1;min-width:0">
                <p style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.cliente_nome || '—'}</p>
                <p style="font-size:10px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.itens || ''}</p>
            </div>
            <div style="text-align:right;margin-left:.75rem;flex-shrink:0">
                <p style="font-weight:800;font-size:13px;color:#34d399">${brl(p.total||0)}</p>
                <span class="badge ${p.status==='Pago'?'badge-pago':'badge-pendente'}">${(p.status||'Pendente').toUpperCase()}</span>
            </div>
        </div>`).join('');
}

// ─────────────────────────────────────────
// 7. LISTA DE PEDIDOS
// ─────────────────────────────────────────
function renderizarPedidos(pedidos) {
    const el = document.getElementById('ordersTableBody');
    if (!el) return;
    if (!pedidos.length) { el.innerHTML = `<p style="text-align:center;color:#4b5563;font-size:13px;padding:2rem">Nenhum pedido registrado ainda.</p>`; return; }
    el.innerHTML = pedidos.map(p => {
        const dt = p.created_at ? new Date(p.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
        return `
        <div class="item-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
                <span style="font-size:11px;font-weight:800;color:#3b82f6">#${String(p.id).slice(-5)}</span>
                <div style="display:flex;align-items:center;gap:.5rem">
                    <span class="badge ${p.status==='Pago'?'badge-pago':'badge-pendente'}">${(p.status||'Pendente').toUpperCase()}</span>
                    <span style="font-weight:900;color:#34d399;font-size:14px">${brl(p.total||0)}</span>
                </div>
            </div>
            <p style="font-weight:700;font-size:14px">${p.cliente_nome || '—'}</p>
            <p style="font-size:11px;color:#6b7280;margin-bottom:.25rem">${p.cliente_tel || ''}&nbsp;·&nbsp;${dt}</p>
            <p style="font-size:11px;color:#9ca3af;margin-bottom:.75rem;line-height:1.4">${p.itens || '—'}</p>
            ${p.status !== 'Pago'
                ? `<button onclick="marcarComoPago(${p.id})"
                          style="width:100%;padding:10px;border-radius:10px;background:#059669;color:white;font-weight:800;font-size:12px;border:none;cursor:pointer;letter-spacing:.04em;font-family:inherit"
                          onmouseover="this.style.background='#10b981'" onmouseout="this.style.background='#059669'">
                       ✓ CONFIRMAR PAGAMENTO
                   </button>`
                : `<div style="text-align:center;font-size:11px;color:#34d399;font-weight:700;padding:6px 0"><i class="fas fa-check-double"></i> Pagamento confirmado</div>`
            }
        </div>`;
    }).join('');
}

async function marcarComoPago(id) {
    const { error } = await _supabase.from('pedidos').update({ status: 'Pago' }).eq('id', id);
    if (!error) await carregarDados();
}

// ─────────────────────────────────────────
// 8. INVENTÁRIO
// ─────────────────────────────────────────
function renderizarInventario(pizzas) {
    const el = document.getElementById('inventoryList');
    if (!el) return;
    if (!pizzas.length) { el.innerHTML = `<p style="text-align:center;color:#4b5563;font-size:13px;padding:2rem">Nenhum produto cadastrado.</p>`; return; }
    el.innerHTML = pizzas.map(p => `
        <div class="item-card" style="display:flex;align-items:center;gap:.875rem">
            <img src="${p.image_url || 'https://placehold.co/64x64/1e3a5f/white?text=🍕'}"
                 onerror="this.src='https://placehold.co/64x64/1e3a5f/white?text=?'"
                 style="width:56px;height:56px;border-radius:.75rem;object-fit:cover;flex-shrink:0">
            <div style="flex:1;min-width:0">
                <p style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</p>
                <p style="font-size:12px;color:#3b82f6;font-weight:700;margin:.1rem 0">
                    Venda: ${brl(Number(p.price))}
                    ${p.cost ? `<span style="color:#6b7280;font-weight:500;margin-left:.5rem">· Custo: ${brl(Number(p.cost))}</span>` : ''}
                </p>
                <div style="display:flex;align-items:center;gap:.5rem;margin-top:.35rem">
                    <button onclick="alterarEstoque('${p.id}',-1)" style="width:28px;height:28px;border-radius:8px;background:rgba(239,68,68,.15);color:#f87171;border:none;font-size:16px;cursor:pointer;font-weight:900;display:flex;align-items:center;justify-content:center">−</button>
                    <span style="font-weight:900;font-size:15px;min-width:28px;text-align:center;color:${(p.estoque||0)<=0?'#ef4444':'#34d399'}">${p.estoque || 0}</span>
                    <button onclick="alterarEstoque('${p.id}',1)"  style="width:28px;height:28px;border-radius:8px;background:rgba(16,185,129,.15);color:#34d399;border:none;font-size:16px;cursor:pointer;font-weight:900;display:flex;align-items:center;justify-content:center">+</button>
                    <span style="font-size:10px;color:#6b7280;margin-left:.25rem">unid.</span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:.5rem;flex-shrink:0">
                <button onclick="prepararEdicao('${p.id}',\`${p.name}\`,${p.price},${p.cost||0},\`${p.image_url||''}\`)"
                        style="width:36px;height:36px;border-radius:10px;background:rgba(59,130,246,.12);color:#60a5fa;border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deletarPizza('${p.id}')"
                        style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,.12);color:#f87171;border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`).join('');
}

async function alterarEstoque(id, delta) {
    const { data: p } = await _supabase.from('pizzas').select('estoque').eq('id', id).single();
    await _supabase.from('pizzas').update({ estoque: Math.max(0, (p.estoque||0) + delta) }).eq('id', id);
    await carregarDados();
}

async function deletarPizza(id) {
    if (confirm('Remover este sabor do cardápio?')) {
        await _supabase.from('pizzas').delete().eq('id', id);
        await carregarDados();
    }
}

// ─────────────────────────────────────────
// 9. MODAL PIZZA
// ─────────────────────────────────────────
function abrirModal()  { document.getElementById('modalPizza').style.display = 'flex'; }
function fecharModal() {
    delete document.getElementById('modalPizza').dataset.editId;
    ['pName','pPrice','pCost','pImageUrl'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('pizzaModalTitle').innerText = 'Novo Sabor';
    document.getElementById('modalPizza').style.display  = 'none';
}
function prepararEdicao(id, nome, preco, custo, imageUrl) {
    document.getElementById('pName').value     = nome;
    document.getElementById('pPrice').value    = preco;
    document.getElementById('pCost').value     = custo || '';
    document.getElementById('pImageUrl').value = imageUrl || '';
    document.getElementById('pizzaModalTitle').innerText     = 'Editar Sabor';
    document.getElementById('modalPizza').dataset.editId = id;
    abrirModal();
}
async function salvarPizza() {
    const name     = document.getElementById('pName').value.trim();
    const price    = document.getElementById('pPrice').value;
    const cost     = document.getElementById('pCost').value;
    const imageUrl = document.getElementById('pImageUrl').value.trim();
    const id       = document.getElementById('modalPizza').dataset.editId;
    if (!name || !price) { alert('Preencha Nome e Preço!'); return; }
    const payload  = { name, price: parseFloat(price), cost: cost ? parseFloat(cost) : null, image_url: imageUrl || null };
    const { error } = id
        ? await _supabase.from('pizzas').update(payload).eq('id', id)
        : await _supabase.from('pizzas').insert([{ ...payload, estoque: 0 }]);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    fecharModal();
    await carregarDados();
}

// ─────────────────────────────────────────
// 10. RELATÓRIOS
// ─────────────────────────────────────────
function onPeriodoChange() {
    const v      = document.getElementById('filtro-periodo').value;
    const custom = document.getElementById('filtro-datas-custom');
    custom.style.display = v === 'personalizado' ? 'flex' : 'none';
}

function calcularIntervalo(periodo) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const fim  = new Date(); fim.setHours(23,59,59,999);

    if (periodo === 'hoje')          return { inicio: new Date(hoje), fim };
    if (periodo === 'ontem') {
        const ini = new Date(hoje); ini.setDate(ini.getDate() - 1);
        const f   = new Date(ini);  f.setHours(23,59,59,999);
        return { inicio: ini, fim: f };
    }
    if (periodo === 'semana') {
        const ini = new Date(hoje); ini.setDate(ini.getDate() - ini.getDay());
        return { inicio: ini, fim };
    }
    if (periodo === 'semana_passada') {
        const ini = new Date(hoje); ini.setDate(ini.getDate() - ini.getDay() - 7);
        const f   = new Date(ini);  f.setDate(f.getDate() + 6); f.setHours(23,59,59,999);
        return { inicio: ini, fim: f };
    }
    if (periodo === 'mes') {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        return { inicio: ini, fim };
    }
    if (periodo === 'mes_passado') {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const f   = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23,59,59,999);
        return { inicio: ini, fim: f };
    }
    if (periodo === 'personalizado') {
        const vs = document.getElementById('filtro-inicio').value;
        const ve = document.getElementById('filtro-fim').value;
        if (!vs || !ve) { alert('Selecione as duas datas.'); return null; }
        return { inicio: new Date(vs + 'T00:00:00'), fim: new Date(ve + 'T23:59:59') };
    }
    return { inicio: new Date(hoje), fim };
}

function labelPeriodo(periodo, inicio, fim) {
    const fmt = d => d.toLocaleDateString('pt-BR');
    const mapa = { hoje:'Hoje', ontem:'Ontem', semana:'Esta semana', semana_passada:'Semana passada', mes:'Este mês', mes_passado:'Mês passado' };
    return mapa[periodo] || `${fmt(inicio)} — ${fmt(fim)}`;
}

function contarSabores(pedidos) {
    const c = {};
    pedidos.forEach(p => {
        if (!p.itens) return;
        p.itens.split(',').forEach(parte => {
            const m   = parte.trim().match(/^(\d+)x\s*(.+)/i);
            const qtd = m ? parseInt(m[1]) : 1;
            const s   = m ? m[2].trim() : parte.trim();
            if (s) c[s] = (c[s] || 0) + qtd;
        });
    });
    return c;
}

function show(id, val) { const el = document.getElementById(id); if (el) el.style.display = val ? '' : 'none'; }

async function gerarRelatorio() {
    const periodo   = document.getElementById('filtro-periodo').value;
    const statusFil = document.getElementById('filtro-status').value;
    const intervalo = calcularIntervalo(periodo);
    if (!intervalo) return;

    const filtrados = todosOsPedidos.filter(p => {
        const dt = new Date(p.created_at);
        const statusOk = statusFil === 'todos' || p.status === statusFil;
        return dt >= intervalo.inicio && dt <= intervalo.fim && statusOk;
    });

    // Esconde tudo primeiro
    ['rel-kpis','rel-chart-wrap','rel-sabores-wrap','rel-pedidos-wrap'].forEach(id => show(id, false));
    show('rel-vazio', false);

    if (!filtrados.length) { show('rel-vazio', true); return; }

    ['rel-kpis','rel-chart-wrap','rel-sabores-wrap','rel-pedidos-wrap'].forEach(id => show(id, true));

    // ── KPIs ──
    const receita = filtrados.reduce((a,p) => a + Number(p.total||0), 0);
    const qtd     = filtrados.length;
    const ticket  = qtd > 0 ? receita / qtd : 0;
    const sabores = contarSabores(filtrados);
    const totalPizzas = Object.values(sabores).reduce((a,v) => a+v, 0);

    document.getElementById('rel-receita').innerText      = brl(receita);
    document.getElementById('rel-qtd').innerText          = qtd;
    document.getElementById('rel-ticket').innerText       = brl(ticket);
    document.getElementById('rel-pizzas').innerText       = totalPizzas;
    document.getElementById('rel-periodo-label').innerText = labelPeriodo(periodo, intervalo.inicio, intervalo.fim);

    // ── GRÁFICO DE BARRAS POR DIA ──
    const porDia = {};
    filtrados.forEach(p => {
        const dia = new Date(p.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
        porDia[dia] = (porDia[dia] || 0) + Number(p.total||0);
    });
    const diasLabels = Object.keys(porDia);
    const diasValues = diasLabels.map(d => porDia[d]);

    if (chartRel) chartRel.destroy();
    chartRel = new Chart(document.getElementById('chartRelatorio'), {
        type: 'bar',
        data: { labels: diasLabels, datasets: [{ label: 'Receita', data: diasValues, backgroundColor: 'rgba(59,130,246,.55)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
                y: { ticks: { color: '#9ca3af', font: { size: 10 }, callback: v => 'R$ '+v.toFixed(0) }, grid: { color: 'rgba(255,255,255,.06)' } }
            }
        }
    });

    // ── RANKING SABORES ──
    const saboresOrdenados = Object.entries(sabores).sort((a,b) => b[1]-a[1]);
    document.getElementById('rel-sabores-body').innerHTML = saboresOrdenados.map(([s,q]) => `
        <tr>
            <td style="font-weight:700">${s}</td>
            <td style="color:#34d399;font-weight:800">${q}</td>
            <td style="color:#9ca3af">${totalPizzas > 0 ? ((q/totalPizzas)*100).toFixed(1)+'%' : '—'}</td>
        </tr>`).join('');

    // ── LISTA DE PEDIDOS ──
    document.getElementById('rel-pedidos-body').innerHTML = filtrados.map(p => {
        const dt = p.created_at
            ? new Date(p.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
            : '—';
        return `
        <tr>
            <td style="color:#3b82f6;font-weight:800">#${String(p.id).slice(-5)}</td>
            <td style="color:#9ca3af;white-space:nowrap">${dt}</td>
            <td style="font-weight:600;white-space:nowrap">${p.cliente_nome||'—'}</td>
            <td style="color:#9ca3af;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.itens||'—'}</td>
            <td style="color:#34d399;font-weight:800;white-space:nowrap">${brl(p.total||0)}</td>
            <td><span class="badge ${p.status==='Pago'?'badge-pago':'badge-pendente'}">${(p.status||'Pendente').toUpperCase()}</span></td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────
// 11. NAVEGAÇÃO
// ─────────────────────────────────────────
const SECTIONS = ['dash','relatorio','orders','inventory'];

function showSection(id) {
    SECTIONS.forEach(s => {
        document.getElementById(`sec-${s}`)?.classList.remove('active');
        document.getElementById(`btn-${s}`)?.classList.remove('active');
        document.getElementById(`bnav-${s}`)?.classList.remove('active');
    });
    document.getElementById(`sec-${id}`)?.classList.add('active');
    document.getElementById(`btn-${id}`)?.classList.add('active');
    document.getElementById(`bnav-${id}`)?.classList.add('active');
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
}

// ─────────────────────────────────────────
// 12. REALTIME
// ─────────────────────────────────────────
function iniciarRealtime() {
    _supabase.channel('realtime-admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async (payload) => {
            if (payload.eventType === 'INSERT') playNotificationSound();
            await carregarDados();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pizzas' }, async () => {
            await carregarDados();
        })
        .subscribe();
}

function playNotificationSound() {
    try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e) {}
}

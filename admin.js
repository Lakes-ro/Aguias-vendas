// ============================================================
// ADMIN.JS — AGUIAS DE CRISTO | Pizza Camp
// ============================================================

const SUPABASE_URL = 'https://ukuapolecardpsrmqxum.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let chartInstance = null;

// ============================================================
// 1. LOGIN
// ============================================================
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('adminPass').value;
    if (pass === 'sempreavante') {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('mainDashboard').style.opacity = '1';
        init();
    } else {
        const err = document.getElementById('loginError');
        err.classList.remove('hidden');
        setTimeout(() => err.classList.add('hidden'), 3000);
    }
});

// ============================================================
// 2. INICIALIZAÇÃO
// ============================================================
async function init() {
    showSection('dash');
    await carregarDados();
    iniciarRealtime();
}

// ============================================================
// 3. DADOS CENTRAL
// ============================================================
async function carregarDados() {
    try {
        const [resPedidos, resPizzas] = await Promise.all([
            _supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
            _supabase.from('pizzas').select('*').order('name', { ascending: true })
        ]);
        const pedidos = resPedidos.data || [];
        const pizzas  = resPizzas.data  || [];

        renderizarKPIs(pedidos);
        renderizarGrafico(pedidos);
        renderizarRanking(pedidos);
        renderizarPedidos(pedidos);
        renderizarInventario(pizzas);
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
}

// ============================================================
// 4. KPIs
// ============================================================
function renderizarKPIs(pedidos) {
    const receita   = pedidos.reduce((a, p) => a + Number(p.total || 0), 0);
    const pagos     = pedidos.filter(p => p.status === 'Pago').length;
    const pendentes = pedidos.filter(p => p.status !== 'Pago').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    set('receitaBruta',   `R$ ${receita.toFixed(2)}`);
    set('totalPedidos',   pedidos.length);
    set('totalPendentes', pendentes);
    set('totalPagos',     pagos);
}

// ============================================================
// 5. GRÁFICO
// ============================================================
function renderizarGrafico(pedidos) {
    const ctx = document.getElementById('chartFlavors');
    if (!ctx) return;

    const contagem = {};
    pedidos.forEach(p => {
        if (!p.itens) return;
        p.itens.split(',').forEach(parte => {
            const sabor = parte.trim().replace(/^\d+x\s*/i, '').trim();
            if (sabor) contagem[sabor] = (contagem[sabor] || 0) + 1;
        });
    });

    if (chartInstance) chartInstance.destroy();

    const labels  = Object.keys(contagem);
    const valores  = Object.values(contagem);
    const cores    = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

    if (labels.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 12,
                        font: { size: 11, weight: '700' }
                    }
                }
            }
        }
    });
}

// ============================================================
// 6. RANKING (últimos 5 — dashboard)
// ============================================================
function renderizarRanking(pedidos) {
    const container = document.getElementById('rankingTableBody');
    if (!container) return;

    const top = pedidos.slice(0, 5);

    if (top.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-600 text-sm py-4">Nenhum pedido ainda.</p>`;
        return;
    }

    container.innerHTML = top.map(p => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:.6rem .5rem; border-bottom:1px solid rgba(255,255,255,0.05)">
            <div style="flex:1; min-width:0">
                <p style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${p.cliente_nome || '—'}</p>
                <p style="font-size:10px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${p.itens || ''}</p>
            </div>
            <div style="text-align:right; margin-left:.75rem; flex-shrink:0">
                <p style="font-weight:800; font-size:13px; color:#34d399">R$ ${Number(p.total||0).toFixed(2)}</p>
                <span class="badge ${p.status === 'Pago' ? 'badge-pago' : 'badge-pendente'}">${(p.status||'Pendente').toUpperCase()}</span>
            </div>
        </div>
    `).join('');
}

// ============================================================
// 7. LISTA COMPLETA DE PEDIDOS — cards mobile-first
// ============================================================
function renderizarPedidos(pedidos) {
    const container = document.getElementById('ordersTableBody');
    if (!container) return;

    if (pedidos.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-600 text-sm py-8">Nenhum pedido registrado ainda.</p>`;
        return;
    }

    container.innerHTML = pedidos.map(p => `
        <div class="item-card">
            <!-- Linha 1: ID + Status + Total -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:.5rem">
                <span style="font-size:11px; font-weight:800; color:#3b82f6">#${String(p.id).slice(-5)}</span>
                <div style="display:flex; align-items:center; gap:.5rem">
                    <span class="badge ${p.status === 'Pago' ? 'badge-pago' : 'badge-pendente'}">${(p.status||'Pendente').toUpperCase()}</span>
                    <span style="font-weight:900; color:#34d399; font-size:14px">R$ ${Number(p.total||0).toFixed(2)}</span>
                </div>
            </div>
            <!-- Linha 2: Cliente -->
            <div style="margin-bottom:.35rem">
                <p style="font-weight:700; font-size:14px">${p.cliente_nome || '—'}</p>
                <p style="font-size:11px; color:#6b7280">${p.cliente_tel || ''}</p>
            </div>
            <!-- Linha 3: Itens -->
            <p style="font-size:11px; color:#9ca3af; margin-bottom:.75rem; line-height:1.4">${p.itens || '—'}</p>
            <!-- Botão -->
            ${p.status !== 'Pago' ? `
                <button onclick="marcarComoPago(${p.id})"
                        style="width:100%; padding:10px; border-radius:10px; background:#059669; color:white; font-weight:800; font-size:12px; border:none; cursor:pointer; transition:background .2s; letter-spacing:.04em"
                        onmouseover="this.style.background='#10b981'" onmouseout="this.style.background='#059669'">
                    ✓ CONFIRMAR PAGAMENTO
                </button>
            ` : `
                <div style="text-align:center; font-size:11px; color:#34d399; font-weight:700; padding:6px 0">
                    <i class="fas fa-check-double"></i> Pagamento confirmado
                </div>
            `}
        </div>
    `).join('');
}

async function marcarComoPago(id) {
    const { error } = await _supabase.from('pedidos').update({ status: 'Pago' }).eq('id', id);
    if (!error) await carregarDados();
}

// ============================================================
// 8. INVENTÁRIO — cards mobile-first
// ============================================================
function renderizarInventario(pizzas) {
    const container = document.getElementById('inventoryList');
    if (!container) return;

    if (pizzas.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-600 text-sm py-8">Nenhum produto cadastrado.</p>`;
        return;
    }

    container.innerHTML = pizzas.map(p => `
        <div class="item-card" style="display:flex; align-items:center; gap:.875rem">
            <!-- Foto -->
            <img src="${p.image_url || 'https://placehold.co/64x64/1e3a5f/white?text=🍕'}"
                 onerror="this.src='https://placehold.co/64x64/1e3a5f/white?text=?'"
                 style="width:56px; height:56px; border-radius:.75rem; object-fit:cover; flex-shrink:0">

            <!-- Info -->
            <div style="flex:1; min-width:0">
                <p style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${p.name}</p>
                <p style="font-size:12px; color:#3b82f6; font-weight:700; margin:.1rem 0">R$ ${Number(p.price).toFixed(2)}</p>
                <!-- Controle de estoque -->
                <div style="display:flex; align-items:center; gap:.5rem; margin-top:.35rem">
                    <button onclick="alterarEstoque('${p.id}', -1)"
                            style="width:28px; height:28px; border-radius:8px; background:rgba(239,68,68,0.15); color:#f87171; border:none; font-size:16px; cursor:pointer; font-weight:900; display:flex; align-items:center; justify-content:center">−</button>
                    <span style="font-weight:900; font-size:15px; min-width:28px; text-align:center; color:${(p.estoque||0) <= 0 ? '#ef4444' : '#34d399'}">${p.estoque || 0}</span>
                    <button onclick="alterarEstoque('${p.id}', 1)"
                            style="width:28px; height:28px; border-radius:8px; background:rgba(16,185,129,0.15); color:#34d399; border:none; font-size:16px; cursor:pointer; font-weight:900; display:flex; align-items:center; justify-content:center">+</button>
                    <span style="font-size:10px; color:#6b7280; margin-left:.25rem">unid.</span>
                </div>
            </div>

            <!-- Ações -->
            <div style="display:flex; flex-direction:column; gap:.5rem; flex-shrink:0">
                <button onclick="prepararEdicao('${p.id}', \`${p.name}\`, ${p.price}, \`${p.image_url || ''}\`)"
                        style="width:36px; height:36px; border-radius:10px; background:rgba(59,130,246,0.12); color:#60a5fa; border:none; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deletarPizza('${p.id}')"
                        style="width:36px; height:36px; border-radius:10px; background:rgba(239,68,68,0.12); color:#f87171; border:none; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function alterarEstoque(id, delta) {
    const { data: p } = await _supabase.from('pizzas').select('estoque').eq('id', id).single();
    const novoEstoque = Math.max(0, (p.estoque || 0) + delta);
    await _supabase.from('pizzas').update({ estoque: novoEstoque }).eq('id', id);
    await carregarDados();
}

async function deletarPizza(id) {
    if (confirm('Remover este sabor do cardápio?')) {
        await _supabase.from('pizzas').delete().eq('id', id);
        await carregarDados();
    }
}

// ============================================================
// 9. MODAL
// ============================================================
function abrirModal() {
    document.getElementById('modalPizza').style.display = 'flex';
}
function fecharModal() {
    delete document.getElementById('modalPizza').dataset.editId;
    ['pName','pPrice','pImageUrl'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('pizzaModalTitle').innerText = 'Novo Sabor';
    document.getElementById('modalPizza').style.display = 'none';
}
function prepararEdicao(id, nome, preco, imageUrl) {
    document.getElementById('pName').value     = nome;
    document.getElementById('pPrice').value    = preco;
    document.getElementById('pImageUrl').value = imageUrl || '';
    document.getElementById('pizzaModalTitle').innerText = 'Editar Sabor';
    document.getElementById('modalPizza').dataset.editId = id;
    abrirModal();
}
async function salvarPizza() {
    const name     = document.getElementById('pName').value.trim();
    const price    = document.getElementById('pPrice').value;
    const imageUrl = document.getElementById('pImageUrl').value.trim();
    const id       = document.getElementById('modalPizza').dataset.editId;

    if (!name || !price) { alert('Preencha Nome e Preço!'); return; }

    const payload = { name, price: parseFloat(price), image_url: imageUrl || null };

    const { error } = id
        ? await _supabase.from('pizzas').update(payload).eq('id', id)
        : await _supabase.from('pizzas').insert([{ ...payload, estoque: 0 }]);

    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    fecharModal();
    await carregarDados();
}

// ============================================================
// 10. NAVEGAÇÃO — sincroniza sidebar desktop e bottom nav
// ============================================================
function showSection(id) {
    ['dash','orders','inventory'].forEach(s => {
        document.getElementById(`sec-${s}`)?.classList.remove('active');
        // sidebar desktop
        document.getElementById(`btn-${s}`)?.classList.remove('active');
        // bottom nav
        document.getElementById(`bnav-${s}`)?.classList.remove('active');
    });

    document.getElementById(`sec-${id}`)?.classList.add('active');
    document.getElementById(`btn-${id}`)?.classList.add('active');
    document.getElementById(`bnav-${id}`)?.classList.add('active');

    // Scroll para o topo ao trocar de aba no mobile
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
}

// ============================================================
// 11. REALTIME
// ============================================================
function iniciarRealtime() {
    _supabase
        .channel('realtime-admin')
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
    try {
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play();
    } catch(e) { /* ignora */ }
}
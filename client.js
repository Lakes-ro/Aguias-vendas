// ================================================================
// CLIENT.JS — AGUIAS DE CRISTO | Pizza Camp
// Service Worker e atualização → gerenciados por pwa-update.js
// ================================================================

const supabaseUrl = 'https://ukuapolecardpsrmqxum.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let cart          = [];
let estoqueMap    = {};
let _arquivoComprovante = null; // guarda o File selecionado com segurança
let formaPagamento = 'pix';

// ── Formatação monetária BR ──────────────────────────────────
function brl(v) {
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


// ── Formata ID do pedido: 42 → "AC-0042" ───────────────────
function pedidoCodigo(id) {
    return 'AC-' + String(id).padStart(4, '0');
}

// ── Copia texto para a área de transferência ────────────────
function copiarTexto(texto, btnId) {
    navigator.clipboard.writeText(texto).then(() => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const original = btn.innerHTML;
        btn.innerHTML  = '✅ Copiado!';
        btn.style.background = 'rgba(16,185,129,.2)';
        btn.style.color      = '#34d399';
        setTimeout(() => {
            btn.innerHTML  = original;
            btn.style.background = '';
            btn.style.color      = '';
        }, 2000);
    }).catch(() => {
        alert('Código do pedido: ' + texto);
    });
}

// ── Forma de pagamento ───────────────────────────────────────
function selecionarPagamento(tipo) {
    formaPagamento = tipo;
    const map = { pix: ['btn-pix', 'detalhe-pix'], cartao: ['btn-cartao', 'detalhe-cartao'] };
    ['pix', 'cartao'].forEach(t => {
        const [btnId, detId] = map[t];
        document.getElementById(btnId)?.classList.toggle('selected', t === tipo);
        const det = document.getElementById(detId);
        if (det) det.style.display = t === tipo ? '' : 'none';
    });
}

// ============================================================
// BANNER PWA
// ============================================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isInstalado() && !jaDispensou())
        setTimeout(() => mostrarBanner('pwa-banner'), 3000);
});
window.addEventListener('appinstalled', () => { esconderBanner('pwa-banner'); deferredPrompt = null; });

const isIos        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function isInstalado() { return isStandalone; }
function jaDispensou() {
    const ts = localStorage.getItem('pwa_dismissed');
    return ts && (Date.now() - parseInt(ts)) < 7 * 24 * 60 * 60 * 1000;
}
function mostrarBanner(id)  { document.getElementById(id)?.classList.add('visible'); }
function esconderBanner(id) { document.getElementById(id)?.classList.remove('visible'); }
function instalarApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; esconderBanner('pwa-banner'); });
}
function dispensarBanner(id) {
    esconderBanner(id);
    localStorage.setItem('pwa_dismissed', Date.now());
}

document.addEventListener('DOMContentLoaded', () => {
    if (isIos && !isInstalado() && !jaDispensou())
        setTimeout(() => mostrarBanner('ios-banner'), 3000);
});

// ============================================================
// 1. CARREGAR PRODUTOS (carga inicial)
// ============================================================
async function fetchProducts() {
    try {
        const { data, error } = await _supabase
            .from('pizzas').select('*').order('name', { ascending: true });
        if (error) throw error;

        const container = document.getElementById('pizzasContainer');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <p class="col-span-full text-center py-16 text-gray-400">
                    <i class="fas fa-pizza-slice text-4xl mb-4 block"></i>
                    Nenhum sabor cadastrado ainda. Aguarde!
                </p>`;
            return;
        }

        // Atualiza mapa de estoque com dados frescos do banco
        estoqueMap = {};
        data.forEach(p => { estoqueMap[p.id] = p.estoque || 0; });

        renderizarCardapio(data);
    } catch (err) {
        console.error('Erro ao carregar produtos:', err.message);
    }
}

// ── Renderiza todos os cards do cardápio ─────────────────────
function renderizarCardapio(pizzas) {
    const container = document.getElementById('pizzasContainer');
    if (!container) return;

    container.innerHTML = pizzas.map(pizza => {
        const estoque    = estoqueMap[pizza.id] ?? (pizza.estoque || 0);
        const semEstoque = estoque <= 0;
        return `
        <div class="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 transition hover:-translate-y-1 hover:shadow-xl"
             id="card-pizza-${pizza.id}">
            <div class="relative">
                <img src="${pizza.image_url || 'https://placehold.co/400x300/1e3a5f/white?text=Pizza'}"
                     class="w-full h-48 object-cover"
                     onerror="this.src='https://placehold.co/400x300/1e3a5f/white?text=Pizza'">
                <div id="badge-esgotado-${pizza.id}"
                     class="absolute inset-0 bg-black/60 flex items-center justify-center"
                     style="display:${semEstoque ? 'flex' : 'none'} !important">
                    <span class="bg-red-500 text-white font-black px-4 py-2 rounded-full text-sm">ESGOTADO</span>
                </div>
            </div>
            <div class="p-4">
                <h3 class="font-bold text-xl text-blue-950">${pizza.name}</h3>
                <p class="text-gray-400 text-xs mb-4" id="estoque-label-${pizza.id}">
                    Estoque: ${estoque} unidade${estoque !== 1 ? 's' : ''}
                </p>
                <div class="flex justify-between items-center">
                    <span class="text-2xl font-black text-blue-900">${brl(pizza.price)}</span>
                    <button id="btn-add-${pizza.id}"
                            onclick="addToCart('${pizza.id}', \`${pizza.name}\`, ${pizza.price})"
                            ${semEstoque ? 'disabled' : ''}
                            class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                        ${semEstoque ? 'Esgotado' : 'Adicionar +'}
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Atualiza apenas o card afetado pelo Realtime ─────────────
// Evita re-renderizar todo o cardápio a cada mudança de estoque,
// o que causaria perda de foco/scroll no mobile.
function atualizarCardPizza(pizza) {
    const novoEstoque = pizza.estoque || 0;
    const idAnterior  = estoqueMap[pizza.id];

    // Atualiza o mapa local
    estoqueMap[pizza.id] = novoEstoque;

    // Se o card ainda não existe no DOM (pizza nova), refaz tudo
    if (!document.getElementById(`card-pizza-${pizza.id}`)) {
        fetchProducts();
        return;
    }

    const semEstoque = novoEstoque <= 0;

    // Atualiza label de estoque
    const label = document.getElementById(`estoque-label-${pizza.id}`);
    if (label) label.textContent = `Estoque: ${novoEstoque} unidade${novoEstoque !== 1 ? 's' : ''}`;

    // Mostra/esconde badge ESGOTADO
    const badge = document.getElementById(`badge-esgotado-${pizza.id}`);
    if (badge) badge.style.display = semEstoque ? 'flex' : 'none';

    // Habilita/desabilita botão
    const btn = document.getElementById(`btn-add-${pizza.id}`);
    if (btn) {
        btn.disabled   = semEstoque;
        btn.textContent = semEstoque ? 'Esgotado' : 'Adicionar +';
    }

    // Ajusta o carrinho se o novo estoque for menor que a qtd adicionada
    const itemNoCarrinho = cart.findIndex(i => i.id === pizza.id);
    if (itemNoCarrinho > -1) {
        const qtyAtual = cart[itemNoCarrinho].qty;
        if (qtyAtual > novoEstoque) {
            if (novoEstoque <= 0) {
                // Remove do carrinho — acabou o estoque
                cart.splice(itemNoCarrinho, 1);
                mostrarAviso(
                    `⚠️ "${pizza.name}" foi removido do seu carrinho (estoque esgotado).`,
                    'warn'
                );
            } else {
                // Reduz para o máximo disponível
                cart[itemNoCarrinho].qty      = novoEstoque;
                cart[itemNoCarrinho].estoqueMax = novoEstoque;
                mostrarAviso(
                    `⚠️ Quantidade de "${pizza.name}" ajustada para ${novoEstoque} (estoque disponível).`,
                    'warn'
                );
            }
            updateCartUI();
        }
        // Atualiza estoqueMax do item
        if (cart[itemNoCarrinho]) cart[itemNoCarrinho].estoqueMax = novoEstoque;
    }
}

// ============================================================
// 2. REALTIME — sincronismo ao vivo com o banco
// ============================================================
function iniciarRealtimeCliente() {
    _supabase
        .channel('vitrine-realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pizzas' },
            (payload) => {
                console.log('[Realtime] Pizza atualizada:', payload.eventType, payload.new?.id);

                if (payload.eventType === 'DELETE') {
                    // Pizza removida — refaz o cardápio completo
                    fetchProducts();
                    return;
                }

                if (payload.new) {
                    atualizarCardPizza(payload.new);
                }
            }
        )
        .subscribe((status) => {
            console.log('[Realtime] Status canal vitrine:', status);
        });
}

// ============================================================
// 3. CARRINHO — com limite sempre baseado em estoqueMap ao vivo
// ============================================================
function addToCart(id, name, price) {
    // Sempre consulta o mapa ao vivo, nunca o valor estático do HTML
    const estoqueAtual = estoqueMap[id] ?? 0;
    const index        = cart.findIndex(item => item.id === id);

    if (index > -1) {
        if (cart[index].qty >= estoqueAtual) {
            mostrarAvisoEstoque(name, estoqueAtual);
            return;
        }
        cart[index].qty++;
        cart[index].estoqueMax = estoqueAtual; // mantém sincronizado
    } else {
        if (estoqueAtual <= 0) {
            mostrarAvisoEstoque(name, 0);
            return;
        }
        cart.push({ id, name, price: Number(price), qty: 1, estoqueMax: estoqueAtual });
    }
    updateCartUI();
}

function mostrarAvisoEstoque(nome, max) {
    const msg = max <= 0
        ? `❌ "${nome}" está esgotado.`
        : `⚠️ Limite atingido: apenas ${max} ${max === 1 ? 'unidade' : 'unidades'} de "${nome}"`;
    mostrarAviso(msg, 'error');
}

// Toast genérico (substitui alert para avisos não-bloqueantes)
function mostrarAviso(msg, tipo = 'warn') {
    const cores = {
        warn:  { bg: '#1e293b', border: 'rgba(234,179,8,.5)',   icon: '⚠️' },
        error: { bg: '#1e1520', border: 'rgba(239,68,68,.5)',    icon: '❌' },
        info:  { bg: '#0f172a', border: 'rgba(59,130,246,.5)',   icon: 'ℹ️' },
    };
    const c = cores[tipo] || cores.warn;
    const el = document.createElement('div');
    el.innerHTML = `
        <div style="position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
            background:${c.bg};color:white;padding:12px 20px;border-radius:12px;
            font-size:13px;font-weight:700;z-index:9999;
            border:1px solid ${c.border};box-shadow:0 4px 20px rgba(0,0,0,.5);
            max-width:90vw;text-align:center;line-height:1.4;
            animation:slideUpToast .25s ease">
            ${msg}
        </div>
        <style>
            @keyframes slideUpToast {
                from{opacity:0;transform:translateX(-50%) translateY(12px)}
                to  {opacity:1;transform:translateX(-50%) translateY(0)}
            }
        </style>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function removeFromCart(id) {
    const index = cart.findIndex(item => item.id === id);
    if (index > -1) {
        if (cart[index].qty > 1) cart[index].qty--;
        else cart.splice(index, 1);
    }
    updateCartUI();
}

function updateCartUI() {
    const cartItems     = document.getElementById('cartItems');
    const totalValue    = document.getElementById('totalValue');
    const floatingTotal = document.getElementById('floatingTotal');
    if (!cartItems) return;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <p class="text-center text-gray-400 py-8">
                <i class="fas fa-shopping-basket text-3xl mb-3 block"></i>
                Seu carrinho está vazio.
            </p>`;
    } else {
        cartItems.innerHTML = cart.map(item => {
            // Limite sempre vem do mapa ao vivo
            const limiteAtual = estoqueMap[item.id] ?? item.estoqueMax ?? 0;
            const noLimit     = item.qty >= limiteAtual;
            return `
            <div class="flex justify-between items-center border-b pb-3 mb-3">
                <div class="flex-1 pr-2">
                    <p class="font-bold text-blue-950">${item.name}</p>
                    <p class="text-xs text-gray-400">
                        ${brl(item.price)} × ${item.qty} = <strong>${brl(item.price * item.qty)}</strong>
                    </p>
                    ${noLimit ? `<p class="text-[10px] text-red-500 font-bold mt-0.5">Limite do estoque atingido</p>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 transition">
                        <i class="fas fa-minus-circle text-lg"></i>
                    </button>
                    <span class="font-black w-6 text-center">${item.qty}</span>
                    <button onclick="addToCart('${item.id}', \`${item.name}\`, ${item.price})"
                            class="transition ${noLimit ? 'text-gray-300 cursor-not-allowed' : 'text-green-500 hover:text-green-700'}"
                            ${noLimit ? 'disabled' : ''}>
                        <i class="fas fa-plus-circle text-lg"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    if (totalValue)    totalValue.innerText    = brl(total);
    if (floatingTotal) floatingTotal.innerText = brl(total);
}

// ============================================================
// 4. FINALIZAR PEDIDO — baixa atômica via RPC
// ============================================================
async function enviarPedido() {
    const nome = document.getElementById('custName')?.value.trim();
    const tel  = document.getElementById('custPhone')?.value.trim();
    if (!nome || !tel) { alert('Preencha seu nome e telefone!'); return; }
    if (cart.length === 0) { alert('Carrinho vazio!'); return; }

    const btn = document.querySelector('#modalIdentificacao button[onclick="enviarPedido()"]');
    if (btn) { btn.disabled = true; btn.innerText = 'Processando...'; }

    try {
        // ── Validação final no banco (dados frescos) ─────────
        const erros = [];
        for (const item of cart) {
            const { data: p, error } = await _supabase
                .from('pizzas').select('name, estoque').eq('id', item.id).single();
            if (error) throw error;
            if ((p.estoque || 0) < item.qty) {
                erros.push(`${p.name} (disponível agora: ${p.estoque})`);
                // Atualiza mapa local com valor real
                estoqueMap[item.id] = p.estoque || 0;
            }
        }

        if (erros.length) {
            // Atualiza carrinho e vitrine com os valores reais
            updateCartUI();
            fetchProducts();
            if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Pedido'; }
            alert('❌ Estoque insuficiente — quantidades ajustadas:\n' + erros.join('\n'));
            return;
        }

        // ── Baixa atômica: decrementa estoque com verificação ─
        // Usa UPDATE com WHERE estoque >= qty para evitar race condition.
        // Se outro usuário já comprou nesse instante, rowsAffected = 0.
        const falhas = [];
        for (const item of cart) {
            const { data: atualizado, error } = await _supabase
                .from('pizzas')
                .update({ estoque: estoqueMap[item.id] - item.qty })
                .eq('id', item.id)
                .gte('estoque', item.qty)   // ← proteção race condition
                .select('id, estoque')
                .single();

            if (error || !atualizado) {
                // Estoque mudou entre a validação e o update — busca valor real
                const { data: atual } = await _supabase
                    .from('pizzas').select('name, estoque').eq('id', item.id).single();
                falhas.push(`${item.name} (disponível agora: ${atual?.estoque ?? 0})`);
                estoqueMap[item.id] = atual?.estoque ?? 0;
            } else {
                estoqueMap[item.id] = atualizado.estoque;
            }
        }

        if (falhas.length) {
            updateCartUI();
            fetchProducts();
            if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Pedido'; }
            alert('❌ Não foi possível reservar todos os itens:\n' + falhas.join('\n') + '\n\nSeu carrinho foi atualizado.');
            return;
        }

        // ── Salva o pedido ───────────────────────────────────
        const total        = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
        const itensTexto   = cart.map(i => `${i.qty}x ${i.name}`).join(', ');
        const statusInicial = formaPagamento === 'cartao' ? 'Confirmado' : 'Pendente';

        const { data: pedidoSalvo, error: orderError } = await _supabase
            .from('pedidos')
            .insert([{
                cliente_nome:    nome,
                cliente_tel:     tel,
                itens:           itensTexto,
                total,
                status:          statusInicial,
                forma_pagamento: formaPagamento,
            }])
            .select('id')   // captura o ID gerado pelo banco
            .single();

        if (orderError) throw orderError;

        cart = [];
        updateCartUI();
        exibirSucesso(pedidoSalvo.id, nome, total, formaPagamento);

    } catch (err) {
        console.error('Erro crítico:', err.message);
        alert('Erro ao processar pedido. Tente novamente.');
        if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Pedido'; }
    }
}

// ============================================================
// 5. INTERFACE
// ============================================================
function exibirSucesso(pedidoId, nomeCliente, total, formaPgto) {
    const inner = document.querySelector('#modalIdentificacao .modal-inner');
    if (!inner) return;

    const isPix   = formaPgto !== 'cartao';
    const codigo  = pedidoCodigo(pedidoId);
    const btnId   = 'btn-copiar-id';

    inner.innerHTML = `
        <div class="sucesso-card">

            <!-- Cabeçalho -->
            <div class="sucesso-header">
                <div class="sucesso-check-icon">✅</div>
                <h2 class="sucesso-titulo">Pedido Confirmado!</h2>
                <p class="sucesso-subtitulo">Recebemos seu pedido com sucesso</p>
            </div>

            <!-- Corpo -->
            <div class="sucesso-body">

                <!-- Número do pedido -->
                <div class="sucesso-pedido-box">
                    <p class="sucesso-pedido-label">Número do Pedido</p>
                    <p class="sucesso-pedido-codigo">${codigo}</p>
                    <button id="${btnId}" class="btn-copiar-codigo"
                            onclick="copiarTexto('${codigo}', '${btnId}')">
                        <i class="fas fa-copy"></i> Copiar código
                    </button>
                    <p class="sucesso-pedido-info">
                        Total: <strong style="color:#34d399">${brl(total)}</strong>
                        &nbsp;·&nbsp;
                        ${isPix ? '💚 PIX' : '💳 Cartão'}
                    </p>
                </div>

                ${isPix ? `
                <!-- Upload de comprovante -->
                <div>
                    <p class="sucesso-section-label">Comprovante PIX</p>

                    <div id="area-comprovante" class="upload-area-comprovante"
                         onclick="document.getElementById('inputComprovante').click()">
                        <input type="file" id="inputComprovante"
                               accept="image/*,application/pdf"
                               style="display:none"
                               onchange="selecionarComprovante(this, ${pedidoId}, '${nomeCliente}', ${total})">
                        <i class="fas fa-camera upload-icone" style="font-size:1.25rem;color:#3b82f6;display:block"></i>
                        <p class="upload-label" style="font-size:12px;font-weight:700;color:#94a3b8">
                            Toque para anexar o comprovante
                        </p>
                        <p class="upload-dica" style="font-size:10px;color:#475569">JPG, PNG ou PDF · máx. 5 MB</p>
                    </div>

                    <button id="btn-upload-comprovante" class="btn-upload"
                            onclick="enviarComprovante(${pedidoId}, '${nomeCliente}', ${total})">
                        <i class="fas fa-upload" style="margin-right:.4rem"></i> Enviar Comprovante
                    </button>

                    <div id="status-upload" class="upload-status"></div>
                </div>

                <div class="sucesso-divisor"><span>OU</span></div>

                <button class="btn-whatsapp"
                        onclick="abrirWhatsapp(${pedidoId}, '${nomeCliente}', ${total})">
                    <i class="fab fa-whatsapp"></i>
                    Enviar Comprovante via WhatsApp
                </button>

                ` : `
                <div class="sucesso-cartao-box">
                    💳 Pagamento no cartão na entrega.<br>
                    <strong style="color:#60a5fa">Guarde o código ${codigo}.</strong>
                </div>
                `}

                <button class="btn-novo-pedido" onclick="location.reload()">
                    Fazer Outro Pedido
                </button>

            </div>
        </div>`;
}

// ── Seleciona arquivo e mostra botão de upload ───────────────
function selecionarComprovante(input, pedidoId, nomeCliente, total) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('Arquivo muito grande! Máximo 5 MB.');
        input.value = '';
        return;
    }

    // ── Salva o arquivo numa variável global ANTES de qualquer DOM change ──
    _arquivoComprovante = file;

    // Atualiza visual da área SEM recriar o input (mantém o files[0] acessível)
    const area = document.getElementById('area-comprovante');
    if (area) {
        area.style.borderColor = 'rgba(16,185,129,.5)';
        area.style.background  = 'rgba(16,185,129,.06)';

        // Atualiza só os elementos visuais, preserva o <input> original
        const icone = area.querySelector('.upload-icone');
        const label = area.querySelector('.upload-label');
        const dica  = area.querySelector('.upload-dica');

        if (icone) { icone.className = 'fas fa-file-check upload-icone'; icone.style.color = '#34d399'; }
        if (label) { label.textContent = file.name; label.style.color = '#34d399'; }
        if (dica)  { dica.textContent  = 'Toque para trocar'; }
    }

    // Mostra botão de upload
    const btn = document.getElementById('btn-upload-comprovante');
    if (btn) btn.style.display = 'block';
}

// ── Faz o upload para o Supabase Storage ────────────────────
async function enviarComprovante(pedidoId, nomeCliente, total) {
    // Usa a variável global — não depende do DOM do input (que pode ter sido recriado)
    if (!_arquivoComprovante) {
        alert('Selecione o comprovante primeiro.');
        return;
    }

    const file   = _arquivoComprovante;
    const ext    = file.name.split('.').pop().toLowerCase();
    const nome   = `${pedidoCodigo(pedidoId)}_${Date.now()}.${ext}`;

    const btnUp  = document.getElementById('btn-upload-comprovante');
    const status = document.getElementById('status-upload');

    // Estado: carregando
    if (btnUp) {
        btnUp.disabled     = true;
        btnUp.innerHTML    = '<i class="fas fa-spinner fa-spin" style="margin-right:.4rem"></i> Enviando...';
        btnUp.style.background = '#1e3a8a';
    }
    if (status) { status.style.display = 'none'; }

    try {
        const { error: upError } = await _supabase.storage
            .from('comprovantes')
            .upload(nome, file, { cacheControl: '3600', upsert: false, contentType: file.type });

        if (upError) throw upError;

        // Estado: sucesso
        if (btnUp) {
            btnUp.innerHTML        = '✅ Comprovante Enviado com Sucesso!';
            btnUp.style.background = '#065f46';
            btnUp.disabled         = true;
        }
        if (status) {
            status.style.display    = 'block';
            status.style.background = 'rgba(16,185,129,.1)';
            status.style.color      = '#34d399';
            status.style.border     = '1px solid rgba(16,185,129,.25)';
            status.textContent      = `📎 Arquivo vinculado ao pedido ${pedidoCodigo(pedidoId)}`;
        }

        // Salva URL do comprovante no pedido
        const urlPublica = `${supabaseUrl}/storage/v1/object/public/comprovantes/${nome}`;
        await _supabase.from('pedidos').update({ comprovante_url: urlPublica }).eq('id', pedidoId);

        // Após upload, abre WhatsApp automaticamente
        _arquivoComprovante = null;
        setTimeout(() => abrirWhatsapp(pedidoId, nomeCliente, total, true), 800);

    } catch (err) {
        console.error('Erro no upload:', err.message);
        if (btnUp) {
            btnUp.disabled     = false;
            btnUp.innerHTML    = '<i class="fas fa-upload" style="margin-right:.4rem"></i> Tentar Novamente';
            btnUp.style.background = '#dc2626';
        }
        if (status) {
            status.style.display    = 'block';
            status.style.background = 'rgba(239,68,68,.1)';
            status.style.color      = '#f87171';
            status.style.border     = '1px solid rgba(239,68,68,.25)';
            status.textContent      = 'Erro ao enviar. Tente pelo WhatsApp.';
        }
    }
}

// ── Abre WhatsApp com mensagem automática ────────────────────
function abrirWhatsapp(pedidoId, nomeCliente, total, aposUpload = false) {
    const prefixo = aposUpload
        ? `Olá! Sou ${nomeCliente}. Acabei de fazer o pedido ${pedidoCodigo(pedidoId)} no valor de ${brl(total)} e estou enviando o comprovante em anexo.`
        : `Olá! Sou ${nomeCliente}. Acabei de fazer o pedido ${pedidoCodigo(pedidoId)} no valor de ${brl(total)}. Segue meu comprovante PIX.`;

    const msg    = encodeURIComponent(prefixo);
    const zapUrl = `https://wa.me/5522998620353?text=${msg}`;
    window.open(zapUrl, '_blank');
}

function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    sidebar.classList.toggle('translate-x-full');
    document.body.classList.toggle('cart-open', !sidebar.classList.contains('translate-x-full'));
}

function validarEFinalizar() {
    if (cart.length === 0) { alert('Carrinho vazio! Adicione ao menos um sabor.'); return; }
    document.getElementById('cartSidebar').classList.add('translate-x-full');
    document.body.classList.remove('cart-open');
    document.getElementById('modalIdentificacao').classList.remove('hidden');
    selecionarPagamento('pix');
}

function fecharModalIdentificacao() {
    document.getElementById('modalIdentificacao').classList.add('hidden');
}

function copyPix() {
    navigator.clipboard.writeText('joselucasdesouza36@gmail.com').then(() => alert('Chave PIX copiada!'));
}

// ============================================================
// 6. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    updateCartUI();
    iniciarRealtimeCliente(); // ← sincronismo ao vivo
});

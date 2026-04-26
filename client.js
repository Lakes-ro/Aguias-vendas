// ============================================================
// CLIENT.JS — AGUIAS DE CRISTO | Pizza Camp
// ============================================================

const supabaseUrl = 'https://ukuapolecardpsrmqxum.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let cart = [];
// Mapa de estoque: { [id]: quantidade_disponivel }
let estoqueMap = {};

// ============================================================
// 1. CARREGAR PRODUTOS
// ============================================================
async function fetchProducts() {
    try {
        const { data, error } = await _supabase
            .from('pizzas')
            .select('*')
            .order('name', { ascending: true });

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

        // Salva o estoque de cada pizza no mapa
        estoqueMap = {};
        data.forEach(p => { estoqueMap[p.id] = p.estoque || 0; });

        container.innerHTML = data.map(pizza => {
            const semEstoque = (pizza.estoque || 0) <= 0;
            return `
                <div class="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 transition hover:-translate-y-1 hover:shadow-xl">
                    <div class="relative">
                        <img src="${pizza.image_url || 'https://placehold.co/400x300/1e3a5f/white?text=Pizza'}"
                             class="w-full h-48 object-cover"
                             onerror="this.src='https://placehold.co/400x300/1e3a5f/white?text=Pizza'">
                        ${semEstoque ? `<div class="absolute inset-0 bg-black/60 flex items-center justify-center"><span class="bg-red-500 text-white font-black px-4 py-2 rounded-full text-sm">ESGOTADO</span></div>` : ''}
                    </div>
                    <div class="p-4">
                        <h3 class="font-bold text-xl text-blue-950">${pizza.name}</h3>
                        <p class="text-gray-400 text-xs mb-4">Estoque: ${pizza.estoque || 0} unidades</p>
                        <div class="flex justify-between items-center">
                            <span class="text-2xl font-black text-blue-900">R$ ${Number(pizza.price).toFixed(2)}</span>
                            <button
                                id="btn-add-${pizza.id}"
                                onclick="addToCart('${pizza.id}', \`${pizza.name}\`, ${pizza.price}, ${pizza.estoque || 0})"
                                ${semEstoque ? 'disabled' : ''}
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                                ${semEstoque ? 'Esgotado' : 'Adicionar +'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Erro ao carregar produtos:', err.message);
    }
}

// ============================================================
// 2. CARRINHO — com limite de estoque
// ============================================================
function addToCart(id, name, price, estoqueDisponivel) {
    const estoqueMax = estoqueDisponivel ?? (estoqueMap[id] ?? 0);
    const index = cart.findIndex(item => item.id === id);

    if (index > -1) {
        // Verifica se já atingiu o limite do estoque
        if (cart[index].qty >= estoqueMax) {
            mostrarAvisoEstoque(name, estoqueMax);
            return;
        }
        cart[index].qty++;
    } else {
        if (estoqueMax <= 0) return; // segurança extra
        cart.push({ id, name, price: Number(price), qty: 1, estoqueMax });
    }
    updateCartUI();
}

function mostrarAvisoEstoque(nome, max) {
    // Aviso visual discreto sem alert()
    const aviso = document.createElement('div');
    aviso.innerHTML = `
        <div style="
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#1e293b; color:white; padding:12px 20px; border-radius:12px;
            font-size:13px; font-weight:700; z-index:9999;
            border:1px solid rgba(239,68,68,0.4); box-shadow:0 4px 20px rgba(0,0,0,0.4);
            white-space:nowrap; animation: fadeInUp .25s ease;
        ">
            ⚠️ Limite atingido: apenas ${max} ${max === 1 ? 'unidade disponível' : 'unidades disponíveis'} de <strong>${nome}</strong>
        </div>
    `;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 3000);
}

function removeFromCart(id) {
    const index = cart.findIndex(item => item.id === id);
    if (index > -1) {
        if (cart[index].qty > 1) {
            cart[index].qty--;
        } else {
            cart.splice(index, 1);
        }
    }
    updateCartUI();
}

function updateCartUI() {
    const cartItems   = document.getElementById('cartItems');
    const totalValue  = document.getElementById('totalValue');
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
            const noLimit = item.qty >= (item.estoqueMax || estoqueMap[item.id] || 0);
            return `
                <div class="flex justify-between items-center border-b pb-3 mb-3">
                    <div class="flex-1 pr-2">
                        <p class="font-bold text-blue-950">${item.name}</p>
                        <p class="text-xs text-gray-400">
                            R$ ${item.price.toFixed(2)} × ${item.qty} =
                            <strong>R$ ${(item.price * item.qty).toFixed(2)}</strong>
                        </p>
                        ${noLimit ? `<p class="text-[10px] text-red-500 font-bold mt-0.5">Limite do estoque atingido</p>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 transition">
                            <i class="fas fa-minus-circle text-lg"></i>
                        </button>
                        <span class="font-black w-6 text-center">${item.qty}</span>
                        <button onclick="addToCart('${item.id}', \`${item.name}\`, ${item.price}, ${item.estoqueMax || 0})"
                                class="transition ${noLimit ? 'text-gray-300 cursor-not-allowed' : 'text-green-500 hover:text-green-700'}"
                                ${noLimit ? 'disabled' : ''}>
                            <i class="fas fa-plus-circle text-lg"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    if (totalValue)    totalValue.innerText    = `R$ ${total.toFixed(2)}`;
    if (floatingTotal) floatingTotal.innerText = `R$ ${total.toFixed(2)}`;
}

// ============================================================
// 3. FINALIZAR PEDIDO
// ============================================================
async function enviarPedido() {
    const nome = document.getElementById('custName')?.value.trim();
    const tel  = document.getElementById('custPhone')?.value.trim();

    if (!nome || !tel) { alert('Preencha seu nome e telefone!'); return; }
    if (cart.length === 0) { alert('Carrinho vazio!'); return; }

    const btnConfirmar = document.querySelector('#modalIdentificacao button[onclick="enviarPedido()"]');
    if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.innerText = 'Processando...'; }

    try {
        // Valida estoque no banco (segurança server-side)
        const erros = [];
        for (const item of cart) {
            const { data: p } = await _supabase.from('pizzas').select('name, estoque').eq('id', item.id).single();
            if ((p.estoque || 0) < item.qty) {
                erros.push(`${p.name} (disponível agora: ${p.estoque})`);
            }
        }
        if (erros.length > 0) {
            alert('❌ Estoque insuficiente:\n' + erros.join('\n'));
            if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.innerText = 'Confirmar Pedido'; }
            return;
        }

        // Baixa de estoque
        for (const item of cart) {
            const { data: p } = await _supabase.from('pizzas').select('estoque').eq('id', item.id).single();
            await _supabase.from('pizzas').update({ estoque: (p.estoque || 0) - item.qty }).eq('id', item.id);
        }

        // Salva pedido
        const total      = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
        const itensTexto = cart.map(i => `${i.qty}x ${i.name}`).join(', ');

        const { error: orderError } = await _supabase.from('pedidos').insert([{
            cliente_nome: nome,
            cliente_tel:  tel,
            itens:        itensTexto,
            total,
            status: 'Pendente'
        }]);

        if (orderError) throw orderError;

        exibirSucesso();
        cart = [];
        updateCartUI();

    } catch (err) {
        console.error('Erro crítico:', err.message);
        alert('Erro ao processar pedido. Tente novamente.');
        if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.innerText = 'Confirmar Pedido'; }
    }
}

// ============================================================
// 4. INTERFACE
// ============================================================
function exibirSucesso() {
    const inner = document.querySelector('#modalIdentificacao .modal-inner');
    if (!inner) return;
    inner.innerHTML = `
        <div class="p-10 text-center">
            <i class="fas fa-check-circle text-6xl text-green-500 mb-4"></i>
            <h2 class="text-2xl font-bold mb-2 text-blue-950">Pedido Confirmado!</h2>
            <p class="text-gray-600 mb-8">Seu pedido foi enviado ao painel do clube.<br>Em breve entraremos em contato!</p>
            <button onclick="location.reload()" class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition">
                Fazer Outro Pedido
            </button>
        </div>
    `;
}

function toggleCart() {
    document.getElementById('cartSidebar').classList.toggle('translate-x-full');
}

function validarEFinalizar() {
    if (cart.length === 0) { alert('Carrinho vazio! Adicione ao menos um sabor.'); return; }
    document.getElementById('cartSidebar').classList.add('translate-x-full');
    document.getElementById('modalIdentificacao').classList.remove('hidden');
}

function fecharModalIdentificacao() {
    document.getElementById('modalIdentificacao').classList.add('hidden');
}

function copyPix() {
    navigator.clipboard.writeText('35991264352').then(() => alert('Chave PIX copiada!'));
}

// ============================================================
// 5. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    updateCartUI();
});
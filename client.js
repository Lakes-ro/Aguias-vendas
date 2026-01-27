// 1. CONEXÃO E CONFIGURAÇÃO
const supabaseUrl = 'https://ukuapolecardpsrmqxum.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let cart = [];

// 2. BUSCA DE PRODUTOS (VITRINE) - RESOLVE O ERRO DA LINHA 67
async function fetchProducts() {
    try {
        // Agora o await está dentro da função async, eliminando o SyntaxError
        const { data, error } = await _supabase
            .from('pizzas')
            .select('*');

        if (error) throw error;

        const container = document.getElementById('pizzasContainer');
        if (!container) return;

        // Se o banco estiver vazio, avisa o usuário
        if (!data || data.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center py-10 text-gray-500">Nenhum produto cadastrado no banco.</p>`;
            return;
        }

        container.innerHTML = data.map(pizza => `
            <div class="bg-white rounded-2xl shadow-md p-4 border border-gray-100">
                <img src="${pizza.image_url}" class="w-full h-48 object-cover rounded-xl mb-4">
                <h3 class="font-bold text-xl text-blue-950">${pizza.name}</h3>
                <p class="text-gray-400 text-xs mb-4">Estoque: ${pizza.estoque}</p>
                <div class="flex justify-between items-center">
                    <span class="text-2xl font-black text-blue-900">R$ ${Number(pizza.price).toFixed(2)}</span>
                    <button onclick="addToCart('${pizza.id}', '${pizza.name}', ${pizza.price})" 
                            class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
                        Adicionar +
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Erro ao carregar produtos:", err.message);
    }
}

// 3. LÓGICA DO CARRINHO (ADICIONAR/REMOVER/ATUALIZAR)
function addToCart(id, name, price) {
    const index = cart.findIndex(item => item.id === id);
    if (index > -1) {
        cart[index].qty++;
    } else {
        cart.push({ id, name, price, qty: 1 });
    }
    updateUI();
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
    updateUI();
}

function updateUI() {
    const cartItems = document.getElementById('cartItems');
    const totalValue = document.getElementById('totalValue');
    const floatingTotal = document.getElementById('floatingTotal');

    if (!cartItems) return;

    cartItems.innerHTML = cart.map(item => `
        <div class="flex justify-between items-center border-b pb-2 mb-2">
            <div>
                <p class="font-bold text-blue-950">${item.name}</p>
                <p class="text-xs text-gray-500">R$ ${item.price.toFixed(2)} x ${item.qty}</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="removeFromCart('${item.id}')" class="text-red-500"><i class="fas fa-minus-circle"></i></button>
                <span class="font-bold">${item.qty}</span>
                <button onclick="addToCart('${item.id}', '${item.name}', ${item.price})" class="text-green-500"><i class="fas fa-plus-circle"></i></button>
            </div>
        </div>
    `).join('');

    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    totalValue.innerText = `R$ ${total.toFixed(2)}`;
    if (floatingTotal) floatingTotal.innerText = `R$ ${total.toFixed(2)}`;
}

// 4. FINALIZAÇÃO E ENVIO (COM BAIXA DE ESTOQUE)
// Função ÚNICA para enviar o pedido (Site do Cliente)
async function enviarPedido() {
    // 1. Coleta dados do formulário
    const nome = document.getElementById('custName')?.value.trim();
    const tel = document.getElementById('custPhone')?.value.trim();

    if (!nome || !tel) {
        alert("Por favor, preencha seu nome e telefone!");
        return;
    }

    if (cart.length === 0) {
        alert("Seu carrinho está vazio!");
        return;
    }

    try {
        // 2. VALIDAÇÃO DE ESTOQUE (Verifica todos os itens antes de começar)
        let errosEstoque = [];
        for (let item of cart) {
            const { data: p } = await _supabase.from('pizzas').select('name, estoque').eq('id', item.id).single();
            if (p.estoque < item.qty) {
                errosEstoque.push(`${p.name} (Disponível: ${p.estoque})`);
            }
        }

        if (errosEstoque.length > 0) {
            alert("❌ Itens indisponíveis:\n" + errosEstoque.join('\n'));
            return; // PARA O ENVIO AQUI
        }

        // 3. SE CHEGOU AQUI, HÁ ESTOQUE. FAZ A BAIXA.
        for (let item of cart) {
            const { data: p } = await _supabase.from('pizzas').select('estoque').eq('id', item.id).single();
            await _supabase.from('pizzas').update({ estoque: p.estoque - item.qty }).eq('id', item.id);
        }

        // 4. SALVA O PEDIDO NA TABELA 'pedidos' (ou 'orders', verifique seu banco)
        const total = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
        const itensTexto = cart.map(i => `${i.qty}x ${i.name}`).join(', ');

        const { error: orderError } = await _supabase.from('pedidos').insert([{
            cliente_nome: nome,
            cliente_tel: tel,
            itens: itensTexto,
            total: total,
            status: 'Pendente'
        }]);

        if (orderError) throw orderError;

        exibirSucesso(); // Chama o modal de sucesso

    } catch (err) {
        console.error("Erro crítico:", err.message);
        alert("Erro ao processar pedido. Tente novamente.");
    }
}

// 5. INTERFACE (MODAIS E SIDEBAR)
function exibirSucesso() {
    const modalContent = document.querySelector('#modalIdentificacao > div');
    modalContent.innerHTML = `
        <div class="p-10 text-center bg-white rounded-2xl">
            <i class="fas fa-check-circle text-6xl text-green-500 mb-4"></i>
            <h2 class="text-2xl font-bold mb-2">Sucesso!</h2>
            <p class="mb-8">Seu pedido foi enviado ao painel do Clube.</p>
            <button onclick="location.reload()" class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Voltar</button>
        </div>
    `;
    cart = [];
}

function toggleCart() {
    document.getElementById('cartSidebar').classList.toggle('translate-x-full');
}

function validarEFinalizar() {
    if (cart.length === 0) {
        alert("Carrinho vazio!");
        return;
    }
    document.getElementById('modalIdentificacao').classList.remove('hidden');
}

function fecharModalIdentificacao() {
    document.getElementById('modalIdentificacao').classList.add('hidden');
}

// 6. INICIALIZAÇÃO SEGURA
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    updateUI();
});

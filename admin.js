// 1. CONFIGURAÇÃO E CONEXÃO
const SUPABASE_URL = 'https://ukuapolecardpsrmqxum.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrdWFwb2xlY2FyZHBzcm1xeHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDUzOTAsImV4cCI6MjA4NDg4MTM5MH0.c0dH27je2wh1vDDDOz2AaUPGgPvqxdYWyBDObg3SQmI';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let chartInstance = null;

//sidebar

// Navegação entre seções
function showSection(sectionId) {
    // Esconde todas
    ['dash', 'orders', 'inventory', 'expenses'].forEach(s => {
        document.getElementById(`sec-${s}`)?.classList.add('hidden');
        document.getElementById(`btn-${s}`)?.classList.remove('active');
    });

    // Mostra a selecionada
    document.getElementById(`sec-${sectionId}`).classList.remove('hidden');
    document.getElementById(`btn-${sectionId}`).classList.add('active');
}

// TRAVA DE ESTOQUE: Chame isso antes de concluir qualquer venda
async function validarEstoque(carrinho) {
    for (let item of carrinho) {
        const { data: p } = await _supabase.from('pizzas').select('estoque, name').eq('id', item.id).single();
        if (p.estoque < item.qty) {
            alert(`🚫 ESTOQUE INSUFICIENTE: ${p.name} (Disponível: ${p.estoque})`);
            return false;
        }
    }
    return true;
}

async function validarEstoqueCompleto(carrinho) {
    let erros = [];

    for (let item of carrinho) {
        // Busca o estoque atualizado direto do banco para evitar dados obsoletos
        const { data: p, error } = await _supabase
            .from('pizzas')
            .select('name, estoque')
            .eq('id', item.id)
            .single();

        if (error) {
            console.error("Erro ao consultar item:", item.name);
            continue;
        }

        // Verifica se a quantidade no carrinho ultrapassa o que existe no banco
        if (p.estoque < item.qty) {
            erros.push(`${p.name} (Disponível: ${p.estoque})`);
        }
    }

    // Se houver qualquer erro, exibe todos de uma vez e bloqueia a venda
    if (erros.length > 0) {
        alert("❌ Estoque insuficiente para os seguintes itens:\n\n" + erros.join('\n'));
        return false; // Bloqueia o processo de finalização
    }

    return true; // Todos os itens estão disponíveis
}

// Exemplo de Edição de Estoque Direta
async function atualizarEstoqueRapido(id, novoValor) {
    if (novoValor < 0) return alert("Estoque não pode ser negativo!");
    await _supabase.from('pizzas').update({ estoque: novoValor }).eq('id', id);
    carregarDados();
}

// 2. SISTEMA DE ACESSO
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('adminPass').value;
    
    if (pass === "132") {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('mainDashboard').style.opacity = '1';
        init();
    } else {
        const err = document.getElementById('loginError');
        err.classList.remove('hidden');
        setTimeout(() => err.classList.add('hidden'), 3000);
    }
});

async function cadastrarSabor(nome, preco, descricao) {
    const { data, error } = await _supabase
        .from('pizzas')
        .insert([{ name: nome, price: preco, description: descricao }]);
    
    if (error) console.error("Erro ao salvar sabor:", error.message);
    else console.log("Sabor cadastrado com sucesso!");
}

async function cadastrarGasto(descricao, valor) {
    await _supabase
        .from('expenses')
        .insert([{ description: descricao, amount: parseFloat(valor) }]);
    
    await carregarDados(); // Isso vai atualizar o gráfico e os KPIs na hora!
}

// No topo do seu admin.js, envolva tudo em uma verificação de carregamento
document.addEventListener('DOMContentLoaded', () => {
    // Vincule o formulário de login APENAS se ele existir na tela
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            verificarSenha();
        });
    }
});

function verificarSenha() {
    const input = document.getElementById('adminPass');
    if (!input) return; // Evita o erro "reading value of null"
    
    if (input.value === "maranata2026") {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('mainDashboard').classList.replace('opacity-0', 'opacity-100');
        init();
    }
}

// Função para carregar os pedidos na tela do Admin
async function carregarPedidosAdmin() {
    const { data, error } = await _supabase
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return;

    const container = document.getElementById('rankingTableBody'); // Usando seu ID existente da tabela
    container.innerHTML = data.map(pedido => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition">
            <td class="p-4 text-xs font-bold text-blue-400">#${pedido.id.toString().slice(-4)}</td>
            <td class="p-4">
                <div class="font-bold text-white">${pedido.cliente_nome}</div>
                <div class="text-[10px] text-gray-500">${pedido.cliente_tel}</div>
            </td>
            <td class="p-4 text-xs text-gray-300">${pedido.itens}</td>
            <td class="p-4 font-black text-emerald-400">R$ ${pedido.total.toFixed(2)}</td>
            <td class="p-4">
                <span class="px-2 py-1 rounded text-[10px] font-black ${pedido.status === 'Pago' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}">
                    ${pedido.status.toUpperCase()}
                </span>
            </td>
            <td class="p-4">
                ${pedido.status !== 'Pago' ? `
                    <button onclick="marcarComoPago(${pedido.id}, ${pedido.total})" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded shadow-lg transition">
                        BAIXA (PAGO)
                    </button>
                ` : '<i class="fas fa-check-double text-emerald-500"></i>'}
            </td>
        </tr>
    `).join('');
}

function togglePassword() {
    const input = document.getElementById('adminPass');
    const icon = document.getElementById('eyeIcon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// Substitua sua função atualizarKPIs por esta:
function atualizarKPIs(pedidos = []) { // O "= []" evita o erro de 'undefined'
    if (!pedidos || pedidos.length === 0) return;
    const ids = {
        receita: document.getElementById('receitaBruta'),
        vendas: document.getElementById('totalVendas'),
        gastos: document.getElementById('gastosTotais'),
        lucro: document.getElementById('lucroLiquido'),
        pizzas: document.getElementById('pizzasVendidas') // Adicionado para bater com seu HTML
    };

    if (!ids.receita || !pedidos) return;

    // Filtra apenas os pedidos pagos
    const pagos = pedidos.filter(p => p.status?.toLowerCase() === 'pago');
    
    // Cálculos
    const receitaTotal = pagos.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const totalVendas = pagos.length;

    // Atualização da Interface
    if (ids.receita) ids.receita.innerText = `R$ ${receitaTotal.toFixed(2)}`;
    if (ids.vendas) ids.vendas.innerText = totalVendas;
    if (ids.pizzas) ids.pizzas.innerText = totalVendas; 
    
    console.log("📊 KPIs atualizados via Realtime");
}

// Função para dar baixa no pagamento e atualizar o financeiro
async function marcarComoPago(id) {
    const { error } = await _supabase
        .from('pedidos')
        .update({ status: 'Pago' })
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar:", error.message);
        return;
    }

    // FEEDBACK VISUAL IMEDIATO: 
    // Em vez de recarregar a página, chamamos a função que busca e redesenha os dados
    console.log("Pagamento confirmado, atualizando interface...");
    await carregarDados(); 
}

// Garanta que esta função exista para matar o erro do console
function renderizarInventario(pizzas) {
    const container = document.getElementById('inventoryTableBody');
    if (!container) return;
    
    container.innerHTML = pizzas.map(p => `
        <div class="p-4 border-b border-white/5 flex justify-between items-center">
            <span>${p.name}</span>
            <span class="text-blue-400">R$ ${p.price}</span>
        </div>
    `).join('');
}


// 3. INICIALIZAÇÃO DE DADOS
async function init() {
    console.log("Sincronizando dados...");
    // Chamada inicial
    await carregarDados();
    // Realtime já configurado no final do arquivo cuidará do resto
}

// 1. FUNÇÃO DE INICIALIZAÇÃO CORRIGIDA
async function init() {
    console.log("Sincronizando dados...");
    // Chamada inicial
    await carregarDados();
    // Realtime já configurado no final do arquivo cuidará do resto
}

// 2. CARREGAR DADOS UNIFICADO (Focando na tabela 'pedidos')
async function carregarDados() {
    try {
        const [resPedidos, resGastos] = await Promise.all([
            _supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
            _supabase.from('expenses').select('*')
        ]);

        // Redesenha tudo no DOM sem Refresh
        renderizarKPIs(resPedidos.data || [], resGastos.data || []);
        renderizarTabelaPedidos(resPedidos.data || []);
        renderizarGrafico(resPedidos.data || []);
        
    } catch (err) {
        console.error("Falha na sincronização:", err);
    }
}

// OUVINTE ÚNICO E EFICIENTE
const monitorarTudo = _supabase
  .channel('fluxo-gestao')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
      console.log('🔔 Mudança nos pedidos! Atualizando painel...');
      playNotificationSound();
      await carregarDados(); // Carrega tudo de novo automaticamente
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'pizzas' }, async () => {
      console.log('🍕 Mudança no estoque! Atualizando vitrine...');
      await carregarDados(); 
  })
  .subscribe();

// 3. RENDERIZAR KPIs COM TRAVA DE SEGURANÇA (Evita o erro de 'null')
function renderizarKPIs(pedidos, despesas) {
    const el = {
        receita: document.getElementById('receitaBruta'),
        vendas: document.getElementById('totalVendas'),
        gastos: document.getElementById('gastosTotais'),
        lucro: document.getElementById('lucroLiquido')
    };

    // Cálculo baseado em status: Receita = Tudo, Lucro = Apenas Pagos - Despesas
    const receitaTotal = pedidos.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const pagosTotal = pedidos.filter(p => p.status?.toLowerCase() === 'pago')
                              .reduce((acc, p) => acc + Number(p.total || 0), 0);
    const gastosTotal = despesas.reduce((acc, d) => acc + Number(d.amount || 0), 0);

    if (el.receita) el.receita.innerText = `R$ ${receitaTotal.toFixed(2)}`;
    if (el.vendas) el.vendas.innerText = pedidos.length;
    if (el.gastos) el.gastos.innerText = `R$ ${gastosTotal.toFixed(2)}`;
    if (el.lucro) el.lucro.innerText = `R$ ${(pagosTotal - gastosTotal).toFixed(2)}`;
    
    console.log("✅ Dashboard Atualizado");
}

// Garanta que o gráfico tenha altura fixa no contêiner
function renderizarGrafico(pedidos) {
    const ctx = document.getElementById('chartFlavors');
    if (!ctx) return;

    // ... lógica de contagem ...
    
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { /* ... seus dados ... */ },
        options: { 
            responsive: true, 
            maintainAspectRatio: false // IMPEDE O GRÁFICO DE CRESCER INFINITAMENTE
        }
    });
}

// 4. FUNÇÃO PARA LISTAR OS PEDIDOS NA TABELA
function renderizarTabelaPedidos(pedidos) {
    const container = document.getElementById('rankingTableBody');
    if (!container) return;

    container.innerHTML = pedidos.map(pedido => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition">
            <td class="p-4 text-xs font-bold text-blue-400">#${pedido.id.toString().slice(-4)}</td>
            <td class="p-4">
                <div class="font-bold text-white">${pedido.cliente_nome}</div>
                <div class="text-[10px] text-gray-500">${pedido.cliente_tel}</div>
            </td>
            <td class="p-4 text-xs text-gray-300">${pedido.itens}</td>
            <td class="p-4 font-black text-emerald-400">R$ ${Number(pedido.total).toFixed(2)}</td>
            <td class="p-4">
                <span class="px-2 py-1 rounded text-[10px] font-black ${pedido.status === 'Pago' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}">
                    ${pedido.status.toUpperCase()}
                </span>
            </td>
            <td class="p-4 text-right">
                ${pedido.status !== 'Pago' ? `
                    <button onclick="marcarComoPago(${pedido.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded shadow-lg transition">
                        BAIXA
                    </button>
                ` : '<i class="fas fa-check-double text-emerald-500 px-3"></i>'}
            </td>
        </tr>
    `).join('');
}

function renderizarGrafico(pedidos) {
    const ctx = document.getElementById('chartFlavors');
    if (!ctx) return;

    const contagem = {};
    pedidos.forEach(p => {
        const primeiroSabor = p.itens ? p.itens.split('x ')[1]?.split(',')[0] : "Outros";
        contagem[primeiroSabor] = (contagem[primeiroSabor] || 0) + 1;
    });

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(contagem),
            datasets: [{ data: Object.values(contagem), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false } // Trava o gráfico no contêiner
    });
}

// 4. INTELIGÊNCIA FINANCEIRA
function renderizarKPIs(pedidos, despesas) {
    // IDs que o JS vai procurar. Se não achar, ele ignora em vez de travar o site.
    const elements = {
        receita: document.getElementById('receitaBruta'),
        vendas: document.getElementById('totalVendas'),
        gastos: document.getElementById('gastosTotais'),
        lucro: document.getElementById('lucroLiquido')
    };

    const pagos = pedidos.filter(p => p.status?.toLowerCase() === 'pago');
    const receitaTotal = pagos.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const gastosTotal = despesas.reduce((acc, d) => acc + Number(d.amount || 0), 0);

    // Atualização segura (Resolve o erro da imagem 63a30e)
    if (elements.receita) elements.receita.innerText = `R$ ${receitaTotal.toFixed(2)}`;
    if (elements.vendas) elements.vendas.innerText = pagos.length;
    if (elements.gastos) elements.gastos.innerText = `R$ ${gastosTotal.toFixed(2)}`;
    if (elements.lucro) elements.lucro.innerText = `R$ ${(receitaTotal - gastosTotal).toFixed(2)}`;
    
    console.log("📊 KPIs atualizados com sucesso.");
}

// 5. GESTÃO DE PRODUTOS E IMAGENS (A funcionalidade que você pediu)
async function salvarPizza() {
    const name = document.getElementById('pName').value;
    const price = parseFloat(document.getElementById('pPrice').value);
    const fileInput = document.getElementById('pizzaFile');
    const file = fileInput.files[0];

    if (!name || !pr.ice) return alert("Preencha nome e preço!");

    let imageUrl = "https://via.placeholder.com/150"; // Default

    // Lógica de Upload (Visão de Diretor)
    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `pizzas/${fileName}`;

       // Trecho dentro da função salvarPizza()
const { data, error } = await _supabase.storage
    .from('images') // O nome exato que você criou no passo 1
    .upload(filePath, file);

        if (!error) {
            const { data: urlData } = _supabase.storage.from('images').getPublicUrl(filePath);
            imageUrl = urlData.publicUrl;
        }
    }

    const { error } = await _supabase.from('pizzas').insert([
        { name, price, image_url: imageUrl, active: true }
    ]);

    if (!error) {
        fecharModal();
        carregarDados();
    }
}

// 6. VISUALIZAÇÃO DE DADOS (Gráfico e Ranking)
function renderizarGrafico(pedidos) {
    const ctx = document.getElementById('chartFlavors');
    if (!ctx) return;

    const contagem = {};
    pedidos.forEach(p => {
        const sabor = p.itens ? p.itens.split(',')[0] : "Outros";
        contagem[sabor] = (contagem[sabor] || 0) + 1;
    });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(contagem),
            datasets: [{
                data: Object.values(contagem),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, // OBRIGATÓRIO para não vazar do card
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 12 } } }
        }
    });
}

async function adicionarProduto() {
    const nome = document.getElementById('pName').value;
    const preco = parseFloat(document.getElementById('pPrice').value);
    const estoque = parseInt(document.getElementById('pStock').value);
    const imagem = document.getElementById('pImageUrl').value; // Ou lógica de upload

    const { error } = await _supabase.from('pizzas').insert([
        { name: nome, price: preco, estoque: estoque, image_url: imagem, active: true }
    ]);

    if (!error) {
        alert("Sabor adicionado com sucesso!");
        carregarDados(); // Recarrega o inventário
    }
}

function renderizarRanking(pedidos) {
    const container = document.getElementById('rankingTableBody');
    if (!container) return;

    // Pega apenas os últimos 5 para o dashboard principal
    const topVendas = pedidos.slice(0, 5);

    container.innerHTML = topVendas.map((p, index) => `
        <div class="flex items-center justify-between p-4 border-b border-white/5 hover:bg-white/5 transition">
            <div class="flex items-center gap-4">
                <span class="text-gray-500 font-bold">#${pedidos.length - index}</span>
                <div>
                    <div class="text-white font-bold">${p.cliente_nome || 'Anônimo'}</div>
                    <div class="text-[10px] text-gray-500">${p.itens || ''}</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-emerald-400 font-black">R$ ${Number(p.total).toFixed(2)}</div>
                <span class="text-[10px] px-2 py-0.5 rounded ${p.status === 'Pago' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}">
                    ${p.status.toUpperCase()}
                </span>
            </div>
        </div>
    `).join('');
}

function renderizarInventario(pizzas) {
    const container = document.getElementById('inventoryTableBody');
    container.innerHTML = pizzas.map(p => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition">
            <td class="p-4 text-center"><img src="${p.image_url}" class="w-12 h-12 rounded-xl object-cover mx-auto"></td>
            <td class="p-4 font-bold">${p.name}</td>
            <td class="p-4 text-blue-400 font-black">R$ ${p.price.toFixed(2)}</td>
            <td class="p-4">
                <button onclick="deletarPizza('${p.id}')" class="text-red-500 hover:scale-110 transition"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}
async function validarEstoqueAntesDaVenda(itensCarrinho) {
    for (let item of itensCarrinho) {
        const { data: produto } = await _supabase
            .from('pizzas')
            .select('estoque, name')
            .eq('id', item.id)
            .single();

        if (produto.estoque < item.qty) {
            alert(`Estoque insuficiente para ${produto.name}. Disponível: ${produto.estoque}`);
            return false; // Bloqueia a venda
        }
    }
    return true; // Prossegue com a venda
}    

function renderizarGestaoEstoque() {
    const container = document.getElementById('inventoryTableBody');
    // Busca os produtos e renderiza com inputs de edição
    // Adicione um botão "Salvar" que executa o .update() no Supabase
}

async function editarProduto(id, novosDados) {
    const { error } = await _supabase
        .from('pizzas')
        .update(novosDados)
        .eq('id', id);
    
    if (!error) alert("Produto atualizado!");
}

const monitoradorGlobal = _supabase
    .channel('gestao_total')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        playNotificationSound(); // Alerta sonoro de novo pedido
        carregarDadosGerais(); // Atualiza KPIs de Receita e Lucro
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pizzas' }, payload => {
        // Atualiza a lista de estoque se houver alteração de preço ou quantidade
        if (document.getElementById('sec-estoque').classList.contains('hidden') === false) {
            renderizarGestaoEstoque();
        }
    })
    .subscribe();

    // 7. UTILITÁRIOS DE INTERFACE
// Função ÚNICA de Navegação
function showSection(sectionId) {
    // 1. Identifica todas as seções possíveis
    const sections = ['dash', 'orders', 'inventory', 'expenses'];
    
    sections.forEach(s => {
        const el = document.getElementById(`sec-${s}`);
        const btn = document.getElementById(`btn-${s}`);
        
        if (el) {
            // Se for a seção clicada, mostra. Se não, esconde.
            el.classList.toggle('hidden', s !== sectionId);
        }
        if (btn) {
            // Estilo visual do botão ativo
            btn.classList.toggle('bg-blue-600', s === sectionId);
            btn.classList.toggle('text-white', s === sectionId);
        }
    });

    // 2. Inteligência: Só carrega dados pesados se estiver na tela certa
    if (sectionId === 'dash') carregarDados();
}

function abrirModalAddPizza() { document.getElementById('modalPizza').classList.remove('hidden'); }
function fecharModal() { document.getElementById('modalPizza').classList.add('hidden'); }

async function deletarPizza(id) {
    if(confirm("Remover sabor?")) {
        await _supabase.from('pizzas').delete().eq('id', id);
        carregarDados();
    }
}

function gerarRelatorio() { window.print(); }

// Função para tocar som de alerta (experiência de app)
function playNotificationSound() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play();
}

// Escuta em tempo real
const pedidosRealtime = _supabase
  .channel('public:pedidos')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async payload => {
      console.log('Mudança detectada no banco!');
      playNotificationSound();
      
      // Em vez de chamar a função vazia, recarregue os dados globais
      await carregarDados(); 
  })
  .subscribe();

  async function atualizarDashboard() {
    try {
        // Busca todos os pedidos
        const { data: pedidos, error } = await _supabase
            .from('pedidos')
            .select('*');

        if (error) throw error;

        // 1. Receita Bruta (Soma TUDO o que foi vendido)
        const receitaBruta = pedidos.reduce((acc, p) => acc + Number(p.total || 0), 0);

        // 2. Lucro Líquido (Soma apenas o que está PAGO)
        const lucroLiquido = pedidos
            .filter(p => p.status === 'Pago')
            .reduce((acc, p) => acc + Number(p.total || 0), 0);

        // 3. Quantidade de Pizzas
        const pizzasVendidas = pedidos.length;

        // ATUALIZA A TELA (IDs devem bater com seu HTML)
        document.getElementById('receitaBruta').innerText = `R$ ${receitaBruta.toFixed(2)}`;
        document.getElementById('lucroLiquido').innerText = `R$ ${lucroLiquido.toFixed(2)}`;
        document.getElementById('pizzasVendidas').innerText = pizzasVendidas;

    } catch (err) {
        console.error("Erro ao processar valores do dashboard:", err);
    }
}

// Configurar a escuta em tempo real para novos pedidos
// ESCUTA EM TEMPO REAL (O Coração da Gestão)
const monitorarPedidos = _supabase
  .channel('gestao-realtime')
  .on('postgres_changes', { 
      event: '*', // Escuta INSERT, UPDATE e DELETE
      schema: 'public', 
      table: 'orders' 
  }, (payload) => {
      console.log('🔔 Mudança detectada nos pedidos!', payload.eventType);
      
      // Se for um novo pedido, toca o som
      if (payload.eventType === 'INSERT') {
          playNotificationSound();
      }

      // Atualiza a tela inteira (KPIs, Tabela e Gráfico)
      carregarDados(); 
  })
  .subscribe();


  
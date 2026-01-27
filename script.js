/**
 * FADMINAS MARKETPLACE - ENTERPRISE ENGINE
 * Foco: Performance, Sincronização Supabase e UX de PWA
 */

// 1. CONFIGURAÇÃO DE INFRAESTRUTURA (SUPABASE)
const S_URL = "https://dkzbpevakiiwzuimzftz.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremJwZXZha2lpd3p1aW16ZnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNTc4NDgsImV4cCI6MjA4NDczMzg0OH0.GgDQz3KR2x1vupLWPSd7gU9lLXNCjBAaFXEM6IADYWY";
const BUCKET_FOTOS = 'produtos';
const _supabase = supabase.createClient(S_URL, S_KEY);
/**
 * FADMINAS MARKETPLACE - CORE ENGINE
 * Sincronização Supabase + Gestão de Estado + PWA
 */

// 1. CONFIGURAÇÃO DE INFRAESTRUTURA
// Substitua pelos seus dados do painel do Supabase

// 2. ESTADO GLOBAL (Single Source of Truth)
const state = {
    products: [],
    cart: JSON.parse(localStorage.getItem('fadminas_cart')) || [],
    currentSection: 'home',
    filters: { category: 'all' },
    isSidebarOpen: false
};

// 3. INICIALIZAÇÃO DO SISTEMA
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Inicializando motor Fadminas...");
    await fetchProducts(); // Sincroniza com banco
    initEventListeners();  // Ativa controles de UI
    renderProducts();      // Desenha vitrine
    updateCartUI();        // Restaura carrinho
    registerServiceWorker(); // Ativa PWA
});

// 4. COMUNICAÇÃO COM SUPABASE (DATA LAYER)
async function fetchProducts() {
    try {
        const { data, error } = await _supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        state.products = data;
        console.log("✅ Estoque sincronizado");
    } catch (err) {
        console.error("❌ Falha na conexão:", err.message);
        // Fallback para não deixar a vitrine vazia se o banco falhar
        state.products = []; 
    }
}

// 5. RENDERIZAÇÃO DINÂMICA (VIEW LAYER)
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const filtered = state.filters.category === 'all' 
        ? state.products 
        : state.products.filter(p => p.categoria === state.filters.category);

    const countLabel = document.getElementById('productCount');
    if (countLabel) countLabel.textContent = `${filtered.length} itens encontrados`;

    grid.innerHTML = filtered.map(product => `
        <div class="product-card animate-fadeIn">
            <div class="relative overflow-hidden group">
                <img src="${product.imagem}" alt="${product.nome}" 
                     class="transition-transform duration-500 group-hover:scale-110"
                     onerror="this.src='https://via.placeholder.com/400x300?text=Imagem+Indisponível'">
                <span class="product-badge ${product.tipo === 'official' ? 'official' : 'partner'}">
                    ${product.tipo === 'official' ? 'Fadminas' : 'Parceiro'}
                </span>
            </div>
            <div class="p-5 flex flex-col flex-1">
                <span class="text-[10px] font-black text-blue-500 uppercase tracking-tighter">${product.categoria}</span>
                <h3 class="text-lg font-bold mt-1 text-white">${product.nome}</h3>
                <p class="text-slate-400 text-xs mt-2 line-clamp-2">${product.descricao || ''}</p>
                
                <div class="mt-auto pt-6 flex items-center justify-between">
                    <div>
                        <p class="text-[10px] text-slate-500 uppercase">Investimento</p>
                        <p class="text-xl font-black text-white font-mono">R$ ${parseFloat(product.preco).toFixed(2)}</p>
                    </div>
                    <button onclick="addToCart(${product.id})" 
                            class="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl shadow-lg shadow-blue-900/20 active:scale-90 transition">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// 6. LÓGICA DE NEGÓCIO: CARRINHO
function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const itemInCart = state.cart.find(item => item.id === productId);
    
    if (itemInCart) {
        itemInCart.quantidade++;
    } else {
        state.cart.push({ ...product, quantidade: 1 });
    }

    saveAndRefreshCart();
    showToast(`Adicionado: ${product.nome}`);
}

function changeQty(id, delta) {
    const item = state.cart.find(i => i.id === id);
    if (!item) return;

    item.quantidade += delta;
    if (item.quantidade <= 0) {
        state.cart = state.cart.filter(i => i.id !== id);
    }
    saveAndRefreshCart();
}

function saveAndRefreshCart() {
    localStorage.setItem('fadminas_cart', JSON.stringify(state.cart));
    updateCartUI();
}

function updateCartUI() {
    const containers = [document.getElementById('cartItems'), document.getElementById('carrinhoPageItems')];
    const totalDisplays = [document.getElementById('total'), document.getElementById('checkoutTotal')];
    const countBadge = document.getElementById('cartCountHeader');
    
    let total = 0;
    let count = 0;

    const cartHTML = state.cart.map(item => {
        total += item.preco * item.quantidade;
        count += item.quantidade;
        return `
            <div class="cart-item border-b border-slate-700/50 pb-4">
                <img src="${item.imagem}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/100'">
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h4 class="text-sm font-bold">${item.nome}</h4>
                        <button onclick="changeQty(${item.id}, -${item.quantidade})" class="text-slate-500 hover:text-red-500"><i class="fas fa-times"></i></button>
                    </div>
                    <p class="text-blue-400 font-bold text-sm">R$ ${item.preco.toFixed(2)}</p>
                    <div class="flex items-center gap-4 mt-2">
                        <div class="cart-item-qty">
                            <button onclick="changeQty(${item.id}, -1)">-</button>
                            <span class="text-xs font-bold">${item.quantidade}</span>
                            <button onclick="changeQty(${item.id}, 1)">+</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    containers.forEach(c => { if(c) c.innerHTML = cartHTML || '<p class="text-center text-slate-500 py-10">Carrinho vazio</p>' });
    totalDisplays.forEach(d => { if(d) d.textContent = `R$ ${total.toFixed(2)}` });
    if(countBadge) countBadge.textContent = count;
    
    const subtotal = document.getElementById('subtotal');
    if(subtotal) subtotal.textContent = `R$ ${total.toFixed(2)}`;
}

// 7. CRIAÇÃO DE ANÚNCIOS (SUPABASE INSERT)
async function handleCreateAnuncio(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PUBLICANDO...';

    const payload = {
        nome: document.getElementById('produtoNome').value,
        preco: parseFloat(document.getElementById('produtoPreco').value),
        estoque: parseInt(document.getElementById('produtoEstoque').value),
        categoria: document.getElementById('produtoCategoria').value,
        descricao: document.getElementById('produtoDescricao').value,
        imagem: document.getElementById('previewImg').src,
        vendedor: 'Comunidade Fadminas',
        tipo: 'partner'
    };

    try {
        const { error } = await _supabase.from('products').insert([payload]);
        if (error) throw error;

        showToast("🚀 Anúncio publicado com sucesso!", "success");
        e.target.reset();
        closeModals();
        await fetchProducts();
        renderProducts();
    } catch (err) {
        showToast("Erro ao publicar: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "PUBLICAR AGORA";
    }
}

// 8. UI CONTROLLER & NAVEGAÇÃO
function showSection(sectionId) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`${sectionId}-section`);
    if(target) target.classList.remove('hidden');

    document.querySelectorAll('.sidebar-item').forEach(i => {
        i.classList.toggle('active', i.dataset.section === sectionId);
    });

    state.currentSection = sectionId;
    if(window.innerWidth < 1024) toggleSidebar(false);
}

function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('modalOverlay');
    const isOpen = force !== undefined ? force : sidebar.classList.contains('-translate-x-full');

    sidebar.classList.toggle('-translate-x-full', !isOpen);
    overlay.classList.toggle('hidden', !isOpen);
}

function closeModals() {
    document.getElementById('anuncioModal').classList.add('hidden');
    document.getElementById('cartSidebar').classList.add('translate-x-full');
    document.getElementById('modalOverlay').classList.add('hidden');
    toggleSidebar(false);
}

// 9. EVENT LISTENERS
function initEventListeners() {
    // Cliques Básicos
    document.getElementById('toggleSidebar')?.addEventListener('click', () => toggleSidebar(true));
    document.getElementById('modalOverlay')?.addEventListener('click', closeModals);
    document.getElementById('closeAnuncioModal')?.addEventListener('click', closeModals);
    document.getElementById('closeCart')?.addEventListener('click', closeModals);

    // Sidebar Navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(item.dataset.section);
        });
    });

    // Carrinho Sidebar
    document.getElementById('cartToggleHeader')?.addEventListener('click', () => {
        document.getElementById('cartSidebar').classList.remove('translate-x-full');
        document.getElementById('modalOverlay').classList.remove('hidden');
    });

    // Modal de Anúncio
    document.getElementById('openAnuncioModal')?.addEventListener('click', () => {
        document.getElementById('anuncioModal').classList.remove('hidden');
        document.getElementById('modalOverlay').classList.remove('hidden');
    });

    // Categorias
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.category = btn.dataset.category;
            renderProducts();
        });
    });

    // Upload de Foto (Preview)
    document.getElementById('fotoProduto')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('previewImg').src = ev.target.result;
                document.getElementById('fotoPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    // Form submission
    document.getElementById('anuncioForm')?.addEventListener('submit', handleCreateAnuncio);
}

// 10. UTILITÁRIOS (PWA & TOAST)
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl z-[100] animate-bounce";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.log("SW Error:", err));
        });
    }
}
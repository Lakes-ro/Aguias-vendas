// ================================================================
// PWA-UPDATE.JS — Gerenciamento de SW + Toast de Atualização
// Pizza Camp · Aguias de Cristo
//
// Inclua este arquivo em index.html e admin.html ANTES dos
// scripts principais:
//   <script src="pwa-update.js"></script>
// ================================================================

(function () {
    'use strict';

    // ── Estilos do Toast ─────────────────────────────────────────
    // Injetados uma única vez no <head>. Usam variáveis CSS do
    // projeto e são compatíveis com o layout do admin.html e
    // index.html sem interferir nas classes Tailwind existentes.
    const TOAST_STYLE = `
        #pwa-update-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(120px);
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 18px;
            border-radius: 16px;
            background: #0a0e17;
            border: 1px solid #3b82f6;
            box-shadow:
                0 0 0 1px rgba(59,130,246,.15),
                0 0 24px rgba(59,130,246,.25),
                0 8px 32px rgba(0,0,0,.6);
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            color: #e2e8f0;
            white-space: nowrap;
            transition: transform .4s cubic-bezier(.4,0,.2,1), opacity .4s ease;
            opacity: 0;
            pointer-events: none;
        }

        #pwa-update-toast.pwa-toast-visible {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
            pointer-events: all;
        }

        #pwa-update-toast .pwa-toast-icon {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(59,130,246,.15);
            border: 1px solid rgba(59,130,246,.3);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #60a5fa;
            font-size: 15px;
            animation: pwa-spin 1.5s linear infinite;
        }

        #pwa-update-toast .pwa-toast-text strong {
            display: block;
            font-weight: 800;
            font-size: 13px;
            color: #f1f5f9;
            margin-bottom: 2px;
        }

        #pwa-update-toast .pwa-toast-text span {
            font-size: 11px;
            color: #64748b;
        }

        #pwa-update-toast .pwa-toast-btn {
            padding: 8px 16px;
            border-radius: 10px;
            background: #3b82f6;
            color: white;
            font-family: inherit;
            font-weight: 800;
            font-size: 12px;
            letter-spacing: .04em;
            border: none;
            cursor: pointer;
            flex-shrink: 0;
            transition: background .15s, transform .1s;
        }

        #pwa-update-toast .pwa-toast-btn:hover {
            background: #2563eb;
        }

        #pwa-update-toast .pwa-toast-btn:active {
            transform: scale(.96);
        }

        #pwa-update-toast .pwa-toast-close {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(255,255,255,.06);
            border: none;
            color: #64748b;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-family: inherit;
            padding: 0;
            transition: background .15s, color .15s;
        }

        #pwa-update-toast .pwa-toast-close:hover {
            background: rgba(255,255,255,.12);
            color: #e2e8f0;
        }

        @keyframes pwa-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
    `;

    // ── Injeta estilos ───────────────────────────────────────────
    const styleEl = document.createElement('style');
    styleEl.textContent = TOAST_STYLE;
    document.head.appendChild(styleEl);

    // ── Estado interno ───────────────────────────────────────────
    let _swRegistration = null;
    let _toastVisible   = false;

    // ── Cria o DOM do Toast ──────────────────────────────────────
    function criarToast() {
        if (document.getElementById('pwa-update-toast')) return;

        const toast = document.createElement('div');
        toast.id = 'pwa-update-toast';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <div class="pwa-toast-icon" aria-hidden="true">↻</div>
            <div class="pwa-toast-text">
                <strong>Atualização disponível!</strong>
                <span>Nova versão do app encontrada</span>
            </div>
            <button class="pwa-toast-btn" id="pwa-btn-update">
                Atualizar agora
            </button>
            <button class="pwa-toast-close" id="pwa-btn-close" aria-label="Fechar">✕</button>
        `;
        document.body.appendChild(toast);

        // Botão Atualizar
        document.getElementById('pwa-btn-update').addEventListener('click', () => {
            esconderToast();
            if (_swRegistration && _swRegistration.waiting) {
                // Pede ao SW em espera para assumir o controle agora
                _swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
                // Aguarda o controllerchange e recarrega
                // (o listener abaixo em registrarSW cuida disso)
            } else {
                // Fallback: reload forçado sem cache
                window.location.reload(true);
            }
        });

        // Botão Fechar
        document.getElementById('pwa-btn-close').addEventListener('click', () => {
            esconderToast();
        });
    }

    function mostrarToast() {
        if (_toastVisible) return;
        _toastVisible = true;
        criarToast();
        // Delay mínimo para garantir que o elemento está no DOM antes de animar
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = document.getElementById('pwa-update-toast');
                if (el) el.classList.add('pwa-toast-visible');
            });
        });
    }

    function esconderToast() {
        _toastVisible = false;
        const el = document.getElementById('pwa-update-toast');
        if (el) {
            el.classList.remove('pwa-toast-visible');
            // Remove do DOM após a transição
            setTimeout(() => el.remove(), 450);
        }
    }

    // ── Registra SW e monitora atualizações ──────────────────────
    async function registrarSW() {
        if (!('serviceWorker' in navigator)) return;

        try {
            const reg = await navigator.serviceWorker.register('./sw.js', {
                // updateViaCache: 'none' garante que o browser SEMPRE
                // busca o sw.js no servidor, nunca servindo do cache HTTP.
                // Essencial para detectar novas versões corretamente.
                updateViaCache: 'none',
            });

            _swRegistration = reg;
            console.log('[PWA] SW registrado:', reg.scope);

            // Verifica atualização imediatamente ao carregar
            // (captura versões que chegaram enquanto o app estava fechado)
            reg.update().catch(() => {}); // silencia erro se offline

            // ── Detecta novo SW sendo instalado ─────────────────
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;

                console.log('[PWA] Novo SW encontrado — instalando...');

                newWorker.addEventListener('statechange', () => {
                    console.log('[PWA] Novo SW estado:', newWorker.state);

                    // 'installed' + controller existente = update real
                    // (não é a primeira instalação)
                    if (
                        newWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        console.log('[PWA] ✅ Nova versão pronta — mostrando toast');
                        mostrarToast();
                    }
                });
            });

            // ── Recarrega quando o novo SW assume o controle ─────
            // Isso acontece APÓS o usuário clicar em "Atualizar agora"
            // e o SW em espera receber SKIP_WAITING.
            // NÃO interfere com o Realtime do Supabase — o reload é
            // proposital e disparado apenas por ação do usuário.
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                console.log('[PWA] Novo controller ativo — recarregando app');
                window.location.reload();
            });

        } catch (err) {
            console.warn('[PWA] Falha ao registrar SW:', err);
        }
    }

    // ── Inicia após o DOM estar pronto ───────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registrarSW);
    } else {
        registrarSW();
    }

    // ── Expõe API pública (opcional, para debug) ─────────────────
    window.PwaUpdate = { mostrarToast, esconderToast };

})();
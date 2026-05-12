/* ============================================================
   ÁLBUM COPA 2026 — app.js (VERSÃO FINAL LIMPA)
============================================================ */
'use strict';

(function() {
    const SUPABASE_URL = 'https://phfevmzqzqmnievyelfb.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZmV2bXpxenFtbmlldnllbGZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjk5MDAsImV4cCI6MjA5NDEwNTkwMH0.REh4Z4Y7wNoHUsI2BfvCAYAz_W0UCMW5NaDtqY0YE8A';

    if (!window.supabaseInstance) {
        window.supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    const supabase = window.supabaseInstance;

    const state = {
        pagina: 1,
        porPagina: 20,
        filtroTipo: '',
        filtroDe: '',
        filtroAte: '',
        editandoId: null,
        deletandoId: null,
        tipoAtual: 'COMPRA_PACOTE',
        chartBarras: null,
        chartPizza: null,
    };

    document.addEventListener('DOMContentLoaded', () => {
        const appEl = document.getElementById('app');
        if (appEl) appEl.style.display = 'block';

        definirDataHoje();
        carregarDashboard();
        carregarHistorico();
        configurarFormulario();
        configurarFiltros();
        configurarPaginacao();
        configurarModal();
        configurarNavegacao();

        const btnVerTodos = document.getElementById('btn-ver-todos');
        if (btnVerTodos) {
            btnVerTodos.addEventListener('click', (e) => {
                e.preventDefault();
                navegarPara('lancamento');
            });
        }
    });

    function configurarNavegacao() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => navegarPara(btn.dataset.page));
        });
    }

    function navegarPara(pageName) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
        const pageEl = document.getElementById(`page-${pageName}`);
        
        if (navBtn) navBtn.classList.add('active');
        if (pageEl) pageEl.classList.add('active');

        if (pageName === 'inicio') carregarDashboard();
        if (pageName === 'lancamento') carregarHistorico();
    }

    async function carregarDashboard() {
        try {
            const { data, error } = await supabase
                .from('transacoes')
                .select('*')
                .order('data', { ascending: false });

            if (error) throw error;

            calcularResumo(data || []);
            renderizarGraficoBarras(data || []);
            renderizarGraficoPizza(data || []);
            renderizarTabelaRecente((data || []).slice(0, 10));
        } catch (error) {
            console.error("Erro Dashboard:", error);
        }
    }

    function calcularResumo(transacoes) {
        let gasto = 0, ganho = 0, figCompradas = 0, figVendidas = 0, figTrocadas = 0, pacotes = 0;

        transacoes.forEach(t => {
            const valor = parseFloat(t.valor_total) || 0;
            const qtdFig = parseInt(t.qtd_figurinhas) || 0;
            const qtdPac = parseInt(t.qtd_pacotes) || 0;

            if (t.tipo === 'COMPRA_PACOTE' || t.tipo === 'COMPRA_AVULSA') {
                gasto += valor;
                figCompradas += qtdFig;
                if (t.tipo === 'COMPRA_PACOTE') pacotes += qtdPac;
            } else if (t.tipo === 'VENDA') {
                ganho += valor;
                figVendidas += qtdFig;
            } else if (t.tipo === 'TROCA') {
                figTrocadas += qtdFig;
            }
        });

        const saldo = ganho - gasto;
        setText('stat-gasto', brl(gasto));
        setText('stat-ganho', brl(ganho));
        setText('stat-saldo', brl(saldo));
        setText('stat-ops', transacoes.length);
        setText('stat-fig-compradas', figCompradas);
        setText('stat-fig-vendidas', figVendidas);
        setText('stat-fig-trocadas', figTrocadas);
        setText('stat-pacotes', `${pacotes} pacote${pacotes !== 1 ? 's' : ''}`);

        const elSaldo = document.getElementById('stat-saldo');
        if (elSaldo) {
            elSaldo.classList.toggle('positivo', saldo >= 0);
            elSaldo.classList.toggle('negativo', saldo < 0);
        }
    }

    function renderizarGraficoBarras(transacoes) {
        const porMes = {};
        transacoes.forEach(t => {
            if (!t.data) return;
            const mes = t.data.substring(0, 7);
            if (!porMes[mes]) porMes[mes] = { gasto: 0, ganho: 0 };
            const val = parseFloat(t.valor_total) || 0;
            if (t.tipo === 'COMPRA_PACOTE' || t.tipo === 'COMPRA_AVULSA') porMes[mes].gasto += val;
            else if (t.tipo === 'VENDA') porMes[mes].ganho += val;
        });

        const meses = Object.keys(porMes).sort();
        const labels = meses.map(m => {
            const [ano, mes] = m.split('-');
            const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            return `${nomes[parseInt(mes) - 1]}/${ano.slice(2)}`;
        });

        const ctx = document.getElementById('chart-barras');
        if (!ctx) return;

        if (state.chartBarras) state.chartBarras.destroy();
        state.chartBarras = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Gastos', data: meses.map(m => porMes[m].gasto), backgroundColor: '#fca5a5' },
                    { label: 'Receitas', data: meses.map(m => porMes[m].ganho), backgroundColor: '#86efac' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderizarGraficoPizza(transacoes) {
        let compradas = 0, vendidas = 0, trocadas = 0;
        transacoes.forEach(t => {
            const q = parseInt(t.qtd_figurinhas) || 0;
            if (t.tipo === 'COMPRA_PACOTE' || t.tipo === 'COMPRA_AVULSA') compradas += q;
            else if (t.tipo === 'VENDA') vendidas += q;
            else if (t.tipo === 'TROCA') trocadas += q;
        });

        const ctx = document.getElementById('chart-pizza');
        if (!ctx) return;

        if (state.chartPizza) state.chartPizza.destroy();
        state.chartPizza = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Compradas', 'Vendidas', 'Trocadas'],
                datasets: [{ data: [compradas, vendidas, trocadas], backgroundColor: ['#60a5fa', '#4ade80', '#c084fc'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderizarTabelaRecente(rows) {
        const tbody = document.getElementById('tbody-recente');
        if (!tbody) return;
        tbody.innerHTML = rows.length ? rows.map(t => `
            <tr>
                <td>${formatarData(t.data)}</td>
                <td>${badgeTipo(t.tipo)}</td>
                <td>${t.qtd_figurinhas}${t.qtd_pacotes ? ` (${t.qtd_pacotes} pct.)` : ''}</td>
                <td>${t.valor_total > 0 ? brl(t.valor_total) : '—'}</td>
                <td>${t.observacao || '—'}</td>
            </tr>
        `).join('') : '<tr><td colspan="5" class="empty-row">Nenhum lançamento.</td></tr>';
    }

    async function carregarHistorico() {
        try {
            let query = supabase.from('transacoes').select('*', { count: 'exact' }).order('data', { ascending: false }).order('id', { ascending: false });
            if (state.filtroTipo) query = query.eq('tipo', state.filtroTipo);
            if (state.filtroDe) query = query.gte('data', state.filtroDe);
            if (state.filtroAte) query = query.lte('data', state.filtroAte);

            const from = (state.pagina - 1) * state.porPagina;
            const to = from + state.porPagina - 1;
            const { data, count, error } = await query.range(from, to);
            if (error) throw error;

            renderizarTabelaHistorico(data || [], count || 0);
        } catch (error) {
            console.error("Erro Histórico:", error);
        }
    }

    function renderizarTabelaHistorico(rows, total) {
        const tbody = document.getElementById('tbody-historico');
        if (!tbody) return;
        setText('count-registros', `${total} registros`);
        const inicio = (state.pagina - 1) * state.porPagina;
        tbody.innerHTML = rows.length ? rows.map((t, i) => `
            <tr>
                <td>${inicio + i + 1}</td>
                <td>${formatarData(t.data)}</td>
                <td>${badgeTipo(t.tipo)}</td>
                <td>${t.qtd_figurinhas}</td>
                <td>${t.qtd_pacotes ?? '—'}</td>
                <td>${t.valor_unitario != null ? brl(t.valor_unitario) : '—'}</td>
                <td>${t.valor_total > 0 ? brl(t.valor_total) : '—'}</td>
                <td>${t.observacao || '—'}</td>
                <td>
                    <button class="btn-edit" onclick="window.iniciarEdicao(${t.id})">✏️</button>
                    <button class="btn-del" onclick="window.solicitarExclusao(${t.id})">🗑️</button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="9" class="empty-row">Nenhum lançamento.</td></tr>';
        atualizarPaginacao(total);
    }

    function atualizarPaginacao(total) {
        const totalPags = Math.max(1, Math.ceil(total / state.porPagina));
        setText('pag-info', `Pág. ${state.pagina} / ${totalPags}`);
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');
        if (btnPrev) btnPrev.disabled = state.pagina <= 1;
        if (btnNext) btnNext.disabled = state.pagina >= totalPags;
    }

    function configurarFormulario() {
        document.querySelectorAll('.tipo-btn').forEach(btn => {
            btn.addEventListener('click', () => selecionarTipo(btn.dataset.tipo));
        });
        const inputs = [['f-qtd-pacotes', calcularPacote], ['f-valor-pacote', calcularPacote], ['f-qtd-avulsa', calcularAvulsa], ['f-valor-avulsa', calcularAvulsa], ['f-qtd-venda', calcularVenda], ['f-valor-venda', calcularVenda]];
        inputs.forEach(([id, func]) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', func);
        });
        document.getElementById('btn-salvar').addEventListener('click', salvarLancamento);
        document.getElementById('btn-cancelar-edicao').addEventListener('click', cancelarEdicao);
    }

    function selecionarTipo(tipo) {
        state.tipoAtual = tipo;
        document.querySelectorAll('.tipo-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo === tipo));
        document.querySelectorAll('.campos-tipo').forEach(c => c.classList.toggle('active', c.dataset.campos === tipo));
    }

    function calcularPacote() {
        const q = parseFloat(document.getElementById('f-qtd-pacotes').value) || 0;
        const v = parseFloat(document.getElementById('f-valor-pacote').value) || 0;
        const el = document.getElementById('preview-pacote');
        if (el) el.innerHTML = `${q} pacotes × R$ ${v.toFixed(2)} = <b>${brl(q * v)}</b>`;
    }

    function calcularAvulsa() {
        const q = parseFloat(document.getElementById('f-qtd-avulsa').value) || 0;
        const v = parseFloat(document.getElementById('f-valor-avulsa').value) || 0;
        const el = document.getElementById('preview-avulsa');
        if (el) el.innerHTML = `${q} figs × R$ ${v.toFixed(2)} = <b>${brl(q * v)}</b>`;
    }

    function calcularVenda() {
        const q = parseFloat(document.getElementById('f-qtd-venda').value) || 0;
        const v = parseFloat(document.getElementById('f-valor-venda').value) || 0;
        const el = document.getElementById('preview-venda');
        if (el) el.innerHTML = `${q} figs × R$ ${v.toFixed(2)} = <b>${brl(q * v)}</b>`;
    }

    async function salvarLancamento() {
        const tipo = state.tipoAtual;
        const data = document.getElementById('f-data').value;
        const obs = document.getElementById('f-obs').value.trim();
        if (!data) { mostrarToast('Informe a data.', 'erro'); return; }
        let registro = { tipo, data, observacao: obs || null };
        try {
            if (tipo === 'COMPRA_PACOTE') {
                const q = parseInt(document.getElementById('f-qtd-pacotes').value);
                const v = parseFloat(document.getElementById('f-valor-pacote').value);
                registro.qtd_pacotes = q; registro.qtd_figurinhas = q * 7; registro.valor_unitario = v; registro.valor_total = q * v;
            } else if (tipo === 'COMPRA_AVULSA' || tipo === 'VENDA') {
                const prefix = tipo === 'COMPRA_AVULSA' ? 'avulsa' : 'venda';
                const q = parseInt(document.getElementById(`f-qtd-${prefix}`).value);
                const v = parseFloat(document.getElementById(`f-valor-${prefix}`).value);
                registro.qtd_figurinhas = q; registro.valor_unitario = v; registro.valor_total = q * v;
            } else if (tipo === 'TROCA') {
                registro.qtd_figurinhas = parseInt(document.getElementById('f-qtd-troca').value);
                registro.valor_total = 0;
            }
            let error;
            if (state.editandoId) {
                ({ error } = await supabase.from('transacoes').update(registro).eq('id', state.editandoId));
            } else {
                ({ error } = await supabase.from('transacoes').insert(registro));
            }
            if (error) throw error;
            mostrarToast('Salvo!', 'sucesso');
            cancelarEdicao(); carregarHistorico(); carregarDashboard();
        } catch (e) { mostrarToast(e.message, 'erro'); }
    }

    window.iniciarEdicao = async function(id) {
        try {
            const { data, error } = await supabase.from('transacoes').select('*').eq('id', id).single();
            if (error) throw error;
            state.editandoId = id;
            document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
            setText('form-title-label', 'Editando #' + id);
            document.getElementById('btn-cancelar-edicao').style.display = 'inline-block';
            selecionarTipo(data.tipo);
            document.getElementById('f-data').value = data.data;
            document.getElementById('f-obs').value = data.observacao || '';
            if (data.tipo === 'COMPRA_PACOTE') {
                document.getElementById('f-qtd-pacotes').value = data.qtd_pacotes;
                document.getElementById('f-valor-pacote').value = data.valor_unitario;
                calcularPacote();
            } else if (data.tipo === 'COMPRA_AVULSA') {
                document.getElementById('f-qtd-avulsa').value = data.qtd_figurinhas;
                document.getElementById('f-valor-avulsa').value = data.valor_unitario;
                calcularAvulsa();
            } else if (data.tipo === 'VENDA') {
                document.getElementById('f-qtd-venda').value = data.qtd_figurinhas;
                document.getElementById('f-valor-venda').value = data.valor_unitario;
                calcularVenda();
            } else if (data.tipo === 'TROCA') {
                document.getElementById('f-qtd-troca').value = data.qtd_figurinhas;
            }
        } catch (e) { alert(e.message); }
    };

    window.solicitarExclusao = function(id) {
        state.deletandoId = id;
        document.getElementById('modal-overlay').classList.add('open');
    };

    function cancelarEdicao() {
        state.editandoId = null;
        setText('form-title-label', 'Novo Lançamento');
        document.getElementById('btn-cancelar-edicao').style.display = 'none';
        limparFormulario();
    }

    function limparFormulario() {
        ['f-qtd-pacotes','f-valor-pacote','f-qtd-avulsa','f-valor-avulsa','f-qtd-venda','f-valor-venda','f-qtd-troca','f-obs'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        definirDataHoje();
    }

    function configurarModal() {
        document.getElementById('modal-cancelar').addEventListener('click', () => {
            document.getElementById('modal-overlay').classList.remove('open');
            state.deletandoId = null;
        });
        document.getElementById('modal-confirmar').addEventListener('click', async () => {
            if (!state.deletandoId) return;
            try {
                const { error } = await supabase.from('transacoes').delete().eq('id', state.deletandoId);
                if (error) throw error;
                document.getElementById('modal-overlay').classList.remove('open');
                mostrarToast('Excluído!', 'sucesso');
                carregarHistorico(); carregarDashboard();
            } catch (e) { alert(e.message); }
        });
    }

    function configurarFiltros() {
        document.getElementById('btn-filtrar').addEventListener('click', () => {
            state.filtroTipo = document.getElementById('filtro-tipo').value;
            state.filtroDe = document.getElementById('filtro-de').value;
            state.filtroAte = document.getElementById('filtro-ate').value;
            state.pagina = 1; carregarHistorico();
        });
        document.getElementById('btn-limpar-filtro').addEventListener('click', () => {
            document.getElementById('filtro-tipo').value = '';
            document.getElementById('filtro-de').value = '';
            document.getElementById('filtro-ate').value = '';
            state.filtroTipo = ''; state.filtroDe = ''; state.filtroAte = '';
            state.pagina = 1; carregarHistorico();
        });
    }

    function configurarPaginacao() {
        document.getElementById('btn-prev').addEventListener('click', () => { if (state.pagina > 1) { state.pagina--; carregarHistorico(); } });
        document.getElementById('btn-next').addEventListener('click', () => { state.pagina++; carregarHistorico(); });
    }

    function brl(v) { return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
    function formatarData(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a.slice(2)}`; }
    function badgeTipo(t) {
        const m = { 'COMPRA_PACOTE': ['badge-compra-pacote', '📦 Pacote'], 'COMPRA_AVULSA': ['badge-compra-avulsa', '🎴 Avulsa'], 'VENDA': ['badge-venda', '🏷️ Venda'], 'TROCA': ['badge-troca', '🔃 Troca'] };
        const [c, l] = m[t] || ['', t];
        return `<span class="badge ${c}">${l}</span>`;
    }
    function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
    function definirDataHoje() { const h = new Date().toISOString().split('T')[0]; const el = document.getElementById('f-data'); if (el) el.value = h; }
    function mostrarToast(m, t) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = m; el.className = `toast ${t}`; el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
})();

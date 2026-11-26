/**
 * FinTrack — Dashboard & Ledger Controller
 * -----------------------------------------
 * Estado inicial populado para demonstração imediata da UI.
 * Para integrar ao Flask + SQLite, substitua `categories` e `transactions`
 * pelos dados renderizados pelo Jinja2 ou via chamadas `fetch('/api/...')`.
 */

let categories = [];
let transactions = [];

let activeTypeFilter = 'all';
let selectedSwatchColor = '#635BFF';
let cashflowChartInstance = null;
let categoryChartInstance = null;
let lastDeletedTx = null;

const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const generateHash = (id) => {
  const hex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return `FT:${String(id).padStart(4, '0')}:${hex}`;
};

const API_URL = '/transactions';

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'Erro ao comunicar com o servidor.');
    }

    return data;
}

const categoryColors = [
    '#635BFF',
    '#38BDF8',
    '#FBBF24',
    '#A78BFA',
    '#2DD4BF',
    '#F87171',
    '#34D399'
];

function normalizeCategory(category, index) {
    return {
        id: Number(category.id),
        name: category.name,
        type: category.type,
        color: categoryColors[index % categoryColors.length]
    };
}

function normalizeTransaction(transaction) {
    return {
        id: Number(transaction.id),
        hash: `FT:${String(transaction.id).padStart(4, '0')}:DB`,
        desc: transaction.title,
        categoryId: Number(transaction.category_id),
        date: transaction.date,
        type: transaction.type,
        amount: Number(transaction.amount),
        description: transaction.description || ''
    };
}

async function loadData() {
    try {
        const [transactionsData, categoriesData] = await Promise.all([
            apiRequest('/'),
            apiRequest('/categories')
        ]);

        transactions = transactionsData.transactions.map(normalizeTransaction);
        categories = categoriesData.categories.map(normalizeCategory);

        refreshApp();

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showToast(error.message);
    }
}

function getFilteredTransactions() {
  const month = document.getElementById('filter-month').value;
  const catId = document.getElementById('filter-category').value;
  const query = document.getElementById('filter-search').value.trim().toLowerCase();

  return transactions
    .filter(tx => {
      if (month !== 'all' && !tx.date.startsWith(month)) return false;
      if (catId !== 'all' && String(tx.categoryId) !== catId) return false;
      if (activeTypeFilter !== 'all' && tx.type !== activeTypeFilter) return false;
      if (query && !tx.desc.toLowerCase().includes(query) && !tx.hash.toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function populateCategorySelects() {
  const filterSel = document.getElementById('filter-category');
  const modalSel = document.getElementById('tx-category');
  const currentFilter = filterSel.value;

  filterSel.innerHTML = '<option value="all">Todas categorias</option>' +
    categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  filterSel.value = currentFilter || 'all';

  modalSel.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function updateKPIs(list) {
  const incomeList = list.filter(t => t.type === 'income');
  const expenseList = list.filter(t => t.type === 'expense');

  const totalIncome = incomeList.reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = expenseList.reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100) : 0;

  document.getElementById('kpi-balance').textContent = fmtBRL(balance);
  document.getElementById('kpi-balance-sub').textContent = `${list.length} lançamentos no período`;
  document.getElementById('kpi-income').textContent = fmtBRL(totalIncome);
  document.getElementById('kpi-income-count').textContent = `${incomeList.length} entradas`;
  document.getElementById('kpi-expense').textContent = fmtBRL(totalExpense);
  document.getElementById('kpi-expense-count').textContent = `${expenseList.length} saídas`;
  document.getElementById('kpi-savings').textContent = `${savingsRate.toFixed(1)}%`;
}

function renderLedger(list) {
  const rowsHTML = list.length ? list.map(tx => {
    const cat = categories.find(c => c.id === tx.categoryId) || { name: 'Geral', color: '#8A94A6' };
    const sign = tx.type === 'income' ? '+' : '-';
    return `
      <tr>
        <td class="tx-hash">${tx.hash}</td>
        <td class="tx-desc">${tx.desc}</td>
        <td>
          <span class="cat-badge">
            <span class="cat-dot" style="background:${cat.color}"></span>
            ${cat.name}
          </span>
        </td>
        <td class="tx-date">${tx.date}</td>
        <td><span class="status-tag ${tx.type}">${tx.type === 'income' ? 'RECEITA' : 'DESPESA'}</span></td>
        <td class="tx-amount ${tx.type}">${sign} ${fmtBRL(tx.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" onclick="openEditModal(${tx.id})" title="Editar lançamento" type="button">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" onclick="deleteTransaction(${tx.id})" title="Excluir lançamento" type="button">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="7" class="empty-state">Nenhum lançamento encontrado para os filtros aplicados.</td></tr>`;

  document.getElementById('ledger-tbody').innerHTML = rowsHTML;
  document.getElementById('ledger-full-tbody').innerHTML = rowsHTML;
  document.getElementById('ledger-count').textContent = `${list.length} registros`;
  document.getElementById('ledger-full-count').textContent = `${list.length} registros`;
}

function updateCharts(list) {
  const days = ['01', '05', '10', '15', '20', '25', '30'];
  const incomeSeries = days.map((_, idx) => {
    const start = idx * 5 + 1;
    const end = start + 4;
    return list
      .filter(t => t.type === 'income' && Number(t.date.slice(8, 10)) >= start && Number(t.date.slice(8, 10)) <= end)
      .reduce((s, t) => s + t.amount, 0);
  });
  const expenseSeries = days.map((_, idx) => {
    const start = idx * 5 + 1;
    const end = start + 4;
    return list
      .filter(t => t.type === 'expense' && Number(t.date.slice(8, 10)) >= start && Number(t.date.slice(8, 10)) <= end)
      .reduce((s, t) => s + t.amount, 0);
  });

  if (cashflowChartInstance) cashflowChartInstance.destroy();
  const ctxLine = document.getElementById('cashflowChart').getContext('2d');
  cashflowChartInstance = new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: days.map(d => `Dia ${d}`),
      datasets: [
        {
          label: 'Receitas',
          data: incomeSeries,
          borderColor: '#635BFF',
          backgroundColor: 'rgba(99, 91, 255, 0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#635BFF',
          tension: 0.35,
          fill: true
        },
        {
          label: 'Despesas',
          data: expenseSeries,
          borderColor: '#F87171',
          backgroundColor: 'rgba(248, 113, 113, 0.06)',
          borderWidth: 1.75,
          pointRadius: 3,
          pointBackgroundColor: '#F87171',
          tension: 0.35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: '#161B26' },
          ticks: { color: '#525B6E', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          grid: { color: '#161B26' },
          ticks: {
            color: '#525B6E',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => 'R$ ' + v
          }
        }
      }
    }
  });

  const expenseTotals = {};
  list.filter(t => t.type === 'expense').forEach(t => {
    expenseTotals[t.categoryId] = (expenseTotals[t.categoryId] || 0) + t.amount;
  });

  const entries = Object.entries(expenseTotals).map(([catId, total]) => {
    const cat = categories.find(c => c.id === Number(catId)) || { name: 'Outros', color: '#8A94A6' };
    return { name: cat.name, color: cat.color, total };
  }).sort((a, b) => b.total - a.total);

  if (categoryChartInstance) categoryChartInstance.destroy();
  const ctxDonut = document.getElementById('categoryChart').getContext('2d');
  categoryChartInstance = new Chart(ctxDonut, {
    type: 'doughnut',
    data: {
      labels: entries.length ? entries.map(e => e.name) : ['Sem despesas'],
      datasets: [{
        data: entries.length ? entries.map(e => e.total) : [1],
        backgroundColor: entries.length ? entries.map(e => e.color) : ['#161B26'],
        borderColor: '#040507',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false } }
    }
  });

  const breakdownEl = document.getElementById('category-breakdown');
  breakdownEl.innerHTML = entries.slice(0, 4).map(e => `
    <div class="breakdown-row">
      <div class="breakdown-left">
        <span class="breakdown-dot" style="background:${e.color}"></span>
        <span>${e.name}</span>
      </div>
      <span class="breakdown-val">${fmtBRL(e.total)}</span>
    </div>
  `).join('') || '<div class="panel-subtitle">Nenhuma despesa no período selecionado.</div>';
}

function renderCategoriesView() {
  document.getElementById('cat-total-pill').textContent = `${categories.length} ativas`;
  document.getElementById('categories-grid').innerHTML = categories.map(cat => `
    <div class="cat-card">
      <div class="cat-card-info">
        <span class="cat-dot" style="background:${cat.color}; width:10px; height:10px;"></span>
        <div>
          <div style="font-weight:500; font-size:13px;">${cat.name}</div>
          <div class="cat-card-meta">${cat.type === 'income' ? 'Receita' : cat.type === 'expense' ? 'Despesa' : 'Ambos'}</div>
        </div>
      </div>
      <button class="icon-btn danger" onclick="deleteCategory(${cat.id})" title="Remover categoria" type="button">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

function refreshApp() {
  populateCategorySelects();
  const filtered = getFilteredTransactions();
  updateKPIs(filtered);
  renderLedger(filtered);
  updateCharts(filtered);
  renderCategoriesView();
}

// =========================================================
// MODAL & CRUD ACTIONS
// =========================================================
const modal = document.getElementById('tx-modal');

function setModalType(type) {
  document.getElementById('tx-type').value = type;
  const optExp = document.getElementById('opt-expense');
  const optInc = document.getElementById('opt-income');
  optExp.className = 'type-option' + (type === 'expense' ? ' active-expense' : '');
  optInc.className = 'type-option' + (type === 'income' ? ' active-income' : '');
}

document.getElementById('opt-expense').addEventListener('click', () => setModalType('expense'));
document.getElementById('opt-income').addEventListener('click', () => setModalType('income'));

document.getElementById('btn-open-modal').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Novo Lançamento';
  document.getElementById('tx-id').value = '';
  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
  setModalType('expense');
  modal.classList.add('open');
});

window.openEditModal = function(id) {
    const tx = transactions.find(t => t.id === id);

    if (!tx) return;

    document.getElementById('modal-title').textContent = `Editar ${tx.hash}`;
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-desc').value = tx.desc;
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-category').value = tx.categoryId;

    setModalType(tx.type);

    modal.classList.add('open');
};

const closeModal = () => modal.classList.remove('open');
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

document.getElementById('tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const idVal = document.getElementById('tx-id').value;

    const payload = {
        title: document.getElementById('tx-desc').value.trim(),
        amount: parseFloat(document.getElementById('tx-amount').value),
        date: document.getElementById('tx-date').value,
        category_id: Number(document.getElementById('tx-category').value),
        type: document.getElementById('tx-type').value
    };

    try {
        if (idVal) {
            await apiRequest(`/${idVal}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            showToast('Lançamento atualizado com sucesso.');

        } else {
            await apiRequest('/', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            showToast('Novo lançamento registrado com sucesso.');
        }

        closeModal();

        await loadData();

    } catch (error) {
        console.error(error);
        showToast(error.message);
    }
});

window.deleteTransaction = async function(id) {
    const confirmed = confirm('Deseja realmente excluir este lançamento?');

    if (!confirmed) return;

    try {
        await apiRequest(`/${id}`, {
            method: 'DELETE'
        });

        showToast('Lançamento excluído com sucesso.');

        await loadData();

    } catch (error) {
        console.error(error);
        showToast(error.message);
    }
};

window.deleteCategory = async function(id) {
    const confirmed = confirm('Deseja realmente excluir esta categoria?');

    if (!confirmed) return;

    try {
        await apiRequest(`/categories/${id}`, {
            method: 'DELETE'
        });

        showToast('Categoria removida com sucesso.');

        await loadData();

    } catch (error) {
        console.error(error);
        showToast(error.message);
    }
};

document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('cat-name').value.trim();
    const type = document.getElementById('cat-type').value;

    if (!name) return;

    try {
        await apiRequest('/categories', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                type: type
            })
        });

        document.getElementById('cat-name').value = '';

        showToast(`Categoria "${name}" criada.`);

        await loadData();

    } catch (error) {
        console.error(error);
        showToast(error.message);
    }
});

document.querySelectorAll('.swatch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSwatchColor = btn.dataset.color;
  });
});

// =========================================================
// NAVEGAÇÃO & FILTROS
// =========================================================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.getElementById('crumb-title').textContent = view;
    document.getElementById('view-overview').style.display = view === 'overview' ? 'block' : 'none';
    document.getElementById('view-ledger').style.display = view === 'ledger' ? 'block' : 'none';
    document.getElementById('view-categories').style.display = view === 'categories' ? 'block' : 'none';
  });
});

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTypeFilter = btn.dataset.type;
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === activeTypeFilter);
    });
    refreshApp();
  });
});

['filter-month', 'filter-category'].forEach(id => {
  document.getElementById(id).addEventListener('change', refreshApp);
});
document.getElementById('filter-search').addEventListener('input', refreshApp);

// =========================================================
// TOAST FEEDBACK + UNDO
// =========================================================
function showToast(msg, allowUndo = false) {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${msg}</span>`;

  if (allowUndo && lastDeletedTx) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo';
    undoBtn.textContent = 'UNDO';
    undoBtn.onclick = () => {
      transactions.push(lastDeletedTx);
      lastDeletedTx = null;
      toast.remove();
      refreshApp();
    };
    toast.appendChild(undoBtn);
  }

  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Inicialização
loadData();
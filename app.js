// State
let expenses = JSON.parse(localStorage.getItem('expenses')) || [];
let scriptUrl = localStorage.getItem('scriptUrl') || '';
let chartInstance = null;
let doughnutInstance = null;
let currentFilter = 'last30';

// Categories Configuration
const CATEGORIES = {
    supermercado: {
        keywords: ['coto', 'supermercado', 'super', 'carniceria', 'verduleria', 'carrefour', 'dia', 'jumbo', 'disco', 'chino'],
        icon: 'fa-cart-shopping',
        color: '#FF9F43',
        label: 'Supermercado'
    },
    mercadopago: {
        keywords: ['mp', 'mercado', 'mercado pago', 'transferencia', 'qr'],
        icon: 'fa-handshake',
        color: '#009EE3',
        label: 'Mercado Pago'
    },
    comida: {
        keywords: ['comida', 'mostaza', 'mc', 'mcdonalds', 'burger', 'king', 'empanadas', 'pizza', 'restaurante', 'bar', 'cafe', 'café', 'starbucks', 'pedidosya', 'rappi'],
        icon: 'fa-utensils',
        color: '#FF6B6B',
        label: 'Comida'
    },
    transporte: {
        keywords: ['uber', 'cabify', 'didi', 'sube', 'taxi', 'nafta', 'estacionamiento', 'peaje', 'bondi', 'colectivo', 'tren', 'subte'],
        icon: 'fa-car',
        color: '#54A0FF',
        label: 'Transporte'
    },
    farmacia: {
        keywords: ['farmacia', 'remedios', 'medicamentos', 'farmacity'],
        icon: 'fa-pills',
        color: '#1DD1A1',
        label: 'Farmacia'
    },
    otros: {
        keywords: [],
        icon: 'fa-bag-shopping',
        color: '#8395A7',
        label: 'Otros'
    }
};

// DOM Elements
const expenseInput = document.getElementById('expenseInput');
const addBtn = document.getElementById('addBtn');
const feedback = document.getElementById('feedback');
const expenseList = document.getElementById('expenseList');
const clearBtn = document.getElementById('clearBtn');
const ctx = document.getElementById('expenseChart').getContext('2d');
const ctxDoughnut = document.getElementById('categoryChart').getContext('2d');
const filterBtns = document.querySelectorAll('.filter-btn');
const totalLabel = document.getElementById('totalLabel');
const totalAmount = document.getElementById('totalAmount');

// Modal Elements
const configBtn = document.getElementById('configBtn');
const configModal = document.getElementById('configModal');
const scriptUrlInput = document.getElementById('scriptUrlInput');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const cancelConfigBtn = document.getElementById('cancelConfigBtn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (scriptUrl) {
        syncDown();
    } else {
        renderExpenses();
        renderCharts();
        renderTotal();
    }
});

// Event Listeners
addBtn.addEventListener('click', handleAddExpense);
clearBtn.addEventListener('click', clearAllExpenses);
expenseList.addEventListener('click', handleDeleteItem);

filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        updateCharts();
        renderTotal();
    });
});

// Config Modal Listeners
configBtn.addEventListener('click', () => {
    scriptUrlInput.value = scriptUrl;
    configModal.classList.remove('hidden');
});

cancelConfigBtn.addEventListener('click', () => {
    configModal.classList.add('hidden');
});

saveConfigBtn.addEventListener('click', () => {
    const url = scriptUrlInput.value.trim();
    if (url) {
        scriptUrl = url;
        localStorage.setItem('scriptUrl', scriptUrl);
        configModal.classList.add('hidden');
        showFeedback('URL guardada. Sincronizando...', 'success');
        syncDown();
    }
});

// Core Logic
function handleAddExpense() {
    const text = expenseInput.value.trim();
    if (!text) return;

    const lines = text.split('\n');
    let addedCount = 0;
    let failedCount = 0;

    lines.forEach(line => {
        if (!line.trim()) return;

        const parsedData = parseExpense(line);
        if (parsedData) {
            expenses.unshift(parsedData);
            addedCount++;
            // Sync Up
            if (scriptUrl) syncUp(parsedData);
        } else {
            failedCount++;
        }
    });

    if (addedCount > 0) {
        saveExpenses();
        renderExpenses();
        updateCharts();
        renderTotal();
        expenseInput.value = '';

        if (failedCount > 0) {
            showFeedback(`Se agregaron ${addedCount} gastos. ${failedCount} no se entendieron.`, 'success');
        } else {
            showFeedback(`Se agregaron ${addedCount} gastos correctamente`, 'success');
        }
    } else {
        showFeedback('No pude entender los gastos. Intenta: "500 comida"', 'error');
    }
}

// Sync Logic
async function syncUp(expense) {
    try {
        await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Apps Script
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(expense)
        });
        console.log('Synced up:', expense);
    } catch (error) {
        console.error('Sync up failed:', error);
        showFeedback('Error al sincronizar con Google Sheets', 'error');
    }
}

async function syncDown() {
    try {
        const response = await fetch(scriptUrl);
        const data = await response.json();

        if (Array.isArray(data)) {
            expenses = data;
            saveExpenses();
            renderExpenses();
            renderCharts();
            renderTotal();
            showFeedback('Sincronizado con Google Sheets', 'success');
        }
    } catch (error) {
        console.error('Sync down failed:', error);
        renderExpenses();
        renderCharts();
        renderTotal();
    }
}

function detectCategory(description) {
    const lowerDesc = description.toLowerCase();

    for (const [key, config] of Object.entries(CATEGORIES)) {
        if (key === 'otros') continue;
        if (config.keywords.some(keyword => lowerDesc.includes(keyword))) {
            return key;
        }
    }
    return 'otros';
}

function parseExpense(text) {
    let amount = 0;
    let rawAmount = "";

    const amountRegex = /([\d.,]+)\s*(k|mil)?/i;
    const amountMatch = text.match(amountRegex);

    if (!amountMatch) return null;

    rawAmount = amountMatch[1];
    const suffix = amountMatch[2] ? amountMatch[2].toLowerCase() : null;

    if (rawAmount.includes(',') && rawAmount.includes('.')) {
        rawAmount = rawAmount.replace(/\./g, '').replace(',', '.');
    } else if (rawAmount.includes(',')) {
        rawAmount = rawAmount.replace(',', '.');
    } else if (rawAmount.includes('.')) {
        const parts = rawAmount.split('.');
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            rawAmount = rawAmount.replace(/\./g, '');
        }
    }

    amount = parseFloat(rawAmount);
    if (isNaN(amount)) return null;

    if (suffix === 'k' || suffix === 'mil') {
        amount *= 1000;
    }

    let date = new Date();
    const lowerText = text.toLowerCase();

    const daysAgoMatch = lowerText.match(/hace\s+(\d+|un|una|dos|tres)\s+(dia|dias|día|días)/);
    const weeksAgoMatch = lowerText.match(/hace\s+(\d+|un|una|dos|tres)\s+(semana|semanas)/);

    if (lowerText.includes('ayer')) {
        date.setDate(date.getDate() - 1);
    } else if (lowerText.includes('anteayer') || lowerText.includes('antes de ayer')) {
        date.setDate(date.getDate() - 2);
    } else if (daysAgoMatch) {
        let days = daysAgoMatch[1];
        if (days === 'un' || days === 'una') days = 1;
        else if (days === 'dos') days = 2;
        else if (days === 'tres') days = 3;
        else days = parseInt(days);
        date.setDate(date.getDate() - days);
    } else if (weeksAgoMatch) {
        let weeks = weeksAgoMatch[1];
        if (weeks === 'un' || weeks === 'una') weeks = 1;
        else if (weeks === 'dos') weeks = 2;
        else if (weeks === 'tres') weeks = 3;
        else weeks = parseInt(weeks);
        date.setDate(date.getDate() - (weeks * 7));
    } else {
        const dateRegex = /\b(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?\b/;
        const dateMatch = text.match(dateRegex);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1;
            const yearStr = dateMatch[4];
            let year = new Date().getFullYear();

            if (yearStr) {
                if (yearStr.length === 2) year = 2000 + parseInt(yearStr);
                else year = parseInt(yearStr);
            }

            date = new Date(year, month, day);
        }
    }

    let description = text.replace(amountMatch[0], '');

    if (lowerText.includes('ayer')) description = description.replace(/ayer/i, '');
    if (lowerText.includes('anteayer')) description = description.replace(/anteayer/i, '');
    if (daysAgoMatch) description = description.replace(daysAgoMatch[0], '');
    if (weeksAgoMatch) description = description.replace(weeksAgoMatch[0], '');

    const dateRegex = /\b(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?\b/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) description = description.replace(dateMatch[0], '');

    description = description
        .replace(/\b(gaste|gasté|compre|compré|en|el|la|los|las|un|una|unos|unas|hoy|pesos|peso|\$)\b/gi, '')
        .replace(/[^\w\sñÑáéíóúÁÉÍÓÚüÜ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!description) description = "Varios";

    description = description.charAt(0).toUpperCase() + description.slice(1);

    const category = detectCategory(description);

    return {
        id: Date.now() + Math.random(),
        amount: amount,
        description: description,
        category: category,
        date: date.toISOString()
    };
}

function saveExpenses() {
    localStorage.setItem('expenses', JSON.stringify(expenses));
}

function clearAllExpenses() {
    if (confirm('¿Estás seguro de borrar todo el historial?')) {
        expenses = [];
        saveExpenses();
        renderExpenses();
        updateCharts();
        renderTotal();
        showFeedback('Historial borrado', 'success');
    }
}

function handleDeleteItem(e) {
    if (e.target.classList.contains('delete-item-btn') || e.target.closest('.delete-item-btn')) {
        const item = e.target.closest('.expense-item');
        const id = parseFloat(item.dataset.id);
        expenses = expenses.filter(exp => exp.id !== id);
        saveExpenses();
        renderExpenses();
        updateCharts();
        renderTotal();
    }
}

function getFilteredExpenses() {
    const now = new Date();

    return expenses.filter(exp => {
        const expDate = new Date(exp.date);

        if (currentFilter === 'last30') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);
            return expDate >= thirtyDaysAgo;
        } else if (currentFilter === 'month') {
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return expDate >= firstDayOfMonth;
        }
        return true;
    });
}

function renderTotal() {
    const filtered = getFilteredExpenses();
    const total = filtered.reduce((sum, exp) => sum + exp.amount, 0);

    const totalStr = total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    totalAmount.textContent = totalStr;

    if (currentFilter === 'last30') {
        totalLabel.textContent = 'Total Últimos 30 días';
    } else {
        totalLabel.textContent = 'Total Este Mes';
    }
}

function showFeedback(msg, type) {
    feedback.textContent = msg;
    feedback.className = `feedback-msg ${type}`;
    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback-msg';
    }, 3000);
}

function renderExpenses() {
    expenseList.innerHTML = '';

    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedExpenses.forEach(exp => {
        const dateObj = new Date(exp.date);
        const dateStr = dateObj.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

        const catKey = exp.category || 'otros';
        const catConfig = CATEGORIES[catKey] || CATEGORIES['otros'];

        const li = document.createElement('li');
        li.className = 'expense-item';
        li.dataset.id = exp.id;

        const amountStr = exp.amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

        li.innerHTML = `
            <div class="expense-left">
                <div class="cat-icon" style="background-color: ${catConfig.color}">
                    <i class="fa-solid ${catConfig.icon}"></i>
                </div>
                <div class="expense-info">
                    <span class="expense-desc">${exp.description}</span>
                    <span class="expense-date">${dateStr}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center;">
                <span class="expense-amount">${amountStr}</span>
                <button class="delete-item-btn"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        expenseList.appendChild(li);
    });
}

function renderCharts() {
    renderLineChart();
    renderDoughnutChart();
}

function updateCharts() {
    updateLineChart();
    updateDoughnutChart();
}

function renderLineChart() {
    const data = processLineChartData();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Gastos',
                data: data.values,
                borderColor: '#6C63FF',
                backgroundColor: 'rgba(108, 99, 255, 0.2)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#00D2D3'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#E0E6ED' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9AA0A6' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9AA0A6' }
                }
            }
        }
    });
}

function updateLineChart() {
    const data = processLineChartData();
    chartInstance.data.labels = data.labels;
    chartInstance.data.datasets[0].data = data.values;
    chartInstance.update();
}

function processLineChartData() {
    const map = {};
    const filtered = getFilteredExpenses();
    const sorted = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        if (!map[dateStr]) map[dateStr] = 0;
        map[dateStr] += exp.amount;
    });

    return {
        labels: Object.keys(map),
        values: Object.values(map)
    };
}

function renderDoughnutChart() {
    const data = processDoughnutData();

    doughnutInstance = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.values,
                backgroundColor: data.colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#E0E6ED' }
                }
            }
        }
    });
}

function updateDoughnutChart() {
    const data = processDoughnutData();
    doughnutInstance.data.labels = data.labels;
    doughnutInstance.data.datasets[0].data = data.values;
    doughnutInstance.data.datasets[0].backgroundColor = data.colors;
    doughnutInstance.update();
}

function processDoughnutData() {
    const map = {};
    const filtered = getFilteredExpenses();

    filtered.forEach(exp => {
        const catKey = exp.category || 'otros';
        if (!map[catKey]) map[catKey] = 0;
        map[catKey] += exp.amount;
    });

    const labels = [];
    const values = [];
    const colors = [];

    for (const [key, amount] of Object.entries(map)) {
        const config = CATEGORIES[key] || CATEGORIES['otros'];
        labels.push(config.label);
        values.push(amount);
        colors.push(config.color);
    }

    return { labels, values, colors };
}

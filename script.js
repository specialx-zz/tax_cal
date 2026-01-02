/**
 * 프리랜서 인건비 최적화 시뮬레이터 (대표님 맞춤형 로직)
 * 1. 종합소득금액 2,400만 원 초과 시 무조건 24% 세율 적용
 * 2. 간이사업자/지역가입자 건보료 상승분 반영 (소득점수 기준 약 7% 추산)
 */

const CONST = {
    EXP_RATE: 0.641,        // 단순경비율 (소득률 35.9%)
    HEALTH_RATE: 0.0709,    // 건보료율 약 7.09%
    ISA_LIMIT: 38000000,    // ISA 서민형 기준
    HEALTH_LIMIT: 20000000, // 직장인 건보료 부과 기준
    DEP_LIMIT: 5000000,     // 피부양자 사업소득 기준
    TAX_SAFE_LIMIT: 24000000, // [수정] 대표님 기준: 2,400만 원 초과 시 고세율
    WITHHOLD_RATE: 0.033    // 원천징수 3.3%
};

function getEmpDeduction(salary) {
    const s = salary / 10000;
    if (s <= 500) return salary * 0.7;
    if (s <= 1500) return 3500000 + (salary - 5000000) * 0.4;
    if (s <= 4500) return 7500000 + (salary - 15000000) * 0.15;
    return 12000000 + (salary - 45000000) * 0.05;
}

function fMan(num) {
    if (isNaN(num)) return '0';
    return Math.round(num / 10000).toLocaleString() + '만';
}

function fTax(num) {
    if (isNaN(num)) return '0';
    const manwon = num / 10000;
    return manwon.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '만';
}

function addRow(data = {}) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    const row = document.createElement('tr');
    
    const d_existing = data.existingIncome || 0;
    const d_biz = data.businessIncome || 0;
    const d_add = data.additionalAmount || 0;

    row.innerHTML = `
        <td><input type="text" class="name-in" value="${data.name || ''}" placeholder="이름"></td>
        <td>
            <select class="type-sel">
                <option value="간이사업자" ${data.incomeType === '간이사업자' ? 'selected' : ''}>간이사업자</option>
                <option value="피부양자" ${data.incomeType === '피부양자' ? 'selected' : ''}>피부양자</option>
                <option value="4대보험" ${data.incomeType === '4대보험' ? 'selected' : ''}>4대보험</option>
            </select>
        </td>
        <td><input type="text" class="existing-in" value="${(d_existing/10000).toLocaleString()}" data-value="${d_existing}"></td>
        <td><input type="text" class="biz-in" value="${(d_biz/10000).toLocaleString()}" data-value="${d_biz}"></td>
        <td><input type="text" class="add-in" value="${(d_add/10000).toLocaleString()}" data-value="${d_add}"></td>
        <td class="res-biz-a calculated-cell">0</td>
        <td class="res-comb-b calculated-cell">0</td>
        <td class="res-isa calculated-cell">-</td>
        <td class="res-health calculated-cell">-</td>
        <td class="res-tax calculated-cell">0</td>
        <td class="res-net calculated-cell">0</td>
        <td><button class="btn btn-danger delete-row">삭제</button></td>
    `;
    
    tbody.appendChild(row);
    bindEvents(row);
    updateRow(row);
    updateTotal();
}

function bindEvents(row) {
    const inputs = row.querySelectorAll('input[type="text"]:not(.name-in)');
    inputs.forEach(input => {
        input.addEventListener('input', function() {
            const val = parseInt(this.value.replace(/[^0-9]/g, '')) || 0;
            this.dataset.value = val * 10000;
            updateRow(row);
            updateTotal();
        });
        input.addEventListener('blur', function() {
            const val = parseInt(this.dataset.value || 0) / 10000;
            this.value = val > 0 ? val.toLocaleString() : '';
        });
    });
    row.querySelector('.type-sel').addEventListener('change', () => { updateRow(row); updateTotal(); });
    row.querySelector('.delete-row').addEventListener('click', () => { row.remove(); updateTotal(); });
}

function updateRow(row) {
    const existing = parseFloat(row.querySelector('.existing-in').dataset.value || 0);
    const bizIn = parseFloat(row.querySelector('.biz-in').dataset.value || 0);
    const addIn = parseFloat(row.querySelector('.add-in').dataset.value || 0);
    const type = row.querySelector('.type-sel').value;

    const addBizA = addIn * (1 - CONST.EXP_RATE);
    let bizA = bizIn + addBizA;
    if (type === '피부양자') bizA += existing * (1 - CONST.EXP_RATE);

    let combB = (type === '4대보험') ? (existing - getEmpDeduction(existing)) + bizA : existing + bizA;

    const setCell = (cls, html, className = '') => {
        const cell = row.querySelector('.' + cls);
        if (cell) { cell.innerHTML = html; cell.className = `calculated-cell ${cls} ${className}`; }
    };

    setCell('res-biz-a', fMan(bizA));
    setCell('res-comb-b', fMan(combB));

    // 1. ISA 판정
    if (combB <= CONST.ISA_LIMIT) setCell('res-isa', `안전<br><small>여유:${fMan(CONST.ISA_LIMIT-combB)}</small>`, 'safe-cell');
    else setCell('res-isa', `일반형전환<br><small>초과:${fMan(combB-CONST.ISA_LIMIT)}</small>`, 'warning-cell');

    // 2. 건보료 판정 (간이사업자 지역건보료 상승분 로직 추가)
    let monthHealth = 0;
    if (type === '4대보험') {
        const extra = bizIn + addIn;
        if (extra > CONST.HEALTH_LIMIT) {
            monthHealth = (extra - CONST.HEALTH_LIMIT) * CONST.HEALTH_RATE / 12;
            setCell('res-health', `${fTax(monthHealth)}↑<br><small>초과:${fMan(extra-20000000)}</small>`, 'warning-cell');
        } else setCell('res-health', `안전<br><small>여유:${fMan(20000000-extra)}</small>`, 'safe-cell');
    } else if (type === '피부양자') {
        if (bizA > CONST.DEP_LIMIT) setCell('res-health', `탈락(지역가입)<br><small>사업소득초과</small>`, 'danger-cell');
        else setCell('res-health', `안전<br><small>여유:${fMan(5000000-bizA)}</small>`, 'safe-cell');
    } else if (type === '간이사업자') {
        // [수정] 지역가입자 보험료는 소득금액(A)의 약 7%가 추가된다고 보수적 계산
        monthHealth = bizA * CONST.HEALTH_RATE / 12;
        setCell('res-health', `${fTax(monthHealth)}↑<br><small>지역건보료 예상상승</small>`, 'warning-cell');
    }

    // 3. 소득세 (대표님 기준 2,400만 원 초과 시 24% 적용)
    const taxRate = combB > CONST.TAX_SAFE_LIMIT ? 0.24 : 0.15;
    const addTax = (addBizA * taxRate) - (addIn * CONST.WITHHOLD_RATE);
    setCell('res-tax', `${fTax(addTax)}<br><small>${Math.round(taxRate*100)}%구간</small>`, addTax > 0 ? 'warning-cell' : 'safe-cell');

    const net = bizIn + addIn - (monthHealth * 12) - addTax;
    setCell('res-net', fMan(net));

    row.dataset.sum_add = addIn; row.dataset.sum_biz_in = bizIn; row.dataset.sum_biz_a = bizA;
    row.dataset.sum_comb_b = combB; row.dataset.sum_health = monthHealth * 12;
    row.dataset.sum_tax = addTax; row.dataset.sum_net = net;
}

function updateTotal() {
    const rows = document.querySelectorAll('#tableBody tr');
    let s = { add:0, bizIn:0, bizA:0, comb:0, health:0, tax:0, net:0 };
    rows.forEach(r => {
        s.add += parseFloat(r.dataset.sum_add || 0); s.bizIn += parseFloat(r.dataset.sum_biz_in || 0);
        s.bizA += parseFloat(r.dataset.sum_biz_a || 0); s.comb += parseFloat(r.dataset.sum_comb_b || 0);
        s.health += parseFloat(r.dataset.sum_health || 0); s.tax += parseFloat(r.dataset.sum_tax || 0);
        s.net += parseFloat(r.dataset.sum_net || 0);
    });

    const setTotal = (id, value, isTax = false) => {
        const el = document.getElementById(id);
        if (el) el.textContent = isTax ? fTax(value) : fMan(value);
    };

    setTotal('totalAdditional', s.add);
    setTotal('totalBusinessIncomeInput', s.bizIn);
    setTotal('totalBusinessIncome', s.bizA);
    setTotal('totalCombinedIncome', s.comb);
    setTotal('totalHealthInsurance', s.health);
    setTotal('totalAdditionalTax', s.tax, true);
    setTotal('totalNetIncome', s.net);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('addRowBtn').addEventListener('click', () => addRow());
    document.getElementById('resetBtn').addEventListener('click', () => {
        if(confirm('초기화하시겠습니까?')) { document.getElementById('tableBody').innerHTML = ''; updateTotal(); }
    });
    const initData = [
        { name: '상희', incomeType: '간이사업자', existingIncome: 5000000, businessIncome: 0, additionalAmount: 15000000 },
        { name: '영지', incomeType: '피부양자', existingIncome: 10000000, businessIncome: 0, additionalAmount: 3900000 },
        { name: '진영', incomeType: '4대보험', existingIncome: 42000000, businessIncome: 0, additionalAmount: 19500000 },
        { name: '와이프', incomeType: '4대보험', existingIncome: 24000000, businessIncome: 0, additionalAmount: 21000000 }
    ];
    initData.forEach(d => addRow(d));
});
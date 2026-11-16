// Все расчёты по объекту: вложения, план/факт, прогноз прибыли, распределение, взаиморасчёт.

const CATEGORIES = [
  'Покупка',
  'Ремонт',
  'Мебель и техника',
  'Нотариус и регистрация',
  'Налоги',
  'Риелтор',
  'Содержание',
  'Прочее'
];

const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round2 = (v) => Math.round(v * 100) / 100;

function computeObject(object, members, entries) {
  const invested = {};
  for (const m of members) invested[m.user_id] = 0;

  let totalIn = 0;
  let poolSpent = 0;
  let factTotal = 0;
  let planTotal = 0;
  const cats = {};
  const catOf = (c) => {
    const key = c || 'Прочее';
    if (!cats[key]) cats[key] = { category: key, plan: 0, fact: 0 };
    return cats[key];
  };

  for (const e of entries) {
    const amount = n(e.amount);
    const uid = e.user_id;
    if (invested[uid] === undefined) invested[uid] = 0;
    if (e.kind === 'in') {
      totalIn += amount;
      invested[uid] += amount;
    } else if (e.kind === 'out') {
      factTotal += amount;
      catOf(e.category).fact += amount;
      if (e.source === 'pool') poolSpent += amount;
      else invested[uid] += amount;
    } else if (e.kind === 'plan') {
      planTotal += amount;
      catOf(e.category).plan += amount;
    }
  }

  const categories = Object.values(cats).sort(
    (a, b) => idx(a.category) - idx(b.category)
  );
  const forecastCosts = categories.reduce((s, c) => s + Math.max(c.plan, c.fact), 0);
  const salePrice = object.sale_price === null || object.sale_price === undefined ? null : n(object.sale_price);
  const profit = salePrice === null ? null : salePrice - forecastCosts;
  const totalInvested = Object.values(invested).reduce((s, v) => s + v, 0);

  // Распределение прибыли: сначала прораб(ы), остаток — инвесторам по долям.
  const investors = members.filter((m) => m.role === 'investor');
  const foremen = members.filter((m) => m.role === 'foreman');
  const shareSum = investors.reduce((s, m) => s + n(m.share_pct), 0);
  const payout = {};
  let foremanTotal = 0;
  if (profit !== null) {
    for (const f of foremen) {
      let v = 0;
      if (profit > 0) {
        if (f.foreman_mode === 'pct') v = (profit * n(f.foreman_value)) / 100;
        else if (f.foreman_mode === 'fix') v = n(f.foreman_value);
      }
      v = Math.max(0, Math.min(v, profit - foremanTotal));
      payout[f.user_id] = round2(v);
      foremanTotal += v;
    }
    const rest = profit - foremanTotal;
    for (const m of investors) {
      payout[m.user_id] = shareSum > 0 ? round2((rest * n(m.share_pct)) / shareSum) : 0;
    }
  }

  // Взаиморасчёт: все вложенные деньги делятся между инвесторами по долям.
  // Кто вложил больше своей доли — получает, кто меньше — доплачивает.
  const settlement = [];
  if (shareSum > 0 && totalInvested > 0) {
    const bal = [];
    for (const m of members) {
      const target = m.role === 'investor' ? (totalInvested * n(m.share_pct)) / shareSum : 0;
      const diff = round2((invested[m.user_id] || 0) - target);
      if (Math.abs(diff) >= 1) bal.push({ user_id: m.user_id, diff });
    }
    const debtors = bal.filter((b) => b.diff < 0).map((b) => ({ ...b, diff: -b.diff }));
    const creditors = bal.filter((b) => b.diff > 0);
    debtors.sort((a, b) => b.diff - a.diff);
    creditors.sort((a, b) => b.diff - a.diff);
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(debtors[i].diff, creditors[j].diff);
      if (amt >= 1) settlement.push({ from: debtors[i].user_id, to: creditors[j].user_id, amount: round2(amt) });
      debtors[i].diff -= amt;
      creditors[j].diff -= amt;
      if (debtors[i].diff < 1) i++;
      if (creditors[j].diff < 1) j++;
    }
  }

  return {
    invested,
    totalIn: round2(totalIn),
    totalInvested: round2(totalInvested),
    poolBalance: round2(totalIn - poolSpent),
    factTotal: round2(factTotal),
    planTotal: round2(planTotal),
    categories,
    forecastCosts: round2(forecastCosts),
    salePrice,
    profit: profit === null ? null : round2(profit),
    roi: profit !== null && forecastCosts > 0 ? round2((profit / forecastCosts) * 100) : null,
    payout,
    shareSum: round2(shareSum),
    settlement
  };
}

function idx(c) {
  const i = CATEGORIES.indexOf(c);
  return i === -1 ? 99 : i;
}

module.exports = { computeObject, CATEGORIES };

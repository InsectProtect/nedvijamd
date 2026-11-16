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

function computeObject(object, members, entries, advances = []) {
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

  let rentTotal = 0;
  const rentHeld = {};
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
    } else if (e.kind === 'rent') {
      rentTotal += amount;
      rentHeld[uid] = (rentHeld[uid] || 0) + amount;
    }
  }

  // Стоимость покупки и бюджет ремонта из карточки объекта — это план по статьям «Покупка» и «Ремонт»
  for (const [cat, value] of [['Покупка', n(object.purchase_price)], ['Ремонт', n(object.repair_budget)]]) {
    if (value > 0) {
      const c = catOf(cat);
      if (value > c.plan) {
        planTotal += value - c.plan;
        c.plan = value;
      }
    }
  }

  // Аванс покупателя: если покупатель отказался и аванс остался — это доход.
  // Деньги на руках у того, кто получил аванс — во взаиморасчёте он делится ими с остальными по долям.
  let advanceKept = 0;
  let advanceActive = 0;
  const heldCash = { ...rentHeld };
  // Старые «взносы» (без общего котла) считаем деньгами у создателя объекта
  if (totalIn > 0 && object.creator_id !== undefined && object.creator_id !== null) {
    heldCash[Number(object.creator_id)] = (heldCash[Number(object.creator_id)] || 0) + totalIn;
  }
  for (const a of advances) {
    const amount = n(a.amount);
    if (a.status === 'kept') {
      advanceKept += amount;
      heldCash[a.user_id] = (heldCash[a.user_id] || 0) + amount;
    } else if (a.status === 'active') advanceActive += amount;
  }

  const categories = Object.values(cats).sort(
    (a, b) => idx(a.category) - idx(b.category)
  );
  const forecastCosts = categories.reduce((s, c) => s + Math.max(c.plan, c.fact), 0);
  // Сделка закрыта — считаем по фактической цене и фактическим затратам, иначе — прогноз.
  const closed = object.sold_price !== null && object.sold_price !== undefined && object.sold_price !== '';
  const salePrice = closed ? n(object.sold_price) : object.sale_price === null || object.sale_price === undefined ? null : n(object.sale_price);
  const income = advanceKept + rentTotal;
  const profit = salePrice === null ? null : salePrice - (closed ? factTotal : forecastCosts) + income;
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

  // Взаиморасчёт: все вложенные деньги (минус аванс, оставшийся на руках) делятся между инвесторами по долям.
  // Кто вложил больше своей доли — получает, кто меньше — доплачивает.
  const settlement = [];
  const net = (uid) => (invested[uid] || 0) - (heldCash[uid] || 0);
  const totalNet = totalInvested - Object.values(heldCash).reduce((x, v) => x + v, 0);
  if (!closed && shareSum > 0 && (totalInvested > 0 || advanceKept > 0 || rentTotal > 0)) {
    const bal = [];
    for (const m of members) {
      const target = m.role === 'investor' ? (totalNet * n(m.share_pct)) / shareSum : 0;
      const diff = round2(net(m.user_id) - target);
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

  // Закрытие сделки: у каждого должно остаться «вложил + его прибыль».
  // Сейчас на руках: аванс/аренда у получивших, деньги от покупателя — у receiver.
  let closing = null;
  if (closed && profit !== null) {
    const receiver = object.sold_receiver_id === null || object.sold_receiver_id === undefined ? null : Number(object.sold_receiver_id);
    const rows = members.filter((m) => m.role !== 'viewer').map((m) => {
      const uid = Number(m.user_id);
      const target = (invested[uid] || 0) + (payout[uid] || 0);
      const cash = (heldCash[uid] || 0) + (receiver === uid ? salePrice : 0);
      return { user_id: uid, invested: round2(invested[uid] || 0), profit: round2(payout[uid] || 0), total: round2(target), cash: round2(cash), diff: round2(cash - target) };
    });
    const payers = rows.filter((r) => r.diff >= 1).map((r) => ({ ...r }));
    const takers = rows.filter((r) => r.diff <= -1).map((r) => ({ ...r, diff: -r.diff }));
    payers.sort((x, y) => y.diff - x.diff);
    takers.sort((x, y) => y.diff - x.diff);
    const transfers = [];
    let i = 0;
    let j = 0;
    while (i < payers.length && j < takers.length) {
      const amt = Math.min(payers[i].diff, takers[j].diff);
      if (amt >= 1) transfers.push({ from: payers[i].user_id, to: takers[j].user_id, amount: round2(amt) });
      payers[i].diff -= amt;
      takers[j].diff -= amt;
      if (payers[i].diff < 1) i++;
      if (takers[j].diff < 1) j++;
    }
    closing = { rows, transfers, receiver };
  }

  return {
    invested,
    totalIn: round2(totalIn),
    totalInvested: round2(totalInvested),
    poolBalance: round2(totalIn - poolSpent),
    factTotal: round2(factTotal),
    planTotal: round2(planTotal),
    advanceKept: round2(advanceKept),
    rentTotal: round2(rentTotal),
    closed,
    closing,
    advanceActive: round2(advanceActive),
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

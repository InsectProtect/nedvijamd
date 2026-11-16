// Отчёт по объекту для партнёров и бухгалтера (RU / RO), готов к печати и PDF.

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (v) => `${Math.round(Number(v) || 0).toLocaleString('ru-RU').replace(/\s/g, ' ')} €`;
const sgn = (v) => `${Number(v) >= 0 ? '+' : '−'}${eur(Math.abs(Number(v) || 0))}`;
const pct = (v) => `${String(Math.round(Number(v) * 10) / 10).replace('.', ',')} %`;
const dmy = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };

const T = {
  ru: {
    title: 'Отчёт по объекту', asOf: 'по состоянию на', summary: 'Итоги', invested: 'Вложено участниками', fact: 'Затраты · факт', plan: 'Затраты · план',
    sale: 'Цена продажи (прогноз)', sold: 'Продано за', profit: 'Прибыль', rent: 'Доход от аренды', advKept: 'Аванс, оставшийся у нас', advActive: 'Действующий аванс',
    members: 'Участники и доли', name: 'Участник', role: 'Роль', share: 'Доля', inv: 'Вложил', pay: 'Прибыль', categories: 'План и факт по статьям', cat: 'Статья',
    planC: 'План', factC: 'Факт', diff: 'Разница', ops: 'Операции', date: 'Дата', who: 'Кто', type: 'Тип', note: 'Комментарий', amount: 'Сумма', receipts: 'Чеки',
    out: 'Расход', rentT: 'Аренда', inT: 'Взнос', planT: 'План', settlement: 'Взаиморасчёт', closing: 'Итоговые выплаты по сделке', paid: 'выплачено', notPaid: 'не выплачено',
    installment: 'Рассрочка', paidI: 'Выплачено', left: 'Осталось', total: 'Всего', advances: 'Авансы покупателей', buyer: 'Покупатель', until: 'До', status: 'Статус',
    st: { active: 'действует', applied: 'зачтён в цену', kept: 'остался у нас', returned: 'возвращён' },
    roles: { investor: 'инвестор', foreman: 'прораб', viewer: 'просмотр' }, foremanPct: 'от прибыли', print: 'Распечатать / PDF', none: 'нет',
    gen: 'Сформировано в приложении «Доля»'
  },
  ro: {
    title: 'Raport pe obiect', asOf: 'la data de', summary: 'Rezultate', invested: 'Investit de participanți', fact: 'Costuri · real', plan: 'Costuri · plan',
    sale: 'Prețul de vânzare (prognoză)', sold: 'Vândut cu', profit: 'Profit', rent: 'Venit din chirie', advKept: 'Avans rămas la noi', advActive: 'Avans activ',
    members: 'Participanți și cote', name: 'Participant', role: 'Rol', share: 'Cota', inv: 'A investit', pay: 'Profit', categories: 'Plan și real pe categorii', cat: 'Categorie',
    planC: 'Plan', factC: 'Real', diff: 'Diferență', ops: 'Operațiuni', date: 'Data', who: 'Cine', type: 'Tip', note: 'Comentariu', amount: 'Suma', receipts: 'Bonuri',
    out: 'Cheltuială', rentT: 'Chirie', inT: 'Contribuție', planT: 'Plan', settlement: 'Decontare', closing: 'Plăți finale pe tranzacție', paid: 'achitat', notPaid: 'neachitat',
    installment: 'Rate', paidI: 'Achitat', left: 'Rămas', total: 'Total', advances: 'Avansuri de la cumpărători', buyer: 'Cumpărător', until: 'Până la', status: 'Statut',
    st: { active: 'activ', applied: 'inclus în preț', kept: 'rămas la noi', returned: 'returnat' },
    roles: { investor: 'investitor', foreman: 'diriginte de șantier', viewer: 'vizualizare' }, foremanPct: 'din profit', print: 'Tipărește / PDF', none: 'nu',
    gen: 'Generat în aplicația «Dolya»'
  }
};
const CAT_RO = { 'Покупка': 'Cumpărare', 'Ремонт': 'Reparație', 'Мебель и техника': 'Mobilă și tehnică', 'Нотариус и регистрация': 'Notar și înregistrare', 'Налоги': 'Impozite', 'Риелтор': 'Agent imobiliar', 'Содержание': 'Întreținere', 'Прочее': 'Altele' };

function buildReport({ object, members, entries, advances, calc, installment, deal, lang = 'ru', printable = false }) {
  const t = T[lang === 'ro' ? 'ro' : 'ru'];
  const cat = (c) => (lang === 'ro' ? CAT_RO[c] || c : c);
  const today = new Date().toISOString().slice(0, 10);
  const kv = (k, v, cls = '') => `<tr><td>${k}</td><td class="r ${cls}">${v}</td></tr>`;
  const memberRows = members.map((m) => `<tr><td>${esc(m.name)}</td><td>${t.roles[m.role]}</td>
    <td class="r">${m.role === 'investor' ? pct(m.share_pct) : m.role === 'foreman' ? (m.foreman_mode === 'pct' ? `${pct(m.foreman_value)} ${t.foremanPct}` : m.foreman_mode === 'fix' ? eur(m.foreman_value) : '—') : '—'}</td>
    <td class="r">${eur(m.invested)}</td><td class="r">${m.payout === null || m.payout === undefined ? '—' : sgn(m.payout)}</td></tr>`).join('');
  const catRows = calc.categories.map((c) => `<tr><td>${esc(cat(c.category))}</td><td class="r">${eur(c.plan)}</td><td class="r">${eur(c.fact)}</td><td class="r ${c.fact > c.plan && c.plan ? 'neg' : ''}">${c.plan ? sgn(c.plan - c.fact) : '—'}</td></tr>`).join('');
  const kindT = { out: t.out, rent: t.rentT, in: t.inT, plan: t.planT };
  const opRows = entries.map((e) => `<tr><td>${dmy(e.entry_date)}</td><td>${esc(e.author)}</td><td>${kindT[e.kind]}${e.category ? ` · ${esc(cat(e.category))}` : ''}</td><td>${esc(e.note || '')}</td>
    <td class="r ${e.kind === 'rent' ? 'pos' : ''}">${e.kind === 'rent' ? '+' : e.kind === 'out' ? '−' : ''}${eur(e.amount)}${e.orig_currency === 'MDL' ? `<div class="small">${Math.round(e.orig_amount).toLocaleString('ru-RU')} lei</div>` : ''}</td><td class="r">${Number(e.receipts) || ''}</td></tr>`).join('');
  const advRows = advances.map((a) => `<tr><td>${dmy(a.received_date)}</td><td>${esc(a.author)}</td><td>${esc(a.buyer || '')}</td><td>${dmy(a.valid_until)}</td><td>${t.st[a.status]}</td><td class="r">${eur(a.amount)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title} — ${esc(object.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #E9E7E1; color: #1A1A1A; font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 10pt; line-height: 1.4; }
  .bar { position: sticky; top: 0; display: flex; justify-content: center; padding: 12px; background: #0D0D0E; z-index: 2; }
  .bar button { height: 44px; padding: 0 20px; border-radius: 22px; border: none; background: #D4BF94; color: #0D0D0E; font: 600 15px Inter, system-ui, sans-serif; cursor: pointer; }
  .paper { max-width: 900px; margin: 20px auto; background: #fff; padding: 36px 40px; box-shadow: 0 10px 40px rgba(0,0,0,.12); }
  h1 { font-size: 17pt; margin: 0; letter-spacing: -.01em; }
  .sub { color: #666; margin: 4px 0 16px; }
  h2 { font-size: 11.5pt; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #D4BF94; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #E6E3DC; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #777; font-weight: 600; }
  td.r, th.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .neg { color: #B4532A; } .pos { color: #1F7A3E; } .small { font-size: 8pt; color: #888; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  .big td { font-size: 11pt; } .big tr:last-child td { font-weight: 700; }
  .note { font-size: 8.5pt; color: #888; margin-top: 18px; }
  @media (max-width: 640px) { .paper { padding: 18px 12px; margin: 0; } .grid { grid-template-columns: 1fr; } th, td { padding: 4px 3px; } body { font-size: 9.5pt; } th { font-size: 7pt; letter-spacing: 0; } td.r { font-size: 8.5pt; } .wrap { overflow-x: auto; } }
  @media print { body { background: #fff; } .bar { display: none; } .paper { box-shadow: none; margin: 0; padding: 0; max-width: none; } tr { break-inside: avoid; } h2 { break-after: avoid; } }
</style>
</head>
<body>
${printable ? `<div class="bar"><button onclick="window.print()">${t.print}</button>${typeof printable === 'string' ? ` <a href="${printable}" style="display:inline-flex;align-items:center;height:44px;padding:0 20px;border-radius:22px;border:1px solid #D4BF94;color:#D4BF94;font:600 15px Inter,system-ui,sans-serif;text-decoration:none;margin-left:8px">Excel</a>` : ''}</div>` : ''}
<div class="paper contract">
  <h1>${t.title}: ${esc(object.name)}</h1>
  <div class="sub">${object.area ? `${String(object.area).replace('.', ',')} m² · ` : ''}${t.asOf} ${dmy(today)}</div>
  <div class="grid">
    <div><h2>${t.summary}</h2><table class="big">
      ${kv(t.invested, eur(calc.totalInvested))}
      ${kv(t.fact, eur(calc.factTotal))}
      ${kv(t.plan, eur(calc.planTotal))}
      ${calc.rentTotal ? kv(t.rent, sgn(calc.rentTotal), 'pos') : ''}
      ${calc.advanceKept ? kv(t.advKept, sgn(calc.advanceKept), 'pos') : ''}
      ${calc.advanceActive ? kv(t.advActive, eur(calc.advanceActive)) : ''}
      ${calc.salePrice !== null ? kv(calc.closed ? t.sold : t.sale, eur(calc.salePrice)) : ''}
      ${calc.profit !== null ? kv(t.profit, sgn(calc.profit), calc.profit >= 0 ? 'pos' : 'neg') : ''}
    </table></div>
    ${installment ? `<div><h2>${t.installment}</h2><table class="big">${kv(t.paidI, eur(installment.paid))}${kv(t.left, eur(installment.left))}${kv(t.total, eur(installment.total))}</table></div>` : '<div></div>'}
  </div>
  <h2>${t.members}</h2>
  <div class="wrap"><table><thead><tr><th>${t.name}</th><th>${t.role}</th><th class="r">${t.share}</th><th class="r">${t.inv}</th><th class="r">${t.pay}</th></tr></thead><tbody>${memberRows}</tbody></table></div>
  ${deal && deal.transfers.length ? `<h2>${t.closing}</h2><div class="wrap"><table><tbody>${deal.transfers.map((x) => `<tr><td>${esc(x.fromName)} → ${esc(x.toName)}</td><td class="r">${eur(x.amount)}</td><td class="r ${x.paid_at ? 'pos' : 'neg'}">${x.paid_at ? t.paid : t.notPaid}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${!calc.closed && calc.settlement.length ? `<h2>${t.settlement}</h2><div class="wrap"><table><tbody>${calc.settlement.map((x) => `<tr><td>${esc(x.fromName)} → ${esc(x.toName)}</td><td class="r">${eur(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${catRows ? `<h2>${t.categories}</h2><div class="wrap"><table><thead><tr><th>${t.cat}</th><th class="r">${t.planC}</th><th class="r">${t.factC}</th><th class="r">${t.diff}</th></tr></thead><tbody>${catRows}</tbody></table></div>` : ''}
  ${advRows ? `<h2>${t.advances}</h2><div class="wrap"><table><thead><tr><th>${t.date}</th><th>${t.who}</th><th>${t.buyer}</th><th>${t.until}</th><th>${t.status}</th><th class="r">${t.amount}</th></tr></thead><tbody>${advRows}</tbody></table></div>` : ''}
  <h2>${t.ops} · ${entries.length}</h2>
  <div class="wrap"><table><thead><tr><th>${t.date}</th><th>${t.who}</th><th>${t.type}</th><th>${t.note}</th><th class="r">${t.amount}</th><th class="r">${t.receipts}</th></tr></thead><tbody>${opRows || `<tr><td colspan="6">${t.none}</td></tr>`}</tbody></table></div>
  <div class="note">${t.gen} · ${dmy(today)}</div>
</div>
</body>
</html>`;
}

module.exports = { buildReport, CAT_RO };

// Acord de investiție comună (RO): снимок данных объекта → HTML договора с подписями.
const crypto = require('crypto');

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (v) => `${Math.round(Number(v) || 0).toLocaleString('ro-RO').replace(/\./g, ' ')} €`;
const pct = (v) => `${String(Math.round(Number(v) * 100) / 100).replace('.', ',')} %`;
const blank = (w = 160) => `<span class="blank" style="min-width:${w}px"></span>`;
const val = (v, w) => (v !== undefined && v !== null && String(v).trim() !== '' ? `<b>${esc(v)}</b>` : blank(w));
const dmy = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const dmyhm = (iso) => {
  const d = new Date(new Date(iso).getTime() + 2 * 3600 * 1000); // время Молдовы (UTC+2)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// Снимок: всё, что попадает в текст договора
function makeSnapshot({ object, members, calc, installment, repair }) {
  const parties = members
    .filter((m) => m.role === 'investor' || m.role === 'foreman')
    .map((m) => ({
      user_id: Number(m.user_id),
      name: m.name,
      role: m.role,
      share_pct: Number(m.share_pct) || 0,
      foreman_mode: m.foreman_mode,
      foreman_value: Number(m.foreman_value) || 0,
      invested: (calc.invested && calc.invested[m.user_id]) || 0
    }));
  return {
    date: new Date().toISOString(),
    object: {
      id: Number(object.id),
      name: object.name,
      area: object.area === null || object.area === undefined ? null : Number(object.area),
      purchase_price: object.purchase_price === null || object.purchase_price === undefined ? null : Number(object.purchase_price),
      sale_price: object.sale_price === null || object.sale_price === undefined ? null : Number(object.sale_price)
    },
    fields: object.contract_fields || {},
    parties,
    installment: installment || null,
    repair: repair || null
  };
}

// Отпечаток условий договора (без дат и текущих сумм вложений) — чтобы понять, изменились ли условия
function termsHash(snap) {
  const terms = {
    object: snap.object,
    fields: snap.fields,
    parties: snap.parties.map(({ invested, ...p }) => p),
    installment: snap.installment ? { total: snap.installment.total, monthly: snap.installment.monthly } : null,
    repair: snap.repair ? { budget: snap.repair.budget } : null
  };
  return crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex');
}

function buildContract(snap, { signatures = {}, details = {}, printable = false, draft = false } = {}) {
  const f = snap.fields || {};
  const o = snap.object;
  const parties = snap.parties;
  const investors = parties.filter((m) => m.role === 'investor');
  const foremen = parties.filter((m) => m.role === 'foreman');
  const shareSum = investors.reduce((s, m) => s + Number(m.share_pct || 0), 0);
  const asOf = dmy(snap.date);
  const contractDate = f.contract_date ? dmy(f.contract_date) : asOf;
  const repair = snap.repair;
  const inst = snap.installment;
  const info = (uid) => signatures[uid] || details[uid] || {};
  const owner = f.owner_user_id ? parties.find((p) => p.user_id === Number(f.owner_user_id)) : null;
  const ownerName = owner ? owner.name : f.owner_name;

  const partyList = parties.map((m, i) => `
    <p><b>${i + 1}. ${esc(m.name)}</b>${(details[m.user_id] || {}).birth_date ? `, născut(ă) la <b>${dmy(details[m.user_id].birth_date)}</b>` : ''}, IDNP ${val(info(m.user_id).idnp, 150)}, domiciliat(ă) în ${val(info(m.user_id).address, 240)},
    în calitate de <b>${m.role === 'investor' ? 'Investitor' : 'Diriginte de șantier'}</b>,</p>`).join('');

  const investorRows = investors.map((m) => `
    <tr><td>${esc(m.name)}</td><td class="r">${pct(m.share_pct)}</td><td class="r">${eur(m.invested)}</td></tr>`).join('');

  const foremanClauses = foremen.map((fm, i) => {
    const reward = fm.foreman_mode === 'pct'
      ? `o cotă de <b>${pct(fm.foreman_value)}</b> din profitul net obținut din vânzarea Obiectului`
      : fm.foreman_mode === 'fix'
        ? `o sumă fixă de <b>${eur(fm.foreman_value)}</b> din profitul net obținut din vânzarea Obiectului (dar nu mai mult decât profitul net)`
        : 'nicio cotă din profit; activitatea sa se remunerează separat, în baza unei înțelegeri distincte';
    return `<p>2.${4 + i}. <b>${esc(fm.name)}</b>, în calitate de diriginte de șantier, organizează și răspunde de efectuarea lucrărilor de reparație ale Obiectului, de calitatea, termenele și costul acestora${repair && repair.budget ? `, cu respectarea bugetului estimativ de <b>${eur(repair.budget)}</b>` : ''}. Dirigintele de șantier prezintă documente justificative pentru toate cheltuielile efectuate. Pentru această activitate primește ${reward}.</p>`;
  }).join('');

  const installmentText = inst
    ? `<p>1.3. Obiectul se procură în rate, în baza contractului nr. ${val(f.installment_no, 80)} din ${f.installment_date ? `<b>${dmy(f.installment_date)}</b>` : blank(110)}, la prețul total de <b>${eur(inst.total)}</b>${inst.monthly ? `, cu rata lunară de <b>${eur(inst.monthly)}</b>` : ''}. La data de ${asOf} s-au achitat <b>${eur(inst.paid)}</b>, rămânând de achitat <b>${eur(inst.left)}</b>. Ratele se achită de Părți proporțional cu cotele lor, dacă Părțile nu convin altfel în scris.</p>`
    : `<p>1.3. Prețul de cumpărare al Obiectului constituie ${o.purchase_price ? `<b>${eur(o.purchase_price)}</b>` : blank(120)}.</p>`;

  const signRows = parties.map((m) => {
    const s = signatures[m.user_id];
    return `<tr class="${s ? 'signed' : ''}"><td>${esc(m.name)}</td><td>${m.role === 'investor' ? 'Investitor' : 'Diriginte de șantier'}</td>
      <td class="sign">${s ? `<img src="data:image/png;base64,${s.image}" alt="Semnătura ${esc(m.name)}"><div class="stamp">✓ semnat electronic în aplicația «Dolya» la ${dmyhm(s.signed_at)}</div>` : ''}</td>
      <td class="sign small">${s ? dmy(s.signed_at) : ''}</td></tr>`;
  }).join('');

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acord de investiție comună — ${esc(o.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #E9E7E1; color: #1A1A1A; font-family: 'Times New Roman', Times, Georgia, serif; font-size: 12.5pt; line-height: 1.5; }
  .bar { position: sticky; top: 0; display: flex; gap: 10px; justify-content: center; padding: 12px; background: #0D0D0E; z-index: 2; }
  .bar button { height: 44px; padding: 0 20px; border-radius: 22px; border: none; background: #D4BF94; color: #0D0D0E; font: 600 15px Inter, system-ui, sans-serif; cursor: pointer; }
  .paper { max-width: 800px; margin: 20px auto; background: #fff; padding: 48px 56px; box-shadow: 0 10px 40px rgba(0,0,0,.12); position: relative; }
  .draft { position: absolute; top: 18px; right: 22px; font: 700 11px Inter, system-ui, sans-serif; letter-spacing: .12em; color: #B4532A; border: 1.5px solid #B4532A; padding: 3px 8px; border-radius: 4px; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; letter-spacing: .02em; }
  .sub { text-align: center; margin-bottom: 18px; }
  .meta { display: flex; justify-content: space-between; margin: 16px 0 20px; }
  h2 { font-size: 12.5pt; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .03em; }
  p { margin: 6px 0; text-align: justify; }
  ul { margin: 6px 0 6px 22px; padding: 0; }
  .blank { display: inline-block; border-bottom: 1px solid #555; height: 1.1em; vertical-align: bottom; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5pt; }
  th, td { border: 1px solid #888; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #F3F1EC; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.sign { width: 34%; height: 64px; }
  td.sign.small { width: 14%; }
  td.sign img { display: block; max-width: 100%; max-height: 56px; }
  tr.signed td { background: #F1F8F2; }
  .stamp { font: 600 8.5pt Inter, system-ui, sans-serif; color: #1F7A3E; margin-top: 2px; }
  .note { font-size: 10pt; color: #555; margin-top: 18px; }
  @media (max-width: 640px) { .paper { padding: 24px 18px; margin: 0; } body { font-size: 12pt; } p { text-align: left; } .meta { flex-wrap: wrap; gap: 8px; } }
  @media print { body { background: #fff; } .bar { display: none; } .paper { box-shadow: none; margin: 0; padding: 0; max-width: none; } h2 { break-after: avoid; } table, tr { break-inside: avoid; } }
</style>
</head>
<body>
${printable ? '<div class="bar"><button onclick="window.print()">Tipărește / Salvează PDF</button></div>' : ''}
<div class="paper contract">
  ${draft ? '<div class="draft">PROIECT</div>' : ''}
  <h1>ACORD DE INVESTIȚIE COMUNĂ</h1>
  <div class="sub">privind procurarea${repair ? ', reparația' : ''} și vânzarea bunului imobil «${esc(o.name)}»</div>
  <div class="meta"><span>nr. ${val(f.number, 60)}</span><span>${f.city ? `<b>${esc(f.city)}</b>` : `mun./or. ${blank(120)}`}</span><span>${draft && !f.contract_date ? `«${blank(30)}» ${blank(90)} 20${blank(30)}` : `<b>${contractDate}</b>`}</span></div>

  ${partyList}
  <p>denumite în continuare împreună «<b>Părțile</b>», iar fiecare separat «<b>Partea</b>», au încheiat prezentul Acord privind următoarele:</p>

  <h2>1. Obiectul Acordului</h2>
  <p>1.1. Părțile convin să investească în comun mijloace bănești în procurarea${repair ? ', reparația' : ''} și vânzarea ulterioară a bunului imobil: <b>«${esc(o.name)}»</b>${o.area ? `, cu suprafața de <b>${String(o.area).replace('.', ',')} m²</b>` : ''}, situat la adresa ${val(f.property_address, 260)}, număr cadastral ${val(f.cadastral, 160)} (în continuare — «<b>Obiectul</b>»), în scopul obținerii profitului.</p>
  <p>1.2. Dreptul de proprietate asupra Obiectului se înregistrează pe numele: ${val(ownerName, 240)}. Persoana pe numele căreia este înregistrat Obiectul îl deține în interesul tuturor Părților, proporțional cu cotele stabilite în prezentul Acord, și nu are dreptul să-l înstrăineze, gajeze sau greveze în alt mod fără acordul scris al tuturor Părților.</p>
  ${installmentText}
  ${o.sale_price ? `<p>1.4. Prețul estimativ de vânzare a Obiectului constituie <b>${eur(o.sale_price)}</b>. Prețul final de vânzare se stabilește conform pct. 4.1.</p>` : ''}

  <h2>2. Contribuțiile și cotele Părților</h2>
  <p>2.1. Cotele de participare ale investitorilor la profit și pierderi, precum și sumele investite de fiecare Parte la data de <b>${asOf}</b>, conform evidenței din aplicația «Dolya», sunt:</p>
  <table><thead><tr><th>Investitor</th><th class="r">Cota</th><th class="r">Investit la ${asOf}</th></tr></thead><tbody>${investorRows}</tbody></table>
  ${Math.abs(shareSum - 100) > 0.01 ? `<p><b>Atenție:</b> suma cotelor investitorilor constituie ${pct(shareSum)} și trebuie adusă la 100 % înainte de semnare.</p>` : ''}
  <p>2.2. Investitorii finanțează cheltuielile comune (prețul de cumpărare, reparația, impozitele, taxele notariale, întreținerea etc.) proporțional cu cotele lor. Sumele achitate de o Parte peste cota sa se compensează la decontarea finală conform pct. 4.2.</p>
  <p>2.3. Cotele pot fi modificate numai cu acordul scris al tuturor Părților, prin act adițional la prezentul Acord.</p>
  ${foremanClauses}
  ${repair && repair.budget && !foremen.length ? `<p>2.4. Bugetul estimativ al reparației constituie <b>${eur(repair.budget)}</b>.</p>` : ''}

  <h2>3. Evidența contribuțiilor și cheltuielilor</h2>
  <p>3.1. Toate contribuțiile și cheltuielile se înregistrează în aplicația «Dolya». Fiecare Parte înregistrează doar operațiunile proprii și atașează documentele justificative (bonuri fiscale, facturi, chitanțe, contracte).</p>
  <p>3.2. Părțile recunosc înregistrările din aplicația «Dolya», confirmate prin documente justificative, ca evidență a contribuțiilor și cheltuielilor fiecărei Părți. Ștergerea unei înregistrări se efectuează numai cu acordul tuturor Părților.</p>
  <p>3.3. Cheltuielile care depășesc bugetul estimativ al unei categorii cu mai mult de ${val(f.overrun_pct, 40)} % se efectuează numai cu acordul prealabil al tuturor investitorilor.</p>

  <h2>4. Vânzarea Obiectului și repartizarea profitului</h2>
  <p>4.1. Decizia privind vânzarea Obiectului, prețul minim și momentul vânzării se adoptă cu acordul tuturor investitorilor.</p>
  <p>4.2. Din suma obținută din vânzarea Obiectului se achită, în următoarea ordine:</p>
  <ul>
    <li>a) cheltuielile legate de vânzare (agent imobiliar, notar etc.) și impozitele aferente;</li>
    <li>b) restituirea către fiecare Parte a contribuțiilor efectuate, conform evidenței din pct. 3;</li>
    ${foremen.length ? '<li>c) cota dirigintelui de șantier, conform pct. 2.4;</li><li>d) profitul net rămas se repartizează între investitori proporțional cu cotele lor.</li>' : '<li>c) profitul net rămas se repartizează între investitori proporțional cu cotele lor.</li>'}
  </ul>
  <p>4.3. Pierderile se suportă de investitori proporțional cu cotele lor.</p>
  <p>4.4. Repartizarea mijloacelor se efectuează în termen de ${val(f.payout_days, 40)} zile lucrătoare de la primirea integrală a prețului de vânzare.</p>

  <h2>5. Drepturile și obligațiile Părților</h2>
  <ul>
    <li>să-și achite la timp partea din cheltuielile comune;</li>
    <li>să nu înstrăineze, gajeze sau greveze în alt mod Obiectul sau cota sa fără acordul scris al celorlalte Părți;</li>
    <li>să ofere celorlalte Părți acces la informațiile și documentele privind Obiectul;</li>
    <li>să înregistreze corect și la timp operațiunile proprii în aplicația «Dolya».</li>
  </ul>

  <h2>6. Ieșirea unei Părți din Acord</h2>
  <p>6.1. Partea care dorește să iasă din Acord notifică în scris celelalte Părți cu cel puțin 30 de zile înainte. Celelalte Părți au drept de preempțiune la procurarea cotei acesteia.</p>
  <p>6.2. Dacă Părțile nu convin altfel, contribuția Părții care iese se restituie după vânzarea Obiectului, conform pct. 4.2.</p>

  <h2>7. Soluționarea litigiilor</h2>
  <p>7.1. Litigiile se soluționează pe cale amiabilă, prin negocieri. În cazul neajungerii la un acord, litigiul se examinează de instanța de judecată competentă a Republicii Moldova, conform legislației Republicii Moldova.</p>

  <h2>8. Dispoziții finale</h2>
  <p>8.1. Prezentul Acord intră în vigoare la data semnării lui de către toate Părțile și este valabil până la executarea integrală a obligațiilor.</p>
  <p>8.2. Modificările și completările la Acord sunt valabile numai dacă sunt întocmite în scris și semnate de toate Părțile.</p>
  <p>8.3. Acordul este întocmit în ${parties.length} exemplare, câte unul pentru fiecare Parte, având aceeași forță juridică. Părțile pot semna Acordul și electronic, în aplicația «Dolya».</p>

  <h2>Semnăturile Părților</h2>
  <table><thead><tr><th>Numele, prenumele</th><th>Calitatea</th><th>Semnătura</th><th>Data</th></tr></thead><tbody>${signRows}</tbody></table>

  <div class="note">${draft ? 'Proiect generat' : 'Redacție fixată'} în aplicația «Dolya» la ${asOf}. Cifrele reflectă evidența la această dată. Modelul nu constituie consultanță juridică — înainte de semnare se recomandă verificarea de către un jurist sau notar.</div>
</div>
</body>
</html>`;
}

module.exports = { buildContract, makeSnapshot, termsHash };

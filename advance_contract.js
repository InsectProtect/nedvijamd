// Contract de arvună (avans) / Договор задатка (аванса) — двуязычный: RO слева, RU справа.

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (v) => `${Math.round(Number(v) || 0).toLocaleString('ro-RO').replace(/\./g, ' ')} €`;
const blank = (w = 140) => `<span class="blank" style="min-width:${w}px"></span>`;
const val = (v, w) => (v !== undefined && v !== null && String(v).trim() !== '' ? `<b>${esc(v)}</b>` : blank(w));
const dmy = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
const dmyhm = (iso) => {
  const d = new Date(new Date(iso).getTime() + 2 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

function buildAdvanceContract({ adv, object, fields = {}, seller = {}, signatures = {}, printable = false }) {
  const double = adv.return_mode !== 'single';
  const place = adv.city || fields.city;
  const rows = [
    [
      `<p><b>Vânzătorul:</b> ${val(seller.name, 200)}, IDNP ${val(seller.idnp, 130)}, domiciliat(ă) în ${val(seller.address, 200)}, care acționează în nume propriu și în interesul coinvestitorilor bunului imobil, pe de o parte, și</p>
       <p><b>Cumpărătorul:</b> ${val(adv.buyer, 200)}, IDNP ${val(adv.buyer_idnp, 130)}, domiciliat(ă) în ${val(adv.buyer_address, 200)}, tel. ${val(adv.buyer_phone, 110)}, pe de altă parte,</p>
       <p>au încheiat prezentul contract privind următoarele:</p>`,
      `<p><b>Продавец:</b> ${val(seller.name, 200)}, IDNP ${val(seller.idnp, 130)}, проживающий(ая) по адресу ${val(seller.address, 200)}, действующий(ая) от своего имени и в интересах соинвесторов объекта недвижимости, с одной стороны, и</p>
       <p><b>Покупатель:</b> ${val(adv.buyer, 200)}, IDNP ${val(adv.buyer_idnp, 130)}, проживающий(ая) по адресу ${val(adv.buyer_address, 200)}, тел. ${val(adv.buyer_phone, 110)}, с другой стороны,</p>
       <p>заключили настоящий договор о нижеследующем:</p>`
    ],
    [
      `<p><b>1.</b> Părțile se obligă să încheie contractul de vânzare-cumpărare a bunului imobil «${esc(object.name)}»${object.area ? `, cu suprafața de ${String(object.area).replace('.', ',')} m²` : ''}, situat la adresa ${val(fields.property_address, 220)}, număr cadastral ${val(fields.cadastral, 140)}, la prețul de ${adv.sale_price ? `<b>${eur(adv.sale_price)}</b>` : blank(110)}.</p>`,
      `<p><b>1.</b> Стороны обязуются заключить договор купли-продажи объекта недвижимости «${esc(object.name)}»${object.area ? `, площадью ${String(object.area).replace('.', ',')} м²` : ''}, расположенного по адресу ${val(fields.property_address, 220)}, кадастровый номер ${val(fields.cadastral, 140)}, по цене ${adv.sale_price ? `<b>${eur(adv.sale_price)}</b>` : blank(110)}.</p>`
    ],
    [
      `<p><b>2.</b> La data de <b>${dmy(adv.received_date)}</b> Cumpărătorul a transmis, iar Vânzătorul a primit suma de <b>${eur(adv.amount)}</b> cu titlu de arvună, în contul prețului și în confirmarea intenției de a încheia contractul de vânzare-cumpărare.</p>`,
      `<p><b>2.</b> <b>${dmy(adv.received_date)}</b> Покупатель передал, а Продавец получил сумму <b>${eur(adv.amount)}</b> в качестве задатка в счёт цены и в подтверждение намерения заключить договор купли-продажи.</p>`
    ],
    [
      `<p><b>3.</b> Contractul de vânzare-cumpărare, în formă autentică, se încheie până la data de <b>${dmy(adv.valid_until)}</b> inclusiv.</p>`,
      `<p><b>3.</b> Договор купли-продажи в нотариальной форме заключается до <b>${dmy(adv.valid_until)}</b> включительно.</p>`
    ],
    [
      `<p><b>4.</b> Dacă Cumpărătorul refuză încheierea contractului sau nu se prezintă până la termenul indicat, arvuna rămâne Vânzătorului.</p>`,
      `<p><b>4.</b> Если Покупатель откажется от заключения договора или не явится до указанного срока, задаток остаётся у Продавца.</p>`
    ],
    [
      `<p><b>5.</b> Dacă Vânzătorul refuză încheierea contractului, acesta restituie Cumpărătorului arvuna ${double ? '<b>în mărime dublă</b>' : '<b>în aceeași mărime</b>'} în termen de 5 zile lucrătoare.</p>`,
      `<p><b>5.</b> Если Продавец откажется от заключения договора, он возвращает Покупателю задаток ${double ? '<b>в двойном размере</b>' : '<b>в том же размере</b>'} в течение 5 рабочих дней.</p>`
    ],
    [
      `<p><b>6.</b> Dacă contractul nu se încheie din motive pentru care niciuna dintre Părți nu răspunde, arvuna se restituie integral Cumpărătorului.</p>`,
      `<p><b>6.</b> Если договор не заключён по причинам, за которые ни одна из Сторон не отвечает, задаток возвращается Покупателю полностью.</p>`
    ],
    [
      `<p><b>7.</b> La încheierea contractului de vânzare-cumpărare, arvuna se include în prețul bunului.</p>`,
      `<p><b>7.</b> При заключении договора купли-продажи задаток засчитывается в цену объекта.</p>`
    ],
    [
      `<p><b>8.</b> Contractul este întocmit în două exemplare, în limbile română și rusă, câte unul pentru fiecare Parte. În caz de divergențe prevalează textul în limba de stat. Litigiile se soluționează de instanțele de judecată ale Republicii Moldova.</p>`,
      `<p><b>8.</b> Договор составлен в двух экземплярах, на румынском и русском языках, по одному для каждой Стороны. При разночтениях приоритет имеет текст на государственном языке. Споры разрешаются судами Республики Молдова.</p>`
    ]
  ];

  const sigCell = (s) => (s ? `<img src="data:image/png;base64,${s.image}" alt=""><div class="stamp">✓ semnat electronic / подписано в приложении «Dolya» · ${dmyhm(s.signed_at)}</div>` : '');

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contract de arvună / Договор задатка — ${esc(object.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #E9E7E1; color: #1A1A1A; font-family: 'Times New Roman', Times, Georgia, serif; font-size: 11pt; line-height: 1.45; }
  .bar { position: sticky; top: 0; display: flex; justify-content: center; padding: 12px; background: #0D0D0E; z-index: 2; }
  .bar button { height: 44px; padding: 0 20px; border-radius: 22px; border: none; background: #D4BF94; color: #0D0D0E; font: 600 15px Inter, system-ui, sans-serif; cursor: pointer; }
  .paper { max-width: 900px; margin: 20px auto; background: #fff; padding: 40px 44px; box-shadow: 0 10px 40px rgba(0,0,0,.12); }
  .t2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
  .t2 > div { min-width: 0; }
  h1 { font-size: 13.5pt; text-align: center; margin: 0; }
  .meta { display: flex; justify-content: space-between; margin: 14px 0 16px; font-size: 10.5pt; }
  p { margin: 5px 0; text-align: justify; }
  .row { border-top: 1px solid #E3E0D8; padding: 4px 0; }
  .blank { display: inline-block; border-bottom: 1px solid #555; height: 1.1em; vertical-align: bottom; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 10.5pt; }
  th, td { border: 1px solid #888; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #F3F1EC; }
  td.sign { width: 42%; height: 66px; }
  td.sign img { display: block; max-width: 100%; max-height: 56px; }
  .stamp { font: 600 8pt Inter, system-ui, sans-serif; color: #1F7A3E; margin-top: 2px; }
  .note { font-size: 9pt; color: #666; margin-top: 14px; }
  @media (max-width: 640px) { .paper { padding: 20px 14px; margin: 0; } .t2 { grid-template-columns: 1fr; } .t2 > div + div { border-left: 3px solid #E3E0D8; padding-left: 10px; margin: 4px 0 8px; color: #333; } p { text-align: left; } .meta { flex-wrap: wrap; gap: 8px; } }
  @media print { body { background: #fff; } .bar { display: none; } .paper { box-shadow: none; margin: 0; padding: 0; max-width: none; } .row { break-inside: avoid; } table, tr { break-inside: avoid; } }
</style>
</head>
<body>
${printable ? '<div class="bar"><button onclick="window.print()">Tipărește / Распечатать · PDF</button></div>' : ''}
<div class="paper contract">
  <div class="t2"><div><h1>CONTRACT DE ARVUNĂ (AVANS)</h1></div><div><h1>ДОГОВОР ЗАДАТКА (АВАНСА)</h1></div></div>
  <div class="meta"><span>${place ? `<b>${esc(place)}</b>` : `mun./or. ${blank(120)}`}</span><span><b>${dmy(adv.received_date)}</b></span></div>
  ${rows.map(([ro, ru]) => `<div class="row t2"><div>${ro}</div><div lang="ru">${ru}</div></div>`).join('')}
  <table>
    <thead><tr><th>Partea / Сторона</th><th>Numele / ФИО</th><th>Semnătura / Подпись</th></tr></thead>
    <tbody>
      <tr><td>Vânzătorul / Продавец</td><td>${esc(seller.name || '')}</td><td class="sign">${sigCell(signatures.seller)}</td></tr>
      <tr><td>Cumpărătorul / Покупатель</td><td>${esc(adv.buyer || '')}</td><td class="sign">${sigCell(signatures.buyer)}</td></tr>
    </tbody>
  </table>
  <div class="note">Document generat în aplicația «Dolya» / Документ сформирован в приложении «Доля». Modelul nu constituie consultanță juridică / Шаблон не является юридической консультацией.</div>
</div>
</body>
</html>`;
}

module.exports = { buildAdvanceContract };

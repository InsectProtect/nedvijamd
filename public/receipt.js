'use strict';
/* Распознавание чека прямо на телефоне (Tesseract.js загружается по требованию)
   и разбор текста: итоговая сумма, валюта и дата. */
(function (root) {
  const TOTAL_WORDS = /(total\s*(de\s*plat[aă])?|suma\s*(total[aă])?|spre\s*plat[aă]|de\s*plat[aă]|итого|всего|к\s*оплате|сумма)/i;
  const NUM = /(\d{1,3}(?:[ . ]\d{3})+|\d+)(?:[.,](\d{2}))\b/g;

  function toNumber(intPart, dec) {
    return Number(String(intPart).replace(/[ . ]/g, '') + '.' + (dec || '00'));
  }

  const stripDates = (t) => String(t).replace(/\b\d{2}[./-]\d{2}[./-]\d{2,4}\b/g, ' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');

  function parseReceipt(text) {
    const raw = String(text || '');
    const lines = stripDates(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const all = stripDates(raw);
    let amount = null;
    // 1) строка со словом «итого / total / suma» — берём последнее число в ней (или в следующей строке)
    for (let i = lines.length - 1; i >= 0 && amount === null; i--) {
      if (!TOTAL_WORDS.test(lines[i]) || /subtotal|tva|nds|ндс|rest|сдача/i.test(lines[i])) continue;
      for (const l of [lines[i], lines[i + 1] || '']) {
        const nums = [...l.matchAll(NUM)];
        if (nums.length) { const m = nums[nums.length - 1]; amount = toNumber(m[1], m[2]); break; }
      }
    }
    // 2) иначе — самое большое число с копейками
    if (amount === null) {
      let best = null;
      for (const m of all.matchAll(NUM)) { const v = toNumber(m[1], m[2]); if (v < 10000000 && (best === null || v > best)) best = v; }
      amount = best;
    }
    let currency = null;
    if (/\b(mdl|lei|leu)\b|лей|леев/i.test(raw)) currency = 'MDL';
    else if (/€|\beur\b|euro/i.test(raw)) currency = 'EUR';
    let date = null;
    const d = raw.match(/\b(\d{2})[./-](\d{2})[./-](\d{4}|\d{2})\b/);
    if (d) {
      const y = d[3].length === 2 ? `20${d[3]}` : d[3];
      const iso = `${y}-${d[2]}-${d[1]}`;
      if (!Number.isNaN(new Date(iso).getTime()) && Number(d[2]) <= 12 && Number(d[1]) <= 31) date = iso;
    }
    return { amount, currency, date };
  }

  let loading = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.async = true;
      s.onload = () => (root.Tesseract ? resolve(root.Tesseract) : reject(new Error('no tesseract')));
      s.onerror = () => { loading = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function recognize(dataUrl) {
    const T = await loadTesseract();
    const worker = await T.createWorker('eng+ron');
    try {
      const { data } = await worker.recognize(dataUrl);
      return parseReceipt(data.text);
    } finally {
      worker.terminate();
    }
  }

  const api = { parseReceipt, recognize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Receipt = api;
})(typeof window !== 'undefined' ? window : globalThis);

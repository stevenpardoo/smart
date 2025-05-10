/**
 * auto‑class – CommonJS (+fetch) — envía PNG + HTML a Discord
 * 12 intentos, 5 min de intervalo
 */

const { chromium } = require('playwright');
const fs           = require('fs/promises');
const path         = require('path');

// ─────────── ENV ───────────
const { USER_ID, USER_PWD, DISCORD_WEBHOOK } = process.env;
if (!USER_ID || !USER_PWD)  throw new Error('USER_ID o USER_PWD no definidos');
if (!DISCORD_WEBHOOK)       throw new Error('DISCORD_WEBHOOK no definido');

// ───────── CONFIG ──────────
const RETRIES = 12;                 // máx. reintentos
const GAP_MS  = 5 * 60_000;         // 5 min
const H1      = '18:00';
const H2      = '19:30';
const SEDE    = 'CENTRO MAYOR';

const ts  = () => new Date().toISOString();
const log = m => console.log(`[${ts()}] ${m}`);

// ───────── UTILS ───────────
async function sendFile(filePath) {
  const data = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([data]), path.basename(filePath));
  const res = await fetch(DISCORD_WEBHOOK, { method: 'POST', body: form });
  if (!res.ok) console.error('💥 Discord:', await res.text());
}

async function saveAndSend(page, tag) {
  const png  = `/tmp/fail-${tag}.png`;
  const html = `/tmp/fail-${tag}.html`;
  await page.screenshot({ path: png, fullPage: true });
  await fs.writeFile(html, await page.content());
  await sendFile(png);
  await sendFile(html);
}

// ───────── MAIN LOOP ───────
async function run(attempt) {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60_000);

  try {
    // 1 — Login
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',  USER_PWD);
    await Promise.all([
      page.keyboard.press('Enter'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    ]);

    // 2 — Entrar a Programación
    await page.waitForSelector('img[src*="PROGRAMACION"]', { timeout: 60_000 });
    await page.click('img[src*="PROGRAMACION"]');

    // 3 — Plan
    await page.waitForSelector('text=INGB1C1');
    await page.click('text=INGB1C1');
    await Promise.all([
      page.click('input[value="Iniciar"]'),
      page.waitForSelector('text=Programar clases')
    ]);

    // 4 — Asignar clases
    const assign = async hora => {
      await page.selectOption('select[name="vTPEAPROBO"]', { value: '2' }); // Pendientes
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('input[value="Asignar"]');
      await page.selectOption('select[name="vREGCONREG"]', { label: SEDE });

      const dia = await page.waitForSelector('select[name="vDIA"]');
      if ((await dia.evaluate(e => e.options.length)) < 2) {
        await page.click('input[value="Regresar"]'); return false;
      }
      await dia.selectOption({ index: 1 });

      if (await page.$('text=No hay salones disponibles')) {
        await page.click('input[value="Regresar"]'); return false;
      }

      const fila = await page.$(`text="${hora}"`);
      if (!fila) { await page.click('input[value="Regresar"]'); return false; }
      await fila.click();
      await Promise.all([
        page.click('input[value="Confirmar"]'),
        page.waitForSelector('text=Clase asignada').catch(() => null)
      ]);
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const ok = (await assign(H1)) | (await assign(H2));
    await browser.close();
    return ok;

  } catch (e) {
    log(`⚠️ Error intento ${attempt}: ${e.message}`);
    await saveAndSend(page, attempt);
    await browser.close();
    return false;
  }
}

(async () => {
  for (let i = 1; i <= RETRIES; i++) {
    log(`🔄 Intento ${i}/${RETRIES}`);
    if (await run(i)) { log('🎉 Agendamiento completo'); process.exit(0); }
    if (i < RETRIES) { log('⏱ Espera 5 min'); await new Promise(r => setTimeout(r, GAP_MS)); }
  }
  log('🚫 Sin éxito tras 12 intentos');
})();

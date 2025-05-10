/**
 * Smart‑auto‑class v2025‑05‑09 22:05 (@ace)
 *
 * ▸ 12 intentos, 5 min de espera
 * ▸ Guarda PNG + HTML en /tmp/artifacts  (directorio siempre visible en cualquier contenedor)
 * ▸ Imprime el Base64 completo en bloques de 8 000 caracteres (Railway no lo trunca)
 * ▸ Sin waitForNavigation: se basa en polling del icono PROGRAMACION (in‑frame o main)
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('Faltan USER_ID o USER_PWD en variables de entorno');

const MAX_TRIES = 12;                // 1 h total
const GAP_MS    = 5 * 60_000;        // 5 min
const HORA1     = '18:00';
const HORA2     = '19:30';
const SEDE      = 'CENTRO MAYOR';

const ART_DIR   = '/tmp/artifacts';
await fs.mkdir(ART_DIR, { recursive: true });

const ts  = () => new Date().toISOString();
const log = (m) => console.log(`[${ts()}] ${m}`);

function dumpBase64(label, buf) {
  const b64 = buf.toString('base64');
  for (let i = 0; i < b64.length; i += 8000) {
    console.log(`[${ts()}] ${label} (chunk ${i / 8000 + 1}): ${b64.slice(i, i + 8000)}`);
  }
}

async function saveArtifacts(page, tag) {
  const png  = await page.screenshot({ fullPage: true });
  const html = await page.content();
  const p1 = path.join(ART_DIR, `fail-${tag}.png`);
  const p2 = path.join(ART_DIR, `fail-${tag}.html`);
  await fs.writeFile(p1, png);
  await fs.writeFile(p2, html);
  log(`🖼 Guardado --> ${p1}`);
  log(`📄 Guardado --> ${p2}`);
  dumpBase64('Screenshot Base64', png);
}

async function attempt(n) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60_000);

  try {
    /* 1. Login ----------------------------------------------------------------- */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);

    // Triple disparo GeneXus
    await page.click('input[value="Confirmar"]').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.evaluate(() => {
      if (window.gx?.evt?.execEvt) {
        try { gx.evt.execEvt('', false, 'EENTER.', this); } catch {}
      }
    });

    /* 2. Poll icono PROGRAMACION (main + iframes) ------------------------------ */
    const found = await page.waitForFunction(() => {
      const sel = 'img[src*="PROGRAMACION"]';
      const match = d => d.querySelector(sel);
      if (match(document)) return true;
      for (const fr of document.querySelectorAll('iframe')) {
        try { if (match(fr.contentDocument)) return true; } catch {}
      }
      return false;
    }, null, { timeout: 60_000 }).catch(() => false);

    if (!found) throw new Error('Icono PROGRAMACION no aparece');

    // Click icono (main o iframe)
    await page.evaluate(() => {
      const sel = 'img[src*="PROGRAMACION"]';
      const click = d => { const e = d.querySelector(sel); if (e) e.click(); };
      click(document);
      for (const fr of document.querySelectorAll('iframe')) {
        try { click(fr.contentDocument); } catch {}
      }
    });

    /* 3. Selección de plan ------------------------------------------------------ */
    await page.waitForSelector('text=INGB1C1');
    await page.click('text=INGB1C1');
    await Promise.all([
      page.click('input[value="Iniciar"]'),
      page.waitForSelector('text=Programar clases')
    ]);

    /* 4. Helper para asignar una hora ------------------------------------------ */
    const asignar = async hora => {
      await page.selectOption('select[name="vTPEAPROBO"]', { value: '2' }); // Pendientes
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('input[value="Asignar"]');

      await page.selectOption('select[name="vREGCONREG"]', { label: SEDE });

      const selDia = await page.waitForSelector('select[name="vDIA"]');
      const opciones = await selDia.evaluate(e => e.options.length);
      if (opciones < 2) { await page.click('input[value="Regresar"]'); return false; }

      await selDia.selectOption({ index: 1 });

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
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const ok = (await asignar(HORA1)) | (await asignar(HORA2));
    await browser.close();
    return ok;

  } catch (err) {
    log(`⚠️ Error intento ${n}: ${err.message}`);
    await saveArtifacts(page, n);
    await browser.close();
    return false;
  }
}

/* Bucle principal -------------------------------------------------------------- */
for (let i = 1; i <= MAX_TRIES; i++) {
  log(`🔄 Intento ${i}/${MAX_TRIES}`);
  const success = await attempt(i);
  if (success) { log('🎉 Agendamiento completo'); process.exit(0); }
  if (i < MAX_TRIES) {
    log('⏱ Espera 5 min');
    await new Promise(r => setTimeout(r, GAP_MS));
  }
}
log('🚫 Sin éxito tras 12 intentos');
process.exit(0);

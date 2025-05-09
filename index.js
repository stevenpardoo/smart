/**
 * auto‑class – Smart Academy
 * Última actualización: 2025‑05‑09 21:50 GMT‑5
 *
 * ▸ 12 intentos cada 5 min (1 h)
 * ▸ Captura PNG + HTML en cada fallo (carpeta /app/debug)
 * ▸ Soporta:
 *     ‑ Botón GeneXus “Confirmar” (click + Enter + evento GX)
 *     ‑ Dashboard dentro de iframe
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('Env vars USER_ID / USER_PWD missing');

const MAX_ATTEMPTS  = 12;               // 1 h total
const GAP_MS        = 5 * 60_000;       // 5 min
const HORA_1        = '18:00';
const HORA_2        = '19:30';
const SEDE_FIJA     = 'CENTRO MAYOR';
const DEBUG_DIR     = '/app/debug';

const ts = () => new Date().toISOString();
const log = (m) => console.log(`[${ts()}] ${m}`);

await fs.mkdir(DEBUG_DIR, { recursive: true });

async function saveDebug(page, tag) {
  const png  = await page.screenshot();
  const html = await page.content();
  const pngPath  = path.join(DEBUG_DIR, `fail-${tag}.png`);
  const htmlPath = path.join(DEBUG_DIR, `fail-${tag}.html`);
  await fs.writeFile(pngPath,  png);
  await fs.writeFile(htmlPath, html);
  log(`🖼 Guardado ${pngPath}`);
}

async function intento(n) {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width:1280, height:800 } });
  page.setDefaultNavigationTimeout(120_000);

  try {
    /* 1‑ Login ------------------------------------------------------- */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);

    // ① click normal
    await page.click('input[value="Confirmar"]', { timeout: 5_000 }).catch(() => {});
    // ② enter key (por si el botón no dispara)
    await page.keyboard.press('Enter').catch(() => {});
    // ③ evento GeneXus (caso clásico EENTER)
    await page.evaluate(() => {
      if (window.gx && gx.evt && gx.evt.execEvt) {
        try { gx.evt.execEvt('', false, "EENTER.", this); } catch {}
      }
    });

    /* 2‑ Esperar dashboard / icono Programación ---------------------- */
    // Puede estar en main page o dentro de iframe
    const getProgIcon = async () => {
      let el = await page.$('img[src*="PROGRAMACION"]');
      if (el) return { frame: page, el };
      for (const f of page.frames()) {
        el = await f.$('img[src*="PROGRAMACION"]');
        if (el) return { frame: f, el };
      }
      return null;
    };

    const prog = await page.waitForFunction(getProgIcon, null, { timeout: 60_000 })
      .then(res => res.jsonValue())
      .catch(() => null);

    if (!prog) throw new Error('Icono Programación no encontrado');

    const dashboard = prog.frame;
    await prog.el.click({ force:true });

    /* 3‑ Seleccionar plan ------------------------------------------- */
    await dashboard.waitForSelector('text=INGB1C1');
    await dashboard.click('text=INGB1C1');
    await Promise.all([
      dashboard.click('input[value="Iniciar"]'),
      dashboard.waitForSelector('text=Programar clases')
    ]);

    /* 4‑ Función util para asignar ---------------------------------- */
    const asignar = async (hora) => {
      await dashboard.selectOption('select[name="vTPEAPROBO"]', { value: '2' }); // Pendientes
      await dashboard.check('table tbody tr:first-child input[type="checkbox"]');
      await dashboard.click('input[value="Asignar"]');

      await dashboard.selectOption('select[name="vREGCONREG"]', { label: SEDE_FIJA });

      const selDia = await dashboard.waitForSelector('select[name="vDIA"]');
      if ((await selDia.evaluate(e => e.options.length)) < 2) {
        log('⏸ Sin fecha disponible'); await dashboard.click('input[value="Regresar"]'); return false;
      }
      await selDia.selectOption({ index: 1 });

      if (await dashboard.$('text=No hay salones disponibles')) {
        log('⏸ Sin salones'); await dashboard.click('input[value="Regresar"]'); return false;
      }

      const fila = await dashboard.$(`text="${hora}"`);
      if (!fila) { log(`⏸ Hora ${hora} no listada`); await dashboard.click('input[value="Regresar"]'); return false; }
      await fila.click();
      await Promise.all([
        dashboard.click('input[value="Confirmar"]'),
        dashboard.waitForSelector('text=Clase asignada').catch(() => null)
      ]);
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const done = (await asignar(HORA_1)) | (await asignar(HORA_2));
    await browser.close();
    return done;

  } catch (err) {
    log(`⚠️  Error intento ${n}: ${err.message}`);
    await saveDebug(page, n);
    await browser.close();
    return false;
  }
}

/* Bucle de reintentos ---------------------------------------------- */
for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  log(`🔄 Intento ${i}/${MAX_ATTEMPTS}`);
  const ok = await intento(i);
  if (ok) { log('🎉 Agendamiento completo'); process.exit(0); }
  if (i < MAX_ATTEMPTS) {
    log('⏱ Espera 5 min para reintentar');
    await new Promise(r => setTimeout(r, GAP_MS));
  }
}
log('🚫 Máximo de intentos sin éxito');
process.exit(0);

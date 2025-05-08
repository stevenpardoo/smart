import { chromium } from 'playwright';
import fs from 'fs';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

const HORA_1 = '18:00';
const HORA_2 = '19:30';
const MAX_ATTEMPTS = 12;          // 12 × 5 min
const WAIT_BETWEEN = 5 * 60 * 1000;
const SEDE_FIJA = 'CENTRO MAYOR';

const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

async function intento(at) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(90000);

  try {
    /* 1 Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[src*="PROGRAMACION"]'),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    /* 2 Programación */
    await page.click('img[src*="PROGRAMACION"]');
    await page.waitForSelector('text=INGB1C1');
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases'),
      page.click('input[value="Iniciar"]')
    ]);

    /* util asignar */
    const asignar = async hora => {
      await page.selectOption('select[name="vTPEAPROBO"]', { label: 'Pendientes por programar' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('input[value="Asignar"]');

      await page.selectOption('select[name="vREGCONREG"]', { label: SEDE_FIJA });

      const selDia = await page.waitForSelector('select[name="vDIA"]');
      if ((await selDia.evaluate(el => el.options.length)) < 2) {
        log('⏸ Sin fechas'); await page.click('input[value="Regresar"]'); return false;
      }
      await selDia.selectOption({ index: 1 });

      if (await page.$('text=No hay salones disponibles')) {
        log('⏸ Sin salones'); await page.click('input[value="Regresar"]'); return false;
      }

      const filaHora = await page.$(`text="${hora}"`);
      if (!filaHora) { log(`⏸ Hora ${hora} no listada`); await page.click('input[value="Regresar"]'); return false; }
      await filaHora.click();
      await Promise.all([
        page.click('input[value="Confirmar"]'),
        page.waitForSelector('text=Clase asignada').catch(() => null)
      ]);
      log(`✅ ${hora} confirmada (${SEDE_FIJA})`);
      return true;
    };

    const ok1 = await asignar(HORA_1);
    const ok2 = await asignar(HORA_2);
    await browser.close();
    return ok1 || ok2;
  } catch (e) {
    log(`⚠️  Error intento ${at}: ${e.message}`);
    await page.screenshot({ path: `error-${at}-${Date.now()}.png` });
    await browser.close();
    return false;
  }
}

(async () => {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    log(`🔄 Intento ${i}/${MAX_ATTEMPTS}`);
    if (await intento(i)) { log('🎉 Agendamiento completo'); process.exit(0); }
    if (i < MAX_ATTEMPTS) { log('⏱ Espera 5 min'); await new Promise(r => setTimeout(r, WAIT_BETWEEN)); }
  }
  log('🚫 Máximo de intentos sin éxito');
  process.exit(0);
})();

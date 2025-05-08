import { chromium } from 'playwright';
import fs from 'fs';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

// Configuración
const MAX_ATTEMPTS = 12;       // intentos de 5 min → ~1 h
const WAIT_BETWEEN = 5 * 60 * 1000; // 5 min
const HORA_1 = '18:00';
const HORA_2 = '19:30';
const SEDE_FIJA = 'CENTRO MAYOR';

const log = (msg) => {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${msg}`);
};

async function intentoUnaVez(attempt) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);
  try {
    /* 1. Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[src*="PROGRAMACION"]', { timeout: 90000 }), // icono Programación
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    /* 2. Pantalla de inicio – clic Programación */
    await page.click('img[src*="PROGRAMACION"]');

    /* 3. Selección de plan */
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    /* 4. Función util para asignar */
    const asignar = async (hora) => {
      await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('button:has-text("Asignar")');

      // sede fija
      const sedeSel = await page.waitForSelector('select[name="Sede"]', { timeout: 30000 });
      await sedeSel.selectOption({ label: SEDE_FIJA });

      // fecha (segunda opción)
      const diaSel = await page.waitForSelector('select[name="Dia"]', { timeout: 30000 });
      if ((await diaSel.evaluate(el => el.options.length)) < 2) {
        log('⏸ Sin fechas'); await page.click('button:has-text("Regresar")'); return false;
      }
      await diaSel.selectOption({ index: 1 });

      if (await page.$('text=No hay salones disponibles')) {
        log('⏸ Sin salones'); await page.click('button:has-text("Regresar")'); return false;
      }

      // hora
      const horaRow = await page.$(`text="${hora}"`);
      if (!horaRow) { log(`⏸ Hora ${hora} no listada`); await page.click('button:has-text("Regresar")'); return false; }
      await horaRow.click();

      await Promise.all([
        page.click('button:has-text("Confirmar")'),
        page.waitForSelector('text=Clase asignada', { timeout: 60000 }).catch(() => null)
      ]);
      log(`✅ Clase ${hora} confirmada en ${SEDE_FIJA}`);
      return true;
    };

    const ok1 = await asignar(HORA_1);
    const ok2 = await asignar(HORA_2);
    await browser.close();
    return ok1 || ok2; // si al menos una se agendó, éxito global
  } catch (err) {
    log(`⚠️  Error intento ${attempt}: ${err.message}`);
    await page.screenshot({ path: `error-${attempt}-${Date.now()}.png` });
    await browser.close();
    return false;
  }
}

(async () => {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    log(`🔄 Intento ${i}/${MAX_ATTEMPTS}`);
    const exito = await intentoUnaVez(i);
    if (exito) { log('🎉 Agendamiento completo'); process.exit(0); }
    if (i < MAX_ATTEMPTS) {
      log(`⏱ Esperando ${WAIT_BETWEEN / 60000} min para reintentar…`);
      await new Promise(r => setTimeout(r, WAIT_BETWEEN));
    }
  }
  log('🚫 Se alcanzó el número máximo de intentos sin éxito');
  process.exit(0);
})();

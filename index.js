import { chromium } from 'playwright';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);

  try {
    /* 1. Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60000 }),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    /* 2. Programación */
    await page.click('img[alt="Programación"]');
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    /* 3. Utilidad para asignar hora */
    const asignar = async (hora) => {
      await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('button:has-text("Asignar")');

      /* 3.1 Selección de sede CENTRO MAYOR */
      const sedeSel = await page.waitForSelector('select[name="Sede"]', { timeout: 30000 });
      await sedeSel.selectOption({ label: 'CENTRO MAYOR' });

      /* 3.2 Selección de fecha (segunda opción) */
      const daySel = await page.waitForSelector('select[name="Dia"]', { timeout: 30000 });
      if ((await daySel.evaluate(el => el.options.length)) < 2) {
        console.log('⏸ Sin fechas'); await page.click('button:has-text("Regresar")'); return false;
      }
      await daySel.selectOption({ index: 1 });

      if (await page.$('text=No hay salones disponibles')) {
        console.log('⏸ Sin salones'); await page.click('button:has-text("Regresar")'); return false;
      }

      /* 3.3 Selección de hora */
      await page.click(`text="${hora}"`, { timeout: 10000 });

      await Promise.all([
        page.click('button:has-text("Confirmar")'),
        page.waitForSelector('text=Clase asignada', { timeout: 60000 }).catch(() => null)
      ]);
      console.log(`✅ Clase ${hora} confirmada en CENTRO MAYOR`);
      return true;
    };

    /* 4. Agendar dos franjas */
    await asignar('18:00');  // primera
    await asignar('19:30');  // segunda

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('⚠️', err.message);
    await browser.close();
    process.exit(0);
  }
})();

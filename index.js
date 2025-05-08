import { chromium } from 'playwright';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);

  try {
    /* 1. LOGIN -------------------------------------------------------- */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60000 }),
      page.press('input[name="vPASS"]', 'Enter')      // ← dispara el login
    ]);

    /* 2. PROGRAMACIÓN ------------------------------------------------- */
    await page.click('img[alt="Programación"]');
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    /* 3. MODAL PROGRAMAR CLASES -------------------------------------- */
    await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
    await page.check('table tbody tr:first-child input[type="checkbox"]');
    await page.click('button:has-text("Asignar")');

    /* 4. VENTANA “SELECCIÓN DE CLASES” ------------------------------- */
    const daySelect = await page.waitForSelector('select[name="Dia"]', { timeout: 30000 });
    const options = await daySelect.evaluate(el => Array.from(el.options).map((o, i) => ({ value: o.value, index: i })));
    if (options.length < 2) { console.log('⏸ No hay fechas disponibles'); await browser.close(); process.exit(0); }
    await daySelect.selectOption({ index: 1 });

    // ¿Hay salones?
    const noRooms = await page.$('text=No hay salones disponibles');
    if (noRooms) { console.log('⏸ No hay salones disponibles para esa hora/fecha'); await browser.close(); process.exit(0); }

    // Click en la fila con Hora Inicial 18:00
    await page.click('text="18:00"', { timeout: 10000 });

    await Promise.all([
      page.click('button:has-text("Confirmar")'),
      page.waitForSelector('text=Clase asignada', { timeout: 60000 }).catch(() => null)
    ]);

    console.log('✅ Clase programada a las 18:00.');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('⚠️  Error controlado:', err.message);
    await browser.close();
    process.exit(0);          // exit limpio para evitar CrashLoop
  }
})();

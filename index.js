import { chromium } from 'playwright';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);

  try {
    /* ─── 1. Login ─── */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60000 }),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    /* ─── 2. Entrar a Programación ─── */
    await page.click('img[alt="Programación"]');
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    /* ─── 3. Función util para asignar una hora ─── */
    const asignar = async (hora) => {
      // Filtro pendientes
      await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
      // Selecciono primera fila -> Asignar
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('button:has-text("Asignar")');

      // Ventana "Selección de clases"
      const daySelect = await page.waitForSelector('select[name="Dia"]', { timeout: 30000 });
      const options = await daySelect.evaluate(el => Array.from(el.options).length);
      if (options < 2) { console.log('⏸ Sin fechas'); return false; }
      await daySelect.selectOption({ index: 1 });

      if (await page.$('text=No hay salones disponibles')) {
        console.log('⏸ Sin salones para la fecha'); return false;
      }

      // Clic en la hora solicitada
      await page.click(`text="${hora}"`, { timeout: 10000 });
      // Confirmar
      await Promise.all([
        page.click('button:has-text("Confirmar")'),
        page.waitForSelector('text=Clase asignada', { timeout: 60000 }).catch(() => null)
      ]);
      console.log(`✅ Clase programada ${hora}.`);
      // Modal se cierra; vuelve a tabla principal
      return true;
    };

    /* ─── 4. Agenda dos franjas ─── */
    await asignar('18:00');   // primera clase
    await asignar('19:30');   // segunda clase

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('⚠️  Error:', err.message);
    await browser.close();
    process.exit(0);
  }
})();

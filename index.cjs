import { chromium } from 'playwright';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);

  try {
    // 1. LOGIN
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60000 }),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    // 2. Programación → Plan
    await page.click('img[alt="Programación"]');
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    // 3. Función genérica para asignar una franja
    const asignarHora = async (horaTexto) => {
      await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('button:has-text("Asignar")');

      const daySelect = await page.waitForSelector('select[name="Dia"]', { timeout: 30000 });
      await daySelect.selectOption({ index: 1 }); // segunda opción de día
      if (await page.$('text=No hay salones disponibles')) {
        console.log(`⏸ Sin salones para ${horaTexto}`);
        return false;
      }

      // clic en la fila que contiene el texto completo de la hora
      await page.click(`text="${horaTexto}"`, { timeout: 10000 });
      await Promise.all([
        page.click('button:has-text("Confirmar")'),
        page.waitForSelector('text=Clase asignada', { timeout: 60000 }).catch(() => null)
      ]);
      console.log(`✅ Clase programada ${horaTexto}.`);
      return true;
    };

    // 4. Agenda dos franjas
    await asignarHora('18:00');
    await asignarHora('19 19:30 21:00');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('⚠️ Error controlado:', err.message);
    await browser.close();
    process.exit(0);
  }
})();

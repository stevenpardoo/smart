import { chromium } from 'playwright';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(60000);   // 60 s

  try {
    // 1. Login
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60000 }), // ← clave
      page.click('input[type="submit"]')
    ]);

    // 2. Click en Programación
    await page.click('img[alt="Programación"]');

    // 3. Plan INGB1C1
    await page.waitForSelector('text=INGB1C1', { timeout: 30000 });
    await page.click('text=INGB1C1');
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30000 }),
      page.click('input[value="Iniciar"]')
    ]);

    // 4. Modal Programar clases
    await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
    await page.check('table tbody tr:first-child input[type="checkbox"]');
    await page.click('button:has-text("Asignar")');

    /* TODO: paso final – elegir hora disponible */

    console.log('Paso de asignación alcanzado; falta seleccionar hora.');
    await browser.close();
    process.exit(0);                   // exit limpio
  } catch (err) {
    console.error('Error controlado:', err.message);
    await browser.close();
    process.exit(0);                   // evita CrashLoop
  }
})();

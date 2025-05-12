import { chromium } from 'playwright';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width:1280, height:800 } });
  page.setDefaultNavigationTimeout(60000);

  // 1. Login
  await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
  await page.fill('input[name="vUSUCOD"]', USER_ID);
  await page.fill('input[name="vPASS"]', USER_PWD);
  await Promise.all([
    page.waitForSelector('img[alt="Programación"]'),
    page.press('input[name="vPASS"]', 'Enter')
  ]);

  // 2. Programación → plan → iniciar
  await page.click('img[alt="Programación"]');
  await page.waitForSelector('text=INGB1C1');
  await page.click('text=INGB1C1');
  await Promise.all([
    page.waitForSelector('text=Programar clases'),
    page.click('input[value="Iniciar"]')
  ]);

  // Función genérica para reservar una hora
  const reservar = async (hora) => {
    await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });
    await page.check('table tbody tr:first-child input[type="checkbox"]');
    await page.click('button:has-text("Asignar")');

    // Selección de día y hora
    await page.selectOption('select[name="Dia"]', { index: 1 });
    if (await page.$('text=No hay salones disponibles')) return;
    await page.click(`text="${hora}"`);
    await Promise.all([
      page.click('button:has-text("Confirmar")'),
      page.waitForSelector('text=Clase asignada', { timeout:60000 }).catch(()=>null)
    ]);
    console.log(`✅ Clase programada a ${hora}`);
  };

  // 3. Reserva en 18:00 y luego 19:30
  await reservar('18:00');
  await reservar('19:30');

  await browser.close();
  process.exit(0);
})();

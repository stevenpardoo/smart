import { chromium } from 'playwright';

const { USER_ID, USER_PWD } = process.env;
console.log('ENV check – USER_ID:', !!USER_ID, 'USER_PWD:', !!USER_PWD);
if (!USER_ID || !USER_PWD) {
  throw new Error('ENV vars USER_ID/USER_PWD are missing');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. Login
  await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx', { waitUntil: 'networkidle' });
  await page.fill('input[name="vUSUCOD"]', USER_ID);
  await page.fill('input[name="vPASS"]', USER_PWD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('input[type="submit"]')
  ]);

  // 2. Click en “Programación”
  await page.click('img[alt="Programación"]');              // ajusta selector si es otro tag

  // 3. Seleccionar plan INGB1C1
  await page.click('text=INGB1C1');                         // fila del plan
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('input[value="Iniciar"]')                    // botón Iniciar
  ]);

  // 4. Modal “Programar clases”
  // Espera que se abra (iframe o div). Ajustar selector según DOM real:
  const modal = await page.waitForSelector('text=Programar clases', { timeout: 5000 });

  // Cambiar filtro a “Pendientes por programar”
  await page.selectOption('select[name="EstadoClases"]', { label: 'Pendientes por programar' });

  // Marca la primera clase pendiente (primer checkbox del grid)
  await page.check('table tbody tr:first-child input[type="checkbox"]');

  // Pulsa Asignar
  await page.click('button:has-text("Asignar")');

  // 5. ***Por implementar*** – elegir hora de clase
  // ─ Abre el selector de horario (si aparece otro modal)
  // ─ Elige la primera hora disponible (ejemplo):
  // await page.click('select[name="Hora"]');
  // await page.selectOption('select[name="Hora"]', { index: 1 });
  // ─ Confirmar / guardar

  console.log('Clase asignada (sin hora – pendiente).');
  await browser.close();
})();

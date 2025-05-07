import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');

  await page.fill('input[name="vUSUCOD"]', process.env.1023928198);
  await page.fill('input[name="vPASS"]', process.env.Pardo93.);
  await page.click('input[type="submit"]');

  // Aquí puedes agregar pasos adicionales para programar la clase

  await browser.close();
})();

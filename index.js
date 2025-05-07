import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');

  await page.fill('input[name="vUSUCOD"]', process.env.USER_ID);
  await page.fill('input[name="vPASS"]', process.env.USER_PWD);
  await page.click('input[type="submit"]');

  // Aquí irán los pasos siguientes de navegación

  await browser.close();
})();

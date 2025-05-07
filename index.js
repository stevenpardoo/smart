import { chromium } from 'playwright';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) {
  throw new Error('ENV vars USER_ID/USER_PWD are missing');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
  await page.fill('input[name="vUSUCOD"]', USER_ID);
  await page.fill('input[name="vPASS"]', USER_PWD);
  await page.click('input[type="submit"]');

  // TODO: pasos de reserva

  await browser.close();
})();

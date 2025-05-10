import { chromium } from "playwright";

const webhook = process.env.DISCORD_WEBHOOK;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://schoolpack.smart.edu.co/idiomas/");
  
  // Esperar el modal y cerrarlo si aparece
  try {
    await page.waitForSelector('#gxp0_cls', { timeout: 5000 });
    await page.click('#gxp0_cls');
  } catch (e) {
    console.log("Modal no detectado o ya cerrado");
  }

  // Continuar con login
  await page.fill('#vUSUCOD', 'TU_USUARIO');
  await page.fill('#vPASS', 'TU_CONTRASEÑA');
  await page.click('#BUTTON1');

  // Esperar navegación o validar éxito del login aquí

  // Enviar imagen al webhook de Discord
  const buffer = await page.screenshot();
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: "Resultado de login",
      files: [{ name: "screenshot.png", file: buffer.toString("base64") }]
    })
  });

  await browser.close();
})();

const { chromium } = require("playwright");
const fetch = require("node-fetch");
const fs = require("fs");

const webhook = process.env.DISCORD_WEBHOOK;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://schoolpack.smart.edu.co/idiomas/");

  // Cierra el modal si aparece
  try {
    await page.waitForSelector('#gxp0_cls', { timeout: 5000 });
    await page.click('#gxp0_cls');
  } catch (e) {
    console.log("Modal no detectado.");
  }

  await page.fill('#vUSUCOD', 'TU_USUARIO');
  await page.fill('#vPASS', 'TU_CONTRASEÑA');
  await page.click('#BUTTON1');

  await page.waitForTimeout(3000); // espera que cargue

  const screenshotBuffer = await page.screenshot();

  await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: "Resultado del login",
      files: [
        {
          name: "screenshot.png",
          file: screenshotBuffer.toString("base64")
        }
      ]
    })
  });

  await browser.close();
})();

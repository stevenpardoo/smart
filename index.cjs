require("dotenv").config();
const { chromium } = require("playwright");
const fetch = require("node-fetch");

const LOGIN_URL = "https://schoolpack.smart.edu.co/idiomas/";
const USER = process.env.USER_SMART;
const PASS = process.env.PASS_SMART;
const WEBHOOK = process.env.DISCORD_WEBHOOK;

(async () => {
  // 1. Lanzar navegador headless
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 2. Ir a la página
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  // 3. Si aparece el modal, cerrarlo
  const modalClose = page.locator("#gxp0_cls");
  if (await modalClose.isVisible({ timeout: 5000 }).catch(() => false)) {
    await modalClose.click();
  }

  // 4. Esperar al formulario real (se oculta si el modal sigue abierto)
  await page.locator("input[name='vUSUCOD']").waitFor({ state: "visible", timeout: 15000 });

  // 5. Rellenar credenciales
  await page.fill("input[name='vUSUCOD']", USER);
  await page.fill("input[name='vPASS']", PASS);
  await page.click("input#BUTTON1");

  // 6. Esperar redirección o error
  await page.waitForLoadState("networkidle", { timeout: 20000 });

  // 7. Captura de pantalla
  const buffer = await page.screenshot();

  // 8. Enviar a Discord
  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Resultado del login",
      username: "RailwayBot",
      files: [{ name: "screenshot.png", file: buffer.toString("base64") }]
    })
  });

  await browser.close();
  console.log("✅ Proceso terminado sin errores.");
})();

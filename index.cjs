// index.cjs – flujo de login sin que el modal lo bloquee
const { chromium } = require("playwright");

// ⚙️  Variables de entorno (configúralas en Railway → Variables)
const URL      = process.env.TARGET_URL || "https://schoolpack.smart.edu.co/idiomas/alumnos.aspx";
const USER_ID  = process.env.USER_ID;
const USER_PWD = process.env.USER_PWD;

if (!USER_ID || !USER_PWD) {
  console.error("❌  USER_ID y/o USER_PWD no están definidos en las variables de entorno.");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
    // 1) Ir a la página
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // 2) Cerrar cualquier modal GeneXus que estorbe
    const modalClose = page.locator(".gx-popup-close");           // selector genérico
    if (await modalClose.count()) {
      await modalClose.first().click();
      await modalClose.first().waitFor({ state: "detached", timeout: 10_000 })
        .catch(() => {});                                         // ya se fue
    }

    // 3) Completar formulario
    await page.locator("input[name='vUSUCOD']").waitFor({ state: "visible", timeout: 15_000 });
    await page.fill("input[name='vUSUCOD']", USER_ID);
    await page.fill("input[name='vPASS']",   USER_PWD);
    await page.click("input[name='BUTTON1']");

    // 4) Esperar navegación / éxito
    await page.waitForLoadState("networkidle", { timeout: 60_000 });

    // 5) Captura opcional para inspección
    await page.screenshot({ path: "success.png", fullPage: true });
    console.log("✅  Flujo completado sin errores");

  } catch (err) {
    console.error("❌  Error en el flujo:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

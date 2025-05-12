const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  throw new Error("Faltan USER_ID, USER_PASS o WEBHOOK_URL");
}

const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, file) {
  await hook.send(
    new MessageBuilder().setTitle(title).setColor(color).setTimestamp()
  );
  if (file) await hook.sendFile(file);
}

const stamp = (base) => `${base}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  try {
    // 1. LOGIN
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx");
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]'),
      page.press('input[name="vPASS"]', "Enter")
    ]);

    // 2. ABRIR PROGRAMACIÓN
    await page.click('img[alt="Programación"]');
    await page.waitForSelector(`text=${PLAN_TXT.source.replace(/\\/g, "")}`);

    // 3. INICIAR PLAN
    await page.click(`text=${PLAN_TXT.source.replace(/\\/g, "")}`);
    await Promise.all([
      page.waitForSelector('select[name*="APROB"]'),
      page.click("text=Iniciar")
    ]);

    // 4. FRAME / POPUP
    const frame = page
      .frames()
      .find(f => f.locator('select[name*="APROB"]').countSync() > 0) || page;
    
    // 5. FILTRAR PENDIENTES
    await frame.selectOption('select[name*="APROB"]', { label: "Pendientes por programar" });
    await frame.waitForSelector('input[type="checkbox"][name="vCHECK"]');

    const listPNG = stamp("list");
    await frame.screenshot({ path: listPNG, fullPage: true });

    // 6. BUCLE HORARIOS
    for (const hora of HORARIOS) {
      await frame.evaluate(() => document.documentElement.scrollTop = 0);
      const checkbox = frame.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!await checkbox.count()) {
        throw new Error("No quedan filas pendientes.");
      }
      await checkbox.check();

      await Promise.all([
        frame.waitForSelector('select[name="VTSEDE"]'),
        frame.click("text=Asignar")
      ]);

      await frame.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });
      const diaOpt = frame.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await frame.selectOption('select[name="VFDIA"]', await diaOpt.getAttribute("value"));
      await frame.selectOption('select[name="VFHORA"]', { label: hora });

      await Promise.all([
        frame.waitForSelector("text=Clase asignada", { timeout: 20000 }).catch(() => {}),
        frame.click("text=Confirmar")
      ]);
    }

    const okPNG = stamp("after");
    await frame.screenshot({ path: okPNG, fullPage: true });
    await discord("✅ Clases agendadas", "#00ff00", okPNG);

    await browser.close();
  } catch (err) {
    const crashPNG = stamp("crash");
    try {
      // Screenshot del error en el frame disponible
      const frame = page.frames().find(f => f.isAttached()) || page;
      await frame.screenshot({ path: crashPNG, fullPage: true });
    } catch (ssErr) {
      console.error("Error al generar screenshot:", ssErr);
    }
    await discord(`❌ Crash: ${err.message}`, "#ff0000", crashPNG);
    await browser.close();
    process.exit(1);
  }
})();

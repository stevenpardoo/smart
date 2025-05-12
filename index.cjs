// index.js
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) throw new Error("Faltan credenciales.");

const hook = new Webhook(WEBHOOK_URL);
const stamp = (base) => `${base}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;
async function notify(title, color, file) {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp());
  if (file) await hook.sendFile(file);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport:{width:1280,height:720} });
  page.setDefaultTimeout(30000);

  try {
    // 1. LOGIN
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx");
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
      page.waitForNavigation(),
      page.press('input[name="vPASS"]', "Enter")
    ]);

    // 2. ABRIR PROGRAMACIÓN (fallback por texto o src)
    const prog = page.locator('text=Programación').first();
    if (await prog.count()) {
      await prog.click();
    } else {
      await page.locator('img[src*="PROGRAMACION"]').first().click();
    }

    // 3. INICIAR PLAN
    await page.waitForSelector(`text=${PLAN_TXT.source.replace(/\\/g,"")}`);
    await page.click(`text=${PLAN_TXT.source.replace(/\\/g,"")}`);
    await Promise.all([
      page.waitForSelector('select[name*="APROB"]'),
      page.click("text=Iniciar")
    ]);

    // 4. LOCALIZAR POPUP EN FRAME
    const frame = page.frames().find(f => f.locator('select[name*="APROB"]').countSync()>0) || page;

    // 5. FILTRAR “Pendientes por programar”
    const sel = frame.locator('select[name*="APROB"]');
    if (!await sel.count()) throw new Error("No encontré el selector de estado.");
    await sel.selectOption({ label: "Pendientes por programar" });
    await frame.waitForSelector('input[type="checkbox"][name="vCHECK"]');

    // 6. SCREENSHOT LISTADO
    const listPNG = stamp("list"); 
    await frame.screenshot({ path: listPNG, fullPage: true });

    // 7. BUCLE DE HORARIOS
    for (const hora of HORARIOS) {
      await frame.evaluate(() => document.documentElement.scrollTop = 0);
      const chk = frame.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!await chk.count()) throw new Error("No quedan filas pendientes.");
      await chk.check();

      await Promise.all([
        frame.waitForSelector('select[name="VTSEDE"]'),
        frame.click("text=Asignar")
      ]);

      await frame.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });
      const diaOpt = frame.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await frame.selectOption('select[name="VFDIA"]', await diaOpt.getAttribute("value"));
      await frame.selectOption('select[name="VFHORA"]', { label: hora });

      await Promise.all([
        frame.click("text=Confirmar"),
        frame.waitForTimeout(1000)  // breve espera para DOM
      ]);
    }

    // 8. ÉXITO
    const okPNG = stamp("after");
    await frame.screenshot({ path: okPNG, fullPage: true });
    await notify("✅ Clases agendadas", "#00ff00", okPNG);
    await browser.close();
  } catch (err) {
    // 9. ERROR
    const crashPNG = stamp("crash");
    try {
      const frame = page.frames().find(f=>f.isAttached())||page;
      await frame.screenshot({ path: crashPNG, fullPage: true });
    } catch{}
    await notify(`❌ Crash: ${err.message}`, "#ff0000", crashPNG);
    await browser.close();
    process.exit(1);
  }
})();

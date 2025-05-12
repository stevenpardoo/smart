/* Auto-Class Bot – agenda 18 h y 19 h 30 y notifica en Discord */
import { chromium } from "playwright";
import { Webhook, MessageBuilder } from "discord-webhook-node";
import dayjs from "dayjs";

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan ENV vars");
  process.exit(1);
}

const PLAN_TXT = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT = "CENTRO MAYOR";
const HORAS    = ["18:00", "19:30"];
const hook     = new Webhook(WEBHOOK_URL);

const snap = name => `${name}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;
async function notify(title, color, file) {
  const msg = new MessageBuilder().setTitle(title).setColor(color).setTimestamp();
  await hook.send(msg).catch(()=>{});
  if (file) await hook.sendFile(file).catch(()=>{});
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    page.setDefaultTimeout(90000);

    // 1. Login
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"], img[alt="Matriculas"]'),
      page.press('input[name="vPASS"]', "Enter")
    ]);

    // 2. Menú → Programación → plan → iniciar
    await page.click('img[alt="Programación"], img[alt="Matriculas"]');
    await page.waitForLoadState("networkidle");
    await page.click(`text=${PLAN_TXT}`);
    await Promise.all([
      page.waitForSelector("text=Programar clases"),
      page.click('input[value="Iniciar"]')
    ]);

    // 3. Espera popup y filtra “Pendientes…”
    const pop = await page.waitForSelector('text=/Estado de las clases:/i').then(() => page);
    await page.selectOption('select[name$="APROBO"]', "2");

    // 4. Captura inicial
    const listPNG = snap("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    // 5. Bucle de reserva
    for (const hora of HORAS) {
      const chk = page.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!await chk.count()) throw new Error("No quedan filas pendientes");
      await chk.scrollIntoViewIfNeeded();
      await chk.check();

      await page.click("text=Asignar");
      await page.waitForSelector('select[name="VTSEDE"]');
      await page.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });

      // retry días
      let diaOk = false;
      for (let i=0; i<3 && !diaOk; i++) {
        const opts = await page.locator('select[name="VFDIA"] option:not([disabled])').count();
        if (opts > 1) diaOk = true;
        else await page.waitForTimeout(2000);
      }
      if (!diaOk) throw new Error("No hay días disponibles");
      const val = await page.locator('select[name="VFDIA"] option:not([disabled])').nth(1).getAttribute("value");
      await page.selectOption('select[name="VFDIA"]', val);

      await page.selectOption('select[name="VFHORA"]', { label: hora });
      await Promise.all([
        page.click("text=Confirmar"),
        page.waitForLoadState("networkidle")
      ]);
    }

    // 6. Captura final y notificación
    const okPNG = snap("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await notify("✅ Clases agendadas", "#00ff00", okPNG);
    process.exit(0);

  } catch (err) {
    console.error(err);
    const crashPNG = page ? snap("crash") : null;
    if (page) await page.screenshot({ path: crashPNG, fullPage: true }).catch(()=>{});
    await notify("❌ Crash", "#ff0000", crashPNG);
    process.exit(1);

  } finally {
    await browser.close();
  }
})();

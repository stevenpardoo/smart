/* Auto-Class Bot – agenda 18 h y 19 h 30 y notifica en Discord */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TXT = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT = "CENTRO MAYOR";
const HORAS = ["18:00", "19:30"];

const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp()).catch(()=>{});
  for (const f of files) await hook.sendFile(f).catch(()=>{});
}

const snap = name => `${name}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

// Busca en page y en todos los frames el selector dado
async function popupCtx(page, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // main
    if (await page.locator(selector).count()) return page;
    // frames
    for (const f of page.frames()) {
      if (await f.locator(selector).count()) return f;
    }
    await page.waitForTimeout(300);
  }
  return page; // fallback
}

// Devuelve el <select> junto al texto “Estado de las clases:”
async function estadoSelect(ctx) {
  const lbl = ctx.locator('text=/Estado de las clases:/i');
  if (!await lbl.count()) return null;
  const handle = await lbl.evaluateHandle(el => {
    const s = el.nextElementSibling;
    return (s && s.tagName === "SELECT") ? s : null;
  });
  return handle.asElement();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1280, height: 720 } }).newPage();
  page.setDefaultTimeout(90000);

  try {
    // 1. Login
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    // dispara login con Enter
    await Promise.all([
      page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]', { timeout: 60000 }),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    // 2. Programa → Plan → Iniciar
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle");
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await Promise.all([
      page.waitForSelector('text=Programar clases'),
      page.click('input[value="Iniciar"]')
    ]);

    // 3. Contexto popup y filtro
    const pop = await popupCtx(page, 'text=/Estado de las clases:/i');
    const sel = await estadoSelect(pop);
    if (sel) {
      const actual = await sel.evaluate(s => s.value);
      if (actual !== "2") await sel.selectOption("2").catch(()=>{});
    }

    // 4. Captura listado inicial
    const listPNG = snap("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    // 5. Bucle de horarios
    for (const hora of HORAS) {
      // marcar primer pendiente
      const fila = pop.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!await fila.count()) throw new Error("No hay filas pendientes");
      await fila.evaluate(el => el.scrollIntoView({ block: "center" }));
      await fila.check();

      // asignar
      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor();
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });

      // día (reintento hasta que haya ≥2 opciones)
      let ok = false, tries = 0;
      while (!ok && ++tries <= 3) {
        const opts = pop.locator('select[name="VFDIA"] option:not([disabled])');
        if (await opts.count() > 1) {
          const val = await opts.nth(1).getAttribute("value");
          await pop.selectOption('select[name="VFDIA"]', val);
          ok = true;
        } else {
          await pop.waitForTimeout(2000);
        }
      }
      if (!ok) throw new Error("No aparecieron días disponibles");

      // hora
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      // confirmar
      await pop.click('text=Confirmar');
      await page.waitForLoadState("networkidle");
    }

    // 6. Captura final & notificación
    const okPNG = snap("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("✅ Clases agendadas", "#00ff00", listPNG, okPNG);
    console.log("✅ Flujo completado");

  } catch (err) {
    console.error(err);
    const crashPNG = snap("crash");
    await page.screenshot({ path: crashPNG, fullPage: true }).catch(()=>{});
    await discord("❌ Crash", "#ff0000", crashPNG);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

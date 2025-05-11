/*  Auto‑Class Bot – cierra modal, entra a Programación,
    agenda DOS clases (18 h y 19 h 30) y envía capturas a Discord  */

const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs                       = require("dayjs");

/* ─────────────── CONFIGURACIÓN ─────────────── */

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

const PLAN_TEXT     = /ING-B1, B2 Y C1 PLAN 582H/i;   // texto del plan
const SEDE_TEXT     = "CENTRO MAYOR";                 // sede
const HORARIOS      = ["18:00", "19:30"];             // turnos a tomar

/* ─────────────── Discord helper ─────────────── */

const hook = new Webhook(WEBHOOK_URL);
async function notify(title, color, ...files) {
  await hook.send(
    new MessageBuilder()
      .setTitle(title)
      .setColor(color)
      .setTimestamp()
  ).catch(()=>{});
  for (const f of files) await hook.sendFile(f).catch(()=>{});
}

/* ───────────────── Helpers ──────────────────── */

async function cerrarModal(page){
  const xBtn = page.locator("#gxp0_cls");
  if (await xBtn.isVisible().catch(()=>false)) return xBtn.click();
  await page.evaluate(()=>{
    document.querySelectorAll('div[id^="gxp"][class*="popup"]')
            .forEach(el=>el.style.display="none");
  });
}
const stamp = n => `${n}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

/* ──────────────── FLUJO PRINCIPAL ───────────── */

(async () => {
  const browser = await chromium.launch({ headless:true });
  const ctx     = await browser.newContext({ viewport:{width:1280,height:720} });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. Login */
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx",
                    { waitUntil:"domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Modal */
    await page.waitForTimeout(1_000);
    await cerrarModal(page);

    /* 3. Menú principal → Programación */
    await page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle");

    /* 4. Seleccionar plan y “Iniciar” */
    await page.locator(`text=${PLAN_TEXT}`).first().click();
    await page.click('text=Iniciar');
    await page.waitForLoadState("networkidle");

    /* 5. Filtrar “Pendientes por programar” (valor exacto del <option>) */
    await page.selectOption('select[name="VTAPROBO"]', { value:"P" }); // ← cambia “P” si tu opción usa otro value
    await page.waitForLoadState("networkidle");

    /* 6. Captura listado */
    const listPNG = stamp("list");
    await page.screenshot({ path:listPNG, fullPage:true });

    /* 7. Bucle de horarios */
    for (const hora of HORARIOS){

      /* 7‑a  marcar primera fila pendiente */
      const fila = page.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!await fila.count()) throw new Error("No hay filas pendientes.");
      await fila.check();

      /* 7‑b  Asignar */
      await page.click('text=Asignar');
      await page.waitForLoadState("networkidle");

      /* 7‑c  Sede */
      await page.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });

      /* 7‑d  Día (segunda opción) */
      const diaValue = await page.locator('select[name="VFDIA"] option:not([disabled])').nth(1).getAttribute("value");
      await page.selectOption('select[name="VFDIA"]', diaValue);

      /* 7‑e  Hora */
      await page.selectOption('select[name="VFHORA"]', { label: hora });

      /* 7‑f  Confirmar */
      await page.click('text=Confirmar');
      await page.waitForLoadState("networkidle");
    }

    /* 8. Captura final & OK */
    const donePNG = stamp("after");
    await page.screenshot({ path:donePNG, fullPage:true });
    await notify("✅ Clases agendadas", "#00ff00", listPNG, donePNG);
    console.log("✅ Flujo completado");

  } catch (err) {
    console.error(err);
    const crashPNG = stamp("crash");
    await page.screenshot({ path:crashPNG, fullPage:true }).catch(()=>{});
    await notify("❌ Crash", "#ff0000", crashPNG);
    process.exit(1);
  } finally { await browser.close(); }
})();

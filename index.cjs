/*  Auto‑Class Bot – cierra modal, entra a Programación,
    agenda DOS clases (18 h y 19 h 30) y envía capturas a Discord  */

const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs                       = require("dayjs");

/* ───────────────────────── CONFIG ───────────────────────── */

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

const PLAN_TEXT      = /ING-B1, B2 Y C1 PLAN 582H/i;   // texto exacto del plan
const SEDE_TEXT      = "CENTRO MAYOR";                 // sede a elegir
const HORAS_A_TOMAR  = ["18:00", "19:30"];             // horarios en orden

/* ──────────────────────── Discord hook ───────────────────── */

const hook = new Webhook(WEBHOOK_URL);
async function sendDiscord(title, color, ...files) {
  const card = new MessageBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();
  await hook.send(card).catch(()=>{});
  for (const f of files) await hook.sendFile(f).catch(()=>{});
}

/* ────────────────────────── Helpers ──────────────────────── */

async function forceCloseModal(page) {
  // 1) botón “X” del popup
  const cls = page.locator('#gxp0_cls');
  if (await cls.isVisible().catch(()=>false)) return cls.click();
  // 2) Emergente genérico
  await page.evaluate(() => {
    document.querySelectorAll('div[id^="gxp"][class*="popup"]')
            .forEach(e => e.style.display = "none");
  });
}

function stamp(name){ return `${name}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`; }

/* ────────────────────────── FLUJO ───────────────────────── */

(async () => {
  const browser = await chromium.launch({ headless:true });
  const ctx     = await browser.newContext({ viewport:{ width:1280,height:720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. Login ------------------------------------------------*/
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx",
                    { waitUntil:"domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Cerrar modal si aparece -----------------------------*/
    await page.waitForTimeout(1000);
    await forceCloseModal(page);

    /* 3. Menú principal y Programación -----------------------*/
    await page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle");

    /* 4. Seleccionar plan y pulsar “Iniciar” -----------------*/
    const rowPlan = page.locator(`text=${PLAN_TEXT}`).first();
    await rowPlan.click();                                    // clic en la fila
    await page.click('text=Iniciar');                         // botón Iniciar
    await page.waitForLoadState("networkidle");

    /* 5. Filtro “Pendientes por programar” -------------------*/
    await page.selectOption('select[name="VTAPROBO"]',        // combo Estado de las clases
                            { label: /Pendientes.*programar/i });
    await page.waitForLoadState("networkidle");

    /* 6. Captura listado inicial -----------------------------*/
    const listPNG = stamp("list");
    await page.screenshot({ path:listPNG, fullPage:true });

    /* 7. Loop para los dos horarios solicitados -------------*/
    for (const hora of HORAS_A_TOMAR) {
      // 7‑a  seleccionar primera fila pendiente
      // 7‑d  Día: segunda opción (index 1)
    const dias = await page.$$('select[name="VFDIA"] option:not([disabled])');
    if (dias.length < 2) throw new Error("La lista de días solo tiene una opción.");
    const valueDia = await dias[1].getAttribute("value");
    await page.selectOption('select[name="VFDIA"]', valueDia);

      // 7‑b  “Asignar”
      await page.click('text=Asignar');
      await page.waitForLoadState("networkidle");

      // 7‑c  Sede
      await page.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });

      // 7‑d  Día: segunda opción (index 1)
      const dias = await page.$$('select[name="VFDIA"] option:not([disabled])');
      if (dias.length < 2) throw new Error("La lista de días solo tiene una opción.");
      const valueDia = await dias[1].getAttribute("value");
      await page.selectOption('select[name="VFDIA"]', valueDia);

      // 7‑e  Hora
      await page.selectOption('select[name="VFHORA"]', { label: hora });

      // 7‑f  Confirmar
      await page.click('text=Confirmar');
      await page.waitForLoadState("networkidle");
    }

    /* 8. Captura final y notificación ------------------------*/
    const okPNG = stamp("after");
    await page.screenshot({ path:okPNG, fullPage:true });
    await sendDiscord("✅ Clase(s) agendada(s)", "#00ff00", listPNG, okPNG);

    console.log("✅ Flujo completado");
  } catch (err) {
    console.error(err);
    const crashPNG = stamp("crash");
    await page.screenshot({ path:crashPNG, fullPage:true }).catch(()=>{});
    await sendDiscord("❌ Crash", "#ff0000", crashPNG);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

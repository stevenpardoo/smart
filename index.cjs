/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */

const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ─────────── variables de entorno ─────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

/* ───────────── parámetros del bot ──────────── */
const PLAN_TEXT  = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TEXT  = "CENTRO MAYOR";
const HORARIOS   = ["18:00", "19:30"];
const ESTADOS_VALUE = "2";                      // Pendientes por programar

/* ───────────── webhook de Discord ─────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}

/* ───────────────── helpers ─────────────────── */
const ts = (n) => `${n}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModal(page) {
  const x = page.locator("#gxp0_cls");
  if (await x.isVisible().catch(() => false)) return x.click();
  await page.evaluate(() =>
    document
      .querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach((e) => (e.style.display = "none"))
  );
}

/* ─────────────── flujo principal ───────────── */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. Login */
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx",
                    { waitUntil: "domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Cerrar modal si aparece */
    await page.waitForTimeout(1_000);
    await cerrarModal(page);

    /* 3. Menú → Programación */
    await page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle");

    /* 4. Seleccionar plan y pulsar “Iniciar” */
    await page.locator(`text=${PLAN_TEXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle");

    /* ------------ AHORA TODO ES DENTRO DEL IFRAME --------------- */
    console.log("⌛ esperando iframe del popup…");
    await page.waitForSelector('iframe[src*="wv"]', { state: "attached" });
    const pop = page.frameLocator('iframe[src*="wv"]');

    await pop.locator('select[name="VTAPROBO"]').waitFor({ state: "visible" });

    /* 5. Filtro “Pendientes por programar” */
    await pop.selectOption('select[name="VTAPROBO"]', ESTADOS_VALUE);
    await page.waitForLoadState("networkidle");

    const listPNG = ts("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 6. Bucle de horarios */
    for (const hora of HORARIOS) {
      console.log(`➡ reservando ${hora}`);

      /* 6‑a marcar primera fila pendiente */
      const fila = pop.locator('input[type="checkbox"][name="vCHECK"]').first();
      if (!(await fila.count())) throw new Error("No hay filas pendientes.");
      await fila.check();

      /* 6‑b Asignar */
      await pop.click("text=Asignar");
      await pop.locator('select[name="VTSEDE"]').waitFor();

      /* 6‑c Sede */
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });

      /* 6‑d Día (segunda opción) */
      const diaValue = await pop
        .locator('select[name="VFDIA"] option:not([disabled])')
        .nth(1)
        .getAttribute("value");
      await pop.selectOption('select[name="VFDIA"]', diaValue);

      /* 6‑e Hora */
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      /* 6‑f Confirmar */
      await pop.click("text=Confirmar");
      await page.waitForLoadState("networkidle");
    }

    /* 7. Fin OK */
    const okPNG = ts("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("✅ Clases agendadas", "#00ff00", listPNG, okPNG);
    console.log("✅ Flujo completado");
  } catch (err) {
    console.error(err);
    const crash = ts("crash");
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord("❌ Crash", "#ff0000", crash);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

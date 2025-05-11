/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */

const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ──────────── variables de entorno ──────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

/* ───────────── parámetros del flujo ──────────── */
const PLAN_TEXT  = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TEXT  = "CENTRO MAYOR";
const HORARIOS   = ["18:00", "19:30"];      // orden de reserva
const ESTADOS_VALUE = "2";                  // Pendientes por programar

/* ───────────── webhook de Discord ───────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(t, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(t).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}

/* ───────────────── helpers ──────────────────── */
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

/* ────────────────── flujo ───────────────────── */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. Login */
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded",
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Quitar modal */
    await page.waitForTimeout(1000);
    await cerrarModal(page);

    /* 3. Menú principal → “Programación” */
    await page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await page
      .locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]')
      .first()
      .click();
    await page.waitForLoadState("networkidle");

    /* 4. Seleccionar plan y “Iniciar” */
    await page.locator(`text=${PLAN_TEXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle");

    /* 5. Esperar a que el popup Programar clases aparezca */
    console.log("⌛ esperando popup…");
    await page.waitForSelector('select[name="VTAPROBO"]', { state: "visible" });

    /* 6. Filtrar pendientes */
    await page.selectOption('select[name="VTAPROBO"]', ESTADOS_VALUE);
    await page.waitForLoadState("networkidle");

    const listPNG = ts("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 7. Reservar horarios */
    for (const hora of HORARIOS) {
      console.log(`➡ reservando ${hora}`);

      // marcar primera fila pendiente
      const fila = page
        .locator('input[type="checkbox"][name="vCHECK"]')
        .first();
      if (!(await fila.count())) throw new Error("No hay filas pendientes.");
      await fila.check();

      // botón Asignar
      await page.click("text=Asignar");
      await page.waitForSelector('select[name="VTSEDE"]');

      // sede
      await page.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });

      // día (segunda opción)
      const opcDia = await page
        .locator('select[name="VFDIA"] option:not([disabled])')
        .nth(1)
        .getAttribute("value");
      await page.selectOption('select[name="VFDIA"]', opcDia);

      // hora
      await page.selectOption('select[name="VFHORA"]', { label: hora });

      // confirmar
      await page.click("text=Confirmar");
      await page.waitForLoadState("networkidle");
    }

    /* 8. Final */
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

/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */
const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

/* ─── PARÁMETROS DEL FLUJO ─────────────────────────────────────── */
const PLAN_TXT   = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT   = "CENTRO MAYOR";
const HORARIOS   = ["18:00", "19:30"];          // orden en que se toman
const ESTADO_VAL = "2";                         // value de “Pendientes…”

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const stamp = (base) => `${base}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModal(page) {
  const x = page.locator("#gxp0_cls");
  if (await x.isVisible().catch(() => false)) return x.click();
  await page.evaluate(() => {
    document
      .querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach((e) => (e.style.display = "none"));
  });
}

async function contextoPopup(page, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      const sel = ctx.locator('select[name$="APROBO"]');
      if (await sel.count()) return ctx;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('No apareció select[name$="APROBO"]');
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. LOGIN */
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded",
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. MODAL */
    await page.waitForTimeout(1000);
    await cerrarModal(page);

    /* 3. MENÚ → Programación */
    await page
      .locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]')
      .first()
      .click();
    await page.waitForLoadState("networkidle");

    /* 4. PLAN + Iniciar */
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle");

    /* 5. CONTEXTO DEL POPUP (con o sin iframe) */
    console.log("🔍 buscando popup…");
    const pop = await contextoPopup(page);

    /* 6. FILTRO “Pendientes por programar”                       */
    await pop.selectOption('select[name$="APROBO"]', ESTADO_VAL);

    /* 7. screenshot del listado inicial */
    const listPNG = stamp("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) {
      /* –– scroll hasta arriba por si el checkbox quedó fuera de vista */
      await pop.evaluate(() => (document.querySelector("body").scrollTop = 0));

      /* 8‑a marcar primera fila pendiente */
      const fila = pop.locator('input[type=checkbox][name="vCHECK"]').first();
      if (!await fila.count()) throw new Error("No quedan filas pendientes.");
      await fila.check();

      /* 8‑b Asignar */
      await pop.click("text=Asignar");
      await pop.locator('select[name="VTSEDE"]').waitFor();

      /* 8‑c Sede */
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });

      /* 8‑d Día: segunda opción de la lista habilitada            */
      const dOpt = pop
        .locator('select[name="VFDIA"] option:not([disabled])')
        .nth(1);
      const dVal = await dOpt.getAttribute("value");
      await pop.selectOption('select[name="VFDIA"]', dVal);

      /* 8‑e Hora */
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      /* 8‑f Confirmar */
      await pop.click("text=Confirmar");
      await page.waitForLoadState("networkidle");
    }

    /* 9. OK */
    const okPNG = stamp("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("✅ Clases agendadas", "#00ff00", listPNG, okPNG);
    console.log("✅ Flujo completado");
  } catch (err) {
    console.error(err);
    const crash = stamp("crash");
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord("❌ Crash", "#ff0000", crash);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

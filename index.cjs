/*  Auto‑Class Bot – agenda 18 h y 19 h 30  */
const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ─── ENV ─────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌  Faltan variables"); process.exit(1);
}

/* ─── Parámetros ──────────────────────── */
const PLAN_TXT = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT = "CENTRO MAYOR";
const HORAS    = ["18:00", "19:30"];

/* ─── Discord helper ──────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp()).catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}
const snap = n => `${n}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

/* ─── Utils ───────────────────────────── */
async function hideModals(page) {
  await page.locator('#gxp0_cls, div[id^="gxp"][class*="popup"]')
            .evaluateAll(nodes => nodes.forEach(n => n.style.display = 'none'))
            .catch(() => {});
}
async function popupContext(page, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const ctx of [page, ...page.frames()])
      if (await ctx.locator('text=/Estado de las clases/i').count()) return ctx;
    await page.waitForTimeout(300);
  }
  return page;          // fallback
}
async function estadoSelect(ctx) {
  const label = ctx.locator('text=/Estado de las clases/i');
  if (!await label.count()) return null;
  const h = await label.evaluateHandle(el => {
    const sel = el.nextElementSibling;
    return sel && sel.tagName === "SELECT" ? sel : null;
  });
  return h.asElement();
}

/* ─── MAIN ────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. Login */
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[type="password"]',  USER_PASS);      // ← selector estable
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('input[name="BUTTON1"]')
    ]);

    await hideModals(page);

    /* 2. Menú principal → Programación */
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle");

    /* 3. Seleccionar plan e Iniciar */
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle");

    /* 4. Popup / Iframe */
    const pop = await popupContext(page);

    /* 5. Filtro “Pendientes por programar” */
    const sel = await estadoSelect(pop);
    if (sel && await sel.evaluate(s => s.value) !== "2")
      await sel.selectOption("2").catch(() => {});

    /* 6. Captura listado inicial */
    const listPNG = snap("list");
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 7. Bucle de horarios */
    for (const hora of HORAS) {

      /* a) marcar primera fila pendiente */
      const fila = pop.locator('input[type=checkbox][name="vCHECK"]').first();
      if (!await fila.count()) throw new Error("No hay pendientes");
      await fila.evaluate(el => el.scrollIntoView({ block: "center" }));
      await fila.check();

      /* b) Asignar */
      await pop.click("text=Asignar");
      await pop.locator('select[name="VTSEDE"]').waitFor();

      /* c) Sede */
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });

      /* d) Día – segunda opción con reintento */
      let ok = false, tries = 0;
      while (!ok && ++tries <= 3) {
        const opts = pop.locator('select[name="VFDIA"] option:not([disabled])');
        if (await opts.count() > 1) {
          await pop.selectOption('select[name="VFDIA"]',
                                 await opts.nth(1).getAttribute("value"));
          ok = true;
        } else await pop.waitForTimeout(2000);
      }
      if (!ok) throw new Error("No aparecieron días");

      /* e) Hora */
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      /* f) Confirmar */
      await pop.click("text=Confirmar");
      await page.waitForLoadState("networkidle");
    }

    /* 8. OK */
    const okPNG = snap("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("✅ Clases agendadas", "#00ff00", listPNG, okPNG);
    console.log("FIN OK");

  } catch (err) {
    console.error(err);
    const crash = snap("crash");
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord("❌ Crash", "#ff0000", crash);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

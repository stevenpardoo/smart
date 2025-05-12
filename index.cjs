/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */
const { chromium }         = require('playwright');
const dayjs                = require('dayjs');
const { Webhook, MessageBuilder } = require('discord-webhook-node');

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL'); process.exit(1);
}

/* ─── Discord helper ───────────────────────────────────────────── */
const hook  = new Webhook(WEBHOOK_URL);
const stamp = (b) => `${b}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;
const discord = async (title, color, ...files) => {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
};

/* ─── Utilidades DOM ───────────────────────────────────────────── */
async function cerrarModal(page) {
  const x = page.locator('#gxp0_cls');
  if (await x.isVisible().catch(() => false)) return x.click();
  await page.evaluate(() => {
    document
      .querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach((e) => (e.style.display = 'none'));
  });
}

/* ‑‑ Encuentra el <select name$="APROBO"> sin importar si el popup recarga */
async function contextoPopup(page, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      const sel = ctx.locator('select[name$="APROBO"]');
      if (await sel.count()) return ctx;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('No apareció el popup con el selector de estado');
}

async function setEstadoPendiente(ctx) {
  const sel = ctx.locator('select[name$="APROBO"]');
  await sel.waitFor({ state: 'visible', timeout: 15_000 });

  // 1. Por label (text)
  if (await sel.selectOption({ label: /pendientes/i }).catch(() => false)) return true;
  // 2. Por value conocido = 2
  if (await sel.selectOption('2').catch(() => false)) return true;

  // 3. Último recurso: teclado
  await sel.click();
  await ctx.keyboard.press('ArrowDown');
  await ctx.keyboard.press('Enter');
  return true;
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultNavigationTimeout(90_000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
      page.waitForSelector('img[alt*="PROGRAMACION"], img[alt="Matriculas"]', { timeout: 60_000 }),
      page.press('input[name="vPASS"]', 'Enter'),
    ]);

    /* 2. MODAL */
    await cerrarModal(page);

    /* 3. MENÚ → Programación */
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();

    /* 4. PLAN + Iniciar */
    await page.locator('text=/ING-B1, B2 Y C1 PLAN 582H/i').first().click();
    await Promise.all([
      page.waitForSelector('text=/Iniciar/i', { timeout: 30_000 }),
      page.click('text=Iniciar'),
    ]);

    /* 5. POPUP + estado “Pendientes” */
    let pop = await contextoPopup(page);
    await setEstadoPendiente(pop);

    /* 5‑b  El selector lanza post‑back → reacquire popup tras recarga */
    pop = await contextoPopup(page);

    /* 6. Espera a que aparezcan checkboxes habilitados */
    await pop.waitForSelector('input[type=checkbox][name="vCHECK"]:not([disabled])',
                              { timeout: 15_000 })
            .catch(() => { throw new Error('No hay clases pendientes para programar'); });

    /* 7. Screenshot listado inicial (por si se detiene después) */
    const listPNG = stamp('list');
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. Bucle horarios */
    const HORAS = ['18:00', '19:30'];
    for (const hora of HORAS) {
      await pop.evaluate(() => (document.body.scrollTop = 0));

      const fila = pop.locator('input[type=checkbox][name="vCHECK"]:not([disabled])').first();
      if (!(await fila.count())) { console.log('⏸  Sin filas pendientes'); break; }

      await fila.check();
      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor({ state: 'visible' });

      await pop.selectOption('select[name="VTSEDE"]', { label: 'CENTRO MAYOR' });
      const dOpt = pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await pop.selectOption('select[name="VFDIA"]', await dOpt.getAttribute('value'));
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      await Promise.all([
        pop.click('text=Confirmar'),
        page.waitForTimeout(800),
      ]);
      console.log(`✅  Clase asignada ${hora}`);
    }

    /* 9. OK */
    const okPNG = stamp('after');
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord('Clases agendadas ✅', '#00ff00', listPNG, okPNG);
    console.log('🎉  Flujo completado');
  } catch (err) {
    console.error(err);
    const crash = stamp('crash');
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord('Crash ❌', '#ff0000', crash);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

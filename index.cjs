/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */
const { chromium }               = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs                       = require('dayjs');

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL'); process.exit(1);
}

/* ─── PARÁMETROS DEL FLUJO ─────────────────────────────────────── */
const PLAN_TXT   = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT   = 'CENTRO MAYOR';
const HORARIOS   = ['18:00', '19:30'];           // orden en que se toman
const ESTADO_VAL = '2';                          // value de “Pendientes…”

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const stamp = (b) => `${b}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;

async function cerrarModal(page) {
  const x = page.locator('#gxp0_cls');
  if (await x.isVisible().catch(() => false)) return x.click();
  await page.evaluate(() => {
    document
      .querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach((e) => (e.style.display = 'none'));
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

/* Selecciona la primera fila con estado Pendiente (sin checkbox) */
async function seleccionarFilaPendiente(pop) {
  const fila = pop.locator('tr', { hasText: 'Pendiente' }).first();
  if (!(await fila.count())) return false;
  await fila.click();                // resalta la fila
  return true;
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx', {
      waitUntil: 'domcontentloaded',
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
    await page.waitForLoadState('networkidle');

    /* 4. PLAN + Iniciar */
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click('text=Iniciar');
    await page.waitForLoadState('networkidle');

    /* 5. POPUP */
    let pop = await contextoPopup(page);

    /* 6. Estado “Pendientes” */
    await pop.selectOption('select[name$="APROBO"]', ESTADO_VAL);
    await page.waitForTimeout(800);          // post‑back
    pop = await contextoPopup(page);         // nuevo iframe

    /* 7. Captura listado inicial */
    const listPNG = stamp('list');
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. Verifica disponibilidad inicial */
    if (!(await seleccionarFilaPendiente(pop))) {
      await discord('Sin disponibilidad ❕', '#ffaa00', listPNG);
      console.log('Sin filas pendientes. Termina limpio.');
      process.exit(0);
    }

    /* 9. Bucle por horarios */
    for (const hora of HORARIOS) {
      await pop.evaluate(() => (document.querySelector('body').scrollTop = 0));

      if (!(await seleccionarFilaPendiente(pop))) break;

      await pop.locator('input[value="Asignar"]').click();
      await pop.locator('select[name="VTSEDE"]').waitFor();

      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });
      const dOpt = pop
        .locator('select[name="VFDIA"] option:not([disabled])')
        .nth(1);
      await pop.selectOption('select[name="VFDIA"]', await dOpt.getAttribute('value'));
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      await pop.click('text=Confirmar');
      await page.waitForLoadState('networkidle');
      console.log(`✅  Clase asignada ${hora}`);
    }

    /* 10. OK */
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

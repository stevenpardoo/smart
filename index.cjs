/*  Auto-Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */
const { chromium }               = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs                       = require('dayjs');

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL');
  process.exit(1);
}

/* ─── PARÁMETROS DEL FLUJO ─────────────────────────────────────── */
const PLAN_TXT   = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT   = 'CENTRO MAYOR';
const HORARIOS   = ['18:00', '19:30'];           // orden en que se toman
const ESTADO_VAL = '2';                          // value de “Pendientes…”  

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp()).catch(()=>{});
  for (const f of files) await hook.sendFile(f).catch(()=>{});
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const stamp = b => `${b}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;

async function cerrarModal(page) {
  const x = page.locator('#gxp0_cls');
  if (await x.isVisible().catch(()=>false)) return x.click();
  await page.evaluate(() => {
    document.querySelectorAll('div[id^="gxp"][class*="popup"]').forEach(e => e.style.display = 'none');
  });
}

async function contextoPopup(page, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      if (await ctx.locator('select[name$="APROBO"]').count()) return ctx;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('No apareció select[name$="APROBO"]');
}

/* Selecciona el primer checkbox activo de la lista */
async function seleccionarFilaPendiente(pop) {
  const chk = pop.locator('input[type="checkbox"][name="vCHECK"]:not(:disabled)').first();
  if (!await chk.count()) return false;
  await chk.scrollIntoViewIfNeeded();
  await chk.check();
  return true;
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Cerrar modal si aparece */
    await page.waitForTimeout(1000);
    await cerrarModal(page);

    /* 3. MENÚ → Programación */
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState('networkidle');

    /* 4. PLAN + Iniciar */
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click('text=Iniciar');
    await page.waitForLoadState('networkidle');

    /* 5. Contexto popup */
    let pop = await contextoPopup(page);

    /* 6. Filtro “Pendientes por programar” */
    await pop.selectOption('select[name$="APROBO"]', ESTADO_VAL);
    await page.waitForTimeout(800);
    pop = await contextoPopup(page);

    /* 7. Captura listado inicial */
    const listPNG = stamp('list');
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. Verifica si hay al menos una fila pendiente */
    if (!await seleccionarFilaPendiente(pop)) {
      await discord('Sin disponibilidad ❕', '#ffaa00', listPNG);
      process.exit(0);
    }

    /* 9. Bucle por cada horario */
    for (const hora of HORARIOS) {
      // regresamos al tope
      await pop.evaluate(() => document.querySelector('body').scrollTop = 0);

      if (!await seleccionarFilaPendiente(pop)) break;

      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor();

      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });
      const dOpt = pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      const dVal = await dOpt.getAttribute('value');
      await pop.selectOption('select[name="VFDIA"]', dVal);

      await pop.selectOption('select[name="VFHORA"]', { label: hora });
      await pop.click('text=Confirmar');
      await page.waitForLoadState('networkidle');
      console.log(`✅ Clase asignada ${hora}`);
    }

    /* 10. Captura final y notificación */
    const okPNG = stamp('after');
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord('Clases agendadas ✅', '#00ff00', listPNG, okPNG);
    process.exit(0);

  } catch (err) {
    console.error(err);
    const crashPNG = stamp('crash');
    await page.screenshot({ path: crashPNG, fullPage: true }).catch(()=>{});
    await discord('Crash ❌', '#ff0000', crashPNG);
    process.exit(1);

  } finally {
    await browser.close();
  }
})();

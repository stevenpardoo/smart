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
const HORARIOS   = ['18:00', '19:30'];
const ESTADO_VAL = '2';  // “Pendientes por programar”

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function notify(title, color, ...files) {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp()).catch(()=>{});
  for (const f of files) await hook.sendFile(f).catch(()=>{});
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const snap = (base) => `${base}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;

async function cerrarModal(page) {
  const btn = page.locator('#gxp0_cls');
  if (await btn.isVisible().catch(()=>false)) return btn.click();
  await page.evaluate(() => {
    document.querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach(e => e.style.display = 'none');
  });
}

async function contextoPopup(page, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      if (await ctx.locator('select[name*="APROBO"]').count()) return ctx;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('No apareció el popup de “Estado de las clases”');
}

/* ─ Selecciona **siempre** la PRIMERA fila del listado ─────────── */
async function seleccionarFilaPendiente(pop) {
  // usaremos la estructura table > tbody > tr
  const row = pop.locator('table tbody tr').first();
  const chk = row.locator('input[type="checkbox"]');
  if (!await chk.count()) return false;
  await row.scrollIntoViewIfNeeded();
  await chk.check();
  return true;
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    // 1. LOGIN
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
      page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]'),
      page.click('input[name="BUTTON1"]')
    ]);

    // 2. Cerrar modal si aparece
    await page.waitForTimeout(800);
    await cerrarModal(page);

    // 3. Menú → Programación
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState('networkidle');

    // 4. Seleccionar plan e iniciar
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await Promise.all([
      page.waitForSelector('text=Programar clases'),
      page.click('text=Iniciar')
    ]);

    // 5. Filtrar “Pendientes por programar”
    const pop = await contextoPopup(page);
    await pop.selectOption('select[name*="APROBO"]', ESTADO_VAL);
    await page.waitForTimeout(500);

    // 6. Captura listado inicial
    const listPNG = snap('list');
    await page.screenshot({ path: listPNG, fullPage: true });

    // 7. Verificar que haya filas y marcar la PRIMERA
    if (!await seleccionarFilaPendiente(pop)) {
      await notify('Sin disponibilidad ❕', '#ffaa00', listPNG);
      console.log('No hay filas pendientes. Saliendo.');
      process.exit(0);
    }

    // 8. Bucle para cada horario
    for (const hora of HORARIOS) {
      // 8-a Clic en “Asignar”
      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor();

      // 8-b Seleccionar sede
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TXT });

      // 8-c Seleccionar día (segunda opción)
      const optDia = pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await pop.selectOption('select[name="VFDIA"]', await optDia.getAttribute('value'));

      // 8-d Seleccionar hora
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      // 8-e Confirmar
      await Promise.all([
        pop.click('text=Confirmar'),
        page.waitForLoadState('networkidle')
      ]);

      console.log(`✅ Clase asignada a las ${hora}`);
    }

    // 9. Captura final y notificación
    const okPNG = snap('after');
    await page.screenshot({ path: okPNG, fullPage: true });
    await notify('Clases agendadas ✅', '#00ff00', listPNG, okPNG);

  } catch (err) {
    console.error(err);
    const crashPNG = snap('crash');
    await page.screenshot({ path: crashPNG, fullPage: true }).catch(()=>{});
    await notify('Crash ❌', '#ff0000', crashPNG);
    process.exit(1);

  } finally {
    await browser.close();
  }
})();

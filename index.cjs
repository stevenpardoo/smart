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
const ESTADO_VAL = '2';  // value de “Pendientes…”  

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
  await page.evaluate(()=>{
    document.querySelectorAll('div[id^="gxp"][class*="popup"]').forEach(e=>e.style.display='none');
  });
}

async function contextoPopup(page, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      if (await ctx.locator('select[name$="APROBO"]').count()) return ctx;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('No apareció select[name$="APROBO"]');
}

/* ─── ÚNICO CAMBIO: click en la primera fila de la tabla ───────── */
async function seleccionarFilaPendiente(pop) {
  return await pop.evaluate(() => {
    const row = document.querySelector('table tbody tr');
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    // dispara el click nativo
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport:{ width:1280, height:720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90000);

  try {
    // 1. LOGIN
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',{waitUntil:'domcontentloaded'});
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await page.click('input[name="BUTTON1"]');

    // 2. Cerrar modal
    await page.waitForTimeout(1000);
    await cerrarModal(page);

    // 3. Menú → Programación
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState('networkidle');

    // 4. Plan + Iniciar
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click('text=Iniciar');
    await page.waitForLoadState('networkidle');

    // 5. Contexto popup
    let pop = await contextoPopup(page);

    // 6. Filtrar Pendientes  
    await pop.selectOption('select[name$="APROBO"]', ESTADO_VAL);
    await page.waitForTimeout(800);
    pop = await contextoPopup(page);

    // 7. Captura inicial
    const listPNG = stamp('list');
    await page.screenshot({ path:listPNG, fullPage:true });

    // 8. Seleccionar la primera fila
    if (!await seleccionarFilaPendiente(pop)) {
      await discord('Sin disponibilidad ❕','#ffaa00',listPNG);
      return process.exit(0);
    }

    // 9. Bucle de horarios
    for (const hora of HORARIOS) {
      // asegurarse de resetear scroll
      await pop.evaluate(()=>document.body.scrollTop=0);

      // volver a seleccionar la misma primera fila
      if (!await seleccionarFilaPendiente(pop)) break;

      // asignar
      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor();

      // sede
      await pop.selectOption('select[name="VTSEDE"]',{ label: SEDE_TXT });

      // día y hora
      const dVal = await pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1).getAttribute('value');
      await pop.selectOption('select[name="VFDIA"]', dVal);
      await pop.selectOption('select[name="VFHORA"]',{ label: hora });

      // confirmar
      await pop.click('text=Confirmar');
      await page.waitForLoadState('networkidle');
      console.log(`✅ Clase asignada ${hora}`);
    }

    // 10. Captura final
    const okPNG = stamp('after');
    await page.screenshot({ path:okPNG, fullPage:true });
    await discord('Clases agendadas ✅','#00ff00',listPNG,okPNG);

  } catch (err) {
    console.error(err);
    const crashPNG = stamp('crash');
    await page.screenshot({ path:crashPNG, fullPage:true }).catch(()=>{});
    await discord('Crash ❌','#ff0000',crashPNG);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

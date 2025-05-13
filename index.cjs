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
  const btn = page.locator('#gxp0_cls');
  if (await btn.isVisible().catch(()=>false)) return btn.click();
  await page.evaluate(() => {
    document.querySelectorAll('div[id^="gxp"][class*="popup"]').forEach(e=>e.style.display='none');
  });
}

async function contextoPopup(page, timeout = 15000) {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) {
    for (const ctx of [page, ...page.frames()]) {
      if (await ctx.locator('select[name$="APROBO"]').count()) return ctx;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('No apareció select[name$="APROBO"]');
}

// Marcar la PRIMERA fila mediante script puro
async function marcarPrimeraFila(pop) {
  return await pop.evaluate(() => {
    const chk = document.querySelector('input[type="checkbox"][name="vCHECK"]');
    if (!chk) return false;
    chk.scrollIntoView({ block:'center' });
    chk.click();
    return true;
  });
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless:true });
  const ctx     = await browser.newContext({ viewport:{width:1280,height:720} });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',{waitUntil:'domcontentloaded'});
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. MODAL */
    await page.waitForTimeout(1000);
    await cerrarModal(page);

    /* 3. MENÚ → Programación */
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState('networkidle');

    /* 4. PLAN + Iniciar */
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click('text=Iniciar');
    await page.waitForLoadState('networkidle');

    /* 5. POPUP */
    let pop = await contextoPopup(page);

    /* 6. Estado “Pendientes por programar” */
    await pop.selectOption('select[name$="APROBO"]', ESTADO_VAL);
    await page.waitForTimeout(800);
    pop = await contextoPopup(page);

    /* 7. Captura listado inicial */
    const listPNG = stamp('list');
    await page.screenshot({ path:listPNG, fullPage:true });

    /* 8. Verificar y marcar PRIMERA fila */
    if (!await marcarPrimeraFila(pop)) {
      await discord('Sin disponibilidad ❕','#ffaa00',listPNG);
      console.log('Sin filas pendientes. Termina limpio.');
      process.exit(0);
    }

    /* 9. Bucle por cada horario */
    for (const hora of HORARIOS) {
      await pop.evaluate(()=>document.body.scrollTop=0);

      // volver a marcar PRIMERA fila
      if (!await marcarPrimeraFila(pop)) break;

      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor();

      await pop.selectOption('select[name="VTSEDE"]',{label:SEDE_TXT});
      const diaVal = await pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1).getAttribute('value');
      await pop.selectOption('select[name="VFDIA"]', diaVal);
      await pop.selectOption('select[name="VFHORA"]',{label:hora});

      await pop.click('text=Confirmar');
      await page.waitForLoadState('networkidle');
      console.log(`✅ Clase asignada ${hora}`);
    }

    /* 10. OK */
    const okPNG = stamp('after');
    await page.screenshot({ path:okPNG, fullPage:true });
    await discord('Clases agendadas ✅','#00ff00',listPNG,okPNG);

  } catch(err) {
    console.error(err);
    const crashPNG = stamp('crash');
    await page.screenshot({ path:crashPNG, fullPage:true }).catch(()=>{});
    await discord('Crash ❌','#ff0000',crashPNG);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

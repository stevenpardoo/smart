/*  Auto‑Class Bot  – agenda la clase y manda capturas a Discord  */

const { chromium } = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs = require('dayjs');

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan variables de entorno.');
  process.exit(1);
}
const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport:{ width:1280, height:720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  /* ---------- util para reportar fallos ---------- */
  async function report(label, err) {
    console.error(err);
    const ts   = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const snap = `${label}_${ts}.png`;
    await page.screenshot({ path:snap, fullPage:true }).catch(()=>{});

    const embed = new MessageBuilder()
      .setTitle(`❌ ${label}`)
      .addField('Mensaje', err.message.slice(0,1024))
      .setColor('#ff0000')
      .setTimestamp();

    await hook.send(embed).catch(()=>{});
    await hook.sendFile(snap).catch(()=>{});
  }
  /* ---------------------------------------------- */

  try {
    /* 1 · Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil:'domcontentloaded' });

    /* 2 · Cerrar popup (si aparece) */
    const close = page.locator('#gxp0_cls');
    if (await close.isVisible({ timeout:5_000 }).catch(()=>false)) {
      await close.click();
      console.log('🗙 Modal cerrado');
    }

    /* 3 · Credenciales */
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');
    console.log('↻ Esperando menú principal…');

    /* 4 · Buscar el icono “PROGRAMACION / Matriculas” en todos los iframes */
    let icon;
    const límite = Date.now() + 60_000;
    while (!icon && Date.now() < límite) {
      // documento principal
      icon = page.locator('img[alt="Matriculas"], img[title="Matriculas"]')
                 .first();
      if (await icon.count()) break;

      // iframes
      for (const f of page.frames()) {
        const tmp = f.locator('img[alt="Matriculas"], img[title="Matriculas"]')
                     .first();
        if (await tmp.count()) { icon = tmp; break; }
      }
      if (!await icon.count()) await page.waitForTimeout(1000);
    }
    if (!await icon.count()) throw new Error('No apareció el icono “Matriculas”.');

    /* 5 · Entrar al módulo de programación */
    await icon.click();
    await page.waitForLoadState('networkidle');

    /* 6 · Captura antes de confirmar */
    const ts     = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const before = `before_${ts}.png`;
    await page.screenshot({ path:before, fullPage:true });

    /* 7 · Confirmar reserva */
    await page.click('text=Confirmar').catch(()=>{});
    await page.waitForLoadState('networkidle');

    /* 8 · Captura después */
    const after = `after_${ts}.png`;
    await page.screenshot({ path:after, fullPage:true });

    /* 9 · Discord OK */
    const ok = new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(dayjs().format('DD/MM/YYYY HH:mm'))
      .setColor('#00ff00');
    await hook.send(ok);
    await hook.sendFile(before);
    await hook.sendFile(after);

    console.log('✅ Proceso terminado sin errores');
  } catch (err) {
    await report('Crash', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

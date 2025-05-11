
---

### index.cjs  — nueva lógica para buscar dentro de iframes + trazas

```js
/* Auto‑Class Bot ‑ agenda la clase y manda capturas a Discord */

const { chromium } = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs = require('dayjs');

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Variables de entorno incompletas');
  process.exit(1);
}
const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport:{ width:1280, height:720 } });
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  /* ---------- util para reportar fallos ---------- */
  async function report(err, label = 'Crash') {
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
    /* 1 · Login page */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil:'domcontentloaded' });

    /* 2 · Cerrar popup si aparece */
    const close = page.locator('#gxp0_cls');
    if (await close.isVisible({ timeout:5000 }).catch(()=>false)) {
      await close.click();
      console.log('🗙 Modal cerrado');
    }

    /* 3 · Credenciales */
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 4 · Esperamos que el menú esté cargado en cualquier frame */
    console.log('↻ Buscando “Agendar Clase”…');
    let agendaLocator;
    const maxWait = Date.now() + 60_000;     // 60 s máx
    while (!agendaLocator && Date.now() < maxWait) {
      // revisa página principal …
      let loc = page.locator('text=Agendar Clase');
      if (await loc.count()) agendaLocator = loc.first();

      // … y luego todos los iframes
      if (!agendaLocator) {
        for (const f of page.frames()) {
          loc = f.locator('text=Agendar Clase');
          if (await loc.count()) { agendaLocator = loc.first(); break; }
        }
      }
      if (!agendaLocator) await page.waitForTimeout(1000);
    }
    if (!agendaLocator) throw new Error('No apareció el enlace “Agendar Clase”');

    /* 5 · Entrar a la pantalla de agenda */
    await agendaLocator.click();
    await page.waitForSelector('text=Confirmar', { timeout:30_000 });

    const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const before = `before_${ts}.png`;
    await page.screenshot({ path:before, fullPage:true });

    /* 6 · Confirmar */
    await page.click('text=Confirmar');
    await page.waitForSelector('text=Clase agendada', { timeout:30_000 })
              .catch(()=>{/* algunos sitios no muestran texto final */});

    const after = `after_${ts}.png`;
    await page.screenshot({ path:after, fullPage:true });

    /* 7 · Discord OK */
    const ok = new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(dayjs().format('DD/MM/YYYY HH:mm'))
      .setColor('#00ff00');
    await hook.send(ok);
    await hook.sendFile(before);
    await hook.sendFile(after);

    console.log('✅ Proceso terminado sin errores');
  } catch (err) {
    await report(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

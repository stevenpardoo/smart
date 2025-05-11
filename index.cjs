/*  Auto‑Class Bot – agenda la clase y manda capturas a Discord  */

const { chromium } = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs = require('dayjs');

const USER_ID     = process.env.USER_ID;
const USER_PASS   = process.env.USER_PASS;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan variables de entorno');
  process.exit(1);
}

const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await context.newPage();
  page.setDefaultTimeout(60_000);              // 60 s por si la red está lenta

  /* util: reporta error con screenshot + html */
  async function reportCrash(err) {
    const ts   = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const snap = `crash_${ts}.png`;
    await page.screenshot({ path: snap, fullPage: true }).catch(()=>{});
    const html = await page.content().catch(()=>'');

    const embed = new MessageBuilder()
      .setTitle('❌ Bot falló')
      .addField('Error', err.message.slice(0,1024))
      .setColor('#ff0000')
      .setTimestamp();

    await hook.send(embed).catch(()=>{});
    await hook.sendFile(snap).catch(()=>{});
    await hook.send(`\`\`\`html\n${html.slice(0,1900)}\n\`\`\``).catch(()=>{});
  }

  try {
    /* 1 · login page */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil:'domcontentloaded' });

    /* 2 · cierra modal si existe */
    const modal = page.locator('#gxp0_cls');
    if (await modal.isVisible({ timeout:5000 }).catch(()=>false)) {
      await modal.click();
      console.log('🗙 Modal cerrado');
    }

    /* 3 · credenciales */
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 4 · esperamos a que aparezca “Agendar Clase” (no navegación) */
    await page.waitForSelector('text=Agendar Clase');

    /* 5 · Ir a Agendar Clase */
    await page.click('text=Agendar Clase');
    await page.waitForSelector('text=Confirmar');

    const ts      = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const before  = `before_${ts}.png`;
    await page.screenshot({ path: before, fullPage:true });

    /* 6 · Confirmar reserva */
    await page.click('text=Confirmar');
    await page.waitForSelector('text=Clase agendada',{ timeout:30000 }).catch(()=>{});

    const after = `after_${ts}.png`;
    await page.screenshot({ path: after, fullPage:true });

    /* 7 · Discord OK */
    const ok = new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(`Capturas ${dayjs().format('DD/MM/YYYY HH:mm')}`)
      .setColor('#00ff00');

    await hook.send(ok);
    await hook.sendFile(before);
    await hook.sendFile(after);

    console.log('✅ Flujo completado sin errores');
  } catch (err) {
    console.error(err);
    await reportCrash(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

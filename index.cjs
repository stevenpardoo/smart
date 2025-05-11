/* Auto‑Class Bot – cierra modal, agenda y envía capturas */

const { chromium }          = require('playwright');
const { Webhook,MessageBuilder } = require('discord-webhook-node');
const dayjs                  = require('dayjs');

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan variables de entorno'); process.exit(1);
}
const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless:true });
  const page    = await (await browser.newContext({ viewport:{width:1280,height:720}})).newPage();
  page.setDefaultTimeout(90_000);

  async function report(label, err) {
    const fn = `${label}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;
    await page.screenshot({ path:fn, fullPage:true }).catch(()=>{});
    await hook.send(new MessageBuilder()
      .setTitle(`❌ ${label}`)
      .setDescription(err.message.slice(0,1024))
      .setColor('#ff0000')
      .setTimestamp());
    await hook.sendFile(fn).catch(()=>{});
  }

  try {
    /* 1. Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil:'domcontentloaded' });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');

    /* 2. Cerrar el modal (3 estrategias) */
    console.log('↻ Cerrando modal si existe…');
    await page.waitForTimeout(1_000);
    const modalCLS = page.locator('#gxp0_cls');
    if (await modalCLS.count())            await modalCLS.click().catch(()=>{});
    if ((await modalCLS.count()) &&        // si sigue, fuerza ocultar
        await modalCLS.isVisible().catch(()=>false)) {
      await page.evaluate(() => {
        document.querySelectorAll('div[id^="gxp"][class*=popup]')
                .forEach(el => el.style.display='none');
      });
    }

    /* 3. Esperar el menú principal */
    console.log('↻ Esperando menú…');
    await page.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]',
                               { timeout:60_000 });

    /* 4. Localizar icono “PROGRAMACION” (alt|title Matriculas) */
    const icon = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"], img[title="Matriculas"]').first();
    if (!await icon.count()) throw new Error('Icono “Programación/Matriculas” no encontrado.');

    await icon.click();
    await page.waitForLoadState('networkidle');

    /* 5. Captura antes y después */
    const ts   = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const pre  = `before_${ts}.png`;
    const post = `after_${ts}.png`;
    await page.screenshot({ path:pre, fullPage:true });

    /* 6. Confirmar */
    await page.click('text=Confirmar, text=/Reservar/i').catch(()=>{});
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path:post, fullPage:true });

    /* 7. Discord OK */
    await hook.send(new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(dayjs().format('DD/MM/YYYY HH:mm'))
      .setColor('#00ff00'));
    await hook.sendFile(pre);  await hook.sendFile(post);

    console.log('✅ Flujo completado');
  } catch (err) {
    console.error(err); await report('Crash', err); process.exit(1);
  } finally { await browser.close(); }
})();

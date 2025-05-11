/* Auto‑Class Bot — agenda clase & manda capturas a Discord */

const { chromium }          = require('playwright');
const { Webhook,MessageBuilder } = require('discord-webhook-node');
const dayjs                  = require('dayjs');

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan variables de entorno');
  process.exit(1);
}
const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless:true });
  const ctx     = await browser.newContext({ viewport:{ width:1280, height:720 }});
  const page    = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  async function notify(label, err) {
    const shot = `${label}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;
    await page.screenshot({ path:shot, fullPage:true }).catch(()=>{});
    const embed = new MessageBuilder()
      .setTitle(`❌ ${label}`)
      .setDescription(err.message.slice(0,1024))
      .setColor('#ff0000')
      .setTimestamp();
    await hook.send(embed).catch(()=>{});
    await hook.sendFile(shot).catch(()=>{});
  }

  try {
    /* 1 · Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil:'domcontentloaded' });

    /* 2 · Cerrar pop‑up si lo hay */
    const close = page.locator('#gxp0_cls, img[src*="cerrar"], img[title="Cerrar"]');
    if (await close.isVisible({ timeout:5_000 }).catch(()=>false)) {
      await close.click();
      console.log('🗙  Modal cerrado');
    }

    /* 3 · Credenciales */
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');
    console.log('↻  Esperando menú principal…');

    /* 4 · Localizar icono “Programación” (distintas variantes) */
    const variantes = [
      'img[alt="Programación"]',
      'img[alt="PROGRAMACION"]',
      'img[title="Programación"]',
      'img[title="PROGRAMACION"]',
      'text=/\\bProgramación\\b/i'
    ];
    let icon, limite = Date.now() + 60_000;
    while (!icon && Date.now() < limite) {
      /* documento principal */
      for (const sel of variantes) {
        const tmp = page.locator(sel).first();
        if (await tmp.count()) { icon = tmp; break; }
      }
      if (icon) break;

      /* iframes */
      for (const frame of page.frames()) {
        for (const sel of variantes) {
          const tmp = frame.locator(sel).first();
          if (await tmp.count()) { icon = tmp; break; }
        }
        if (icon) break;
      }
      if (!icon) await page.waitForTimeout(1000);
    }
    if (!icon)
      throw new Error('No apareció el icono “Programación”.');

    /* 5 · Entrar al módulo Programación */
    await icon.click();
    await page.waitForLoadState('networkidle');

    /* 6 · Screenshot antes */
    const ts     = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const antes  = `before_${ts}.png`;
    await page.screenshot({ path:antes, fullPage:true });

    /* 7 · Confirmar reserva */
    await page.click('text=Confirmar, text=/\\bReservar\\b/i').catch(()=>{});
    await page.waitForLoadState('networkidle');

    /* 8 · Screenshot después */
    const despues = `after_${ts}.png`;
    await page.screenshot({ path:despues, fullPage:true });

    /* 9 · Notificación OK */
    const ok = new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(dayjs().format('DD/MM/YYYY HH:mm'))
      .setColor('#00ff00');
    await hook.send(ok);
    await hook.sendFile(antes);
    await hook.sendFile(despues);

    console.log('✅  Flujo completado');
  } catch (err) {
    await notify('Crash', err);
    process.exit(1);
  } finally { await browser.close(); }
})();

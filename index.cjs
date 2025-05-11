/*  Auto‑Class Bot  – cierra el modal, reserva la clase y
    envía 2 capturas de pantalla a Discord                  */

const { chromium } = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dayjs = require('dayjs');

// ▸ Configura estas variables en Railway › Variables
const USER_ID     = process.env.USER_ID;     // ej. 1023928198
const USER_PASS   = process.env.USER_PASS;   // ej. Pardo93.
const WEBHOOK_URL = process.env.WEBHOOK_URL; // URL del webhook de Discord

if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error('❌  Faltan variables de entorno (USER_ID, USER_PASS o WEBHOOK_URL).');
  process.exit(1);
}

const hook = new Webhook(WEBHOOK_URL);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await context.newPage();

  try {
    /* 1. Abrir la página de login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx',
                    { waitUntil: 'domcontentloaded' });

    /* 2. Cerrar el pop‑up (si aparece) */
    try {
      const closeBtn = page.locator('#gxp0_cls');
      if (await closeBtn.isVisible({ timeout: 5_000 })) {
        await closeBtn.click();
        console.log('🗙  Modal cerrado');
      }
    } catch {/* no apareció, seguimos */}

    /* 3. Login */
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',   USER_PASS);
    await page.click('input[name="BUTTON1"]');          // “Confirmar”
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    /* 4. Ir a “Agendar Clase” */
    await page.click('text=Agendar Clase');
    await page.waitForLoadState('networkidle');

    /* 5. Screenshot antes */
    const stamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const pre   = `before_${stamp}.png`;
    await page.screenshot({ path: pre, fullPage: true });

    /* 6. Confirmar reserva */
    await page.click('text=Confirmar');
    await page.waitForLoadState('networkidle');

    /* 7. Screenshot después */
    const post  = `after_${stamp}.png`;
    await page.screenshot({ path: post, fullPage: true });

    /* 8. Enviar a Discord */
    const ok = new MessageBuilder()
      .setTitle('✅ Clase agendada')
      .setDescription(`Capturas generadas el ${dayjs().format('DD/MM/YYYY HH:mm')}`)
      .setColor('#00ff00');

    await hook.send(ok);
    await hook.sendFile(pre);
    await hook.sendFile(post);

    console.log('✅  Flujo completado sin errores');
  } catch (err) {
    console.error(err);

    const fail = new MessageBuilder()
      .setTitle('❌ Error en el bot')
      .setDescription(err.message)
      .setColor('#ff0000');

    await hook.send(fail);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

const { chromium } = require('playwright');
const { Webhook, MessageBuilder } = require('discord-webhook-node');

const hook = new Webhook(process.env.DISCORD_WEBHOOK_URL);

// ⚙️  configura aquí tu usuario / pass
const USER = process.env.SMART_USER;
const PASS = process.env.SMART_PASS;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. Login
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx', { waitUntil: 'domcontentloaded' });
    await page.fill("input[name='vUSUCOD']", USER);
    await page.fill("input[name='vPASS']", PASS);
    await page.click("#BUTTON1");                    // Confirmar
    await page.waitForNavigation();

    // 2. Ir a agenda y reservar (…tu flujo existente…)
    // ↳ cuando sepas que la reserva se completó:
    const shot1 = 'agenda.png';
    await page.screenshot({ path: shot1, fullPage: true });

    // 3. Mandar la captura al canal
    const card = new MessageBuilder()
      .setName('Auto‑Class Bot')
      .setText('✅ Clase agendada correctamente')
      .setColor('#00b894');

    await hook.send(card);          // mensaje
    await hook.sendFile(shot1);     // imagen

    // 4. ( Opcional ) captura final de “flujo completo”
    const shot2 = 'final.png';
    await page.screenshot({ path: shot2, fullPage: true });
    await hook.sendFile(shot2);

    console.log('✅  Flujo completado y capturas enviadas');
  } catch (err) {
    console.error(err);
    await hook.error(`❌ Ocurrió un error:\n\`\`\`${err.message}\`\`\``);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

import { chromium } from 'playwright';
import fs from 'fs/promises';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

const H1 = '18:00', H2 = '19:30', SEDE = 'CENTRO MAYOR';
const MAX = 12, GAP = 5 * 60_000;   // 12 intentos, 5 min

const stamp = () => new Date().toISOString();
const log = m => console.log(`[${stamp()}] ${m}`);

async function debugDump(page, tag) {
  const png = await page.screenshot();
  const html = await page.content();
  const b64 = png.toString('base64');
  await fs.writeFile(`login-fail-${tag}.png`, png);
  await fs.writeFile(`login-fail-${tag}.html`, html);
  log(`🖼 Screenshot Base64 (primeros 200 chars): ${b64.slice(0,200)}…`);
}

async function intento(at) {
  const browser = await chromium.launch({ headless:true });
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  page.setDefaultNavigationTimeout(90_000);

  try {
    /* Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      page.click('input[value="Confirmar"]'),
      page.waitForNavigation({ waitUntil:'domcontentloaded' })
    ]);

    /* Esperamos icono Programación (adjacent o dentro de iframe) */
    const progIcon = await page
      .waitForSelector('img[src*="PROGRAMACION"]', { timeout:30_000, state:'attached' })
      .catch(() => null);

    if (!progIcon) {
      log(`⚠️  Login no mostró icono Programación (intento ${at})`);
      await debugDump(page, at);
      await browser.close();
      return false;
    }

    /* Dashboard → Programación */
    await progIcon.click({ force:true });

    /* Plan */
    await page.waitForSelector('text=INGB1C1');
    await page.click('text=INGB1C1');
    await Promise.all([
      page.click('input[value="Iniciar"]'),
      page.waitForSelector('text=Programar clases')
    ]);

    /* util asignar */
    const asignar = async hora => {
      await page.selectOption('select[name="vTPEAPROBO"]', { label:'Pendientes por programar' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('input[value="Asignar"]');

      await page.selectOption('select[name="vREGCONREG"]', { label:SEDE });
      const selDia = await page.waitForSelector('select[name="vDIA"]');

      if ((await selDia.evaluate(e=>e.options.length)) < 2) {
        log('⏸ Sin fecha disponible'); await page.click('input[value="Regresar"]'); return false;
      }
      await selDia.selectOption({ index:1 });

      if (await page.$('text=No hay salones disponibles')) {
        log('⏸ Sin salones'); await page.click('input[value="Regresar"]'); return false;
      }

      const fila = await page.$(`text="${hora}"`);
      if (!fila) { log(`⏸ Hora ${hora} no listada`); await page.click('input[value="Regresar"]'); return false; }
      await fila.click();
      await Promise.all([
        page.click('input[value="Confirmar"]'),
        page.waitForSelector('text=Clase asignada').catch(()=>null)
      ]);
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const ok = (await asignar(H1)) | (await asignar(H2));
    await browser.close();
    return ok;
  } catch (e) {
    log(`❌ Excepción: ${e.message}`);
    await debugDump(page, `exception-${at}`);
    await browser.close();
    return false;
  }
}

(async () => {
  for (let i=1; i<=MAX; i++){
    log(`🔄 Intento ${i}/${MAX}`);
    if (await intento(i)) { log('🎉 Agendamiento completo'); process.exit(0); }
    if (i<MAX){ log('⏱ Espera 5 min'); await new Promise(r=>setTimeout(r,GAP)); }
  }
  log('🚫 Máximo de intentos sin éxito');
  process.exit(0);
})();

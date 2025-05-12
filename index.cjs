/*  Auto‑Class Bot – agenda 18 h y 19 h 30  */
import { chromium } from 'playwright';
import dayjs from 'dayjs';
import { Webhook, MessageBuilder } from 'discord-webhook-node';

/* ─── ENV ───────────────────────────────────────────── */
const { USER_ID, USER_PWD, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('Faltan USER_ID o USER_PWD');
const hook = WEBHOOK_URL ? new Webhook(WEBHOOK_URL) : null;
const log = (m, ok = true) =>
  hook ? hook.send(new MessageBuilder().setTitle(m).setColor(ok ? '#00ff00' : '#ff0000').setTimestamp()) : null;

/* ─── PARÁMETROS DEL FLUJO ─────────────────────────── */
const PLAN_TXT   = 'INGB1C1';          // texto exacto de tu plan
const HORAS      = ['18:00', '19:30']; // orden de preferencia
const SEDE_TXT   = 'CENTRO MAYOR';

/* ─── MAIN ─────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultNavigationTimeout(90_000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',    USER_PWD);
    await Promise.all([
      page.waitForSelector('img[alt="Programación"]', { timeout: 60_000 }),
      page.press('input[name="vPASS"]', 'Enter')
    ]);

    /* 2. PROGRAMACIÓN */
    await page.click('img[alt="Programación"]');
    await page.waitForSelector(`text=${PLAN_TXT}`, { timeout: 30_000 });
    await page.click(`text=${PLAN_TXT}`);
    await Promise.all([
      page.waitForSelector('text=Programar clases', { timeout: 30_000 }),
      page.click('input[value="Iniciar"]')
    ]);

    /* 3. FUNCIÓN UTIL PARA UNA HORA */
    const reservarHora = async (hora) => {
      // filtro “Pendientes…”
      await page.selectOption('select[name$="APROBO"]', '2');
      // primera fila pendiente
      const fila = page.locator('input[type=checkbox][name="vCHECK"]').first();
      if (!await fila.count()) { console.log('⏸ Sin filas pendientes'); return false; }
      await fila.check();
      await page.click('text=Asignar');

      // popup
      const pop = await page.waitForSelector('select[name="VTSEDE"]', { timeout: 30_000 });
      await pop.selectOption({ label: SEDE_TXT });

      // día → segunda opción habilitada
      const dOpt = pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await pop.selectOption('select[name="VFDIA"]', await dOpt.getAttribute('value'));

      // hora deseada
      const horaSel = pop.locator(`select[name="VFHORA"] option:text("${hora}")`);
      if (!await horaSel.count()) { console.log(`⏸ ${hora} no disponible`); await pop.click('text=Cancelar'); return false; }
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      // confirmar
      await Promise.all([
        page.waitForSelector('text=Clase asignada', { timeout: 60_000 }).catch(() => null),
        pop.click('text=Confirmar')
      ]);
      console.log(`✅ Clase ${hora} confirmada`);
      return true;
    };

    /* 4. BUCLE DE HORAS */
    for (const h of HORAS) await reservarHora(h);

    await log('Clases procesadas');
    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    await log(`Error: ${err.message}`, false).catch(()=>{});
    await browser.close();
    process.exit(0);
  }
})();

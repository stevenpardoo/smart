/*  Auto‑Class Bot – agenda 18 h y 19 h 30 y manda capturas a Discord  */
import { chromium } from 'playwright';
import dayjs          from 'dayjs';
import { Webhook, MessageBuilder } from 'discord-webhook-node';

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) throw new Error('ENV vars missing');

/* ─── Discord helper ───────────────────────────────────────────── */
const hook   = new Webhook(WEBHOOK_URL);
const stamp  = (base) => `${base}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.png`;
const notify = async (title, color, ...files) => {
  await hook.send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp()).catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
};

/* ─── Utilidades DOM ───────────────────────────────────────────── */
async function cerrarModal(page) {
  const x = page.locator('#gxp0_cls');
  if (await x.isVisible().catch(() => false)) return x.click();
  await page.evaluate(() => {
    document
      .querySelectorAll('div[id^="gxp"][class*="popup"]')
      .forEach((e) => (e.style.display = 'none'));
  });
}

/* Devuelve el frame o el propio `page` que contiene el <select name$="APROBO"> */
async function contextoPopup(page, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      const sel = ctx.locator('select[name$="APROBO"]');
      if (await sel.count()) return ctx;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('No apareció el popup con el selector de estado');
}

/* Selecciona “Pendientes por programar” con múltiples estrategias */
async function setEstadoPendiente(ctx) {
  const sel = ctx.locator('select[name$="APROBO"]');
  await sel.waitFor({ state: 'visible', timeout: 15_000 });

  // 1️⃣ Por label (más confiable):
  if (await sel.selectOption({ label: /pendientes/i }).catch(() => false)) return;

  // 2️⃣ Por value conocido (“2”):
  if (await sel.selectOption('2').catch(() => false)) return;

  // 3️⃣ Como último recurso da clic y envía flechas:
  await sel.click();
  await ctx.keyboard.press('ArrowDown');
  await ctx.keyboard.press('Enter');
}

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page    = await ctx.newPage();
  page.setDefaultNavigationTimeout(90_000);

  try {
    /* 1. LOGIN */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',    USER_PASS);
    await Promise.all([
      page.waitForSelector('img[alt*="PROGRAMACION"], img[alt="Matriculas"]', { timeout: 60_000 }),
      page.press('input[name="vPASS"]', 'Enter'),
    ]);

    /* 2. MODAL de aviso */
    await cerrarModal(page);

    /* 3. MENÚ → Programación */
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();

    /* 4. PLAN + Iniciar */
    await page.locator('text=/ING-B1, B2 Y C1 PLAN 582H/i').first().click();
    await Promise.all([
      page.waitForSelector('text=/Iniciar/i', { timeout: 30_000 }),
      page.click('text=Iniciar'),
    ]);

    /* 5. CONTEXTO DEL POPUP */
    console.log('⌛ Buscando popup…');
    const pop = await contextoPopup(page);

    /* 6. Estado “Pendientes por programar” */
    await setEstadoPendiente(pop);

    /* 7. screenshot del listado inicial */
    const listPNG = stamp('list');
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS */
    const HORAS = ['18:00', '19:30'];       // modifica si necesitas más
    for (const hora of HORAS) {
      /* scroll arriba por si quedó fuera de vista */
      await pop.evaluate(() => (document.querySelector('body').scrollTop = 0));

      const fila = pop.locator('input[type=checkbox][name="vCHECK"]').first();
      if (!await fila.count()) {
        console.log('⏸ No quedan filas pendientes.');
        break;
      }
      await fila.check();

      /* Asignar */
      await pop.click('text=Asignar');
      await pop.locator('select[name="VTSEDE"]').waitFor({ state: 'visible' });

      /* Sede, Día (segunda opción) y Hora */
      await pop.selectOption('select[name="VTSEDE"]', { label: 'CENTRO MAYOR' });
      const dOpt = pop.locator('select[name="VFDIA"] option:not([disabled])').nth(1);
      await pop.selectOption('select[name="VFDIA"]', await dOpt.getAttribute('value'));
      await pop.selectOption('select[name="VFHORA"]', { label: hora });

      /* Confirmar */
      await Promise.all([
        pop.click('text=Confirmar'),
        page.waitForTimeout(1_000),          // evita carrera antes del siguiente ciclo
      ]);
      console.log(`✅ Clase asignada ${hora}`);
    }

    /* 9. OK */
    const okPNG = stamp('after');
    await page.screenshot({ path: okPNG, fullPage: true });
    await notify('Clases agendadas ✅', '#00ff00', listPNG, okPNG);
    console.log('🎉 Flujo completado');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('🚨 Error:', err);
    const crash = stamp('crash');
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await notify('Crash ❌', '#ff0000', crash);
    await browser.close();
    process.exit(0);
  }
})();

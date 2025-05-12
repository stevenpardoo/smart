/* Auto Class Bot – FINAL VERSION */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TEXT = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TEXT = "CENTRO MAYOR";
const HORARIOS = ["18:00", "19:30"];
const ESTADO_VAL = "2"; // "Pendientes por programar"

/* ──────────────────────── Discord hook ───────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function sendToDiscord(title, color, ...files) {
  const card = new MessageBuilder().setTitle(title).setColor(color).setTimestamp();
  await hook.send(card).catch((e) => console.error("Discord msg err:", e.message));
  for (const f of files) {
    await hook.sendFile(f).catch((e) => console.error(`Discord file err (${f}):`, e.message));
  }
}

/* ────────────────────────── Helpers ──────────────────────── */
const stamp = (name) => `${name}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModalInfo(page) {
  console.log("🔍 Buscando modal de 'Información'...");
  try {
    const modalCont = page.locator('div[id^="gxp"][class*="gx-popup-default"]');
    await modalCont.waitFor({ state: 'visible', timeout: 7000 });
    const xBtn = page.locator('#gxp0_cls');
    if (await xBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await xBtn.click({ force: true, timeout: 3000 });
      await modalCont.waitFor({ state: 'hidden', timeout: 3000 });
      console.log("🗙 Modal 'Información' cerrado (botón X)."); return;
    }
    await page.evaluate(() => {
      document.querySelectorAll('div[id^="gxp"][class*="gx-popup-default"]')
        .forEach((m) => (m.style.display = "none"));
    });
    await modalCont.waitFor({ state: 'hidden', timeout: 3000 });
    console.log("🗙 Modal 'Información' ocultado (JS).");
  } catch (e) { console.log("ℹ️ Modal 'Información' no apareció o ya cerrado."); }
}

async function getPopupCtx(page, selectorInsidePopup, timeout = 15000) {
  console.log(`🔍 Buscando contexto para popup con selector: ${selectorInsidePopup}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.locator(selectorInsidePopup).count() > 0 && await page.locator(selectorInsidePopup).first().isVisible().catch(()=>false) ) {
      console.log("✅ Selector encontrado en página principal."); return page;
    }
    for (const frame of page.frames()) {
      if (await frame.locator(selectorInsidePopup).count() > 0 && await frame.locator(selectorInsidePopup).first().isVisible().catch(()=>false)) {
        console.log("✅ Selector encontrado en iframe."); return frame;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timeout: No se encontró contexto para popup con selector "${selectorInsidePopup}"`);
}

/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // Un poco más alto
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  try {
    /* 1. LOGIN */
    console.log("🚀 Iniciando: Login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
        page.waitForLoadState("networkidle", { timeout: 30000 }),
        page.click('input[name="BUTTON1"]')
    ]);
    console.log("Login OK. Cerrando modal de información si existe...");

    /* 2. CERRAR MODAL DE "INFORMACIÓN" */
    await cerrarModalInfo(page);

    /* 3. MENÚ PRINCIPAL → Programación */
    console.log("🔍 Navegando a Programación...");
    const progIconLoc = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"], img[title="Matriculas"]');
    await progIconLoc.first().waitFor({ state: 'visible', timeout: 30000 });
    await progIconLoc.first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    console.log("Página de Programación OK.");

    /* 4. SELECCIONAR PLAN Y PULSAR “INICIAR” */
    console.log("🔍 Seleccionando plan:", PLAN_TEXT);
    await page.locator(`text=${PLAN_TEXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForSelector('iframe[id^="gxp"]', { state: 'attached', timeout: 20000 });
    console.log("Popup 'Programar clases' (iframe) detectado.");

    /* 5. OBTENER CONTEXTO DEL POPUP "PROGRAMAR CLASES" */
    // Usamos el botón "Asignar" como referencia porque el combo de estado puede no estar si ya está filtrado.
    const pop = await getPopupCtx(page, 'input[type="button"][value="Asignar"]');
    console.log("✅ Contexto del popup 'Programar clases' OK.");

    /* 6. FILTRO “Pendientes por programar” (SI ES NECESARIO) */
    console.log("🔍 Verificando/Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]'); // Termina en APROBO
    if (await selectEstado.isVisible({timeout: 3000}).catch(()=>false)) { // Solo si el combo es visible
        const estadoActual = await selectEstado.inputValue();
        if (estadoActual !== ESTADO_VAL) {
            await selectEstado.selectOption(ESTADO_VAL);
            // Esperar a que la tabla se actualice después del filtro
            await pop.waitForFunction(async (expectedVal) => {
                const currentVal = await document.querySelector('select[name$="APROBO"]').value;
                // También podrías verificar aquí si la tabla de clases tiene algún contenido específico
                return currentVal === expectedVal;
            }, ESTADO_VAL, { timeout: 15000 });
            console.log("Filtro 'Pendientes' aplicado.");
        } else {
            console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
        }
    } else {
        console.log("ℹ️ Combo de estado no visible, asumiendo filtro correcto.");
    }
    await page.waitForTimeout(1000); // Pausa para que la tabla cargue

    /* 7. CAPTURA LISTADO INICIAL */
    const listPNG = stamp("list_clases_pendientes");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 8-a Marcar primera fila pendiente con checkbox */
      console.log("🔍 Buscando checkbox habilitado en la tabla...");
      // Selector más genérico: cualquier input checkbox dentro de una celda de la tabla de clases, que no esté disabled
      const filaCheckbox = pop.locator('table[id*="Grid"] tbody tr td input[type="checkbox"]:not([disabled])').first();

      await filaCheckbox.waitFor({ state: 'visible', timeout: 15000 }); // Esperar que sea visible
      if (!await filaCheckbox.count()) {
        const noFilasPNG = stamp(`no_checkbox_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No se encontraron checkboxes habilitados para ${hora}`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron checkboxes habilitados para agendar la hora ${hora}.`);
      }
      await filaCheckbox.scrollIntoViewIfNeeded();
      await filaCheckbox.check();
      console.log("Checkbox de primera fila pendiente marcada.");

      /* 8-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      await pop.locator('input[type="button"][value="Asignar"]').click(); // Botón Asignar por su value

      // El clic en "Asignar" abre un sub-popup. Necesitamos obtener su contexto.
      const popAsignar = await getPopupCtx(page, 'select[name="VTSEDE"]', 15000); // Combo de Sede
      console.log("Popup de asignación de Sede/Día/Hora abierto.");

      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popAsignar.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });
      await page.waitForTimeout(1500); // Pausa para que el combo de Día se actualice

      /* 8-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción)...");
      const selectDia = popAsignar.locator('select[name="VFDIA"]');
      await selectDia.waitFor({ state: 'visible', timeout: 10000 });
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(1500); // Pausa para que el combo de Hora se actualice

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      const selectHora = popAsignar.locator('select[name="VFHORA"]');
      await selectHora.waitFor({ state: 'visible', timeout: 10000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      const btnConfirmar = popAsignar.locator('input[type="button"][value="Confirmar"]'); // Botón por su value
      await btnConfirmar.click();
      
      // Esperar a que el popup de asignación se cierre o la tabla principal se actualice.
      // Una forma es esperar que el botón "Asignar" del popup principal vuelva a ser visible.
      await pop.locator('input[type="button"][value="Asignar"]').waitFor({ state: 'visible', timeout: 20000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(2000); // Pausa para refresco de la tabla de pendientes
      }
    }

    /* 9. CAPTURA FINAL Y NOTIFICACIÓN OK */
    const okPNG = stamp("todas_clases_agendadas");
    console.log("📸 Capturando estado final:", okPNG);
    await page.screenshot({ path: okPNG, fullPage: true });
    await sendToDiscord("✅✅ TODAS LAS CLASES AGENDADAS ✅✅", "#00ff00", listPNG, okPNG);
    console.log("🎉 Flujo completado exitosamente.");

  } catch (err) {
    console.error("💥 ERROR CRÍTICO EN EL FLUJO:", err);
    const crashPNG = stamp("CRASH_GENERAL");
    await page.screenshot({ path: crashPNG, fullPage: true }).catch((e) => console.error("Error al tomar screenshot del crash:", e.message));
    await sendToDiscord(`❌❌ CRASH EN EL BOT (${dayjs().format("HH:mm")}) ❌❌`, "#ff0000", crashPNG);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

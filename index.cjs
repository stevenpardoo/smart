/* Auto Class Bot – CORREGIDO Seleccion de Fila */
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

async function getPopupCtx(page, selectorInsidePopup, timeout = 20000) { // Aumentado timeout
  console.log(`🔍 Buscando contexto para popup con selector: ${selectorInsidePopup}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.locator(selectorInsidePopup).count() > 0 && await page.locator(selectorInsidePopup).first().isVisible({timeout: 500}).catch(()=>false) ) {
      console.log("✅ Selector encontrado en página principal."); return page;
    }
    for (const frame of page.frames()) {
      if (await frame.locator(selectorInsidePopup).count() > 0 && await frame.locator(selectorInsidePopup).first().isVisible({timeout: 500}).catch(()=>false)) {
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
    // Revertido: Esperar networkidle después del login, ya que esto funcionaba.
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
    console.log("Haciendo clic en 'Iniciar'...");
    await page.click("text=Iniciar");
    await page.waitForSelector('iframe[id^="gxp"]', { state: 'attached', timeout: 20000 });
    console.log("Popup 'Programar clases' (iframe) detectado.");

    /* 5. OBTENER CONTEXTO DEL POPUP "PROGRAMAR CLASES" */
    const pop = await getPopupCtx(page, 'input[type="button"][value="Asignar"]');
    console.log("✅ Contexto del popup 'Programar clases' OK.");

    /* 6. FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]');
    if (await selectEstado.isVisible({timeout: 3000}).catch(()=>false)) {
        const estadoActual = await selectEstado.inputValue();
        if (estadoActual !== ESTADO_VAL) {
            await selectEstado.selectOption(ESTADO_VAL);
            await pop.locator('//table[contains(@id, "Grid")]//tbody//tr[.//span[contains(text(), "CLASE")]]').first().waitFor({ state: 'visible', timeout: 20000 });
            console.log("Filtro 'Pendientes' aplicado.");
        } else {
            console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
        }
    } else {
        console.log("ℹ️ Combo de estado no visible, asumiendo filtro correcto.");
    }
    await page.waitForTimeout(1500); // Pausa para que la tabla cargue completamente

    /* 7. CAPTURA LISTADO INICIAL */
    const listPNG = stamp("list_clases_pendientes");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 8-a Seleccionar la primera fila que contenga "CLASE" en su descripción */
      console.log("🔍 Buscando primera fila de clase disponible...");
      // Buscamos un <tr> que tenga un <span> con el texto "CLASE" y que no esté "marcado" (si hay alguna clase visual)
      // Este selector es más genérico. Ajustar si es necesario.
      const primeraClaseFila = pop.locator('//table[contains(@id, "Grid")]//tbody//tr[.//span[contains(text(), "CLASE")] and not(.//input[@type="checkbox" and @disabled])]').first();

      await primeraClaseFila.waitFor({ state: 'visible', timeout: 20000 });
      if (!await primeraClaseFila.count()) {
        const noFilasPNG = stamp(`no_filas_clase_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No se encontraron filas de CLASE disponibles para ${hora}`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron filas de CLASE disponibles para agendar la hora ${hora}.`);
      }
      console.log("Fila de clase encontrada. Haciendo clic en el nombre de la clase (span)...");
      // Hacemos clic en el span que contiene el texto "CLASE X"
      const spanClase = primeraClaseFila.locator('span[id^="span_vPRONOMPRO_"]'); // Asumiendo que el ID del span sigue este patrón
      await spanClase.scrollIntoViewIfNeeded();
      await spanClase.click();
      console.log("Fila de clase seleccionada (clic en span).");
      await page.waitForTimeout(500); // Pequeña pausa tras el clic

      /* 8-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      await pop.locator('input[type="button"][value="Asignar"]').click();
      const popAsignar = await getPopupCtx(page, 'select[name="VTSEDE"]', 15000);
      console.log("Popup de asignación de Sede/Día/Hora abierto.");

      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popAsignar.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });
      await page.waitForTimeout(1500);

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
      await page.waitForTimeout(1500);

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      const selectHora = popAsignar.locator('select[name="VFHORA"]');
      await selectHora.waitFor({ state: 'visible', timeout: 10000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      const btnConfirmar = popAsignar.locator('input[type="button"][value="Confirmar"]');
      await btnConfirmar.click();
      await pop.locator('input[type="button"][value="Asignar"]').waitFor({ state: 'visible', timeout: 20000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(2500); // Aumentar un poco la pausa
        const selectEstadoRefresh = pop.locator('select[name$="APROBO"]');
        if (await selectEstadoRefresh.isVisible({timeout: 3000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_VAL);
           // Esperamos que la tabla se refresque buscando nuevamente una fila de clase
           await pop.locator('//table[contains(@id, "Grid")]//tbody//tr[.//span[contains(text(), "CLASE")]]').first().waitFor({ state: 'visible', timeout: 15000 });
           console.log("Filtro de pendientes refrescado.");
        } else {
            console.log("No se pudo encontrar el filtro de estado para refrescar, continuando...");
        }
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
    await sendToDiscord(`❌❌ CRASH EN EL BOT (${dayjs().format("HH:mm")}) - ${err.message.substring(0,100)}`, "#ff0000", crashPNG);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

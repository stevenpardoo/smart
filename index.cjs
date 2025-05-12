/* Auto Class Bot – ENFOQUE TOTAL: Seleccionar primera clase y clic en Asignar */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TEXT_INSIDE_SPAN = "ING-B1, B2 Y C1 PLAN 582H";
const SEDE_TEXT = "CENTRO MAYOR";
const HORARIOS_A_AGENDAR = ["18:00", "19:30"]; // Horarios que queremos agendar
const ESTADO_PENDIENTES_VALUE = "2"; // Value para "Pendientes por programar"

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

async function cerrarModalInfoInicial(page) {
  console.log("🔍 Buscando modal de 'Información' inicial...");
  try {
    const modalInicial = page.locator('div[id="gxp0_b"][class*="gx-popup-default"]');
    await modalInicial.waitFor({ state: 'visible', timeout: 8000 }); // Un poco más de tiempo
    const xBtn = page.locator('#gxp0_cls');
    if (await xBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await xBtn.click({ force: true, timeout: 4000 });
      await modalInicial.waitFor({ state: 'hidden', timeout: 4000 });
      console.log("🗙 Modal 'Información' cerrado (botón X)."); return;
    }
    await page.evaluate(() => { // Fallback
      const el = document.getElementById('gxp0_b');
      if (el) el.style.display = "none";
    });
    await modalInicial.waitFor({ state: 'hidden', timeout: 4000 });
    console.log("🗙 Modal 'Información' ocultado (JS).");
  } catch (e) { console.log("ℹ️ Modal 'Información' inicial no apareció o ya cerrado."); }
}


/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); // Timeout global

  try {
    /* 1. LOGIN (Como estaba cuando funcionaba) */
    console.log("🚀 Iniciando: Login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
        page.waitForLoadState("networkidle", { timeout: 35000 }), // Aumentar ligeramente
        page.click('input[name="BUTTON1"]')
    ]);
    console.log("Login OK. Cerrando modal de información si existe...");

    /* 2. CERRAR MODAL DE "INFORMACIÓN" INICIAL */
    await cerrarModalInfoInicial(page);

    /* 3. MENÚ PRINCIPAL → Programación */
    console.log("🔍 Navegando a Programación...");
    const progIconLoc = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"], img[title="Matriculas"]');
    await progIconLoc.first().waitFor({ state: 'visible', timeout: 35000 });
    await progIconLoc.first().click();
    await page.waitForLoadState("networkidle", { timeout: 35000 });
    console.log("Página de Programación cargada.");

    /* 4. SELECCIONAR PLAN Y PULSAR “INICIAR” */
    console.log("🔍 Seleccionando plan:", PLAN_TEXT_INSIDE_SPAN);
    await page.locator(`//span[contains(normalize-space(), "${PLAN_TEXT_INSIDE_SPAN}")]`).first().click();
    console.log("Plan seleccionado. Haciendo clic en 'Iniciar'...");
    await page.locator('input[type="button"][name="W0030BUTTON1"][value="Iniciar"]').click();
    
    console.log("🔍 Esperando iframe del popup 'Programar clases' (gxp0_ifrm)...");
    const popupIframe = page.frameLocator('#gxp0_ifrm'); // Este es el iframe del popup de "Programar clases"
    await popupIframe.locator('body').waitFor({ state: 'visible', timeout: 25000 });
    console.log("✅ Iframe del popup 'Programar clases' cargado y listo.");

    /* 5. DENTRO DEL IFRAME: FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = popupIframe.locator('select[name="W0030VTAPROBO"]');
    
    await selectEstado.waitFor({ state: 'visible', timeout: 15000 });
    const estadoActual = await selectEstado.inputValue();
    if (estadoActual !== ESTADO_PENDIENTES_VALUE) {
        await selectEstado.selectOption(ESTADO_PENDIENTES_VALUE);
        console.log("Filtro 'Pendientes' aplicado. Esperando actualización de tabla...");
        // Esperar a que la tabla de clases se actualice
        await popupIframe.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[1]')
            .first().waitFor({ state: 'visible', timeout: 25000 });
    } else {
        console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
    }
    await page.waitForTimeout(3000); // Pausa generosa para asegurar renderizado completo de la tabla

    /* 6. CAPTURA LISTADO INICIAL */
    const listPNG = stamp("list_clases_pendientes");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 7. BUCLE DE HORARIOS */
    for (const hora of HORARIOS_A_AGENDAR) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 7-a Seleccionar la PRIMERA FILA VISIBLE que parezca una clase */
      console.log("🔍 Buscando la primera fila de clase disponible para seleccionar...");
      // Selector: Primera fila <tr> dentro de la tabla W0030Grid1ContainerTbl que NO esté oculta (display:none)
      // y que contenga un <span> con un id que COMIENCE con "span_W0030vPRONOMPRO_"
      const primeraFilaVisibleDeClase = popupIframe.locator(
        '//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]'
      ).first();

      await primeraFilaVisibleDeClase.waitFor({ state: 'visible', timeout: 25000 });
      if (!await primeraFilaVisibleDeClase.count()) {
        const noFilasPNG = stamp(`no_filas_clase_visibles_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No se encontraron filas de clase VISIBLES para ${hora} después del filtro. ¿No hay clases disponibles?`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron filas de clase VISIBLES para agendar la hora ${hora}. Ver captura: ${noFilasPNG}`);
      }
      
      // Hacemos clic en la CELDA (td) que contiene el span del nombre de la clase.
      // Esto es a menudo más robusto que hacer clic solo en el span.
      // El span que nos interesa es el que tiene el id que empieza con span_W0030vPRONOMPRO_
      const celdaParaClic = primeraFilaVisibleDeClase.locator('td[.//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]').first();
      console.log("Celda de clase encontrada. Haciendo clic en la celda...");
      await celdaParaClic.scrollIntoViewIfNeeded();
      await celdaParaClic.click();
      console.log("Fila de clase seleccionada (clic en celda).");
      await page.waitForTimeout(1500); // Pausa después del clic para que la interfaz reaccione

      /* 7-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      // El botón Asignar en este popup tiene name="W0030BUTTON1" y value="Asignar"
      const botonAsignar = popupIframe.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]');
      await botonAsignar.waitFor({ state: 'visible', timeout: 10000 });
      await botonAsignar.click();
      
      console.log("🔍 Esperando popup de asignación de Sede/Día/Hora (buscando combo Sede vREGCONREG)...");
      // El sub-popup puede o no ser un nuevo iframe. getPopupCtx buscará en la página y en todos los iframes.
      const popAsignar = await getPopupCtx(page, 'select[name="vREGCONREG"]', 25000);
      console.log("Popup de asignación de Sede/Día/Hora abierto.");

      /* 7-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popAsignar.selectOption('select[name="vREGCONREG"]', { label: SEDE_TEXT });
      await page.waitForTimeout(2000);

      /* 7-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción)...");
      const selectDia = popAsignar.locator('select[name="vDIA"]');
      await selectDia.waitFor({ state: 'visible', timeout: 15000 });
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(2000);

      /* 7-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      const selectHora = popAsignar.locator('select[name="HORSEDHOR"]');
      await selectHora.waitFor({ state: 'visible', timeout: 15000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 7-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      const btnConfirmar = popAsignar.locator('input[type="button"][name="BUTTON1"][value="Confirmar"]');
      await btnConfirmar.waitFor({ state: 'visible', timeout: 10000 });
      await btnConfirmar.click();
      
      // Esperar a que el popup de asignación se cierre y volvamos al iframe principal (gxp0_ifrm)
      // y que el botón "Asignar" de allí vuelva a estar visible.
      await popupIframe.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').waitFor({ state: 'visible', timeout: 30000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS_A_AGENDAR.indexOf(hora) < HORARIOS_A_AGENDAR.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(3500);

        const selectEstadoRefresh = popupIframe.locator('select[name="W0030VTAPROBO"]');
        if (await selectEstadoRefresh.isVisible({timeout: 5000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_PENDIENTES_VALUE);
           await popupIframe.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]')
               .first().waitFor({ state: 'visible', timeout: 20000 });
           console.log("Filtro de pendientes refrescado para siguiente clase.");
        } else {
            console.log("Advertencia: No se pudo encontrar el filtro de estado para refrescar.");
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
    console.error("💥 ERROR CRÍTICO EN EL FLUJO:", err.message);
    console.error(err.stack); 
    const crashPNG = stamp("CRASH_GENERAL");
    try {
      await page.screenshot({ path: crashPNG, fullPage: true });
      await sendToDiscord(`❌❌ CRASH EN EL BOT (${dayjs().format("HH:mm")}) - ${err.message.substring(0,200)}`, "#ff0000", crashPNG);
    } catch (screenErr) {
      console.error("Error al tomar screenshot del crash:", screenErr.message);
      await sendToDiscord(`❌❌ CRASH EN EL BOT (${dayjs().format("HH:mm")}) - ${err.message.substring(0,200)} (sin screenshot)`, "#ff0000");
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

/* Auto Class Bot – SOLUCIÓN DE RAÍZ CON IFRAMES Y SELECTORES PRECISOS */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TEXT_SELECTOR = `//span[contains(text(), "ING-B1, B2 Y C1 PLAN 582H")]`; // Selector XPath para el plan
const SEDE_TEXT = "CENTRO MAYOR";
const HORARIOS = ["18:00", "19:30"];
const ESTADO_PENDIENTES_VALUE = "2"; // Value "2" para "Pendientes por programar"

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
    const modalInicial = page.locator('div[id="gxp0_b"][class*="gx-popup-default"]'); // Contenedor del popup de info
    await modalInicial.waitFor({ state: 'visible', timeout: 7000 });
    const xBtn = page.locator('#gxp0_cls'); // Botón X de ese popup
    if (await xBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log("Intentando cerrar modal de 'Información' con botón X...");
      await xBtn.click({ force: true, timeout: 3000 });
      await modalInicial.waitFor({ state: 'hidden', timeout: 3000 });
      console.log("🗙 Modal 'Información' cerrado (botón X).");
      return;
    }
    console.log("Botón X no funcionó/encontrado, intentando ocultar modal 'Información' por JS...");
    await page.evaluate(() => {
      const el = document.getElementById('gxp0_b');
      if (el) el.style.display = "none";
    });
    await modalInicial.waitFor({ state: 'hidden', timeout: 3000 });
    console.log("🗙 Modal 'Información' ocultado (JS).");
  } catch (e) {
    console.log("ℹ️ Modal 'Información' inicial no apareció o ya estaba cerrado.");
  }
}

/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); // Timeout global

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
        page.click('input[name="BUTTON1"]') // Botón Confirmar del Login
    ]);
    console.log("Login OK. Cerrando modal de información si existe...");

    /* 2. CERRAR MODAL DE "INFORMACIÓN" INICIAL (PAZ Y SALVO) */
    await cerrarModalInfoInicial(page);

    /* 3. MENÚ PRINCIPAL → Programación */
    console.log("🔍 Navegando a Programación...");
    // Usamos el selector de imagen que funcionó antes
    const progIconLoc = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"], img[title="Matriculas"]');
    await progIconLoc.first().waitFor({ state: 'visible', timeout: 30000 });
    await progIconLoc.first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    console.log("Página de Programación cargada.");

    /* 4. SELECCIONAR PLAN Y PULSAR “INICIAR” */
    console.log("🔍 Seleccionando plan por texto...");
    // Basado en tu HTML, el plan está en un span con ID W0030TMPCODART_0001
    // pero el clic es en la fila, así que buscaremos el span y luego su ancestro <tr> o el clic directo en el span si activa la selección.
    // Si PLAN_TEXT_SELECTOR es XPath, usamos page.locator(PLAN_TEXT_SELECTOR)
    const planLocator = page.locator(PLAN_TEXT_SELECTOR).first(); // Asume que PLAN_TEXT_SELECTOR es un selector CSS/Playwright válido
    await planLocator.waitFor({ state: 'visible', timeout: 20000 });
    console.log("Plan encontrado. Haciendo clic en el plan...");
    await planLocator.click(); // Clic en el elemento del plan

    console.log("Haciendo clic en 'Iniciar'...");
    // El botón iniciar tiene name="W0030BUTTON1" según tu HTML de "agendar clase.html"
    await page.locator('input[type="button"][name="W0030BUTTON1"][value="Iniciar"]').click();

    // ESPERAR A QUE EL IFRAME DEL POPUP "PROGRAMAR CLASES" CARGUE
    console.log("🔍 Esperando iframe del popup 'Programar clases' (gxp0_ifrm)...");
    const popupIframe = page.frameLocator('#gxp0_ifrm'); // ID del iframe del popup
    await popupIframe.locator('body').waitFor({ state: 'visible', timeout: 20000 }); // Esperar que el body del iframe cargue
    console.log("✅ Iframe del popup 'Programar clases' cargado y listo.");

    /* 5. DENTRO DEL IFRAME: FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar' dentro del iframe...");
    // El combo de estado tiene id="W0030VTAPROBO" dentro del iframe (webpanel wv0613)
    const selectEstado = popupIframe.locator('select[name="W0030VTAPROBO"]'); // Usar el name exacto del HTML
    await selectEstado.waitFor({ state: 'visible', timeout: 15000 });
    const estadoActual = await selectEstado.inputValue();
    if (estadoActual !== ESTADO_PENDIENTES_VALUE) {
        await selectEstado.selectOption(ESTADO_PENDIENTES_VALUE);
        // Esperar a que la tabla de clases se actualice después del filtro
        // Esperaremos que al menos una fila de clase (<td> con span_W0030vPRONOMPRO) sea visible
        await popupIframe.locator('//table[contains(@id, "W0030Grid1ContainerTbl")]//tbody//tr[.//span[contains(@id, "span_W0030vPRONOMPRO_")]]')
            .first().waitFor({ state: 'visible', timeout: 20000 });
        console.log("Filtro 'Pendientes' aplicado.");
    } else {
        console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
    }
    await page.waitForTimeout(2000); // Pausa extra para asegurar renderizado completo de la tabla

    /* 6. CAPTURA LISTADO INICIAL */
    const listPNG = stamp("list_clases_pendientes");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 7. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 7-a Seleccionar la primera fila disponible (clic en el span del nombre de la clase) */
      console.log("🔍 Buscando primera fila de clase disponible (span)...");
      // Selector para el span del nombre de la clase, basado en tu HTML: span[id^="span_W0030vPRONOMPRO_"]
      // Tomamos el primero que no esté dentro de una fila que parezca "no seleccionable" (esto es heurístico)
      const primeraClaseSpan = popupIframe.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@class,"disabled")) and .//span[contains(@id,"span_W0030vPRONOMPRO_")]]//span[contains(@id,"span_W0030vPRONOMPRO_")]').first();

      await primeraClaseSpan.waitFor({ state: 'visible', timeout: 20000 });
      if (!await primeraClaseSpan.count()) {
        const noFilasPNG = stamp(`no_filas_span_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No se encontraron SPANs de clase disponibles para ${hora}`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron SPANs de clase disponibles para agendar la hora ${hora}.`);
      }
      console.log("Span de clase encontrado. Haciendo clic...");
      await primeraClaseSpan.scrollIntoViewIfNeeded();
      await primeraClaseSpan.click();
      console.log("Fila de clase seleccionada (clic en span).");
      await page.waitForTimeout(1000); // Pausa después del clic

      /* 7-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      // El botón Asignar en este popup tiene name="W0030BUTTON1" y value="Asignar"
      await popupIframe.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').click();

      // El clic en "Asignar" abre un NUEVO IFRAME o actualiza el contenido del actual.
      // Vamos a asumir que es un nuevo iframe (gxp1_ifrm o similar) o que el contexto cambia.
      // Esperaremos por el combo de Sede en CUALQUIER iframe o en la página.
      console.log("🔍 Esperando popup de asignación de Sede/Día/Hora...");
      // El combo de sede en el sub-popup es select[id="vREGCONREG"] o name="vREGCONREG" según tu HTML anterior.
      // El prefijo W0030 ya no aplicaría si es un nuevo webpanel.
      const popAsignar = await getPopupCtx(page, 'select[name="vREGCONREG"]', 20000); // Usamos el name que diste para el sub-popup
      console.log("Popup de asignación de Sede/Día/Hora abierto (contexto obtenido).");

      /* 7-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popAsignar.selectOption('select[name="vREGCONREG"]', { label: SEDE_TEXT });
      await page.waitForTimeout(1500);

      /* 7-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción)...");
      const selectDia = popAsignar.locator('select[name="vDIA"]'); // Name vDIA según tu HTML anterior
      await selectDia.waitFor({ state: 'visible', timeout: 10000 });
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(1500);

      /* 7-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      // El combo de hora en el sub-popup es select[id="HORSEDHOR"] o name="HORSEDHOR" (ajustar si es otro)
      const selectHora = popAsignar.locator('select[name="HORSEDHOR"]'); // AJUSTA ESTE SELECTOR SI ES NECESARIO
      await selectHora.waitFor({ state: 'visible', timeout: 10000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 7-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      // El botón Confirmar en el sub-popup tiene name="BUTTON1" y value="Confirmar"
      const btnConfirmar = popAsignar.locator('input[type="button"][name="BUTTON1"][value="Confirmar"]');
      await btnConfirmar.click();

      // Esperar a que el popup de asignación se cierre y volvamos al iframe principal gxp0_ifrm
      // y que el botón "Asignar" de allí vuelva a estar visible.
      await popupIframe.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').waitFor({ state: 'visible', timeout: 25000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(3000); // Pausa más larga para refresco completo

        // Volver a filtrar "Pendientes por programar" en el iframe principal
        const selectEstadoRefresh = popupIframe.locator('select[name="W0030VTAPROBO"]');
        if (await selectEstadoRefresh.isVisible({timeout: 3000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_PENDIENTES_VALUE);
           await popupIframe.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[.//span[contains(@id, "span_W0030vPRONOMPRO_")]]')
               .first().waitFor({ state: 'visible', timeout: 15000 });
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
    console.error(err.stack); // Imprimir el stacktrace completo
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

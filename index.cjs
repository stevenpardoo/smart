/* Auto Class Bot – VERSIÓN CON LÓGICA RESTAURADA Y ENFOQUE EN PASO 8 */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TEXT_INSIDE_SPAN = "ING-B1, B2 Y C1 PLAN 582H"; // Texto exacto del plan
const SEDE_TEXT = "CENTRO MAYOR";
const HORARIOS_A_AGENDAR = ["18:00", "19:30"];
const ESTADO_PENDIENTES_VALUE = "2";

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

// Esta es la función cerrarModal de tu código que funcionaba
async function cerrarModal(page) { // Cambiado el nombre para evitar conflicto
  console.log("🔍 (Helper cerrarModal) Buscando modal inicial...");
  const x = page.locator("#gxp0_cls");
  if (await x.isVisible({timeout: 7000}).catch(() => false)) { // Aumentar timeout por si acaso
    console.log("(Helper cerrarModal) Modal encontrado, intentando cerrar con botón X...");
    await x.click({force: true, timeout: 4000}); // force:true por si acaso
    await page.locator('div[id="gxp0_b"][class*="gx-popup-default"]').waitFor({ state: 'hidden', timeout: 4000 });
    console.log("🗙 (Helper cerrarModal) Modal cerrado (botón X).");
    return;
  }
  // Fallback si el botón X no es suficiente o cambia el ID
  console.log("(Helper cerrarModal) Botón X no funcionó/encontrado o modal ya cerrado, intentando ocultar por JS si aún existe...");
  const ocultado = await page.evaluate(() => {
    const modalEl = document.querySelector('div[id^="gxp"][class*="gx-popup-default"][style*="visibility: visible"]');
    if (modalEl) {
      modalEl.style.display = "none";
      return true;
    }
    return false;
  });
  if(ocultado) console.log("🗙 (Helper cerrarModal) Modal ocultado (JS).");
  else console.log("ℹ️ (Helper cerrarModal) Modal no visible para ocultar por JS.");
}


// Esta es la función contextoPopup de tu código que funcionaba
async function contextoPopup(page, timeout = 20000) { // Aumentado timeout
  console.log(`🔍 (Helper contextoPopup) Buscando contexto del popup que contenga 'select[name$="APROBO"]'...`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const ctx of [page, ...page.frames()]) {
      const sel = ctx.locator('select[name$="APROBO"]'); // Busca un select cuyo name termine en APROBO
      if (await sel.count() > 0 && await sel.first().isVisible({timeout: 500}).catch(()=>false)) {
         console.log("✅ (Helper contextoPopup) Contexto encontrado.");
         return ctx;
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error('No apareció select[name$="APROBO"] para obtener contexto del popup de Programar Clases');
}

/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); // Timeout global

  try {
    /* 1. LOGIN (Tu lógica que funcionaba) */
    console.log("🚀 Iniciando: Login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([ // Usar Promise.all para esperar la navegación después del clic
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 35000 }),
        page.click('input[name="BUTTON1"]')
    ]);
    console.log("Login OK.");

    /* 2. CERRAR MODAL INICIAL (Tu lógica que funcionaba) */
    console.log("Cerrando modal de información inicial si existe...");
    await page.waitForTimeout(1000); // Dar tiempo a que aparezca
    await cerrarModal(page); // Usando tu función cerrarModal

    /* 3. MENÚ → Programación (Tu lógica que funcionaba) */
    console.log("🔍 Navegando a Programación...");
    await page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await page.waitForLoadState("networkidle", {timeout: 35000});
    console.log("Página de Programación cargada.");

    /* 4. PLAN + Iniciar (Tu lógica que funcionaba) */
    console.log("🔍 Seleccionando plan...");
    await page.locator(`text=${PLAN_TEXT_INSIDE_SPAN}`).first().click(); // Asumiendo PLAN_TEXT_INSIDE_SPAN
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle", {timeout: 35000}); // Esperar a que el popup se cargue
    console.log("Clic en Iniciar. Popup 'Programar clases' debería estar cargando.");

    /* 5. CONTEXTO DEL POPUP "PROGRAMAR CLASES" (Tu lógica que funcionaba) */
    console.log("🔍 Obteniendo contexto del popup 'Programar clases'...");
    // La función contextoPopup busca 'select[name$="APROBO"]' que está en el iframe gxp0_ifrm
    const pop = await contextoPopup(page);
    console.log("✅ Contexto del popup 'Programar clases' obtenido.");

    /* 6. FILTRO “Pendientes por programar” (Tu lógica que funcionaba) */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]'); // Flexible por si cambia el prefijo W0030
    await selectEstado.waitFor({ state: 'visible', timeout: 15000 });
    const estadoActual = await selectEstado.inputValue();
    if (estadoActual !== ESTADO_PENDIENTES_VALUE) {
        await selectEstado.selectOption(ESTADO_PENDIENTES_VALUE);
        console.log("Filtro 'Pendientes' aplicado. Esperando actualización de tabla...");
        // Esperar a que la tabla de clases se actualice
        await pop.locator('//table[contains(@id, "Grid")]//tbody//tr[1]//span[starts-with(@id,"span_W0030vPRONOMPRO_")]')
           .first().waitFor({ state: 'visible', timeout: 25000 });
    } else {
        console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
    }
    await page.waitForTimeout(3000);
    console.log("Tabla de clases filtrada (o ya estaba filtrada).");


    /* 7. CAPTURA LISTADO INICIAL (Tu lógica que funcionaba) */
    const listPNG = stamp("list_clases_pendientes");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS (NUEVA LÓGICA ENFOCADA AQUÍ) */
    for (const hora of HORARIOS_A_AGENDAR) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 8-a Seleccionar la PRIMERA FILA VISIBLE haciendo clic en el SPAN de descripción */
      console.log("🔍 Buscando la primera fila de clase disponible para hacer clic...");
      // Selector: Primera fila <tr> DENTRO DEL CONTEXTO 'pop' (iframe)
      // que NO esté oculta (style*="display:none" o display: none;)
      // y que contenga un <span> con id que COMIENCE con "span_W0030vPRONOMPRO_"
      const primeraFilaParaClic = pop.locator(
        '//table[contains(@id,"Grid1ContainerTbl")]//tbody//tr[not(contains(@style,"display:none")) and .//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]'
      ).first();

      await primeraFilaParaClic.waitFor({ state: 'visible', timeout: 30000 }); // Aumentado timeout
      if (!await primeraFilaParaClic.count()) {
        const noFilasPNG = stamp(`no_filas_clic_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No se encontraron filas de clase clickeables para ${hora}. ¿No hay clases disponibles?`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron filas de clase clickeables para agendar la hora ${hora}.`);
      }
      
      // Hacemos clic en el SPAN específico dentro de esa fila.
      const spanParaClic = primeraFilaParaClic.locator('span[id^="span_W0030vPRONOMPRO_"]').first();
      console.log("Fila/Span de clase encontrado. Haciendo clic...");
      await spanParaClic.scrollIntoViewIfNeeded();
      await spanParaClic.click();
      console.log("Fila de clase seleccionada (clic en span).");
      await page.waitForTimeout(1500); // Pausa después del clic

      /* 8-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      // El botón Asignar en el popup principal (iframe 'pop')
      const botonAsignarPrincipal = pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]');
      await botonAsignarPrincipal.waitFor({ state: 'visible', timeout: 10000 });
      await botonAsignarPrincipal.click();
      
      console.log("🔍 Esperando sub-popup de asignación de Sede/Día/Hora (buscando combo Sede vREGCONREG)...");
      // El sub-popup puede ser un nuevo iframe o actualizar el actual.
      // Usamos getPopupCtx que busca en la página y en todos los iframes.
      // El selector de referencia es el combo de Sede del sub-popup.
      const popSubAsignacion = await getPopupCtx(page, 'select[name="vREGCONREG"]', 25000);
      console.log("Sub-popup de asignación de Sede/Día/Hora abierto (contexto obtenido).");

      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popSubAsignacion.selectOption('select[name="vREGCONREG"]', { label: SEDE_TEXT });
      await page.waitForTimeout(2000);

      /* 8-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción)...");
      const selectDia = popSubAsignacion.locator('select[name="vDIA"]');
      await selectDia.waitFor({ state: 'visible', timeout: 15000 });
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles para seleccionar en el sub-popup.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(2000);

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      const selectHora = popSubAsignacion.locator('select[name="HORSEDHOR"]'); // Mantenemos este, si falla, revisar HTML del sub-popup
      await selectHora.waitFor({ state: 'visible', timeout: 15000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar' (sub-popup)...");
      const btnConfirmarSubPopup = popSubAsignacion.locator('input[type="button"][name="BUTTON1"][value="Confirmar"]');
      await btnConfirmarSubPopup.waitFor({ state: 'visible', timeout: 10000 });
      await btnConfirmarSubPopup.click();
      
      // Esperar a que el sub-popup se cierre y el botón "Asignar" del popup principal (iframe 'pop') vuelva a ser visible.
      await pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').waitFor({ state: 'visible', timeout: 30000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS_A_AGENDAR.indexOf(hora) < HORARIOS_A_AGENDAR.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(3500);

        const selectEstadoRefresh = pop.locator('select[name="W0030VTAPROBO"]');
        if (await selectEstadoRefresh.isVisible({timeout: 5000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_PENDIENTES_VALUE);
           await pop.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]')
               .first().waitFor({ state: 'visible', timeout: 20000 });
           console.log("Filtro de pendientes refrescado para siguiente clase.");
        } else {
            console.log("Advertencia: No se pudo encontrar el filtro de estado para refrescar (combo no visible).");
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

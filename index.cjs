/* Auto-Class Bot – MODIFICACIÓN ENFOCADA EN SELECCIÓN DE FILA (PASO 8) */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ─── ENV ───────────────────────────────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

/* ─── PARÁMETROS DEL FLUJO ─────────────────────────────────────── */
const PLAN_TXT = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT = "CENTRO MAYOR";
const HORARIOS = ["18:00", "19:30"]; // orden en que se toman
const ESTADO_VAL = "2"; // value de “Pendientes…”

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch(() => {});
  for (const f of files) await hook.sendFile(f).catch(() => {});
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const stamp = (base) => `${base}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModal(page) {
  console.log("🔍 (Helper cerrarModal) Buscando modal inicial...");
  const x = page.locator("#gxp0_cls");
  if (await x.isVisible({timeout: 7000}).catch(() => false)) {
    console.log("(Helper cerrarModal) Modal encontrado, intentando cerrar con botón X...");
    await x.click({force: true, timeout: 4000});
    await page.locator('div[id="gxp0_b"][class*="gx-popup-default"]').waitFor({ state: 'hidden', timeout: 4000 });
    console.log("🗙 (Helper cerrarModal) Modal cerrado (botón X).");
    return;
  }
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

async function contextoPopup(page, timeout = 20000) { // Aumentado timeout a 20s por si acaso
    console.log(`🔍 (Helper contextoPopup) Buscando contexto del popup que contenga 'select[name$="APROBO"]'...`);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const ctx of [page, ...page.frames()]) { // Revisa la página principal y todos los iframes
        const sel = ctx.locator('select[name$="APROBO"]'); // Busca un select cuyo name termine en APROBO
                                                          // Esto cubre W0030VTAPROBO, VTAPROBO, etc.
        if (await sel.count() > 0 && await sel.first().isVisible({timeout: 500}).catch(()=>false) ) {
           console.log("✅ (Helper contextoPopup) Contexto encontrado.");
           return ctx; // Devuelve la página o el frame que contiene el selector
        }
      }
      await page.waitForTimeout(300); // Pequeña pausa antes de reintentar
    }
    throw new Error('No apareció select[name$="APROBO"] para obtener contexto del popup de Programar Clases');
  }

/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000); // Timeout global generoso

  try {
    /* 1. LOGIN */
    console.log("🚀 Iniciando: Login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([ // Esperar la navegación que ocurre DESPUÉS del clic
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 35000 }),
        page.click('input[name="BUTTON1"]')
    ]);
    console.log("Login OK.");

    /* 2. MODAL INICIAL */
    console.log("Cerrando modal de información inicial si existe...");
    await page.waitForTimeout(1000); 
    await cerrarModal(page); 

    /* 3. MENÚ → Programación */
    console.log("🔍 Navegando a Programación...");
    const progIconLocator = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await progIconLocator.first().waitFor({state: 'visible', timeout: 35000});
    await progIconLocator.first().click();
    await page.waitForLoadState("networkidle", {timeout: 35000});
    console.log("Página de Programación cargada.");

    /* 4. PLAN + Iniciar */
    console.log("🔍 Seleccionando plan...");
    await page.locator(`text=${PLAN_TXT}`).first().click();
    await page.click("text=Iniciar");
    await page.waitForLoadState("networkidle", {timeout: 35000});
    console.log("Clic en Iniciar. Popup 'Programar clases' debería estar cargando.");
    
    /* 5. CONTEXTO DEL POPUP (iframe 'gxp0_ifrm' que contiene 'wv0613.html') */
    console.log("🔍 Obteniendo contexto del popup 'Programar clases'...");
    // Tu función contextoPopup busca el select[name$="APROBO"] y devuelve el frame correcto (pop)
    const pop = await contextoPopup(page); // Este 'pop' es el frameLocator del iframe correcto
    console.log("✅ Contexto del popup 'Programar clases' obtenido.");

    /* 6. FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]'); // Busca DENTRO del iframe 'pop'
    await selectEstado.waitFor({ state: 'visible', timeout: 15000 });
    const estadoActual = await selectEstado.inputValue();
    if (estadoActual !== ESTADO_VAL) {
        await selectEstado.selectOption(ESTADO_VAL);
        console.log("Filtro 'Pendientes' aplicado. Esperando actualización de tabla...");
        // Esperar a que la tabla se actualice DENTRO DEL IFRAME 'pop'
        await pop.locator('//table[contains(@id, "Grid1ContainerTbl")]//tbody//tr[1]//span[starts-with(@id,"span_W0030vPRONOMPRO_")]')
           .first().waitFor({ state: 'visible', timeout: 25000 });
    } else {
        console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
    }
    await page.waitForTimeout(3000); // Pausa para asegurar renderizado
    console.log("Tabla de clases filtrada (o ya estaba filtrada).");

    /* 7. SCREENSHOT DEL LISTADO INICIAL */
    const listPNG = stamp("list");
    await page.screenshot({ path: listPNG, fullPage: true });
    console.log("📸 Captura del listado de clases pendientes tomada.");

    /* 8. BUCLE DE HORARIOS -- ÚNICA SECCIÓN MODIFICADA PROFUNDAMENTE */
    for (const hora of HORARIOS) {
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 8-a SELECCIONAR LA PRIMERA FILA VISIBLE DE CLASE */
      console.log("🔍 Buscando primera fila de clase (span con ID que empieza por span_W0030vPRONOMPRO_)...");
      // Selector: Busca la primera CELDA (td) en una fila visible (tr que no tenga display:none)
      // dentro de la tabla W0030Grid1ContainerTbl (EN EL IFRAME 'pop'),
      // y esa celda debe contener un span cuyo id comience con span_W0030vPRONOMPRO_
      const primeraCeldaClickeable = pop.locator(
        '//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none"))][.//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]//td[.//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]'
      ).first();

      await primeraCeldaClickeable.waitFor({ state: 'visible', timeout: 30000 }); // Espera más larga por si la tabla tarda
      if (!await primeraCeldaClickeable.count()) {
        const noFilasPNG = stamp(`no_filas_para_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await discord(`⚠️ No se encontraron filas/celdas de clase seleccionables para ${hora}. ¿No hay cupos?`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No se encontraron filas/celdas de clase seleccionables para agendar la hora ${hora}.`);
      }
      
      console.log("Celda de clase encontrada. Haciendo clic...");
      await primeraCeldaClickeable.scrollIntoViewIfNeeded(); // Asegura que esté visible para el clic
      await primeraCeldaClickeable.click();
      console.log("Fila de clase seleccionada (clic en celda).");
      await page.waitForTimeout(1500); // Pausa para que la interfaz registre la selección

      /* 8-b BOTÓN "ASIGNAR" DENTRO DEL IFRAME 'pop' */
      console.log("Haciendo clic en 'Asignar'...");
      // El botón Asignar tiene name="W0030BUTTON1" y value="Asignar" DENTRO DEL IFRAME 'pop'
      const botonAsignar = pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]');
      await botonAsignar.waitFor({ state: 'visible', timeout: 15000 });
      await botonAsignar.click();
      
      // Ahora se abre el SUB-POPUP de Sede/Día/Hora.
      // Necesitamos obtener su contexto. Puede ser un nuevo iframe o el mismo iframe actualizado.
      // Usaremos tu función `contextoPopup` pero buscando un elemento del SUB-POPUP, como 'select[name="vREGCONREG"]'
      console.log("🔍 Esperando sub-popup de asignación (buscando combo Sede 'vREGCONREG')...");
      const popSubAsignacion = await contextoPopup(page, 25000); // Le pasamos 'page' para que busque en todos los iframes
                                                              // Y el selector ya está dentro de la función: 'select[name$="APROBO"]'
                                                              // PERO ESTO NO ES CORRECTO PARA EL SUB-POPUP
                                                              // La función contextoPopup original busca 'select[name$="APROBO"]'
                                                              // Deberíamos tener una función para buscar el contexto del SUB-POPUP por ej. por el combo de SEDE.

      // ----- INICIO CORRECCIÓN IMPORTANTE PARA SUB-POPUP -----
      // El `contextoPopup` anterior no sirve para el sub-popup de sede/día/hora
      // porque ese popup no necesariamente tiene 'select[name$="APROBO"]'.
      // Asumiremos por ahora que el sub-popup se carga DENTRO DEL MISMO IFRAME 'pop' O es un nuevo iframe
      // y buscaremos el combo de Sede para obtener su contexto si fuera necesario un anidamiento.
      // Por simplicidad aquí, si `popSubAsignacion` es igual a `pop`, los siguientes selectores DENTRO DE `pop`
      // buscarán los elementos del sub-popup si el contenido del iframe 'pop' cambió.
      // Si es un NUEVO iframe, getPopupCtx debería haberlo encontrado.

      // La forma más segura es esperar el combo de SEDE usando el frame principal `page`
      // y que `contextoPopup` lo encuentre donde sea que esté.
      // Vamos a redefinir 'popSubAsignacion' buscando específicamente el combo de sede.
      console.log("🔍 Re-obteniendo contexto para el SUB-POPUP (buscando 'select[name=\"vREGCONREG\"]')");

      let popAsignarSedeDiaHora;
      const deadlineSub = Date.now() + 20000;
      while(Date.now() < deadlineSub) {
          for (const frameCtx of [page, ...page.frames()]){
              const selSede = frameCtx.locator('select[name="vREGCONREG"]');
              if (await selSede.count() > 0 && await selSede.first().isVisible({timeout:500}).catch(()=>false)) {
                  popAsignarSedeDiaHora = frameCtx;
                  break;
              }
          }
          if (popAsignarSedeDiaHora) break;
          await page.waitForTimeout(300);
      }
      if (!popAsignarSedeDiaHora) {
          throw new Error('No se encontró el contexto del sub-popup de Sede/Día/Hora (select[name="vREGCONREG"])');
      }
      console.log("✅ Contexto del sub-popup de asignación de Sede/Día/Hora obtenido.");
      // ----- FIN CORRECCIÓN IMPORTANTE PARA SUB-POPUP -----


      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TXT);
      await popAsignarSedeDiaHora.selectOption('select[name="vREGCONREG"]', { label: SEDE_TXT });
      await page.waitForTimeout(2000);

      /* 8-d Día: segunda opción */
      console.log("🔍 Seleccionando día...");
      const selectDia = popAsignarSedeDiaHora.locator('select[name="vDIA"]');
      await selectDia.waitFor({ state: 'visible', timeout: 15000 });
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles en sub-popup.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(2000);

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      // *** ATENCIÓN: El 'name' de este combo podría ser diferente en el sub-popup ***
      // Usaremos 'HORSEDHOR' como antes, pero si falla, hay que inspeccionar el HTML del sub-popup
      const selectHora = popAsignarSedeDiaHora.locator('select[name="HORSEDHOR"]');
      await selectHora.waitFor({ state: 'visible', timeout: 15000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar' (sub-popup)...");
      const btnConfirmarSub = popAsignarSedeDiaHora.locator('input[type="button"][name="BUTTON1"][value="Confirmar"]');
      await btnConfirmarSub.waitFor({ state: 'visible', timeout: 10000 });
      await btnConfirmarSub.click();
      
      // Esperar a que el sub-popup se cierre y el botón "Asignar" del iframe 'pop' vuelva a ser visible
      await pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').waitFor({ state: 'visible', timeout: 30000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS.indexOf(hora) < HORARIOS_A_AGENDAR.length - 1) { // Corrección: HORARIOS_A_AGENDAR
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(3500);

        const selectEstadoRefresh = pop.locator('select[name$="APROBO"]'); // Usamos el 'pop' del iframe principal
        if (await selectEstadoRefresh.isVisible({timeout: 5000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_VAL); // ESTADO_VAL
           await pop.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]')
               .first().waitFor({ state: 'visible', timeout: 20000 });
           console.log("Filtro de pendientes refrescado para siguiente clase.");
        } else {
            console.log("Advertencia: No se pudo encontrar el filtro de estado para refrescar.");
        }
      }
    }

    /* 9. OK */
    const okPNG = stamp("after");
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("Clases agendadas", "#00ff00", listPNG, okPNG); // Emoji removido por si acaso
    console.log("Flujo completado"); // Emoji removido
  } catch (err) {
    console.error(err.message); // Solo el mensaje para el log de Railway
    console.error(err.stack); // Stacktrace completo para el log de Railway
    const crash = stamp("crash");
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord(`Crash - ${err.message.substring(0,100)}`, "#ff0000", crash); // Mensaje más corto para Discord
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

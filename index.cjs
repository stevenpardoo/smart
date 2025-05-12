/* Auto-Class Bot – TU CÓDIGO BASE + CORRECCIÓN EN SELECCIÓN DE FILA Y SUB-POPUP */
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
const HORARIOS = ["18:00", "19:30"];
const ESTADO_VAL = "2"; // “Pendientes por programar”

/* ─── Discord helper ───────────────────────────────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(title, color, ...files) {
  await hook
    .send(new MessageBuilder().setTitle(title).setColor(color).setTimestamp())
    .catch((e) => {console.error("Error enviando mensaje a Discord:", e.message);});
  for (const f of files) {
    await hook.sendFile(f).catch((e) => {console.error(`Error enviando archivo ${f} a Discord:`, e.message);});
  }
}

/* ─── Utils ─────────────────────────────────────────────────────── */
const stamp = (base) => `${base}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModal(page) { // Tu función original
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

async function contextoPopupPrincipal(page, timeout = 20000) { // Renombrada para claridad
    console.log(`🔍 (Helper contextoPopupPrincipal) Buscando contexto del popup de 'Programar Clases' (iframe con 'select[name$="APROBO"]')...`);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const ctx of [page, ...page.frames()]) {
        const sel = ctx.locator('select[name$="APROBO"]'); // Combo de Estado de las clases
        if (await sel.count() > 0 && await sel.first().isVisible({timeout: 500}).catch(()=>false) ) {
           console.log("✅ (Helper contextoPopupPrincipal) Contexto del popup 'Programar Clases' encontrado.");
           return ctx;
        }
      }
      await page.waitForTimeout(300);
    }
    throw new Error('No apareció select[name$="APROBO"] para obtener contexto del popup de Programar Clases');
}

async function contextoSubPopupAsignacion(page, timeout = 25000) {
    console.log(`🔍 (Helper contextoSubPopupAsignacion) Buscando contexto del sub-popup de Sede/Día/Hora (iframe con 'select[name="vREGCONREG"]')...`);
    const deadline = Date.now() + timeout;
    while(Date.now() < deadline) {
        for (const frameCtx of [page, ...page.frames()]){
            const selSede = frameCtx.locator('select[name="vREGCONREG"]'); // Combo de Sede del sub-popup
            if (await selSede.count() > 0 && await selSede.first().isVisible({timeout:1000}).catch(()=>false)) { // Aumentar un poco el timeout interno
                console.log("✅ (Helper contextoSubPopupAsignacion) Contexto del sub-popup de Sede/Día/Hora obtenido.");
                return frameCtx;
            }
        }
        await page.waitForTimeout(300);
    }
    throw new Error('No se encontró el contexto del sub-popup de Sede/Día/Hora (buscando select[name="vREGCONREG"])');
}

/* MODIFICADA: Selecciona la primera fila con estado Pendiente haciendo clic en el SPAN del nombre */
async function seleccionarPrimeraFilaPendienteParaClic(popContext) {
  console.log("🔍 (seleccionarPrimeraFilaPendienteParaClic) Buscando primera fila 'Pendiente' para hacer clic en su descripción...");
  // Selector: Busca la primera CELDA (td) en una fila visible (tr que no tenga display:none)
  // DENTRO DE LA TABLA W0030Grid1ContainerTbl (en el iframe 'popContext'),
  // esa fila debe contener un span con el texto "Pendiente" (para el estado)
  // Y la celda a clickear es la que contiene el span con el nombre de la clase (id^="span_W0030vPRONOMPRO_")
  const celdaDeNombreEnFilaPendiente = popContext.locator(
    '//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[normalize-space()="Pendiente"]][1]//td[.//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]'
  ).first();
  // El [1] después de la condición del estado asegura que tomamos la primera fila que cumpla.

  await celdaDeNombreEnFilaPendiente.waitFor({ state: 'visible', timeout: 20000 });
  if (!await celdaDeNombreEnFilaPendiente.count()) {
    console.log("ℹ️ (seleccionarPrimeraFilaPendienteParaClic) No se encontraron filas 'Pendiente' seleccionables.");
    return false; // No hay filas que cumplan
  }
  
  console.log("(seleccionarPrimeraFilaPendienteParaClic) Celda de clase 'Pendiente' encontrada. Haciendo clic...");
  await celdaDeNombreEnFilaPendiente.scrollIntoViewIfNeeded();
  await celdaDeNombreEnFilaPendiente.click();
  console.log("✅ (seleccionarPrimeraFilaPendienteParaClic) Fila de clase 'Pendiente' seleccionada (clic en celda).");
  await popContext.page().waitForTimeout(1500); // Usar page() para acceder a waitForTimeout desde el frameLocator
  return true;
}


/* ─── FLUJO PRINCIPAL ──────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);

  try {
    /* 1. LOGIN */
    console.log("🚀 Iniciando: Login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    await Promise.all([
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
    await page.waitForLoadState("networkidle", {timeout: 35000}); // Espera a que el iframe del popup se cargue
    console.log("Clic en Iniciar. Popup 'Programar clases' debería estar cargando.");
    
    /* 5. CONTEXTO DEL POPUP "PROGRAMAR CLASES" (iframe 'gxp0_ifrm') */
    console.log("🔍 Obteniendo contexto del popup 'Programar clases'...");
    const pop = await contextoPopupPrincipal(page); // Usando la función renombrada
    console.log("✅ Contexto del popup 'Programar clases' obtenido.");

    /* 6. FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]');
    await selectEstado.waitFor({ state: 'visible', timeout: 15000 });
    const estadoActual = await selectEstado.inputValue();
    if (estadoActual !== ESTADO_VAL) {
        await selectEstado.selectOption(ESTADO_VAL);
        console.log("Filtro 'Pendientes' aplicado. Esperando actualización de tabla...");
        await pop.locator('//table[contains(@id, "Grid1ContainerTbl")]//tbody//tr[1]//span[starts-with(@id,"span_W0030vPRONOMPRO_")]')
           .first().waitFor({ state: 'visible', timeout: 25000 });
    } else {
        console.log("ℹ️ Filtro ya estaba en 'Pendientes'.");
    }
    await page.waitForTimeout(3000);
    console.log("Tabla de clases filtrada.");

    /* 7. SCREENSHOT DEL LISTADO INICIAL */
    const listPNG = stamp("list");
    await page.screenshot({ path: listPNG, fullPage: true });
    console.log("📸 Captura del listado de clases pendientes tomada.");

    /* 8. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) { // Cambiado a HORARIOS (tu variable original)
      console.log(`➡️  Agendando clase para las ${hora}...`);

      /* 8-a SELECCIONAR LA PRIMERA FILA PENDIENTE */
      if (!(await seleccionarPrimeraFilaPendienteParaClic(pop))) { // Usando la nueva función
        const noFilasParaHoraPNG = stamp(`no_filas_para_hora_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await discord(`❕ No se encontraron filas 'Pendiente' para agendar la hora ${hora}. Saltando este horario.`, "#ffcc00", listPNG, noFilasParaHoraPNG);
        console.log(`❕ No se encontraron filas 'Pendiente' para la hora ${hora}. Continuando con el siguiente horario si existe.`);
        continue; // Saltar al siguiente horario si no hay filas para este
      }

      /* 8-b BOTÓN "ASIGNAR" DENTRO DEL IFRAME 'pop' */
      console.log("Haciendo clic en 'Asignar'...");
      const botonAsignar = pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]');
      await botonAsignar.waitFor({ state: 'visible', timeout: 15000 });
      await botonAsignar.click();
      
      console.log("🔍 Esperando sub-popup de asignación...");
      const popSubAsignacion = await contextoSubPopupAsignacion(page);
      console.log("✅ Sub-popup de asignación obtenido.");

      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TXT);
      await popSubAsignacion.selectOption('select[name="vREGCONREG"]', { label: SEDE_TXT });
      await page.waitForTimeout(2000);

      /* 8-d Día: segunda opción */
      console.log("🔍 Seleccionando día...");
      const selectDia = popSubAsignacion.locator('select[name="vDIA"]');
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
      const selectHora = popSubAsignacion.locator('select[name="HORSEDHOR"]');
      await selectHora.waitFor({ state: 'visible', timeout: 15000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar' (sub-popup)...");
      const btnConfirmarSub = popSubAsignacion.locator('input[type="button"][name="BUTTON1"][value="Confirmar"]');
      await btnConfirmarSub.waitFor({ state: 'visible', timeout: 10000 });
      await btnConfirmarSub.click();
      
      await pop.locator('input[type="button"][name="W0030BUTTON1"][value="Asignar"]').waitFor({ state: 'visible', timeout: 30000 });
      console.log(`✅ Clase para las ${hora} agendada.`);

      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
        console.log("Preparando para la siguiente clase...");
        await page.waitForTimeout(3500);

        const selectEstadoRefresh = pop.locator('select[name$="APROBO"]');
        if (await selectEstadoRefresh.isVisible({timeout: 5000}).catch(()=>false)){
           await selectEstadoRefresh.selectOption(ESTADO_VAL);
           // Esperar que la tabla se refresque buscando la primera fila clickeable
           await pop.locator('//table[@id="W0030Grid1ContainerTbl"]//tbody//tr[not(contains(@style,"display:none")) and .//span[normalize-space()="Pendiente"]][1]//td[.//span[starts-with(@id,"span_W0030vPRONOMPRO_")]]')
               .first().waitFor({ state: 'visible', timeout: 20000 });
           console.log("Filtro de pendientes refrescado para siguiente clase.");
        } else {
            console.log("Advertencia: No se pudo encontrar el filtro de estado para refrescar.");
        }
      }
    }

    /* 9. OK */
    const okPNG = stamp("after"); // Renombrado para evitar conflicto con la variable del bucle
    await page.screenshot({ path: okPNG, fullPage: true });
    await discord("Clases agendadas", "#00ff00", listPNG, okPNG);
    console.log("Flujo completado");
  } catch (err) {
    console.error(err.message); 
    console.error(err.stack); 
    const crash = stamp("crash");
    await page.screenshot({ path: crash, fullPage: true }).catch(() => {});
    await discord(`Crash - ${err.message.substring(0,100)}`, "#ff0000", crash);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

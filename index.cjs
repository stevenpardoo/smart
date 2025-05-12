/* Auto Class Bot – cierra modal, entra a Programación, agenda DOS clases (18h y 19h30) y envía capturas a Discord */
const { chromium } = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if (!USER_ID || !USER_PASS || !WEBHOOK_URL) {
  console.error("❌ Faltan USER_ID, USER_PASS o WEBHOOK_URL");
  process.exit(1);
}

const PLAN_TEXT = /ING-B1, B2 Y C1 PLAN 582H/i; // texto exacto del plan
const SEDE_TEXT = "CENTRO MAYOR"; // sede a elegir
const HORARIOS = ["18:00", "19:30"]; // horarios en orden
const ESTADO_VAL = "2"; // value de “Pendientes por programar”

/* ──────────────────────── Discord hook ───────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function sendToDiscord(title, color, ...files) {
  const card = new MessageBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();
  await hook.send(card).catch((e) => console.error("Error enviando mensaje a Discord:", e.message));
  for (const f of files) {
    await hook.sendFile(f).catch((e) => console.error(`Error enviando archivo ${f} a Discord:`, e.message));
  }
}

/* ────────────────────────── Helpers ──────────────────────── */
const stamp = (name) => `${name}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function cerrarModalInfo(page) {
  console.log("🔍 Buscando modal de 'Información' para cerrar...");
  try {
    const modalContainer = page.locator('div[id^="gxp"][class*="gx-popup-default"]');
    await modalContainer.waitFor({ state: 'visible', timeout: 10000 });

    const xBtn = page.locator('#gxp0_cls');
    if (await xBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Intentando cerrar modal con botón X...");
      await xBtn.click({ force: true, timeout: 5000 });
      await modalContainer.waitFor({ state: 'hidden', timeout: 5000 });
      console.log("🗙 Modal de 'Información' cerrado con botón X.");
      return;
    }

    console.log("Botón X no funcionó o no encontrado, intentando ocultar modal por JS...");
    await page.evaluate(() => {
      const modals = document.querySelectorAll('div[id^="gxp"][class*="gx-popup-default"]');
      modals.forEach((m) => (m.style.display = "none"));
    });
    await modalContainer.waitFor({ state: 'hidden', timeout: 5000 });
    console.log("🗙 Modal de 'Información' ocultado por JS.");

  } catch (e) {
    console.log("ℹ️ Modal de 'Información' no detectado o ya estaba cerrado.");
  }
}

async function getPopupWindowContext(page, selectorDelPopup, timeout = 20000) {
  console.log(`🔍 Buscando contexto del popup con selector: ${selectorDelPopup}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.locator(selectorDelPopup).isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("✅ Selector encontrado en la página principal.");
      return page;
    }
    for (const frame of page.frames()) {
      if (await frame.locator(selectorDelPopup).isVisible({ timeout: 500 }).catch(() => false)) {
        console.log("✅ Selector encontrado en un iframe.");
        return frame;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`No se encontró el contexto del popup con selector "${selectorDelPopup}" después de ${timeout / 1000}s`);
}


/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  try {
    /* 1. LOGIN */
    console.log("🚀 Iniciando flujo: Navegando a la página de login...");
    await page.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx", {
      waitUntil: "domcontentloaded", timeout: 60000
    });
    console.log("Página de login cargada. Rellenando credenciales...");
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]', USER_PASS);
    console.log("Credenciales rellenadas. Haciendo clic en 'Confirmar'...");
    await Promise.all([
        page.waitForLoadState("networkidle", { timeout: 30000 }),
        page.click('input[name="BUTTON1"]')
    ]);
    console.log("Login realizado. Esperando posible modal de 'Información'...");

    /* 2. CERRAR MODAL DE "INFORMACIÓN" (PAZ Y SALVO) */
    await cerrarModalInfo(page);

    /* 3. MENÚ PRINCIPAL → Programación */
    console.log("🔍 Buscando icono de 'Programación' (o 'Matriculas')...");
    const progIconLocator = page.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"], img[title="Matriculas"]');
    await progIconLocator.first().waitFor({ state: 'visible', timeout: 30000 });
    console.log("Icono encontrado. Haciendo clic...");
    await progIconLocator.first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    console.log("Página de 'Programación' cargada.");

    /* 4. SELECCIONAR PLAN Y PULSAR “INICIAR” */
    console.log("🔍 Buscando plan:", PLAN_TEXT);
    const rowPlan = page.locator(`text=${PLAN_TEXT}`).first();
    await rowPlan.waitFor({ state: 'visible', timeout: 20000 });
    console.log("Plan encontrado. Haciendo clic...");
    await rowPlan.click();
    console.log("Haciendo clic en 'Iniciar'...");
    await page.click("text=Iniciar");
    // En lugar de networkidle, esperamos que el popup de "Programar clases" esté listo
    await page.waitForSelector('iframe[id^="gxp"]', { state: 'attached', timeout: 20000 }); // Esperar que el iframe del popup exista
    console.log("Popup 'Programar clases' (iframe) detectado.");

    /* 5. OBTENER CONTEXTO DEL POPUP "PROGRAMAR CLASES" (CON O SIN IFRAME) */
    const pop = await getPopupWindowContext(page, 'select[name$="APROBO"]');
    console.log("✅ Contexto del popup 'Programar clases' obtenido.");

    /* 6. FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]');
    await selectEstado.waitFor({ state: 'visible', timeout: 10000 });
    await selectEstado.selectOption(ESTADO_VAL);
    // Después de cambiar el select, la tabla de clases debería actualizarse.
    // Esperamos a que el primer checkbox de la tabla sea visible como señal.
    await pop.locator('input[type=checkbox][name="vCHECK"]:not([disabled])').first().waitFor({ state: 'visible', timeout: 20000 });
    console.log("Filtro aplicado y tabla de clases actualizada.");

    /* 7. CAPTURA LISTADO INICIAL */
    const listPNG = stamp("list");
    console.log("📸 Capturando listado de clases:", listPNG);
    await page.screenshot({ path: listPNG, fullPage: true });

    /* 8. BUCLE DE HORARIOS */
    for (const hora of HORARIOS) {
      console.log(`➡️  Intentando agendar clase para las ${hora}...`);

      /* 8-a Marcar primera fila pendiente */
      console.log("🔍 Buscando primera fila pendiente...");
      const filaCheckbox = pop.locator('input[type=checkbox][name="vCHECK"]:not([disabled])').first();
      if (!await filaCheckbox.count()) {
        // Tomar screenshot antes de lanzar el error si no hay filas
        const noFilasPNG = stamp(`no_filas_${hora.replace(":", "")}`);
        await page.screenshot({ path: noFilasPNG, fullPage: true });
        await sendToDiscord(`⚠️ No hay filas pendientes para ${hora}`, "#ffa500", listPNG, noFilasPNG);
        throw new Error(`No quedan filas pendientes para agendar la hora ${hora}.`);
      }
      await filaCheckbox.scrollIntoViewIfNeeded();
      await filaCheckbox.check();
      console.log("Primera fila pendiente marcada.");

      /* 8-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      await pop.click("text=Asignar");
      // El clic en "Asignar" abre OTRO popup o actualiza el contenido.
      // Necesitamos esperar el combo de Sede dentro de este nuevo contexto/popup.
      // Como no sabemos si es un nuevo iframe o el mismo, volvemos a buscar el contexto.
      const popAsignar = await getPopupWindowContext(page, 'select[name="VTSEDE"]', 15000);
      console.log("Popup de asignación abierto (o contexto encontrado).");


      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await popAsignar.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });
      await page.waitForTimeout(1000); // Pequeña pausa para que cargue el siguiente combo si depende de la sede

      /* 8-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción disponible)...");
      const selectDia = popAsignar.locator('select[name="VFDIA"]');
      await selectDia.waitFor({ state: 'visible', timeout: 10000 }); // Asegurar que el combo de día esté visible
      const diaOptions = selectDia.locator('option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles para seleccionar.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await selectDia.selectOption(diaValue);
      console.log("Día seleccionado.");
      await page.waitForTimeout(1000); // Pausa para que cargue el combo de hora

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      const selectHora = popAsignar.locator('select[name="VFHORA"]');
      await selectHora.waitFor({ state: 'visible', timeout: 10000 });
      await selectHora.selectOption({ label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      // El botón confirmar podría estar en el contexto 'popAsignar' o 'pop' o 'page'
      // Intentamos en el contexto más específico primero
      let btnConfirmar;
      if (await popAsignar.locator("text=Confirmar").isVisible({timeout:1000}).catch(()=>false)) {
          btnConfirmar = popAsignar.locator("text=Confirmar");
      } else if (await pop.locator("text=Confirmar").isVisible({timeout:1000}).catch(()=>false)) {
          btnConfirmar = pop.locator("text=Confirmar");
      } else {
          btnConfirmar = page.locator("text=Confirmar");
      }
      await btnConfirmar.click();
      // Después de confirmar, la página principal (o el popup 'pop') debería actualizarse.
      // No usamos networkidle aquí, sino que esperamos que la tabla de pendientes se refresque
      // o que aparezca un mensaje de éxito (si lo hay).
      // Por ahora, una pausa fija es más segura para GeneXus.
      await page.waitForTimeout(5000); // Ajusta esta pausa según sea necesario
      console.log(`✅ Clase para las ${hora} agendada (o intento realizado).`);

      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
          console.log("Preparando para la siguiente clase...");
          // Volver a filtrar "Pendientes por programar" si la interfaz se resetea
          const selectEstadoRefresh = pop.locator('select[name$="APROBO"]');
          if (await selectEstadoRefresh.isVisible({timeout: 3000}).catch(()=>false)){
             await selectEstadoRefresh.selectOption(ESTADO_VAL);
             await pop.locator('input[type=checkbox][name="vCHECK"]:not([disabled])').first().waitFor({ state: 'visible', timeout: 10000 });
             console.log("Filtro de pendientes refrescado.");
          } else {
              console.log("No se pudo encontrar el filtro de estado para refrescar, continuando...");
          }
      }
    }

    /* 9. CAPTURA FINAL Y NOTIFICACIÓN OK */
    const okPNG = stamp("after_all_bookings");
    console.log("📸 Capturando estado final:", okPNG);
    await page.screenshot({ path: okPNG, fullPage: true });
    await sendToDiscord("✅✅ Clases agendadas exitosamente ✅✅", "#00ff00", listPNG, okPNG);
    console.log("🎉 Flujo completado sin errores.");

  } catch (err) {
    console.error("💥 ERROR EN EL FLUJO PRINCIPAL:", err);
    const crashPNG = stamp("crash");
    await page.screenshot({ path: crashPNG, fullPage: true }).catch((e) => console.error("Error al tomar screenshot del crash:", e.message));
    await sendToDiscord(`❌ CRASH EN EL BOT (${dayjs().format("HH:mm")})`, "#ff0000", crashPNG);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

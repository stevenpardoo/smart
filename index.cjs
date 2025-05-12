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
    // Esperar a que el contenedor del modal sea visible
    const modalContainer = page.locator('div[id^="gxp"][class*="gx-popup-default"]');
    await modalContainer.waitFor({ state: 'visible', timeout: 10000 }); // Espera hasta 10s

    // Intentar cerrar con el botón X
    const xBtn = page.locator('#gxp0_cls'); // ID típico del botón X
    if (await xBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Intentando cerrar modal con botón X...");
      await xBtn.click({ force: true, timeout: 5000 }); // force:true por si está parcialmente oculto
      await modalContainer.waitFor({ state: 'hidden', timeout: 5000 }); // Esperar a que se oculte
      console.log("🗙 Modal de 'Información' cerrado con botón X.");
      return;
    }

    // Si el botón X no funcionó o no se encontró, intentar ocultar por JS
    console.log("Botón X no funcionó o no encontrado, intentando ocultar modal por JS...");
    await page.evaluate(() => {
      const modals = document.querySelectorAll('div[id^="gxp"][class*="gx-popup-default"]');
      modals.forEach((m) => (m.style.display = "none"));
    });
    await modalContainer.waitFor({ state: 'hidden', timeout: 5000 });
    console.log("🗙 Modal de 'Información' ocultado por JS.");

  } catch (e) {
    console.log("ℹ️ Modal de 'Información' no detectado o ya estaba cerrado:", e.message);
  }
}

async function getPopupWindowContext(page, selectorDelPopup, timeout = 20000) {
  console.log(`🔍 Buscando contexto del popup con selector: ${selectorDelPopup}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Revisar la página principal
    if (await page.locator(selectorDelPopup).isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("✅ Selector encontrado en la página principal.");
      return page;
    }
    // Revisar iframes
    for (const frame of page.frames()) {
      if (await frame.locator(selectorDelPopup).isVisible({ timeout: 500 }).catch(() => false)) {
        console.log("✅ Selector encontrado en un iframe.");
        return frame;
      }
    }
    await page.waitForTimeout(500); // Esperar un poco antes de reintentar
  }
  throw new Error(`No se encontró el contexto del popup con selector "${selectorDelPopup}" después de ${timeout / 1000}s`);
}


/* ────────────────────────── FLUJO PRINCIPAL ───────────────────────── */
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); // Timeout global generoso

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
        page.waitForLoadState("networkidle", { timeout: 30000 }), // Esperar a que la red se calme después del clic
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
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    console.log("Popup 'Programar clases' debería estar cargando.");

    /* 5. OBTENER CONTEXTO DEL POPUP "PROGRAMAR CLASES" (CON O SIN IFRAME) */
    // Usamos un selector que sabemos que está dentro de este popup específico
    const pop = await getPopupWindowContext(page, 'select[name$="APROBO"]');
    console.log("✅ Contexto del popup 'Programar clases' obtenido.");

    /* 6. FILTRO “Pendientes por programar” */
    console.log("🔍 Aplicando filtro 'Pendientes por programar'...");
    const selectEstado = pop.locator('select[name$="APROBO"]'); // Selector que termina en APROBO
    await selectEstado.waitFor({ state: 'visible', timeout: 10000 });
    await selectEstado.selectOption(ESTADO_VAL);
    await page.waitForLoadState("networkidle", { timeout: 20000 }); // Esperar a que el filtro aplique
    console.log("Filtro aplicado.");

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
        await sendToDiscord(`⚠️ No hay filas pendientes para ${hora}`, "#ffa500", listPNG);
        throw new Error(`No quedan filas pendientes para agendar la hora ${hora}.`);
      }
      await filaCheckbox.scrollIntoViewIfNeeded();
      await filaCheckbox.check();
      console.log("Primera fila pendiente marcada.");

      /* 8-b "Asignar" */
      console.log("Haciendo clic en 'Asignar'...");
      await pop.click("text=Asignar");
      // Esperar a que aparezca el popup de selección de sede/día/hora
      await pop.locator('select[name="VTSEDE"]').waitFor({ state: 'visible', timeout: 15000 });
      console.log("Popup de asignación abierto.");

      /* 8-c Sede */
      console.log("🔍 Seleccionando sede:", SEDE_TEXT);
      await pop.selectOption('select[name="VTSEDE"]', { label: SEDE_TEXT });

      /* 8-d Día: segunda opción de la lista habilitada */
      console.log("🔍 Seleccionando día (segunda opción disponible)...");
      const diaOptions = pop.locator('select[name="VFDIA"] option:not([disabled])');
      if (await diaOptions.count() < 2) {
        throw new Error("No hay al menos dos días disponibles para seleccionar.");
      }
      const diaValue = await diaOptions.nth(1).getAttribute("value");
      await pop.selectOption('select[name="VFDIA"]', diaValue);
      console.log("Día seleccionado.");

      /* 8-e Hora */
      console.log("🔍 Seleccionando hora:", hora);
      await pop.selectOption('select[name="VFHORA"]', { label: hora });
      console.log("Hora seleccionada.");

      /* 8-f Confirmar */
      console.log("Haciendo clic en 'Confirmar'...");
      await pop.click("text=Confirmar");
      await page.waitForLoadState("networkidle", { timeout: 30000 }); // Esperar a que se procese la confirmación
      console.log(`✅ Clase para las ${hora} agendada (o intento realizado).`);

      // Pequeña pausa antes de la siguiente iteración si es necesario,
      // para que la tabla de "pendientes" se refresque.
      if (HORARIOS.indexOf(hora) < HORARIOS.length - 1) {
          await page.waitForTimeout(2000); 
          // Puede que necesites volver a filtrar "Pendientes por programar" aquí
          // si la página se resetea completamente
          const selectEstadoRefresh = pop.locator('select[name$="APROBO"]');
          if (await selectEstadoRefresh.isVisible({timeout: 3000}).catch(()=>false)){
             await selectEstadoRefresh.selectOption(ESTADO_VAL);
             await page.waitForLoadState("networkidle", { timeout: 10000 });
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

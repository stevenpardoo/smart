/*  Auto‑Class Bot – agenda 18 h y 19 h 30  */
const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

/* ─── ENV ───────────────────────────────── */
const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if(!USER_ID||!USER_PASS||!WEBHOOK_URL){
  console.error("❌  Faltan variables"); process.exit(1);
}

/* ─── Parámetros del flujo ─────────────── */
const PLAN_TXT  = /ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT  = "CENTRO MAYOR";
const HORAS     = ["18:00","19:30"];

/* ─── Discord helper ───────────────────── */
const hook = new Webhook(WEBHOOK_URL);
async function discord(t,color,...f){
  await hook.send(new MessageBuilder().setTitle(t).setColor(color).setTimestamp()).catch(()=>{});
  for(const x of f) await hook.sendFile(x).catch(()=>{});
}
const snap = n=>`${n}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

/* ─── utilidades popup ─────────────────── */
async function closeModal(p){
  await p.locator('#gxp0_cls, div[id^="gxp"][class*="popup"]')
        .evaluateAll(nodes=>nodes.forEach(n=>n.style.display='none'))
        .catch(()=>{});
}
async function popupCtx(page,timeout=15_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    for(const ctx of [page,...page.frames()]){
      if(await ctx.locator('text=/Estado de las clases/i').count()) return ctx;
    }
    await page.waitForTimeout(300);
  }
  return page;              // si no hay label usamos main‑doc
}
async function estadoSelect(ctx){
  /* devuelve el elemento <select> sin importar el nombre real */
  const label = ctx.locator('text=/Estado de las clases/i');
  if(!await label.count()) return null;
  const sel = await label.evaluateHandle(el=>{
    const sib = el.nextElementSibling;
    return sib && sib.tagName==="SELECT" ? sib : null;
  });
  return sel.asElement();
}

/* ─── MAIN ─────────────────────────────── */
(async()=>{
  const br = await chromium.launch({headless:true});
  const pg = await(await br.newContext({viewport:{width:1280,height:720}})).newPage();
  pg.setDefaultTimeout(90_000);

  try{
    /* login */
    await pg.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx",{waitUntil:"domcontentloaded"});
    await pg.fill('input[name="vUSUCOD"]',USER_ID);
    await pg.fill('input[name="vPASS"]',USER_PASS);
    await pg.click('input[name="BUTTON1"]');
    await pg.waitForTimeout(1200); await closeModal(pg);

    /* menú principal → Programación */
    await pg.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await pg.waitForLoadState("networkidle");

    /* plan */
    await pg.locator(`text=${PLAN_TXT}`).first().click();
    await pg.click("text=Iniciar");
    await pg.waitForLoadState("networkidle");

    /* popup / iframe */
    const pop = await popupCtx(pg);
    console.log("📌 popup listo");

    /* filtro de estado (si existe) */
    const sel = await estadoSelect(pop);
    if(sel){
      const actual = await sel.evaluate(s=>s.value);
      if(actual!=="2") await sel.selectOption("2").catch(()=>{});
    }

    /* screenshot listado */
    const listPNG=snap("list"); await pg.screenshot({path:listPNG,fullPage:true});

    /* bucle horarios */
    for(const hora of HORAS){
      /* marcar fila pendiente */
      const fila = pop.locator('input[type=checkbox][name="vCHECK"]').first();
      if(!await fila.count()) throw new Error("No hay pendientes");
      await fila.evaluate(el=>el.scrollIntoView({block:"center"}));
      await fila.check();

      /* Asignar */
      await pop.click("text=Asignar");
      await pop.locator('select[name="VTSEDE"]').waitFor();

      /* Sede */
      await pop.selectOption('select[name="VTSEDE"]',{label:SEDE_TXT});

      /* Día (segunda opción) con reintento */
      let diaOk=false, intentos=0;
      while(!diaOk && ++intentos<=3){
        const opts = pop.locator('select[name="VFDIA"] option:not([disabled])');
        if(await opts.count()>1){
          const v = await opts.nth(1).getAttribute("value");
          await pop.selectOption('select[name="VFDIA"]',v); diaOk=true;
        }else await pop.waitForTimeout(2000);
      }
      if(!diaOk) throw new Error("No aparecieron días disponibles");

      /* Hora */
      await pop.selectOption('select[name="VFHORA"]',{label:hora});

      /* Confirmar */
      await pop.click("text=Confirmar");
      await pg.waitForLoadState("networkidle");
    }

    /* OK */
    const okPNG=snap("after"); await pg.screenshot({path:okPNG,fullPage:true});
    await discord("✅ Clases agendadas","#00ff00",listPNG,okPNG);
    console.log("FIN OK");

  }catch(e){
    console.error(e);
    const crash=snap("crash"); await pg.screenshot({path:crash,fullPage:true}).catch(()=>{});
    await discord("❌ Crash","#ff0000",crash);
    process.exit(1);
  }finally{ await br.close(); }
})();

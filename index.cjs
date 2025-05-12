/*  Auto‑Class Bot – agenda 18 h y 19 h 30  */
const { chromium }               = require("playwright");
const { Webhook, MessageBuilder } = require("discord-webhook-node");
const dayjs = require("dayjs");

const { USER_ID, USER_PASS, WEBHOOK_URL } = process.env;
if(!USER_ID||!USER_PASS||!WEBHOOK_URL){
  console.error("❌  Faltan USER_ID, USER_PASS o WEBHOOK_URL"); process.exit(1);
}

const PLAN_TXT=/ING-B1, B2 Y C1 PLAN 582H/i;
const SEDE_TXT="CENTRO MAYOR";
const HORAS=["18:00","19:30"];

const hook=new Webhook(WEBHOOK_URL);
const notify=(t,c,...f)=>hook.send(new MessageBuilder().setTitle(t).setColor(c).setTimestamp())
                           .then(()=>Promise.all(f.map(x=>hook.sendFile(x).catch(()=>{}))))
                           .catch(()=>{});
const snap=n=>`${n}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.png`;

async function closeModal(p){
  await p.locator('#gxp0_cls, div[id^="gxp"][class*="popup"]').evaluateAll(
        els=>els.forEach(e=>e.style.display='none')).catch(()=>{});
}

(async()=>{
  const br=await chromium.launch({ headless:true });
  const pg=await (await br.newContext({ viewport:{width:1280,height:720} })).newPage();
  pg.setDefaultTimeout(90_000);

  try{
    /* 1. Login ‑‑ espera al cambio de página */
    await pg.goto("https://schoolpack.smart.edu.co/idiomas/alumnos.aspx",{waitUntil:"domcontentloaded"});
    await pg.fill('input[name="vUSUCOD"]',USER_ID);
    await pg.fill('input[name="vPASS"]',USER_PASS);
    await Promise.all([
      pg.waitForNavigation({ waitUntil:'domcontentloaded' }),
      pg.click('input[name="BUTTON1"]')
    ]);

    /* 2. Modal  */
    await pg.waitForSelector('div[id^="gxp"][class*="popup"]',{timeout:5_000}).catch(()=>{});
    await closeModal(pg);

    /* 3. Menú principal → Programación */
    await pg.waitForSelector('img[src*="PROGRAMACION"], img[alt="Matriculas"]');
    await pg.locator('img[src*="PROGRAMACION"], img[alt="Matriculas"]').first().click();
    await pg.waitForLoadState("networkidle");

    /* 4. Plan */
    await pg.locator(`text=${PLAN_TXT}`).first().click();
    await pg.click("text=Iniciar");
    await pg.waitForLoadState("networkidle");

    /* 5. Popup / frame */
    const popCtx = await (async ()=>{               // esperar label Estado…
      for(let t=0;t<15;t++){
        const ctx=[pg,...pg.frames()].find(f=>f.locator('text=/Estado de las clases/i').count());
        if(ctx) return ctx;
        await pg.waitForTimeout(500);
      }
      return pg;
    })();

    /* 6. Filtro “Pendientes por programar” */
    const estadoSel = popCtx.locator('select[name="VTAPROBO"]');
    if(await estadoSel.count()) await estadoSel.selectOption("2").catch(()=>{});

    const list=snap("list"); await pg.screenshot({path:list,fullPage:true});

    /* 7. Loop horarios (igual que antes) */
    for(const hora of HORAS){
      const fila=popCtx.locator('input[type=checkbox][name="vCHECK"]').first();
      if(!await fila.count()) throw new Error("No hay pendientes");
      await fila.evaluate(e=>e.scrollIntoView({block:"center"}));
      await fila.check();
      await popCtx.click("text=Asignar");
      await popCtx.selectOption('select[name="VTSEDE"]',{label:SEDE_TXT});
      const diaVal=await popCtx.locator('select[name="VFDIA"] option:not([disabled])').nth(1).getAttribute("value");
      await popCtx.selectOption('select[name="VFDIA"]',diaVal);
      await popCtx.selectOption('select[name="VFHORA"]',{label:hora});
      await popCtx.click("text=Confirmar");
      await pg.waitForLoadState("networkidle");
    }

    const ok=snap("after"); await pg.screenshot({path:ok,fullPage:true});
    await notify("✅ Clases agendadas","#00ff00",list,ok);
    console.log("FIN OK");

  }catch(e){
    console.error(e);
    const crash=snap("crash"); await pg.screenshot({path:crash,fullPage:true}).catch(()=>{});
    await notify("❌ Crash","#ff0000",crash);
    process.exit(1);
  }finally{ await br.close(); }
})();

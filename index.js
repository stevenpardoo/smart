import { chromium } from 'playwright';
const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('ENV vars missing');

const H1 = '18:00', H2 = '19:30', SEDE = 'CENTRO MAYOR';
const MAX = 12, GAP = 5 * 60_000;    // 5 min
const log = m => console.log(`[${new Date().toISOString()}] ${m}`);

async function run(at) {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width:1280, height:800 } });
  p.setDefaultNavigationTimeout(90_000);

  try {
    /* Login */
    await p.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await p.fill('input[name="vUSUCOD"]', USER_ID);
    await p.fill('input[name="vPASS"]', USER_PWD);
    await Promise.all([
      p.waitForSelector('img[src*="PROGRAMACION"]', { state:'attached' }),
      p.click('input[value="Confirmar"]')
    ]);

    /* Click Programación (forzado) */
    await p.click('img[src*="PROGRAMACION"]', { force:true });

    /* Selección plan */
    await p.waitForSelector('text=INGB1C1');
    await p.click('text=INGB1C1');
    await Promise.all([
      p.waitForSelector('text=Programar clases'),
      p.click('input[value="Iniciar"]')
    ]);

    /* util */
    const asignar = async hora => {
      await p.selectOption('select[name="vTPEAPROBO"]',{ label:'Pendientes por programar'});
      await p.check('table tbody tr:first-child input[type="checkbox"]');
      await p.click('input[value="Asignar"]');

      await p.selectOption('select[name="vREGCONREG"]',{ label:SEDE });

      const selDia = await p.waitForSelector('select[name="vDIA"]');
      if ((await selDia.evaluate(e=>e.options.length))<2){log('⏸ Sin fechas');await p.click('input[value="Regresar"]');return false;}
      await selDia.selectOption({ index:1 });

      if (await p.$('text=No hay salones disponibles')){log('⏸ Sin salones');await p.click('input[value="Regresar"]');return false;}

      const row = await p.$(`text="${hora}"`);
      if(!row){log(`⏸ No listada ${hora}`);await p.click('input[value="Regresar"]');return false;}
      await row.click();
      await Promise.all([
        p.click('input[value="Confirmar"]'),
        p.waitForSelector('text=Clase asignada').catch(()=>null)
      ]);
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const ok = (await asignar(H1)) | (await asignar(H2));
    await b.close(); return ok;
  } catch(e){
    log(`⚠️  Error intento ${at}: ${e.message}`);
    await p.screenshot({ path:`login-fail-${Date.now()}.png` });
    await b.close(); return false;
  }
}

(async()=>{
  for(let i=1;i<=MAX;i++){
    log(`🔄 Intento ${i}/${MAX}`);
    if(await run(i)){log('🎉 Agendamiento completo');process.exit(0);}
    if(i<MAX){log('⏱ Espera 5 min');await new Promise(r=>setTimeout(r,GAP));}
  }
  log('🚫 Máximo de intentos sin éxito');process.exit(0);
})();

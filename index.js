/**
 * Smart auto‑class – login GeneXus sin waitForNavigation
 * Guarda PNG + HTML en /railway/artifacts  ➜ pestaña “Artifacts”
 * 12 intentos, 5 min de intervalo
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const { USER_ID, USER_PWD } = process.env;
if (!USER_ID || !USER_PWD) throw new Error('USER_ID o USER_PWD no definidos');

const RETRIES = 12;
const GAP_MS  = 5 * 60_000;
const H1      = '18:00';
const H2      = '19:30';
const SEDE    = 'CENTRO MAYOR';
const ART_DIR = '/railway/artifacts';

await fs.mkdir(ART_DIR, { recursive: true });
const ts  = () => new Date().toISOString();
const log = m => console.log(`[${ts()}] ${m}`);

async function save(page, tag) {
  const png  = await page.screenshot({ fullPage:true });
  const html = await page.content();
  const p1 = path.join(ART_DIR, `fail-${tag}.png`);
  const p2 = path.join(ART_DIR, `fail-${tag}.html`);
  await fs.writeFile(p1, png);
  await fs.writeFile(p2, html);
  log(`🖼 ${p1}`);
  log(`📄 ${p2}`);
}

async function run(at) {
  const browser = await chromium.launch({ headless:true });
  const page    = await browser.newPage({ viewport:{ width:1280, height:800 }});
  page.setDefaultTimeout(60_000);

  try {
    /* 1‑ Login */
    await page.goto('https://schoolpack.smart.edu.co/idiomas/alumnos.aspx');
    await page.fill('input[name="vUSUCOD"]', USER_ID);
    await page.fill('input[name="vPASS"]',  USER_PWD);

    // Tres métodos para disparar el evento GeneXus
    await page.click('input[value="Confirmar"]').catch(()=>{});
    await page.keyboard.press('Enter').catch(()=>{});
    await page.evaluate(() => {
      if (window.gx?.evt?.execEvt) { try { gx.evt.execEvt('',false,'EENTER.',this);}catch{} }
    });

    /* 2‑ Poll icono Programación (main doc o iframe) */
    const found = await page.waitForFunction(() => {
      const sel = 'img[src*="PROGRAMACION"]';
      const match = d => d.querySelector(sel);
      if (match(document)) return true;
      for (const fr of document.querySelectorAll('iframe')) {
        try { if (match(fr.contentDocument)) return true; } catch {}
      }
      return false;
    }, null, { timeout: 60_000 }).catch(()=>false);

    if (!found) throw new Error('Icono Programación no aparece');

    // Click icono (de nuevo via evaluate para iframe)
    await page.evaluate(() => {
      const sel = 'img[src*="PROGRAMACION"]';
      const click = d => { const e=d.querySelector(sel); if(e)e.click(); };
      click(document);
      for (const fr of document.querySelectorAll('iframe')) {
        try { click(fr.contentDocument); } catch {}
      }
    });

    /* 3‑ Selección de plan */
    await page.waitForSelector('text=INGB1C1');
    await page.click('text=INGB1C1');
    await Promise.all([
      page.click('input[value="Iniciar"]'),
      page.waitForSelector('text=Programar clases')
    ]);

    /* 4‑ Util asignar */
    const assign = async hora => {
      await page.selectOption('select[name="vTPEAPROBO"]',{ value:'2' });
      await page.check('table tbody tr:first-child input[type="checkbox"]');
      await page.click('input[value="Asignar"]');
      await page.selectOption('select[name="vREGCONREG"]',{ label:SEDE });

      const dia = await page.waitForSelector('select[name="vDIA"]');
      if ((await dia.evaluate(e=>e.options.length))<2) { await page.click('input[value="Regresar"]'); return false; }
      await dia.selectOption({ index:1 });

      if (await page.$('text=No hay salones disponibles')) { await page.click('input[value="Regresar"]'); return false; }

      const fila = await page.$(`text="${hora}"`);
      if (!fila) { await page.click('input[value="Regresar"]'); return false; }
      await fila.click();
      await Promise.all([
        page.click('input[value="Confirmar"]'),
        page.waitForSelector('text=Clase asignada').catch(()=>null)
      ]);
      log(`✅ ${hora} confirmada`);
      return true;
    };

    const ok = (await assign(H1)) | (await assign(H2));
    await browser.close();
    return ok;

  } catch (e) {
    log(`⚠️ Error intento ${at}: ${e.message}`);
    await save(page, at);
    await browser.close();
    return false;
  }
}

/* Bucle principal --------------------------------------------------- */
for (let i=1;i<=RETRIES;i++){
  log(`🔄 Intento ${i}/${RETRIES}`);
  if (await run(i)) { log('🎉 Agendamiento completo'); process.exit(0); }
  if (i<RETRIES){ log('⏱ Espera 5 min'); await new Promise(r=>setTimeout(r,GAP_MS)); }
}
log('🚫 Sin éxito tras 12 intentos');
process.exit(0);

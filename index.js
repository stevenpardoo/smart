const { chromium } = require("playwright");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

async function sendFileToDiscord(filePath) {
  const webhookUrl = "https://discord.com/api/webhooks/1370861113402724392/qYfE0bYnstE34OytItWGP73zLH_DVm-V7siW2TdRVhSw-VgoVDVCqKaa6-TNEgPCDmGZ"; // <-- REEMPLAZA ESTA LÍNEA
  const file = fs.createReadStream(filePath);

  const form = new FormData();
  form.append("file", file);

  try {
    await axios.post(webhookUrl, form, {
      headers: form.getHeaders(),
    });
    console.log(`Archivo enviado a Discord: ${filePath}`);
  } catch (error) {
    console.error(`Error al enviar ${filePath} a Discord:`, error.message);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto("https://example.com", { timeout: 60000 });

    const screenshotPath = "./fail-1.png";
    const htmlPath = "./fail-1.html";

    await page.screenshot({ path: screenshotPath });
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent);

    await sendFileToDiscord(screenshotPath);
    await sendFileToDiscord(htmlPath);

  } catch (error) {
    console.error("Error durante la ejecución del bot:", error);
  } finally {
    await browser.close();
  }
})();

export const setDomainLocalStorage = async (browser, url, kv) => {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', r => {
    r.respond({
      status: 200,
      contentType: 'text/plain',
      body: ':)',
    });
  });
  await page.goto(url);
  await page.evaluate(kv => {
    Object.keys(kv).forEach(k => {
      localStorage.setItem(k, kv[k]);
    })
  }, kv);
  await page.close();
};
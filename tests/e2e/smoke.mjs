// Headless-Chrome smoke test of the real UI with a fake Firebase.
//   npm run test:e2e
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const PASS = 'alpha beta gamma delta epsilon';
let failed = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await serve(4173);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const problems = [];
let page;
try {
  page = await browser.newPage();
  // The main walk-through uses the plain Windows look; the spreadsheet look is checked further down.
  await page.evaluateOnNewDocument(() => {
    try { if (!localStorage.getItem('pdc.settings')) localStorage.setItem('pdc.settings', JSON.stringify({ look: 'windows' })); } catch {}
  });
  await page.setViewport({ width: 1100, height: 800 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });

  const clickText = async (text, tag = 'button') => {
    const [el] = await page.$$(`xpath/.//${tag}[contains(normalize-space(.), "${text}")]`);
    if (!el) throw new Error(`no ${tag} with text: ${text}`);
    await el.click();
  };
  const waitText = (text, timeout = 15000) =>
    page.waitForFunction((t) => {
      const c = document.body.cloneNode(true);
      c.querySelectorAll('img.emo').forEach((i) => i.replaceWith(i.alt));
      return c.innerText !== undefined && (document.body.innerText + c.textContent).includes(t);
    }, { timeout }, text);
  const retype = async (el, text) => {
    await el.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await el.type(text);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  await waitText('Log in');
  ok((await page.title()) === 'Planning 2026', 'tab title is the neutral name');

  // --- invite link: she chooses her own password, twice ---
  await page.goto('http://localhost:4173/#invite=e2e-code-her-0123456789', { waitUntil: 'networkidle0' });
  await waitText('Choose your password');
  ok(!page.url().includes('invite='), 'the invite code is removed from the address bar');
  const pw = await page.$$('input[type=password]');
  await pw[0].type('abc');
  await pw[1].type('abc');
  await clickText('Set password');
  await waitText('at least 6 characters.');
  ok(true, 'a password below the Firebase minimum is refused');
  await retype(pw[0], 'a-long-enough-password');
  await retype(pw[1], 'a-long-enough-passwor!');
  await clickText('Set password');
  await waitText('do not match');
  ok(true, 'two different passwords are refused');
  await retype(pw[1], 'a-long-enough-password');
  await clickText('Set password');
  await waitText('Password saved. Now log in.');
  ok((await page.$eval('input[type=email]', (i) => i.value)) === 'her@example.com', 'after setting the password the login screen has her email filled in');
  await page.goto('http://localhost:4173/#invite=used-code-0123456789', { waitUntil: 'networkidle0' });
  await waitText('This invite cannot be used');
  ok(true, 'an expired or used invite link says so');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  await waitText('Log in');

  // --- login ---
  await page.type('input[type=email]', 'ann@example.com');
  await page.type('input[type=password]', 'login-password-1');
  await clickText('Log in');
  await waitText('Create your code');
  ok(true, 'login leads to first-time setup');

  // --- setup: mismatching, then valid passphrase (no strength rules) ---
  const inputs = await page.$$('form input');
  await retype(inputs[0], 'Ann');
  await page.click('input[type=checkbox]');
  await retype(inputs[1], 'login-password-1 plus words here');
  await retype(inputs[2], PASS);
  await clickText('Create keys');
  await waitText('do not match');
  ok(true, 'mismatching passphrases are refused');
  await retype(inputs[1], PASS);
  await clickText('Create keys');
  await page.waitForSelector('.chat');
  ok(true, 'setup creates keys and opens the chat directly, with no extra quick code step');
  ok((await bodyText()).includes('Waiting for the other person'), 'chat opens, waiting for the other person');

  // --- the other person appears ---
  await page.evaluate(() => window.__e2e.addPeer('Bob'));
  await page.waitForFunction(() => document.querySelector('.chat-head .name')?.textContent === 'Bob');
  ok((await page.$eval('.chat-head .name', (e) => e.textContent)) === 'Bob', 'header shows the other person');

  // --- live status in front of the name ---
  const statusOf = () => page.$eval('.chat-head .status-text', (e) => e.textContent);
  await page.evaluate(() => window.__e2e.setPeerPresence('active'));
  await page.waitForFunction(() => document.querySelector('.chat-head .status-text')?.textContent === 'Active now');
  await page.evaluate(() => window.__e2e.setPeerPresence('away'));
  await page.waitForFunction(() => document.querySelector('.chat-head .status-text')?.textContent?.startsWith('Away'));
  await page.evaluate(() => window.__e2e.setPeerPresence('locked'));
  await page.waitForFunction(() => document.querySelector('.chat-head .status-text')?.textContent === 'Chat locked');
  await page.evaluate(() => window.__e2e.setPeerPresence('active', 5 * 60 * 1000));
  await page.waitForFunction(() => document.querySelector('.chat-head .status-text')?.textContent?.startsWith('Offline'));
  ok((await statusOf()).startsWith('Offline, last seen'), 'status shows active, away, locked, and offline with last seen (stale signal = offline)');
  await page.evaluate(() => window.__e2e.setPeerPresence('active'));

  // --- typing shortcuts ---
  await page.click('.composer textarea');
  await page.keyboard.type(':) ');
  ok((await page.$eval('.composer textarea', (e) => e.value)) === '🙂 ', 'typing ":) " becomes an emoji');
  await page.keyboard.press('Backspace');
  ok((await page.$eval('.composer textarea', (e) => e.value)) === ':)', 'Backspace restores ":)"');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('good night <3');
  await page.keyboard.press('Enter');
  await waitText('good night ❤️');
  ok(true, 'a shortcut at the end converts when sent');
  ok((await page.$eval('.composer textarea', (e) => e.value)) === '', 'the input clears after sending');

  // nothing readable in the database
  const dump = await page.evaluate(() => window.__e2e.dump());
  ok(!dump.includes('good night') && !dump.includes(PASS) && !dump.includes('1234'), 'database holds no readable text, passphrase or code');

  // --- emoji picker ---
  await page.click('.composer .icon-btn');
  await page.waitForSelector('.picker .grid button', { timeout: 15000 });
  await page.type('.picker input', 'heart');
  await sleep(300);
  const first = await page.$('.picker .grid button');
  const emojiChar = await first.evaluate((b) => b.querySelector('img')?.alt ?? b.textContent);
  await first.click();
  ok((await page.$eval('.composer textarea', (e) => e.value)).includes(emojiChar), 'emoji picker inserts the chosen emoji');
  await page.keyboard.press('Escape');
  await page.$eval('.composer textarea', (e) => {
    e.focus();
  });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  // --- message from the other person ---
  await page.evaluate(() => window.__e2e.peerSend('hello from Bob'));
  await waitText('hello from Bob');
  ok(true, 'a message from the other person is decrypted and shown');
  ok((await page.evaluate(() => window.__e2e.dump())).includes('ciphertext'), 'stored as ciphertext');

  // --- links are plain, safe links ---
  await page.evaluate(() => window.__e2e.peerSend('see https://example.com/page ok'));
  await waitText('see https://example.com/page ok');
  const rel = await page.$eval('.bubble a', (a) => a.getAttribute('rel'));
  ok(rel.includes('noopener') && rel.includes('noreferrer'), 'links open with noopener and noreferrer');

  // --- script text is shown as text ---
  await page.evaluate(() => window.__e2e.peerSend('<img src=x onerror="document.title=\'HACKED\'"><script>1</script>'));
  await waitText('<script>1</script>');
  await sleep(200);
  ok((await page.title()) === 'Planning 2026' && (await page.$('.bubble img:not(.emo)')) === null, 'HTML in a message is shown as text and does not run');

  // --- tab alert, blur, auto behaviour ---
  const page2 = await browser.newPage(); // brings another tab to the front
  await page2.bringToFront();
  await sleep(400);
  const hidden = await page.evaluate(() => document.visibilityState === 'hidden' || !document.hasFocus());
  ok(hidden, 'the chat tab is in the background');
  ok((await page.$('.stage.is-blurred')) !== null, 'messages are blurred while the window is not focused');
  await page.evaluate(() => window.__e2e.peerSend('are you there?'));
  await sleep(1500);
  const t1 = await page.title();
  const icon1 = await page.$eval('link[rel~=icon]', (l) => l.getAttribute('href'));
  ok(t1.includes('Planning 2026') && !t1.toLowerCase().includes('are you') && !t1.toLowerCase().includes('chat'), `tab title shows no text (title: "${t1}")`);
  await sleep(1100);
  const titles = new Set([t1, await page.title()]);
  ok(titles.has('● Planning 2026') || icon1.includes('dot'), 'the tab title or icon shows the new-message dot');
  await sleep(10500);
  ok((await page.title()) === '● Planning 2026', 'after 10 seconds the blinking stops and a steady dot stays');
  ok((await page.$eval('link[rel~=icon]', (l) => l.getAttribute('href'))) === '/icon-dot.svg', 'the tab icon has the dot');
  await page.bringToFront();
  await sleep(500);
  ok((await page.title()) === 'Planning 2026', 'coming back to the tab clears the alert');
  ok((await page.$('.stage.is-blurred')) === null, 'the blur is removed on return');
  await page2.close();

  // --- quick lock with Esc twice, then the code ---
  await page.click('.messages');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await waitText('Type your code');
  ok(!(await bodyText()).includes('hello from Bob'), 'Esc twice locks and removes every message from the page');
  await page.type('input[type=password]', '0000');
  await clickText('Unlock');
  await waitText('Wrong code');
  ok((await bodyText()).includes('2 tries left'), 'a wrong code shows tries left');
  await page.type('input[type=password]', PASS);
  await clickText('Unlock');
  await page.waitForSelector('.chat');
  await waitText('hello from Bob');
  ok(true, 'the right code reopens the chat with messages decrypted');

  // --- settings ---
  await clickText('⚙️');
  await waitText('Delete messages after');
  await page.select('select', String(60 * 60 * 1000));
  await sleep(200);
  ok((await page.$eval('select', (s) => s.value)) === String(60 * 60 * 1000), 'retention can be set to 1 hour');
  await clickText('Back to chat');
  await page.waitForSelector('.chat');

  // --- spreadsheet look ---
  await clickText('⚙️');
  await clickText('Display');
  await waitText('Look of the app');
  // Import a cover sheet (a tiny synthetic one, or your own file when COVER_JSON is set).
  const fs = await import('node:fs');
  const coverPath = process.env.COVER_JSON || '/tmp/e2e-cover.json';
  if (!process.env.COVER_JSON) {
    fs.writeFileSync(coverPath, JSON.stringify({
      v: 1, fileName: 'Costs.xlsx', sheet: 'Costs', tabs: ['Costs', 'Notes'], zoom: 100,
      cols: [80, 120, 60], rows: [20, 20, 20, 20], defRow: 20, defCol: 64, imgW: 2, imgH: 2,
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }));
  }
  await (await page.$('input[type=file]')).uploadFile(coverPath);
  await waitText('Cover sheet saved');
  ok(true, 'the owner can import a cover sheet');
  const sels = await page.$$('select');
  for (const sel of sels) {
    const vals = await sel.evaluate((e) => [...e.options].map((o) => o.value));
    if (vals.includes('sheet')) await sel.select('sheet');
  }
  await page.waitForSelector('.sh');
  ok(true, 'the spreadsheet look wraps the app in a workbook frame');
  await page.screenshot({ path: '/tmp/sheet-settings.png' });
  await clickText('Back to chat');
  await page.waitForSelector('.sg-compose textarea');
  await page.type('.sg-compose textarea', 'quarterly numbers look fine');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.sg-row .sg-c.c')].some((c) => c.textContent.includes('quarterly numbers look fine')));
  ok((await page.$$eval('.sg-row', (r) => r.length)) > 20, 'messages appear as spreadsheet rows with empty rows below');
  ok((await page.$eval('.sh-title', (e) => e.textContent)).includes('Bob'), 'the other person\'s status sits in the title bar');
  await page.click('.sg-row:not(.sg-cols):not(.sg-head):not(.sg-compose) .sg-c.c');
  await page.waitForFunction(() => document.querySelector('.sh-fbar')?.textContent.length > 0);
  ok(true, 'selecting a cell shows its content in the formula bar');
  await page.screenshot({ path: '/tmp/sheet-chat.png' });
  // Esc once covers the screen with an ordinary table; a click brings the chat back.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.dz .dz-img'));
  ok(!(await bodyText()).includes('quarterly numbers look fine'), 'Esc once covers the chat with an ordinary-looking worksheet');
  await page.screenshot({ path: '/tmp/sheet-cover.png' });
  await page.mouse.click(500, 400);
  await page.waitForFunction(() => document.body.innerText.includes('quarterly numbers look fine'));
  ok(true, 'a click brings the chat back');
  await clickText('Options');
  await clickText('Display');
  await waitText('Look of the app');
  for (const sel of await page.$$('select')) {
    const vals = await sel.evaluate((e) => [...e.options].map((o) => o.value));
    if (vals.includes('windows')) await sel.select('windows');
  }
  await page.waitForFunction(() => !document.querySelector('.sh'));
  await clickText('Back to chat');
  await page.waitForSelector('.chat');

  // --- a swapped key is caught and sending is blocked ---
  await page.evaluate(() => window.__e2e.swapPeerKey());
  await waitText('Accept new key');
  ok((await page.$eval('.composer textarea', (e) => e.disabled)) === true, 'when the other person\'s key changes, the input is disabled');
  ok((await bodyText()).includes('so sending is paused'), 'a clear warning explains why');

  // --- auto-lock after time in the background (about 20 seconds in this test build) ---
  const page3 = await browser.newPage();
  await page3.bringToFront();
  await sleep(22000);
  await page.bringToFront();
  await waitText('Type your code');
  ok(!(await bodyText()).includes('hello from Bob'), 'after the set time in the background the chat locks');
  await page3.close();
  await page.type('input[type=password]', PASS);
  await clickText('Unlock');
  await page.waitForSelector('.chat');

  // --- owner makes an invite link ---
  await clickText('⚙️');
  await clickText('Account');
  await waitText('Create invite link');
  await page.type('input[aria-label="Her email"]', 'her@example.com');
  await clickText('Create invite link');
  await page.waitForSelector('input[aria-label="Invite link"]');
  ok((await page.$eval('input[aria-label="Invite link"]', (i) => i.value)).includes('#invite='), 'the owner gets an invite link in Settings');

  // --- logout ---
  await waitText('Log out');
  await clickText('Log out');
  await waitText('Log in');
  ok(!(await bodyText()).includes('hello from Bob'), 'log out removes everything from the page');
} catch (e) {
  console.log(`FAIL  ${e.message}`);
  failed++;
  try {
    console.log('--- page text at failure ---');
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
  } catch { /* ignore */ }
} finally {
  await browser.close();
  server.close();
}

const real = problems.filter((p) => !/favicon|Failed to load resource/.test(p));
ok(real.length === 0, `no page errors or console errors${real.length ? `: ${real.join(' | ')}` : ''}`);
console.log(failed === 0 ? '\nAll browser checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);

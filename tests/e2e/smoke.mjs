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
  ok((await page.title()) === 'Notes', 'tab title is the neutral name "Notes"');

  // --- login ---
  await page.type('input[type=email]', 'ann@example.com');
  await page.type('input[type=password]', 'login-password-1');
  await clickText('Log in');
  await waitText('Create your chat passphrase');
  ok(true, 'login leads to first-time setup');

  // --- setup: weak, mismatching, then valid passphrase ---
  const inputs = await page.$$('form input');
  await retype(inputs[0], 'Ann');
  await inputs[1].type('short');
  await inputs[2].type('short');
  await page.click('input[type=checkbox]');
  await clickText('Create keys');
  await waitText('Too short');
  ok(true, 'a short passphrase is refused');
  await retype(inputs[1], 'login-password-1 plus words here');
  await retype(inputs[2], PASS);
  await clickText('Create keys');
  await waitText('do not match');
  ok(true, 'mismatching passphrases are refused');
  await retype(inputs[1], PASS);
  await clickText('Create keys');
  await waitText('Choose a quick code');
  ok(true, 'setup creates keys and offers a quick code');

  // --- quick code ---
  const q = await page.$$('form input');
  await q[0].type('1234');
  await q[1].type('1234');
  await clickText('Save code');
  await page.waitForSelector('.chat');
  ok((await bodyText()).includes('Waiting for the other person'), 'chat opens, waiting for the other person');

  // --- the other person appears ---
  await page.evaluate(() => window.__e2e.addPeer('Bob'));
  await waitText('Not verified');
  ok((await page.$eval('.chat-head .name', (e) => e.textContent)) === 'Bob', 'header shows the other person');

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
  ok((await page.title()) === 'Notes' && (await page.$('.bubble img:not(.emo)')) === null, 'HTML in a message is shown as text and does not run');

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
  ok(t1.includes('Notes') && !t1.toLowerCase().includes('are you') && !t1.toLowerCase().includes('chat'), `tab title shows no text (title: "${t1}")`);
  await sleep(1100);
  const titles = new Set([t1, await page.title()]);
  ok(titles.has('● Notes') || icon1.includes('dot'), 'the tab title or icon shows the new-message dot');
  await sleep(10500);
  ok((await page.title()) === '● Notes', 'after 10 seconds the blinking stops and a steady dot stays');
  ok((await page.$eval('link[rel~=icon]', (l) => l.getAttribute('href'))) === '/icon-dot.svg', 'the tab icon has the dot');
  await page.bringToFront();
  await sleep(500);
  ok((await page.title()) === 'Notes', 'coming back to the tab clears the alert');
  ok((await page.$('.stage.is-blurred')) === null, 'the blur is removed on return');
  await page2.close();

  // --- quick lock with Esc twice, then quick code ---
  await page.click('.messages');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await waitText('Locked');
  ok(!(await bodyText()).includes('hello from Bob'), 'Esc twice locks and removes every message from the page');
  await page.type('input[type=password]', '0000');
  await clickText('Unlock');
  await waitText('Wrong code');
  ok((await bodyText()).includes('2 tries left'), 'a wrong quick code shows tries left');
  await page.type('input[type=password]', '1234');
  await clickText('Unlock');
  await page.waitForSelector('.chat');
  await waitText('hello from Bob');
  ok(true, 'the right quick code reopens the chat with messages decrypted');

  // --- verify safety code ---
  await clickText('Verify now');
  await waitText('Verify safety code');
  const code = await page.$eval('.code-box', (e) => e.textContent.trim());
  ok(/^(\d{5} ){5}\d{5}$/.test(code), `safety code has 6 groups of 5 digits (${code})`);
  await clickText('They match');
  // after a quick-code unlock the full passphrase is needed first
  await waitText('Type your passphrase');
  await page.type('.modal-back input[type=password]', 'wrong wrong wrong wrong');
  await clickText('Continue');
  await waitText('Wrong passphrase');
  ok(true, 'a sensitive change after a quick unlock asks for the passphrase and refuses a wrong one');
  await retype(await page.$('.modal-back input[type=password]'), PASS);
  await clickText('Continue');
  await page.waitForSelector('.chat');
  await page.waitForFunction(() => document.querySelector('.badge.ok')?.textContent === 'Verified');
  ok(true, 'after comparing the code the badge shows Verified');

  // --- settings ---
  await clickText('⚙️');
  await waitText('Delete messages after');
  await page.select('select', String(60 * 60 * 1000));
  await sleep(200);
  ok((await page.$eval('select', (s) => s.value)) === String(60 * 60 * 1000), 'retention can be set to 1 hour');
  await clickText('Back to chat');
  await page.waitForSelector('.chat');

  // --- a swapped key is caught and sending is blocked ---
  await page.evaluate(() => window.__e2e.swapPeerKey());
  await page.waitForFunction(() => document.querySelector('.badge.warn')?.textContent === 'Key changed');
  ok((await page.$eval('.composer textarea', (e) => e.disabled)) === true, 'when the other person\'s key changes, the input is disabled');
  ok((await bodyText()).includes('key changed, so sending is blocked'), 'a clear warning explains why');

  // --- auto-lock after time in the background (about 20 seconds in this test build) ---
  const page3 = await browser.newPage();
  await page3.bringToFront();
  await sleep(22000);
  await page.bringToFront();
  await waitText('Locked');
  ok(!(await bodyText()).includes('hello from Bob'), 'after the set time in the background the chat locks');
  await page3.close();
  await page.type('input[type=password]', '1234');
  await clickText('Unlock');
  await page.waitForSelector('.chat');

  // --- logout ---
  await clickText('⚙️');
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

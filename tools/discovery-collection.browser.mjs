// Bounded presentation regression: actual Angular template AST, actual SCSS and
// installed Ionic, rendered as static local DOM. This does NOT bootstrap Angular
// or prove RouterLink/Ionic-stack behavior, native Dynamic Type, accounts or APIs.
// Real interaction/navigation acceptance belongs to the production-template specs.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { BindingType, parseTemplate } from '@angular/compiler';

export const sourcePaths = {
  content: 'src/app/home/community-content.ts',
  home: 'src/app/home/components/tab-community/tab-community',
  retiredCollection: 'src/app/sections/community/inspiration-collection.page',
  routes: 'src/app/app.routes.ts',
};
const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const ts = require('typescript');
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
export const read = path => readFileSync(new URL(path, root), 'utf8');
export const compile = path => sass.compile(fileURLToPath(new URL(path, root)), {
  loadPaths: [fileURLToPath(new URL('node_modules/', root))], logger: sass.Logger.silent,
}).css;

export function contentModule() {
  const module = { exports: {} };
  // The shared content module is pure. Do not grant a fixture access to App
  // services, require(), process, HTTP, local storage or device capabilities.
  vm.runInNewContext(ts.transpileModule(read(sourcePaths.content), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports }, { timeout: 1000 });
  return module.exports;
}

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function dictionary(language = 'zh_cn') {
  const labels = JSON.parse(read(`public/i18n/${language}/${language}.json`));
  return key => {
    const value = String(key).split('.').reduce((item, part) => item?.[part], labels);
    assert.equal(typeof value, 'string', `Missing real ${language} translation: ${key}`);
    return value;
  };
}

// Deliberately narrow, fail-closed static renderer. It consumes the production
// Angular compiler AST instead of copying page markup or regex-removing @if/@for.
// Event bindings are ignored, never executed or replaced by fake event handlers.
function expression(node, context, translate, presentationCalls) {
  if (node?.ast) return expression(node.ast, context, translate, presentationCalls);
  const evaluate = value => expression(value, context, translate, presentationCalls);
  switch (node?.constructor.name) {
    case 'ImplicitReceiver': case 'ThisReceiver': return context;
    case 'LiteralPrimitive': return node.value;
    case 'PropertyRead': case 'SafePropertyRead': {
      const receiver = evaluate(node.receiver);
      if (receiver == null && node.constructor.name === 'SafePropertyRead') return undefined;
      assert.ok(receiver != null && node.name in Object(receiver), `Missing static model field: ${node.name}`);
      return receiver[node.name];
    }
    case 'KeyedRead': case 'SafeKeyedRead': return evaluate(node.receiver)?.[evaluate(node.key)];
    case 'LiteralArray': return node.expressions.map(evaluate);
    case 'LiteralMap': return Object.fromEntries(node.keys.map((key, i) => [key.key, evaluate(node.values[i])]));
    case 'Conditional': return evaluate(node.condition) ? evaluate(node.trueExp) : evaluate(node.falseExp);
    case 'PrefixNot': return !evaluate(node.expression);
    case 'NonNullAssert': case 'ParenthesizedExpression': return evaluate(node.expression);
    case 'Call': {
      assert.equal(node.receiver.constructor.name, 'PropertyRead');
      // Explicit pure fixture inputs only; output/event bindings are never run.
      // The default discovery renderer still only permits the local array slice.
      if (Object.hasOwn(presentationCalls, node.receiver.name)) {
        assert.ok(['ImplicitReceiver', 'ThisReceiver'].includes(node.receiver.receiver.constructor.name));
        return presentationCalls[node.receiver.name](...node.args.map(evaluate));
      }
      assert.equal(node.receiver.name, 'slice', 'Only the real local-array slice presentation call is supported');
      const items = evaluate(node.receiver.receiver);
      assert.ok(Array.isArray(items), 'Presentation slice receiver must be a local content array');
      return items.slice(...node.args.map(evaluate));
    }
    case 'BindingPipe':
      assert.equal(node.name, 'translate', 'Only the actual translate pipe is supported');
      assert.equal(node.args.length, 0, 'Add explicit handling before rendering translated parameters');
      return translate(evaluate(node.exp));
    case 'Interpolation': return node.strings.reduce((text, part, i) => text + part
      + (i < node.expressions.length ? String(evaluate(node.expressions[i]) ?? '') : ''), '');
    case 'Binary': {
      const left = evaluate(node.left);
      if (node.operation === '&&') return left && evaluate(node.right);
      if (node.operation === '||') return left || evaluate(node.right);
      if (node.operation === '??') return left ?? evaluate(node.right);
      const right = evaluate(node.right);
      switch (node.operation) {
        case '===': return left === right;
        case '!==': return left !== right;
        case '==': return left == right; // Angular binding semantics, not application logic.
        case '!=': return left != right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '+': return left + right;
        default: assert.fail(`Unsupported template operation: ${node.operation}`);
      }
    }
    default: assert.fail(`Unsupported template expression: ${node?.constructor.name}`);
  }
}

export function renderTemplate(path, model, translate = dictionary(), presentationCalls = {}) {
  const parsed = parseTemplate(read(path), path, { preserveWhitespaces: false });
  assert.equal(parsed.errors, null, `Invalid production template: ${parsed.errors?.join('\n')}`);
  function render(nodes, parent) {
    const context = Object.assign(Object.create(parent), {});
    return nodes.map(node => {
      switch (node.constructor.name) {
        case 'Text': return escape(node.value);
        case 'BoundText': return escape(expression(node.value, context, translate, presentationCalls));
        case 'LetDeclaration': context[node.name] = expression(node.value, context, translate, presentationCalls); return '';
        case 'IfBlock': {
          for (const branch of node.branches) {
            const value = branch.expression ? expression(branch.expression, context, translate, presentationCalls) : true;
            if (value) return render(branch.children, branch.expressionAlias
              ? Object.assign(Object.create(context), { [branch.expressionAlias.name]: value }) : context);
          }
          return '';
        }
        case 'ForLoopBlock': {
          const values = Array.from(expression(node.expression, context, translate, presentationCalls));
          if (!values.length) return node.empty ? render(node.empty.children, context) : '';
          return values.map((value, index) => render(node.children, Object.assign(Object.create(context), {
            [node.item.name]: value, $index: index, $count: values.length,
            $first: index === 0, $last: index === values.length - 1,
            $even: index % 2 === 0, $odd: index % 2 !== 0,
          }))).join('');
        }
        case 'Element': {
          const attributeName = name => ({ routerLink: 'href', defaultHref: 'default-href' }[name] ?? name);
          const attributes = new Map(node.attributes.map(item => [attributeName(item.name), item.value]));
          const classes = new Set((attributes.get('class') ?? '').split(/\s+/).filter(Boolean));
          for (const input of node.inputs) {
            const value = expression(input.value, context, translate, presentationCalls);
            if (input.name === 'class' && input.type === BindingType.Property) {
              classes.clear();
              for (const name of String(value ?? '').split(/\s+/).filter(Boolean)) classes.add(name);
            } else if (input.type === BindingType.Class) {
              if (value) classes.add(input.name); else classes.delete(input.name);
            } else {
              assert.notEqual(input.type, BindingType.Style, 'Unexpected inline style binding');
              let name = input.name;
              if (name === 'ngModel') name = 'value';
              if (name === 'scrollEvents') name = 'scroll-events';
              if (name === 'routerLink') name = 'href';
              if (name === 'defaultHref') name = 'default-href';
              if (value === undefined || value === null) attributes.delete(name);
              else if (['disabled', 'checked', 'hidden'].includes(name)) {
                if (value) attributes.set(name, ''); else attributes.delete(name);
              } else attributes.set(name, Array.isArray(value) ? value.join('/') : String(value));
            }
          }
          if (classes.size) attributes.set('class', [...classes].join(' '));
          else attributes.delete('class');
          const start = `<${node.name}${[...attributes].map(([name, value]) => ` ${name}="${escape(value)}"`).join('')}>`;
          return start + (node.isVoid ? '' : render(node.children, context) + `</${node.name}>`);
        }
        default: assert.fail(`Unsupported production template node: ${node.constructor.name}`);
      }
    }).join('');
  }
  return render(parsed.nodes, model);
}

function stylesheetBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing actual stylesheet block: ${marker}`);
  let end = source.indexOf('{', start), depth = 1;
  while (depth && ++end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0, `Unbalanced actual stylesheet block: ${marker}`);
  return source.slice(start, end + 1);
}

export function presentation() {
  return { content: contentModule(), translate: dictionary(),
    baseCss: ['core', 'normalize', 'structure', 'typography'].map(name => read('node_modules/@ionic/core/css/' + name + '.css')).join(''),
    headerCss: sass.compileString(stylesheetBlock(read('src/global.scss'), 'ion-header.main-tab-header {')).css,
    homeCss: compile(sourcePaths.home + '.scss'), maskCss: compile('src/app/home/components/_tab-scroll-mask.scss'),
    themeCss: sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', { loadPaths: [fileURLToPath(new URL('src/theme/', root))] }).css };
}

// Static data states, not fake Angular event handlers. Exact presentation getters
// are supplied from shared local content; real handlers live in Angular specs.
export function homeModel(content, { category = 'recommended', search = false, keyword = '' } = {}) {
  const translate = dictionary();
  const cards = content.filterCommunityStories(category, keyword, translate);
  const products = ['recommended', 'products'].includes(category) ? content.COMMUNITY_PRODUCTS.filter(product =>
    content.matchesTranslatedContent(keyword, translate, product.nameKey, product.descriptionKey)) : [];
  const storyPage = content.pageCommunityItems(cards, 1), productPage = content.pageCommunityItems(products, 1);
  return { activeCategory: category, searchVisible: search, searchKeyword: keyword,
    categories: content.COMMUNITY_CATEGORIES,
    filteredCards: cards, filteredProducts: products, storyPage, productPage, pagination: category === 'products' ? productPage : storyPage,
    recommendedSections: content.COMMUNITY_CATEGORIES.filter(item => ['inspiration', 'tips'].includes(item.id))
      .map(item => ({ ...item, cards: content.filterCommunityStories(item.id, keyword, translate).slice(0, 2) }))
      .filter(section => section.cards.length > 0) };
}

export async function runBrowser() {
  const data = presentation(), { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
  for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'DISCOVERY_COLLECTION_SCREENSHOT_DIR']) {
    if (process.env[name]) assert.ok(isAbsolute(process.env[name]), name + ' must be absolute');
  }
  let outputDir, browser, externalRequests = 0, writeRequests = 0;
  if (process.env.DISCOVERY_COLLECTION_SCREENSHOT_DIR) {
    const destination = resolve(process.env.DISCOVERY_COLLECTION_SCREENSHOT_DIR), fromRepo = relative(fileURLToPath(root), destination);
    assert.ok(fromRepo === '..' || fromRepo.startsWith('..' + sep) || isAbsolute(fromRepo), 'Screenshots must be outside the App worktree');
    mkdirSync(destination, { recursive: true }); outputDir = mkdtempSync(join(destination, 'discovery-content-'));
  }
  const failures = [], measurements = [], screenshots = [], pageErrors = [], requestErrors = [];
  const environments = [
    { width: 375, height: 844, rootSize: 16, theme: 'light', mode: 'ios' },
    { width: 375, height: 844, rootSize: 16, theme: 'dark', mode: 'md' },
    { width: 320, height: 844, rootSize: 16, theme: 'light', mode: 'ios' },
    { width: 320, height: 844, rootSize: 16, theme: 'dark', mode: 'md' },
    { width: 320, height: 844, rootSize: 24, theme: 'light', mode: 'md' },
    { width: 320, height: 844, rootSize: 24, theme: 'dark', mode: 'ios' },
    { width: 844, height: 390, rootSize: 16, theme: 'light', mode: 'ios' },
  ];
  const deadline = Date.now() + 120000;
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { writeRequests++; response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'); return; }
    let file;
    if (/^\/ionic\/[\w./-]+\.(js|svg)$/.test(pathname) && !pathname.includes('..')) file = new URL('node_modules/@ionic/core/' + pathname.slice(7), root);
    else if (/^\/(?:assets|devices)\/[\w./-]+\.(webp|png|jpg|svg)$/.test(pathname) && !pathname.includes('..')) file = new URL('public' + pathname, root);
    if (!file || !existsSync(file)) { requestErrors.push(pathname); response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', { js: 'text/javascript', svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' }[pathname.split('.').at(-1)]);
    response.end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const ready = async page => {
    await page.waitForFunction(() => {
      const root = document.querySelector('discovery-probe')?.shadowRoot;
      return root && [...root.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-content,ion-button')].every(node => node.classList.contains('hydrated'))
        && [...root.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0);
    });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  };
  const capture = async (page, name, selector) => {
    if (!outputDir) return;
    const file = join(outputDir, name + '.png'); assert.ok(!existsSync(file), 'Never overwrite previous capture');
    const top = await page.evaluate(async () => (await document.querySelector('discovery-probe').shadowRoot.querySelector('ion-content').getScrollElement()).scrollTop);
    try {
      if (selector) {
        await page.evaluate(async selector => {
          const root = document.querySelector('discovery-probe').shadowRoot;
          const scroll = await root.querySelector('ion-content').getScrollElement(), target = root.querySelector(selector);
          if (!target) throw new Error('Missing screenshot target: ' + selector);
          scroll.scrollTop += target.getBoundingClientRect().top - root.querySelector('ion-header').getBoundingClientRect().bottom - 12;
        }, selector);
        await ready(page);
      }
      await page.screenshot({ path: file }); screenshots.push(file);
    }
    finally { await page.evaluate(async top => { (await document.querySelector('discovery-probe').shadowRoot.querySelector('ion-content').getScrollElement()).scrollTop = top; }, top); await ready(page); }
  };
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ reducedMotion: 'reduce' }); page.setDefaultTimeout(10000);
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(origin + '/')) { externalRequests++; return route.abort(); }
      if (!['GET', 'HEAD'].includes(route.request().method())) { writeRequests++; return route.abort(); } return route.continue();
    });
    await page.goto(origin); await page.addStyleTag({ content: data.themeCss + 'body{margin:0;overflow:hidden}' });
    await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
    for (const environment of environments) {
      const states = [{ category: 'recommended' }, { category: 'inspiration' }, { category: 'tips' }];
      if (environment.width === 375 && environment.theme === 'light') states.push({ category: 'products' }, { category: 'events' }, { category: 'recommended', search: true }, { category: 'recommended', search: true, keyword: 'not-in-local-content' });
      for (const state of states) {
        const label = environment.width + 'x' + environment.height + '/root' + environment.rootSize + '/' + environment.theme + '/' + state.category + '/' + (state.search ? state.keyword ? 'empty-search' : 'search' : 'default');
        try {
          assert.ok(Date.now() < deadline, 'Finite browser deadline exceeded');
          const html = renderTemplate(sourcePaths.home + '.html', homeModel(data.content, state), data.translate);
          await page.setViewportSize({ width: environment.width, height: environment.height });
          await page.evaluate(({ environment, html, css }) => {
            document.documentElement.dataset.uiTheme = environment.theme === 'light' ? 'natural' : 'dark';
            document.documentElement.style.cssText = 'font-size:' + environment.rootSize + 'px;color-scheme:' + environment.theme + ';--ion-safe-area-top:35px;--ion-safe-area-bottom:26px;--ion-safe-area-left:0px;--ion-safe-area-right:0px';
            document.body.innerHTML = '<discovery-probe class="ion-page"></discovery-probe>';
            const root = document.querySelector('discovery-probe').attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + css + ':host{display:block;position:absolute;inset:0}*{box-sizing:border-box}i{display:inline-block;width:1em;height:1em}button,input{font-family:inherit}</style>' + html;
            for (const ion of root.querySelectorAll('*')) if (ion.localName.startsWith('ion-')) ion.setAttribute('mode', environment.mode);
          }, { environment, html, css: data.baseCss + data.headerCss + data.maskCss + data.homeCss });
          await ready(page);
          const result = await page.evaluate(async () => {
            const root = document.querySelector('discovery-probe').shadowRoot, scroll = await root.querySelector('ion-content').getScrollElement();
            const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
            const toolbar = root.querySelector('ion-toolbar'), title = root.querySelector('ion-title');
            const toolbarContainer = toolbar.shadowRoot.querySelector('.toolbar-container');
            const titleClip = title.shadowRoot.querySelector('.toolbar-title');
            const action = root.querySelector('ion-button.header-action');
            const nativeAction = action.shadowRoot.querySelector('button,a');
            if (!toolbarContainer || !titleClip || !nativeAction) throw new Error('Missing installed Ionic title/action shadow structure');
            const firstCharacter = document.createTreeWalker(title, NodeFilter.SHOW_TEXT).nextNode();
            if (!firstCharacter?.textContent.trim()) throw new Error('Missing production discovery title text');
            const range = document.createRange(), start = firstCharacter.textContent.search(/\S/u);
            range.setStart(firstCharacter, start);
            range.setEnd(firstCharacter, start + Array.from(firstCharacter.textContent.slice(start))[0].length);
            const headerSnapshot = phase => ({ phase,
              container: { ...box(toolbarContainer), clientWidth: toolbarContainer.clientWidth,
                scrollWidth: toolbarContainer.scrollWidth, scrollLeft: toolbarContainer.scrollLeft },
              title: { ...box(title), visible: getComputedStyle(title).display !== 'none' },
              titleClip: { ...box(titleClip), scrollLeft: titleClip.scrollLeft },
              firstCharacter: box(range), action: box(action), nativeAction: box(nativeAction),
              nativeActionFocused: action.shadowRoot.activeElement === nativeAction,
              viewport: { left: visualViewport?.offsetLeft ?? 0, right: (visualViewport?.offsetLeft ?? 0) + (visualViewport?.width ?? innerWidth) } });
            // Focus the installed Ionic native action without preventScroll. This
            // exercises the browser's hidden-overflow scrolling, not a copied
            // search handler, fake Angular event or synthetic native keyboard.
            const previousFocus = root.activeElement, headerFocus = [headerSnapshot('before-focus')];
            try {
              nativeAction.focus();
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              headerFocus.push(headerSnapshot('action-focus'));
              nativeAction.blur();
              headerFocus.push(headerSnapshot('action-blur'));
            } finally { previousFocus?.focus(); }
            const copy = node => { const r = node.getBoundingClientRect(), style = getComputedStyle(node), range = document.createRange(); range.selectNodeContents(node);
              return { text: node.textContent.trim(), ...box(node), clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
                || [...range.getClientRects()].some(line => line.width && (line.left < r.left - 1 || line.right > r.right + 1 || line.top < r.top - 1 || line.bottom > r.bottom + 1)),
                clamped: Number(style.webkitLineClamp) > 0 || style.textOverflow === 'ellipsis' }; };
            const stories = [...root.querySelectorAll('.story-card')].map(card => ({ card: box(card), image: box(card.querySelector('.story-image')), body: box(card.querySelector('.story-copy')),
              illustration: box(card.querySelector('.story-image img')), tag: copy(card.querySelector('.category-label')),
              illustrationPosition: getComputedStyle(card.querySelector('.story-image img')).position,
              tagPosition: getComputedStyle(card.querySelector('.category-label')).position,
              title: copy(card.querySelector('h3')), summary: copy(card.querySelector('.story-copy p')),
              imageFits: [...card.querySelectorAll('img')].every(image => getComputedStyle(image).objectFit === 'contain') }));
            const entries = [...root.querySelectorAll('.collection-project')].map(card => ({ card: box(card), heading: box(card.querySelector('.collection-title')), image: box(card.querySelector('.collection-cover')),
              title: copy(card.querySelector('.collection-title')), summary: copy(card.querySelector('.collection-summary')),
              tags: card.querySelectorAll('.category-label,.collection-type,.category-type').length, actions: card.querySelectorAll('button,a,[role=button]').length,
              imageFits: [...card.querySelectorAll('img')].every(image => getComputedStyle(image).objectFit === 'contain') }));
            const targets = [...root.querySelectorAll('.category-tabs button,.view-all,ion-button.header-action')].map(box), focus = [];
            const categoryTabs = root.querySelector('.category-tabs'), categoryScroll = categoryTabs.scrollLeft;
            try { for (const button of root.querySelectorAll('.category-tabs button,.view-all')) { button.focus(); focus.push({ visible: button.matches(':focus-visible'), outline: parseFloat(getComputedStyle(button).outlineWidth) }); } }
            finally { root.activeElement?.blur(); categoryTabs.scrollLeft = categoryScroll; scroll.scrollTop = 0; }
            const last = [...root.querySelectorAll('.story-card,.collection-project,.product-card,.no-result')].at(-1);
            let lastBottom;
            try { scroll.scrollTop = scroll.scrollHeight; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); lastBottom = last?.getBoundingClientRect().bottom; }
            finally { scroll.scrollTop = 0; }
            const products = [...root.querySelectorAll('.product-card')].map(card => ({ card: box(card), image: box(card.querySelector('.product-image')),
              body: box(card.querySelector('.product-copy')), title: copy(card.querySelector('h3')),
              summary: copy(card.querySelector('.product-copy p')), status: copy(card.querySelector('.product-copy small')),
              imageFits: [...card.querySelectorAll('img')].every(image => getComputedStyle(image).objectFit === 'contain') }));
            return { stories, entries, products, targets, focus, headerFocus, header: box(root.querySelector('ion-header')), first: box(root.querySelector('.local-preview-note')), lastBottom,
              overflow: scroll.scrollWidth > scroll.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth, selected: root.querySelectorAll('.category-tabs [aria-pressed=true]').length,
              viewAllCategories: [...root.querySelectorAll('.view-all')].map(button => button.dataset.category), productCount: root.querySelectorAll('.product-card').length,
              emptyCount: root.querySelectorAll('.no-result[role=status]').length, pagerCount: root.querySelectorAll('.content-pagination').length,
              statsCount: root.querySelectorAll('.project-meta,.project-stat').length, search: root.querySelector('.search-field') ? box(root.querySelector('.search-field')) : null,
              categories: box(root.querySelector('.category-tabs')), toolbar: box(root.querySelector('ion-toolbar')), searchInputLabel: root.querySelector('input[type=search]')?.getAttribute('aria-label') };
          });
          assert.equal(result.overflow, false, label + ': horizontal overflow');
          assert.equal(result.headerFocus.length, 3);
          assert.equal(result.headerFocus[1].nativeActionFocused, true, label + ': actual Ionic native action must receive focus');
          for (const frame of result.headerFocus) {
            assert.ok(frame.container.scrollWidth <= frame.container.clientWidth + 1,
              label + '/' + frame.phase + ': toolbar action must not create hidden horizontal overflow');
            assert.ok(Math.abs(frame.container.scrollLeft) <= 1 && Math.abs(frame.titleClip.scrollLeft) <= 1,
              label + '/' + frame.phase + ': focus must not horizontally scroll toolbar or title');
            assert.ok(frame.action.width >= 47.5 && frame.action.height >= 47.5,
              label + '/' + frame.phase + ': header action retains its48px target');
            for (const button of [frame.action, frame.nativeAction]) assert.ok(button.x >= frame.container.x - 1 && button.right <= frame.container.right + 1,
              label + '/' + frame.phase + ': header action must stay inside the toolbar clip');
            if (frame.title.visible) {
              assert.ok(Math.abs(frame.title.x - result.headerFocus[0].title.x) <= 1,
                label + '/' + frame.phase + ': focus must not shift the discovery title');
              assert.ok(frame.firstCharacter.width > 0
                && frame.firstCharacter.x >= Math.max(frame.container.x, frame.titleClip.x, frame.viewport.left) - 1
                && frame.firstCharacter.right <= Math.min(frame.container.right, frame.titleClip.right, frame.viewport.right) + 1,
              label + '/' + frame.phase + ': first title character must remain inside all horizontal clipping bounds');
            }
          }
          assert.equal(result.selected, 1); assert.equal(result.statsCount, 0, 'No fabricated prototype statistics');
          assert.equal(result.pagerCount, 0, 'Actual one-item categories need no pager');
          assert.ok(result.first.y >= result.header.bottom - 1, label + ': initial content hidden by header');
          assert.ok(result.lastBottom <= environment.height - 26 - 64 - 10 + 1, label + ': last item cannot clear floating-navigation safe budget');
          for (const target of result.targets) assert.ok(target.width >= 47.5 && target.height >= 47.5, label + ':48px target');
          for (const focus of result.focus) assert.ok(focus.visible && focus.outline >= 2, label + ': keyboard focus');
          for (const item of [...result.stories, ...result.entries, ...result.products]) {
            for (const text of [item.title, item.summary, item.status, item.tag].filter(Boolean)) assert.ok(!text.clipped && !text.clamped, label + ': complete text must remain available');
            assert.ok(item.imageFits, label + ': decorative illustration must contain');
          }
          for (const product of result.products) {
            const near = (actual, expected) => Math.abs(actual - expected) <= 1;
            assert.ok(near(product.image.width, 80) && near(product.image.height, 80), label + ': existing product thumbnail remains80px square');
            assert.ok(near(product.image.x - product.card.x, 12) && near(product.image.y - product.card.y, 12)
              && near(product.body.right, product.card.right - 12) && near(product.body.y, product.card.y + 12)
              && near(product.card.bottom - Math.max(product.image.bottom, product.body.bottom), 12), label + ': consistent12px product inner padding');
            assert.ok(near(product.body.x - product.image.right, 12), label + ':12px product thumbnail/copy gap');
            assert.ok(product.image.y < product.body.bottom && product.image.bottom > product.body.y, label + ': product thumbnail/copy must overlap vertically');
            for (const text of [product.title, product.summary, product.status]) {
              assert.ok(text.x >= product.body.x - 1 && text.right <= product.body.right + 1 && text.x >= product.image.right + 11,
                label + ': all product text must remain in the right-hand copy column');
              assert.ok(text.y >= product.body.y - 1 && text.bottom <= product.body.bottom + 1, label + ': product copy must retain its wrapper bounds');
            }
            assert.equal(product.status.text, data.translate('COMMUNITY.PRODUCT_PREVIEW_STATUS'));
          }
          if (state.category === 'recommended' && !state.keyword) {
            assert.equal(result.stories.length, 2); assert.equal(result.productCount, 1); assert.equal(result.entries.length, 0);
            assert.deepEqual(result.viewAllCategories, ['inspiration', 'tips', 'products']);
            assert.deepEqual(result.stories.map(item => item.title.text), Array.from(data.content.COMMUNITY_STORIES, item => data.translate(item.titleKey)));
            for (const story of result.stories) {
              assert.ok(story.tag.text, 'Recommendation retains real category label');
              assert.ok(story.image.right <= story.body.x + 1 && story.image.y < story.body.bottom && story.image.bottom > story.body.y,
                label + ': recommendations must keep cover left/copy right, including small screens and larger text');
              assert.ok(story.image.width >= 87 && story.image.width <= 113, label + ': bounded88–112px side column, never a full-width hero');
              assert.ok(story.tag.bottom + 11 <= story.illustration.y, label + ': naturally growing label must remain clear of illustration');
              assert.ok(!['absolute', 'fixed'].includes(story.tagPosition) && !['absolute', 'fixed'].includes(story.illustrationPosition),
                label + ': label/illustration must remain in normal flow');
              for (const visual of [story.tag, story.illustration]) assert.ok(visual.x >= story.image.x - 1 && visual.right <= story.image.right + 1
                && visual.y >= story.image.y - 1 && visual.bottom <= story.image.bottom + 1, label + ': side content must stay inside its column');
              assert.ok(story.illustration.width > 0 && story.illustration.width <= 81
                && Math.abs(story.illustration.width - story.illustration.height) <= 1, label + ': illustration remains a compact square');
            }
          } else if (['inspiration', 'tips'].includes(state.category)) {
            assert.equal(result.stories.length, 0); assert.equal(result.entries.length, 1);
            const expected = data.content.filterCommunityStories(state.category, '', data.translate)[0], entry = result.entries[0];
            assert.equal(entry.title.text, data.translate(expected.titleKey)); assert.equal(entry.summary.text, data.translate(expected.descriptionKey));
            assert.equal(entry.tags, 0); assert.equal(entry.actions, 0);
            assert.ok(Math.abs(entry.image.width - 80) <= 1 && Math.abs(entry.image.height - 80) <= 1, 'B80px square cover');
            assert.ok(entry.heading.right <= entry.image.x - 7 && entry.summary.y >= Math.max(entry.heading.bottom, entry.image.bottom) - 1, 'B full-row summary below left heading/right cover');
          } else if (state.category === 'products') { assert.equal(result.productCount, 1); assert.equal(result.stories.length, 0); assert.equal(result.entries.length, 0); }
          else if (state.category === 'events' || state.keyword) assert.equal(result.emptyCount, 1);
          if (state.search) assert.ok(result.search && result.search.y >= result.toolbar.bottom - 1 && result.search.bottom <= result.categories.y + 1 && result.searchInputLabel, 'Expanded named search obscured by header/categories');
          measurements.push({ label, ...result });
          if ((environment.width === 375 && !state.search && ['recommended', 'inspiration'].includes(state.category)) || (environment.width === 320 && state.category === 'recommended')) await capture(page, state.category + '-' + environment.width + '-root' + environment.rootSize + '-' + environment.theme);
          if (state.category === 'recommended' && !state.search && result.products.length) await capture(page,
            'product-preview-' + environment.width + '-root' + environment.rootSize + '-' + environment.theme, '.product-section');
        } catch (error) { failures.push({ label, error: String(error.stack ?? error) }); await capture(page, 'failure-' + measurements.length + '-' + failures.length); }
      }
    }
    assert.equal(externalRequests, 0); assert.equal(writeRequests, 0); assert.deepEqual(pageErrors, []); assert.deepEqual(requestErrors, []);
  } catch (error) { failures.push({ label: 'runner', error: String(error.stack ?? error) }); }
  finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
    const report = { kind: 'actual-source-static-DOM-not-Angular-or-native', environmentCount: environments.length, stateCount: measurements.length, passed: failures.length === 0,
      externalRequests, writeRequests, pageErrors, requestErrors, failures, measurements, screenshots };
    if (outputDir) writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ passed: report.passed, environmentCount: environments.length, stateCount: measurements.length, failures: failures.length, externalRequests, writeRequests, outputDir }, null, 2));
  }
  assert.deepEqual(failures, [], 'Finite same-page discovery presentation regressions');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runBrowser();

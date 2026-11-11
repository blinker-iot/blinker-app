// Source/SCSS contracts only. Actual template interactions and browser geometry
// have separate finite suites; no account, storage or device use here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseTemplate} from '@angular/compiler';
import {read,compile,renderTemplate} from './discovery-collection.browser.mjs';

const services='src/app/sections/third-party-services/third-party-services.page';
const about='src/app/sections/about/about.page';

test('support surfaces opt into existing settings and control chrome, not global replacements',()=>{
 for(const path of [services,about]){
  assert.match(read(path+'.scss'),/@include chrome\.header;/);
  assert.match(read(path+'.scss'),/@include settings\.tokens;/);
  assert.match(read(path+'.html'),/control-page-header/);
  assert.ok(compile(path+'.scss').includes('--transparent-page-header-height: 56px'));
  assert.equal(parseTemplate(read(path+'.html'),path+'.html').errors,null);
 }
 const css=compile(services+'.scss');
 assert.match(css,/ion-content::part\(scroll\)\s*\{\s*top: var\(--transparent-page-content-top\)/);
 assert.match(css,/ion-content::part\(scroll\)\s*\{[^}]*scroll-padding-block: 16px;/s);
 assert.match(css,/main::before\s*\{\s*display: none !important;/,'The native visible viewport inset must not get a second spacer');
});

test('service controls keep 48px targets, scalable input and original provider/save/clear bindings',()=>{
 const css=compile(services+'.scss'), html=read(services+'.html');
 assert.match(css,/\.key-toggle\s*\{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
 assert.match(css,/\.save-button,\s*\.clear-button\s*\{[^}]*min-height: 48px;/s);
 assert.match(css,/\.save-button:active:not\(:disabled\)\s*\{\s*background: var\(--ion-color-primary\);/,
  'The primary pressed state must not inherit the neutral surface under contrast text');
 assert.match(css,/\.input-shell input,[\s\S]*?font-size: 1rem;/);
 for(const event of ['saveWeatherServices()','saveGeolocationServices()','confirmClearWeatherServices()','confirmClearGeolocationServices()'])assert.ok(html.includes(event));
 for(const field of ['selectedWeatherProvider','selectedGeolocationProvider','weatherKeys[provider.id]','geolocationKeys[provider.id]'])assert.ok(html.includes(`[(ngModel)]="${field}"`));
 assert.doesNotMatch(css,/transform:\s*scale|font-size: (?:9|10|11)px|!important[^}]*color/);
});

test('about keeps complete descriptions, semantic legal group and independent original document actions',()=>{
 const css=compile(about+'.scss'), html=read(about+'.html');
 assert.doesNotMatch(read(about+'.scss'),/text-overflow|white-space:\s*nowrap|-webkit-line-clamp/,
  'The page must not truncate its descriptions; shared header-only rules are not body consumers');
 assert.match(css,/\.legal-card button\s*\{[^}]*min-height: 56px;/s);
 assert.match(html,/aria-labelledby="legal-heading"/);
 assert.ok(html.includes("openUrl(USER_AGREEMENT, '用户协议')"));
 assert.ok(html.includes("openUrl(PRIVACY_POLICY, '隐私政策')"));
 assert.equal((html.match(/<article>/g)??[]).length,3);
});

test('static template renderer stays fail-closed unless a pure presentation call is explicitly supplied',()=>{
 const minimal={weatherProviders:[],geolocationProviders:[],selectedWeatherProvider:'seniverse',selectedGeolocationProvider:'tianditu',
  weatherValidationStatus:'idle',geolocationValidationStatus:'idle',hasSavedWeatherKeys:false,hasSavedGeolocationKeys:false};
 // An actual provider makes the production visibility call reachable. It must
 // never implicitly call a component method or import its service.
 const model={...minimal,weatherProviders:[{id:'seniverse',name:'心知天气',placeholder:'输入心知天气 API Key'}],weatherKeys:{seniverse:'LOCAL_FIXTURE_NOT_A_SECRET'}};
 assert.throws(()=>renderTemplate(services+'.html',model),/Only the real local-array slice/);
 const html=renderTemplate(services+'.html',model,undefined,{isKeyVisible:()=>false});
 assert.match(html,/type="password"/);
 assert.doesNotMatch(html,/\(click\)|\(ngSubmit\)/,'Static fixtures do not implement business handlers');
});

test('only About agreement overlays opt into larger document close targets and header budget',()=>{
 const page=read(about+'.ts'), path='src/app/core/pages/doc/doc.page.scss',scss=read(path),css=compile(path);
 assert.match(page,/cssClass: 'about-document-modal'/);
 const local=scss.slice(scss.indexOf(':host-context(.about-document-modal)'));
 assert.match(local,/--transparent-page-header-height: 56px;/);
 assert.match(local,/--transparent-page-content-top: calc\(var\(--ion-safe-area-top, 0px\) \+ var\(--transparent-page-header-height\)\)/);
 assert.match(css,/:host-context\(\.about-document-modal\) \.doc-page-header ion-toolbar ion-buttons ion-button\.close-button\.header-action\s*\{[^}]*width: 48px;[^}]*height: 48px;/s);
 assert.doesNotMatch(local,/::part\(scroll\)|padding-top:\s*var\(--transparent-page-content-top\)/,'Retain one existing content spacer, not a second inset');
 assert.match(scss.slice(0,scss.indexOf(':host-context(.about-document-modal)')),/font-size: 17px;/,'Other Doc consumers keep the legacy title contract');
});

// Finite presentation/source contracts. Business behavior uses the actual
// Angular templates in ui36-feedback-messages.render.spec.ts, with local doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseTemplate} from '@angular/compiler';
import {read, compile} from './discovery-collection.browser.mjs';

const feedback='src/app/sections/feedback/feedback.component';
const messages='src/app/sections/message/message.page';

test('both support pages opt into existing chrome and one visible scroll viewport',()=>{
 for(const path of [feedback,messages]){
  const scss=read(path+'.scss'),css=compile(path+'.scss'),html=read(path+'.html');
  assert.match(scss,/@include settings\.tokens;/);
  assert.match(scss,/@include chrome\.header;/);
  assert.match(html,/control-page-header/);
  assert.equal(parseTemplate(html,path+'.html').errors,null);
  assert.match(css,/ion-content::part\(scroll\)\s*\{[^}]*top: var\(--transparent-page-content-top\);[^}]*scroll-padding-block: 16px;/s);
  assert.match(css,/main::before\s*\{\s*display: none !important;/);
  assert.doesNotMatch(scss,/linear-gradient|radial-gradient|font-size:\s*(?:9|10|11)px|transform:\s*scale/);
 }
});

test('feedback retains existing draft events and length limits, with semantic grouping and count references',()=>{
 const html=read(feedback+'.html'),css=compile(feedback+'.scss');
 assert.match(html,/\(ngSubmit\)="submit\(\)"/);
 assert.match(html,/\[attr\.aria-busy\]="isSubmitting"/);
 for(const key of ['title','content','email'])assert.ok(html.includes(`[(ngModel)]="${key}"`));
 assert.equal((html.match(/\(ngModelChange\)="onFormChange\(\)"/g)??[]).length,3);
 for(const id of ['feedback-type-heading','feedback-content-heading'])assert.ok(html.includes(`aria-labelledby="${id}"`));
 for(const id of ['title','content'])assert.ok(html.includes(`aria-describedby="feedback-${id}-count"`));
 for(const limit of [80,2000,120])assert.ok(html.includes(`maxlength="${limit}"`));
 assert.match(html,/\(click\)="selectType\(type.value\)"/);
 assert.match(css,/\.field-count\s*\{[^}]*align-self: flex-end;/s);
 assert.doesNotMatch(css,/\.field-count\s*\{[^}]*position:\s*absolute/s);
 assert.match(css,/@container feedback-types \(max-width: 19rem\)/);
 assert.match(css,/\.form-field input,\s*\.form-field textarea\s*\{[^}]*min-height: 48px;[^}]*font-size: 1rem;/s);
});

test('feedback success and retry retain the original state contract and primary pressed contrast',()=>{
 const html=read(feedback+'.html'),css=compile(feedback+'.scss');
 assert.match(html,/@if \(isDone\)/);
 assert.match(html,/@if \(errorMessage\)/);
 assert.match(html,/role="alert"/);
 assert.match(html,/\(click\)="returnToProfile\(\)"/);
 assert.match(css,/\.primary-action:active:not\(:disabled\)\s*\{\s*background: var\(--ion-color-primary\);/);
 assert.match(css,/\.primary-action\s*\{[^}]*min-height: 48px;/s);
 assert.doesNotMatch(css,/\.type-copy small\s*\{[^}]*line-clamp/s);
});

test('message metadata and destructive targets no longer steal the narrow text column',()=>{
 const css=compile(messages+'.scss'),html=read(messages+'.html');
 assert.match(css,/\.message-item\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 48px;/s);
 assert.match(css,/\.message-meta\s*\{[^}]*grid-column: 2;/s);
 assert.match(css,/\.delete-action\s*\{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
 assert.doesNotMatch(css,/\.message-title\s*\{[^}]*(?:white-space: nowrap|text-overflow|line-clamp)/s);
 assert.match(css,/\.message-preview\s*\{[^}]*-webkit-line-clamp: 2;/s);
 assert.match(css,/\.message-state button\s*\{[^}]*min-height: 48px;/s);
 assert.ok(html.includes('aria-label="消息列表"'));
 assert.ok(html.includes('[disabled]="!messageService.hasMore || messageService.loading || messages.length === 0"'));
});

test('message presentation retains every existing action, retry and deployment gate',()=>{
 const html=read(messages+'.html');
 for(const event of ['closeDetail()','markAllRead()','deleteMessage(detailItem, $event)','retryDetail()',
  'openInvitation()','loadFirst()','openMessage(message)','deleteMessage(message, $event)',
  'refreshMessages($event)','loadMoreMessages($event)'])assert.ok(html.includes(`="${event}"`),event);
 for(const state of ['message-detail-loading','message-loading','message-error','message-empty'])assert.ok(html.includes(`data-testid="${state}"`));
 assert.match(read('src/app/app.routes.ts'),/path: 'message', canMatch: \[deploymentGuard\('messages'\)\]/);
 // Opening a real unread detail has side effects. UI fixtures may not pretend
 // this existing write is a safe read-only native acceptance path.
 assert.match(read(messages+'.ts'),/await this\.messageService\.markRead\(detail\.id\)/);
 assert.match(read('src/app/sections/feedback/feedback.service.ts'),/return this\.toResult\('partial', data\)/);
});

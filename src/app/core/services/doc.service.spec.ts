import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocService } from './doc.service';

describe('DocService', () => {
  let service: DocService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DocService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(DocService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads Markdown as text and removes a leading byte-order mark', () => {
    let result = '';

    service
      .getMarkdownDoc(' https://example.com/agreement.md ')
      .subscribe((content) => (result = content));

    const request = httpTesting.expectOne(
      'https://example.com/agreement.md'
    );
    expect(request.request.responseType).toBe('text');

    request.flush('\uFEFF# Agreement');

    expect(result).toBe('# Agreement');
  });

  it('forwards request failures so the document page can offer a retry', () => {
    let receivedError: unknown;

    service
      .getMarkdownDoc('https://example.com/agreement.md')
      .subscribe({ error: (error: unknown) => (receivedError = error) });

    httpTesting
      .expectOne('https://example.com/agreement.md')
      .flush('Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });

    expect(receivedError).toBeTruthy();
  });
});

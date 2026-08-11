import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, timeout } from 'rxjs';

const DOCUMENT_REQUEST_TIMEOUT = 15_000;

@Injectable({
  providedIn: 'root'
})
export class DocService {
  constructor(private http: HttpClient) {}

  getMarkdownDoc(markdownDocUrl: string): Observable<string> {
    return this.http
      .get(markdownDocUrl.trim(), {
        responseType: 'text',
      })
      .pipe(
        timeout(DOCUMENT_REQUEST_TIMEOUT),
        map((content) => content.replace(/^\uFEFF/, ''))
      );
  }
}

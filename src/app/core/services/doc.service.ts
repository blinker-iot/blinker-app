import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
// import { NoticeService } from './notice.service';

@Injectable({
  providedIn: 'root'
})
export class DocService {

  constructor(
    private http: HttpClient,
    // private noticeService: NoticeService
  ) { }

  // async getDoc(docName): Promise<any> {
  //   // await this.noticeService.showLoading('load');
  //   return this.http
  //     .get(this.docUrl + "/page?slug=" + docName)
  //     .toPromise()
  //     .then(response => {
  //       console.log(response);
  //       let data = JSON.parse(JSON.stringify(response));
  //       // this.noticeService.hideLoading();
  //       if (data.status == 200)
  //         return data.data.text
  //       else
  //         return ' ';
  //     })
  //     .catch(this.handleError);
  // }

  getMarkdownDoc(markDownDocUrl): Promise<any> {
    return this.http
      .get(markDownDocUrl, {
        responseType: 'text',
      })
      .toPromise()
      .then(response => {
        return response
      })
      .catch(this.handleError);
  }

  private handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }
}

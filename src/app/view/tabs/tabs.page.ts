import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';


@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  isSubPage = false;

  constructor(
    private router: Router
  ) {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        console.log(e.url.split('/').length)
        this.isSubPage = e.url.split('/').length > 3 ? true : false;
      })
  }

}

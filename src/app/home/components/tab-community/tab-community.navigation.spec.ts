import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouteReuseStrategy, Router, provideRouter } from '@angular/router';
import { IonApp, IonRouterOutlet, IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom, take, timeout } from 'rxjs';
import { routes } from '../../../app.routes';
import { ViewService } from '../../../core/services/view.service';
import { HomePage } from '../../home.page';
import { TabCommunityComponent } from './tab-community';

@Component({ standalone: true, imports: [IonApp, IonRouterOutlet], template: '<ion-app><ion-router-outlet [animated]="false" /></ion-app>' })
class CommunityNavigationHost {}

describe('discovery in the real production Ionic owner', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('view-all does not navigate or add a back stack, and category switches retain the actual content owner and search', async () => {
    expect(routes.some(route => route.path === 'inspiration-collection')).toBe(false);
    await TestBed.configureTestingModule({
      imports: [CommunityNavigationHost],
      providers: [provideRouter([routes.find(route => route.path === 'home')!]),
        provideIonicAngular({ animated: false }), { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
        provideTranslateService(), { provide: ViewService, useValue: { disableMenuSwipe: vi.fn() } }],
    }).compileComponents();
    TestBed.inject(TranslateService).setTranslation('discovery-test', {});
    TestBed.inject(TranslateService).use('discovery-test');
    const fixture = TestBed.createComponent(CommunityNavigationHost);
    fixture.autoDetectChanges();
    const outlet = fixture.debugElement.query(By.directive(IonRouterOutlet)).componentInstance as IonRouterOutlet;
    const stacked = firstValueFrom(outlet.stackDidChange.pipe(take(1), timeout(5000)));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/home/community');
    await stacked;
    await fixture.whenStable();
    const home = fixture.debugElement.query(By.directive(HomePage)).componentInstance;
    const debug = fixture.debugElement.query(By.directive(TabCommunityComponent));
    const component = debug.componentInstance as TabCommunityComponent;
    const element = debug.nativeElement as HTMLElement;
    const content = element.querySelector<HTMLIonContentElement>('ion-content')!;
    const scroll = await content.getScrollElement();
    element.querySelector<HTMLButtonElement>('.view-all[data-category="inspiration"]')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/home/community');
    expect(outlet.component).toBe(home);
    expect(outlet.canGoBack()).toBe(false);
    expect(component.activeCategory).toBe('inspiration');
    expect(await content.getScrollElement()).toBe(scroll);

    // JSDOM has no physical layout; this checks the real Ionic scroll node's
    // property retention, not physical scrolling or native viewport geometry.
    scroll.scrollTop = 83;
    content.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 83 } }));
    element.querySelector<HTMLButtonElement>('.category-tabs [data-category="tips"]')!.click();
    await fixture.whenStable();
    scroll.scrollTop = 47;
    content.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 47 } }));
    element.querySelector<HTMLButtonElement>('.category-tabs [data-category="inspiration"]')!.click();
    await fixture.whenStable();
    expect(scroll.scrollTop).toBe(83);
    expect(router.url).toBe('/home/community');
    element.querySelector<HTMLElement>('.header-action')!.click();
    await fixture.whenStable();
    const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'KITCHEN';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(scroll.scrollTop).toBe(0);
    expect(component.searchKeyword).toBe('KITCHEN');
    expect(fixture.debugElement.query(By.directive(TabCommunityComponent)).componentInstance).toBe(component);
  }, 20000);
});

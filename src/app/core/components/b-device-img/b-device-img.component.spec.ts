import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { DataService } from '../../services/data.service';
import { ImageService } from '../../services/image.service';
import { BDeviceImgComponent } from './b-device-img.component';

describe('BDeviceImgComponent', () => {
  let fixture: ComponentFixture<BDeviceImgComponent>;
  let loader: BehaviorSubject<boolean>;
  let resolveDeviceImage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    loader = new BehaviorSubject(false);
    resolveDeviceImage = vi.fn((reference?: string) => ({
      dark: reference
        ? `devices/${reference.replace('-light.webp', '-dark.webp')}`
        : 'devices/home-living/unknown-device-dark.webp',
      light: reference
        ? `devices/${reference.replace('-dark.webp', '-light.webp')}`
        : 'devices/home-living/unknown-device-light.webp',
    }));

    await TestBed.configureTestingModule({
      imports: [BDeviceImgComponent],
      providers: [
        {
          provide: ImageService,
          useValue: { loader, resolveDeviceImage },
        },
        { provide: DataService, useValue: { device: { dict: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BDeviceImgComponent);
  });

  it('renders only the image stored in the user configuration', () => {
    fixture.componentRef.setInput(
      'filename',
      'home-living/smart-bulb-light.webp',
    );
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);
    expect(fixture.componentInstance.url).toBe(
      'devices/home-living/smart-bulb-light.webp',
    );
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'devices/home-living/smart-bulb-light.webp',
    );

    fixture.componentRef.setInput(
      'filename',
      'home-living/smart-plug-dark.webp',
    );
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);
    expect(fixture.componentInstance.url).toBe(
      'devices/home-living/smart-plug-dark.webp',
    );
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(1);
    const callsBeforeDestroy = resolveDeviceImage.mock.calls.length;
    fixture.destroy();
    loader.next(true);

    expect(loader.observers).toHaveLength(0);
    expect(resolveDeviceImage).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});

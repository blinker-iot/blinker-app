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
        ? `devices/${reference}`
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

  it('resolves both theme images and releases its loader subscription', () => {
    fixture.componentRef.setInput(
      'filename',
      'home-living/smart-bulb-light.webp',
    );
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);
    expect(fixture.componentInstance.lightUrl).toBe(
      'devices/home-living/smart-bulb-light.webp',
    );
    expect(fixture.componentInstance.darkUrl).toBe(
      'devices/home-living/smart-bulb-dark.webp',
    );

    fixture.componentRef.setInput(
      'filename',
      'home-living/smart-plug-light.webp',
    );
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);
    const callsBeforeDestroy = resolveDeviceImage.mock.calls.length;
    fixture.destroy();
    loader.next(true);

    expect(loader.observers).toHaveLength(0);
    expect(resolveDeviceImage).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});

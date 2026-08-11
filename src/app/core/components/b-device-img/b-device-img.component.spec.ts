import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { DataService } from '../../services/data.service';
import { ImageService } from '../../services/image.service';
import { BDeviceImgComponent } from './b-device-img.component';

describe('BDeviceImgComponent', () => {
  let fixture: ComponentFixture<BDeviceImgComponent>;
  let loader: BehaviorSubject<boolean>;
  let imageService: {
    loader: BehaviorSubject<boolean>;
    deviceIconDict: Record<string, string>;
    deviceIconList: Set<string>;
  };

  beforeEach(async () => {
    loader = new BehaviorSubject(false);
    imageService = {
      loader,
      deviceIconDict: {},
      deviceIconList: new Set<string>(),
    };

    await TestBed.configureTestingModule({
      imports: [BDeviceImgComponent],
      providers: [
        { provide: ImageService, useValue: imageService },
        { provide: DataService, useValue: { device: { dict: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BDeviceImgComponent);
  });

  it('keeps one loader subscription and releases it on destroy', () => {
    fixture.componentRef.setInput('filename', 'remote-icon.png');
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);

    fixture.componentRef.setInput('filename', 'another-icon.png');
    fixture.detectChanges();

    expect(loader.observers).toHaveLength(1);

    const component = fixture.componentInstance;
    expect(component.url).toBe(component.unknownUrl);
    fixture.destroy();

    imageService.deviceIconList.add('another-icon');
    imageService.deviceIconDict['another-icon'] = 'https://example.com/icon.png';
    loader.next(true);

    expect(loader.observers).toHaveLength(0);
    expect(component.url).toBe(component.unknownUrl);
  });
});

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext } from 'src/app/core/device-v2/account-scope';
import { OrderData } from 'src/app/core/model/data.model';
import { AilyResponse, GatewayHttpError } from 'src/app/core/model/response.model';
import { isRegionSnapshot, RegionSnapshot } from 'src/app/core/model/region.model';
import { DataService } from 'src/app/core/services/data.service';

@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(
    private readonly http: HttpClient,
    private readonly data: DataService,
  ) {}

  async load(): Promise<RegionSnapshot> {
    const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
    const response = await firstValueFrom(this.http.get<AilyResponse<RegionSnapshot>>(API.ACCOUNT.REGIONS));

    assertDeviceV2AccountContext(this.data, context);

    return this.accept(response.data);
  }

  async saveData(roomData: OrderData, expectedRevision: number, expectedSessionEpoch: number): Promise<RegionSnapshot> {
    if (this.data.sessionEpoch !== expectedSessionEpoch) throw new Error('登录账户已变化，请重新打开区域页面。');

    const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
    const response = await firstValueFrom(this.http.put<AilyResponse<RegionSnapshot>>(API.ACCOUNT.REGIONS, {
      expectedRevision,
      order: roomData.list,
      rooms: roomData.dict,
    }));

    assertDeviceV2AccountContext(this.data, context);

    return this.accept(response.data);
  }

  private accept(snapshot: unknown): RegionSnapshot {
    if (!isRegionSnapshot(snapshot)) throw new Error('区域数据格式无效，请重试。');

    this.data.loadRegions(snapshot);

    return {
      revision: this.data.roomRevision!,
      order: [...this.data.room.list],
      rooms: structuredClone(this.data.room.dict),
    };
  }
}

export function roomErrorMessage(error: unknown): string {
  if (error instanceof GatewayHttpError) {
    if (error.code === 'ACCOUNT_REGIONS_CONFLICT') return '区域已在其他设备修改，请重新加载后再编辑。';
    if (error.code === 'ACCOUNT_REGION_DEVICE_NOT_FOUND') return '部分设备已不可用，请重新选择。';
    if (error.httpStatus === 404) return '区域同步接口暂不可用，请确认服务端已更新。';
    if (error.httpStatus === 401) return '登录已失效，请重新登录。';
  }

  return '区域同步失败，请检查连接后重试。';
}

import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { HttpClient } from '@angular/common/http';
import { BlinkerResponse } from '../model/response.model';
import { API } from 'src/app/configs/app.config';

@Injectable({
    providedIn: 'root'
})
export class CloudStorageService {

    get uuid() {
        return this.dataService.auth.uuid
    }

    get token() {
        return this.dataService.auth.token
    }

    constructor(
        private http: HttpClient,
        private dataService: DataService
    ) { }

    intervalTime = 300000;
    getTimeSeriesData(device, datakey, quickCode = ''): Promise<boolean> {
        if (typeof device.data['history'] == 'undefined')
            device.data['history'] = {}
        if (typeof device.data['history'][datakey] == 'undefined')
            device.data['history'][datakey] = {}
        // 如果已缓存的数据在设定的intervalTime内，则不再向服务器请求
        if (typeof device.data['history'][datakey][quickCode] != 'undefined') {
            if (device.data['history'][datakey][quickCode].length > 0) {
                let length = device.data['history'][datakey][quickCode].length
                let date = device.data['history'][datakey][quickCode][length - 1].date
                // console.log(Date.parse(Date().toString()) - (date * 1000) < this.intervalTime);
                if (Date.parse(Date().toString()) - (date * 1000) < this.intervalTime)
                    return new Promise((resolve, reject) => { resolve(true) })
            }
        }
        return this.http.get<BlinkerResponse>(API.DEVICE.TIME_SERIES_DATA, {
            params: {
                uuid: this.uuid,
                token: this.token,
                deviceName: device.deviceName,
                dataType: datakey,
                quickCode: quickCode
            }
        })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    device.data['history'][datakey][quickCode] = data.detail;
                    return true
                }
                return false;
            })
            .catch(this.handleError);
    }

    handleError(error: any): boolean {
        console.error('An error occurred', error);
        return false;
    }

}
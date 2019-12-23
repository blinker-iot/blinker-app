import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API } from 'src/app/configs/app.config';
import { DataService } from 'src/app/core/services/data.service';

@Injectable({
    providedIn: 'root'
})
export class RoomService {

    get uuid() {
        return this.dataService.auth.uuid;
    }

    get token() {
        return this.dataService.auth.token
    }

    constructor(
        private http: HttpClient,
        private dataService: DataService
    ) { }


    saveData(roomData) {
        let config
        if (typeof roomData.list != 'undefined' && typeof roomData.dict != 'undefined') {
            config = {
                roomList: {
                    data: roomData.dict,
                    order: roomData.list
                }
            }
        } else {
            config = {
                roomList: roomData
            }
        }
        return this.http
            .post(API.USER.SAVE_CONFIG,
                {
                    "uuid": this.uuid,
                    'token': this.token,
                    "userConf": JSON.stringify(config)
                })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    return true;
                } else {
                    return false;
                }
            })
            .catch(this.handleError);
    }

    private handleError(error: any): boolean {
        console.error('An error occurred', error);
        return false;
    }

}
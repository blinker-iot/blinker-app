import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API } from 'src/app/configs/api.config';
import { DataService } from 'src/app/core/services/data.service';
// import { LoaderService } from 'src/app/core/services/loader.service';

@Injectable({
    providedIn: 'root'
})
export class SceneService {

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


    saveData(sceneData) {
        let config
        if (typeof sceneData.list != 'undefined' && typeof sceneData.dict != 'undefined') {
            config = {
                sceneList: {
                    data: sceneData.dict,
                    order: sceneData.list
                }
            }
        } else {
            config = {
                sceneList: sceneData
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
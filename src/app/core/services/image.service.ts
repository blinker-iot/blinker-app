import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CONFIG } from 'src/app/configs/app.config'
import { BehaviorSubject } from 'rxjs';
// import { Storage } from '@ionic/storage';

@Injectable({
    providedIn: 'root'
})
export class ImageService {

    deviceIconDict = {}
    deviceIconList = []

    loader = new BehaviorSubject(false)

    constructor(
        private http: HttpClient,
        // private storage: Storage
    ) { }

    init() {
        this.http.get(CONFIG.ICON_FILE + `?date=${new Date().getTime()}`)
            .subscribe(async resp => {
                this.deviceIconDict = resp;
                // if (await this.storage.get('deviceIconDict') != JSON.stringify(this.deviceIconDict)) {
                //     this.storage.set('deviceIconDict', JSON.stringify(this.deviceIconDict));
                // }

                for (const key in this.deviceIconDict) {
                    this.deviceIconList.push(key);
                }
                this.loader.next(true)
            })
    }

    getBase64Image(imgPath: string, type = 'icon') {
        let img = new Image();
        img.crossOrigin = '';
        img.src = imgPath;
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        if (type == 'icon') {
            ctx.drawImage(img, 0, 0, 200, 200);
        } else {
            ctx.drawImage(img, 0, 0, img.width, img.height);
        }

        var dataURL = canvas.toDataURL("image/png");
        return dataURL;
    }

}

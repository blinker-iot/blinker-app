import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { HttpClient } from '@angular/common/http';
import { BlinkerResponse } from '../model/response.model';
import { API } from 'src/app/configs/api.config';
import { sha256 } from '../functions/func';
import { NavController } from '@ionic/angular';


@Injectable({
    providedIn: 'root'
})
export class AuthService {

    get uuid() {
        return this.dataService.auth.uuid
    }

    get token() {
        return this.dataService.auth.token
    }

    constructor(
        private http: HttpClient,
        private dataService: DataService,
        private navCtrl: NavController
    ) { }

    init() {
        this.dataService.authCheck.subscribe(state => {
            if (state)
                this.checkAuthState()
        });
    }

    isLogin() {
        if (typeof this.dataService.auth != 'undefined')
            return true
        return false
    }

    // 检查是否有其他设备登录
    checkAuthState() {
        console.log('check auth expires');
        this.http.get(API.AUTH.CHECK, {
            params: {
                uuid: this.uuid,
                token: this.token
            }
        }).subscribe(resp => {
            console.log(resp);
        })
    }

    async login(username, password): Promise<boolean> {
        return this.http.get<BlinkerResponse>(API.AUTH.LOGIN, {
            params: {
                username: username,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(resp => {
                console.log(resp);
                if (resp.message == 1000) {
                    this.dataService.auth = resp.detail
                    return true
                } else {
                    return false
                }
            })
            .catch(this.handleError);
    }

    logout() {
        this.dataService.removeAuthData();
        this.dataService.authDataExpire.next(true);
        this.dataService.authDataLoader.next(false);
        this.dataService.userDataLoader.next(false);
        this.navCtrl.navigateRoot('/login');
    }

    register(phone, smscode, password): Promise<boolean> {
        return this.http.get(API.AUTH.REGISTER, {
            params: {
                phone: phone,
                smsCode: smscode,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    this.dataService.auth = data.detail
                    // console.log("uuid:" + this.uuid);
                    // console.log("token:" + this.token);
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    retrieve(phone, smscode, password): Promise<boolean> {
        return this.http.get(API.AUTH.RETRIEVE, {
            params: {
                phone: phone,
                smsCode: smscode,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    getSmscode(phone, action): Promise<boolean> {
        return this.http
            .get(API.AUTH.SMSCODE, {
                params: {
                    phone: phone,
                    sendType: action
                }
            })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    handleError(error: any): boolean {
        console.error('An error occurred', error);
        return false;
    }

}

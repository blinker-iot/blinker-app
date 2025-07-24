import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class AudioService {

    audioEl;

    constructor(
        private http: HttpClient,
    ) { }

    init(el) {
        this.audioEl = el
    }

    switch(state) {
        if (state == 'on')
            this.audioEl.src = `aac/Switch_On.aac`;
        else
            this.audioEl.src = `aac/Switch_Off.aac`;
        this.audioEl.play();
    }

    click(){
        this.audioEl.src = `aac/Click.aac`;
        this.audioEl.play();
    }

    play(audioName) {
        this.audioEl.src = `aac/Speech_${audioName}.aac`;
        this.audioEl.play();
    }

}

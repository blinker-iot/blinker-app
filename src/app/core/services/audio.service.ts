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
            this.audioEl.src = `assets/aac/Switch_On.aac`;
        else
            this.audioEl.src = `assets/aac/Switch_Off.aac`;
        this.audioEl.play();
    }

    play(audioName) {
        this.audioEl.src = `assets/aac/Speech_${audioName}.aac`;
        this.audioEl.play();
    }

}

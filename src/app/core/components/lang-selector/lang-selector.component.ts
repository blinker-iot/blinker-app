import { Component, OnInit } from '@angular/core';
import { TranslationService } from '../../services/translation.service';
import { CONFIG } from 'src/app/configs/app.config';

@Component({
  selector: 'blinker-lang-selector',
  templateUrl: './lang-selector.component.html',
  styleUrls: ['./lang-selector.component.scss'],
})
export class LangSelectorComponent implements OnInit {
  supportI18n;
  languageList;
  selectedLanguage;

  showMore = false;

  constructor(
    private translationService: TranslationService
  ) { }

  ngOnInit() {
    this.getLanguageSetting();
    this.supportI18n = CONFIG.I18N.ENABLE;
  }

  changeLanguage(lang) {
    this.translationService.setLanguage(lang);
    this.getLanguageSetting();
  }

  getLanguageSetting() {
    this.languageList = this.translationService.getLanguageList();
    this.selectedLanguage = this.translationService.getSelectedLanguage();
  }

}

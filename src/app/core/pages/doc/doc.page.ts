import { Component, OnInit, Input } from '@angular/core';
import { DocService } from '../../services/doc.service';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-doc',
  templateUrl: './doc.page.html',
  styleUrls: ['./doc.page.scss'],
})
export class DocPage implements OnInit {

  @Input()
  docTitle = "";

  @Input()
  docUrl = "";

  docContent = "";

  constructor(
    private docService: DocService,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit() {
    this.docService.getMarkdownDoc(this.docUrl).then(content => {
      this.docContent = content
    })
  }

  async close() {
    (await this.modalCtrl.getTop()).dismiss()
    // this.modalCtrl.dismiss()
  }

}

import { Component, OnInit } from '@angular/core';
import { widgetList } from '../widgets/config';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';
import { LayouterService } from '../../layouter.service';

@Component({
  selector: 'widget-listbar',
  templateUrl: './widget-listbar.component.html',
  styleUrls: ['./widget-listbar.component.scss']
})
export class WidgetListbarComponent implements OnInit {

  id;
  device;

  get widgetList() {
    return widgetList
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private dataService: DataService,
    private LayouterService: LayouterService
  ) { }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
  }

  addWidget(type) {
    this.LayouterService.addWidget(type)
  }

}

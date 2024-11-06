import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, ViewChildren } from '@angular/core';
import { ItemComponent } from '../item/item.component';
import { NewuiService } from '../newui.service';

@Component({
  selector: 'nui-item-list',
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
})
export class ItemListComponent implements OnInit {

  @ViewChild('itemList', { static: false }) itemListRef: ElementRef;

  get itemList() {
    return this.itemListRef.nativeElement.childNodes
  }

  @Output() indexChange = new EventEmitter()

  @Output() willEnter = new EventEmitter()

  @Output() willExit = new EventEmitter()

  index;

  constructor(
    private newuiService: NewuiService
  ) { }

  ngOnInit() { }

  ngAfterViewInit() {
    this.initList()
    this.newuiService.back.subscribe(e => {
      this.unSelect()
    })
  }

  initList() {
    let startHeight = 0
    this.itemList.forEach((element, i) => {
      element.style['top'] = startHeight + 'px'
      element.style['opacity'] = 1
      element.style['transition'] = 'all 0.3s'
      element.style['z-index'] = 'auto'
      startHeight += element.clientHeight
      element.onclick = () => {
        this.select(element, i)
      }
    });
    this.itemListRef.nativeElement.style['height'] = startHeight + 'px'
  }

  select(item, index) {
    this.willEnter.emit(index)
    this.itemList.forEach((element, i) => {
      if (i != 0) {
        element.style['top'] = (this.getNumber(element.style['top']) - element.clientHeight) + 'px'
      }
      if (i != index) {
        element.style['opacity'] = 0
        element.style['z-index'] = -999
      }
    })
    item.style['top'] = '0px'
    item.classList.add('selected')
    this.changeIcon(item)
    this.itemListRef.nativeElement.style['height'] = item.clientHeight + 2 + 'px'
    item.onclick = () => {
      this.unSelect()
    }

    setTimeout(() => {
      this.index = index
      this.indexChange.emit(index)
    }, 300);
  }

  unSelect() {
    this.willExit.emit(-1)
    // console.log(this.itemList, this.index);
    let item = this.itemList[this.index]
    item.classList.remove('selected')
    this.initList();
    this.changeIcon(item, false)
    setTimeout(() => {
      this.indexChange.emit(-1)
    }, 300);
  }


  getNumber(numberStr: string) {
    return Number(numberStr.replace('px', ''))
  }

  changeIcon(item, selected = true) {
    let iconEl = item.querySelector(".act-box > i")
    let iconEl2 = item.querySelector(".act-box > i.fa-xmark")
    if (selected) {
      iconEl.style.opacity = 0
      iconEl2.style.opacity = 1
    } else {
      iconEl.style.opacity = 1
      iconEl2.style.opacity = 0
    }
  }

}

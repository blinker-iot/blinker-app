import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'devcenter-devtool',
  templateUrl: './devtool.component.html',
  styleUrls: ['./devtool.component.scss']
})
export class DevtoolComponent implements OnInit {

  constructor(
    private router: Router
  ) { }

  ngOnInit() {
  }

  goto(page) {
    this.router.navigate(['devcenter', 'tool', page])
  }

}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OrderData } from 'src/app/core/model/data.model';
import { AutoTask } from './auto.model';
import { BlinkerResponse } from 'src/app/core/model/response.model';
import { API } from 'src/app/configs/api.config';
import { DataService } from 'src/app/core/services/data.service'

@Injectable({
  providedIn: 'root'
})
export class AutoService {

  tasks: AutoTask[]
  autoTaskData: OrderData;

  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  firstEnter = true;

  constructor(
    private http: HttpClient,
    private dataService: DataService
  ) { }

  getTaskList(tasks) {
    let taskList = []
    tasks.forEach(task => {
      taskList.push(task.id)
    });
    return taskList
  }

  getTaskDict(tasks) {
    let taskDict = {}
    tasks.forEach(task => {
      taskDict[task.id] = task
    });
    return taskDict
  }

  getAutoTasks() {
    return this.http.get<BlinkerResponse>(API.AUTO.TASK, {
      params: {
        uuid: this.uuid,
        token: this.token
      }
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.autoTaskData = {
            list: this.getTaskList(resp.detail),
            dict: this.getTaskDict(resp.detail)
          }
          return true
        } else {
          return false
        }
      })
  }

  updateAutoTask(task) {
    return this.http.post<BlinkerResponse>(API.AUTO.TASK, {
      uuid: this.uuid,
      token: this.token,
      task: JSON.stringify(task)
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          return true
        } else {
          return false
        }
      })
  }

  delAutoTask(taskId) {
    return this.http.delete<BlinkerResponse>(API.AUTO.TASK, {
      params: {
        uuid: this.uuid,
        token: this.token,
        autoId: taskId
      }
    })
      .toPromise()
      .then(resp => {
        if (resp.message == 1000) {
          console.log("delete success");
        }
      })
  }

  changeAutoTaskState(taskId, enable) {
    return this.http.post<BlinkerResponse>(API.AUTO.TASK_STATE, {
      uuid: this.uuid,
      token: this.token,
      autoId: taskId,
      enable: enable
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          return true
        } else {
          return false
        }
      })
  }
}

import {
    Component,
    ViewChild,
    ElementRef
} from '@angular/core';
import {
    NavController,
    ModalController,
} from '@ionic/angular';

@Component({
    selector: 'page-own-airdetector-chart',
    templateUrl: 'own-airdetector-chart.html',
    styleUrls: ['own-airdetector-chart.scss']
})
export class OwnAirdetectorChartPage {
    public myChart: any;
    public myDate;

    @ViewChild('chartCanvas', { read: ElementRef, static: true }) chartCanvas: ElementRef;
    constructor(
        public navCtrl: NavController,

        public modalCtrl: ModalController,
    ) {
    }

    ionViewDidLoad() {
        this.initChart();
        this.myDate = this.getNowFormatDate();
    }

    chosen = 0;
    chose(num) {
        this.chosen = num;
    }

    valueChange(e) {
        console.log(this.myDate);
    }

    getData() {
        // let shijian = new Date();
    }

    RandomNumBoth(Min, Max) {
        var Range = Max - Min;
        var Rand = Math.random();
        var num = Min + Math.round(Rand * Range);
        return num;
    }

    initChart() {
        let shijian = new Date();
        let times = [];

        for (var i = 0; i < 24; i++) {
            shijian = new Date(shijian.valueOf() + 3600000);
            times.push([shijian, this.RandomNumBoth(0, 300)]);
        }
        // console.log(times);

        // this.myChart = echarts.init(this.chartCanvas.nativeElement
        // , null, { renderer: 'svg' }
        // );
        let option = {
            dataZoom: [
                {
                    type: 'inside',
                    filterMode: 'none',
                    minValueSpan: 6,
                    startValue: times[0][0],
                    endValue: times[6][0]
                }
            ],
            tooltip: {
                trigger: 'axis'
            },
            visualMap: {
                show: false,
                showLabel: false,
                pieces: [{
                    gte: 0,
                    lte: 50,
                    color: '#10AF8B'
                }, {
                    gte: 51,
                    lte: 100,
                    color: '#FFDE33'
                }, {
                    gte: 101,
                    lte: 150,
                    color: '#FF9933'
                }, {
                    gt: 151,
                    lte: 200,
                    color: '#660099'
                },
                ],
                outOfRange: {
                    color: '#7E0023'
                }
            },
            xAxis: {
                axisLine: {
                    lineStyle: {
                        color: ['#FFFFFF']
                    }
                },
                type: 'time',

            },
            yAxis: {
                axisLine: {
                    lineStyle: {
                        color: ['#FFFFFF']
                    }
                },
                type: 'value'
            },
            series: [
                {
                    name: 'AQI',
                    type: 'line',
                    smooth: true,
                    data: times,
                    // top:0
                },
                // {
                //     name: 'PM1.0',
                //     type: 'line',
                //     data: [20, 232, 201, 154, 190, 33, 299, 232, 201, 154, 190, 330, 40, 232, 201, 154, 190, 330, 30]
                // },
                // {
                //     name: 'PM2.5',
                //     type: 'line',
                //     data: [33, 332, 301, 334, 390, 330, 320, 332, 301, 334, 390, 330, 320, 332, 301, 334, 214, 330, 320]
                // },
                // {
                //     name: 'PM10',
                //     type: 'line',
                //     data: [60, 92, 91, 94, 320, 250, 300, 30, 40, 80, 320, 250, 320, 10, 66, 30, 3, 10, 320]
                // }
            ],
            // media: [{
            //     option: {
            //         series: [{
            //             width: '100%',
            //             height: '100%',
            //             top:'middle'
            //         }]
            //     }
            // }]
        };

        this.myChart.setOption(option);
        // this.myChart.resize();
    }

    getNowFormatDate() {
        let date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let yearString = year.toString();;
        let monthString = month.toString();;
        let dayString = day.toString();;
        if (month >= 1 && month <= 9) {
            monthString = "0" + monthString;
        }
        if (day >= 0 && day <= 9) {
            dayString = "0" + dayString;
        }
        var currentdate = yearString + '-' + monthString + '-' + dayString;
        return currentdate;
    }

}

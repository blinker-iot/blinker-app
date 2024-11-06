import { Layouter2Data } from "./layouter.interface"

export const LayouterVersion = '3.0.0'

export let DefaultLayouterData: Layouter2Data = {
    version: LayouterVersion,
    header: {
        background: "transparent",
        color: "#757575"
    },
    background: {
        background: "#fafafa"
    },
    dashboard: [],
    actions: [],
    triggers: []
}

export let DemoDashboard = [
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 6, "y": 1, "speech": [], "lstyle": 0 },
    { "type": "tex", "t0": "blinker入门示例", "t1": "文本2", "bg": 2, "ico": "", "cols": 4, "rows": 1, "key": "tex-272", "x": 0, "y": 0, "speech": [], "lstyle": 1, "clr": "#FFF" },
    { "type": "num", "t0": "点击按键", "ico": "fad fa-american-sign-language-interpreting", "clr": "#389BEE", "min": 0, "max": 100, "uni": "次", "bg": 0, "cols": 4, "rows": 2, "key": "num-abc", "x": 0, "y": 1, "speech": [], "lstyle": 1 },
    { "type": "btn", "ico": "fad fa-hand-point-down", "mode": 0, "t0": "点我计数", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-123", "x": 4, "y": 1, "speech": [], "lstyle": 0, "clr": "#389BEE" },
    { "type": "deb", "mode": 0, "bg": 0, "cols": 8, "rows": 3, "key": "debug", "x": 0, "y": 3 }
]

export let DemoActions = [
    {
        "cmd": { "switch": "on" },
        "text": "打开?name"
    },
    {
        "cmd": { "switch": "off" },
        "text": "关闭?name"
    }
]

export let DemoTriggers = [
    {
        "source": "switch",
        "source_zh": "开关状态",
        "state": ["on", "off"],
        "state_zh": ["打开", "关闭"]
    }
]
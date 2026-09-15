"""Render the WeChat application review diagrams with deterministic Chinese text."""
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H, SCALE = 1800, 2100, 2
BG = '#FFFFFF'
INK = '#18324A'
MUTED = '#506579'
BLUE = '#1763C6'
EDGE = '#7690A5'
PALE = '#F0F6FD'
GREEN = '#16765D'
GREEN_PALE = '#EAF7F1'
AMBER_PALE = '#FFF5DF'
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')
FILES = []


class Diagram:
    def __init__(self, index, title, subtitle):
        self.index = index
        self.image = Image.new('RGB', (W * SCALE, H * SCALE), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.nodes = {}
        self.rect((70, 62, 82, 106), BLUE, 0)
        self.text(104, 63, '点灯·blinker', 34, bold=True)
        self.text(1730, 68, f'应用运行流程图  /  {index:02d}', 27, color=MUTED, align='right')
        self.text(70, 137, title, 58, bold=True)
        self.text(70, 220, subtitle, 28, color=MUTED)
        self.line([(70, 282), (1730, 282)], '#D9E4EE', 2)
        self.line([(70, 2014), (1730, 2014)], '#D9E4EE', 2)
        self.text(70, 2035, '点灯·blinker  ·  移动应用业务流程', 24, color=MUTED)
        self.text(1730, 2035, f'{index:02d} / 05', 24, color=MUTED, align='right')

    def font(self, size, bold=False):
        return ImageFont.truetype(str(BOLD if bold else FONT), size * SCALE)

    def text(self, x, y, value, size=30, color=INK, bold=False, align='left'):
        font = self.font(size, bold)
        width = self.draw.textlength(value, font=font) / SCALE
        if align == 'center':
            x -= width / 2
        elif align == 'right':
            x -= width
        if x < 20 or x + width > W - 20:
            raise ValueError(f'Text outside canvas: {value}')
        self.draw.text((x * SCALE, y * SCALE), value, font=font, fill=color,
                       anchor='lt', stroke_width=0)

    def rect(self, bounds, fill, radius=22, outline=None, width=2):
        self.draw.rounded_rectangle(tuple(v * SCALE for v in bounds),
                                    radius=radius * SCALE, fill=fill,
                                    outline=outline, width=width * SCALE)

    def line(self, points, color=EDGE, width=3):
        self.draw.line([(x * SCALE, y * SCALE) for x, y in points],
                       fill=color, width=width * SCALE, joint='curve')

    def arrow(self, points, label=None, at=None, color=EDGE):
        self.line(points, color, 3)
        (x0, y0), (x, y) = points[-2:]
        angle = math.atan2(y-y0, x-x0)
        size = 14
        poly = [(x, y),
                (x-size*math.cos(angle-.48), y-size*math.sin(angle-.48)),
                (x-size*math.cos(angle+.48), y-size*math.sin(angle+.48))]
        self.draw.polygon([(a*SCALE, b*SCALE) for a, b in poly], fill=color)
        if label:
            self.label(*at, label)

    def label(self, x, y, value):
        size = 26
        width = self.draw.textlength(value, font=self.font(size)) / SCALE
        self.rect((x-width/2-9, y-4, x+width/2+9, y+size+9), BG, 4)
        self.text(x, y, value, size, color=MUTED, align='center')

    def box(self, key, x, y, w, h, title, body='', kind='step'):
        self.nodes[key] = (x, y, w, h)
        fill, stroke = (GREEN_PALE, GREEN) if kind == 'end' else (PALE, '#B8CFE6')
        self.rect((x, y, x+w, y+h), fill, 26 if kind == 'end' else 18, stroke, 2)
        lines = body.split('\n') if body else []
        block = 38 + len(lines) * 42 + (14 if lines else 0)
        top = y + (h-block) / 2
        title_font = 34
        if self.draw.textlength(title, font=self.font(title_font, True)) / SCALE > w - 36:
            raise ValueError(f'Node title too wide: {title}')
        self.text(x+w/2, top, title, title_font, bold=True, align='center')
        for i, value in enumerate(lines):
            if self.draw.textlength(value, font=self.font(28)) / SCALE > w - 28:
                raise ValueError(f'Node body too wide: {value}')
            self.text(x+w/2, top+52+i*42, value, 28, color=MUTED, align='center')

    def diamond(self, key, cx, cy, w, h, title, body=''):
        self.nodes[key] = (cx-w/2, cy-h/2, w, h)
        points = [(cx, cy-h/2), (cx+w/2, cy), (cx, cy+h/2), (cx-w/2, cy)]
        self.draw.polygon([(x*SCALE,y*SCALE) for x,y in points], fill=AMBER_PALE)
        self.line(points+[points[0]], '#D1AE69', 2)
        self.text(cx, cy-(35 if body else 18), title, 32, bold=True, align='center')
        if body:
            self.text(cx, cy+12, body, 26, color=MUTED, align='center')

    def p(self, key, side):
        x,y,w,h = self.nodes[key]
        return {'t':(x+w/2,y), 'b':(x+w/2,y+h),
                'l':(x,y+h/2), 'r':(x+w,y+h/2)}[side]

    def link(self, a, b, side_a='b', side_b='t', via=None, label=None, at=None):
        self.arrow([self.p(a,side_a), *(via or []), self.p(b,side_b)], label, at)

    def section(self, x, y, title, hint=''):
        self.text(x, y, title, 32, color=BLUE, bold=True)
        if hint:
            self.text(x, y+49, hint, 27, color=MUTED)

    def note(self, y, title, lines):
        self.rect((70,y,1730,y+72+len(lines)*40), '#F6F8FA', 14)
        self.text(98,y+22,title,28,bold=True)
        for i,value in enumerate(lines):
            self.text(98,y+67+i*40,value,26,color=MUTED)

    def save(self, name):
        path = ROOT / name
        self.image.resize((W,H), Image.Resampling.LANCZOS).save(path, optimize=True, dpi=(144,144))
        with Image.open(path) as check:
            check.verify()
        assert path.stat().st_size < 5_000_000
        FILES.append(path)


def overview():
    d = Diagram(1, '应用整体运行流程', '业务用途：连接物联网设备，提供设备控制、数据查看与共享管理服务。')
    d.box('start',700,340,400,85,'启动点灯 APP',kind='end')
    d.diamond('login',900,560,390,170,'是否已登录？')
    d.box('sign',100,475,445,170,'完成账号登录','邮箱验证码或第三方登录\n微信授权流程见图 02')
    d.box('home',645,765,510,115,'进入首页 · 设备列表','加载当前账号的设备信息')
    d.link('start','login')
    d.link('login','sign','l','r',label='否',at=(625,515))
    d.link('login','home',label='是',at=(944,683))
    d.link('sign','home',via=[(322.5,705),(900,705)])
    d.box('add',90,1010,480,155,'添加设备','选择接入方式并完成添加\n详细流程见图 03')
    d.box('select',660,1010,480,155,'选择已有设备','查看设备状态\n进入对应控制面板')
    d.box('manage',1230,1010,480,155,'进入「我的」','管理账号与设备\n查看服务支持入口')
    for k,c in [('add',330),('select',900),('manage',1470)]:
        d.link('home',k,via=[(900,940),(c,940)])
    d.box('added',90,1300,480,160,'设备出现在列表','查看名称及在线状态\n按区域整理设备')
    d.box('use',660,1300,480,160,'使用设备功能','控制 / 数据查看 / 定时\n详细流程见图 04')
    d.box('settings',1230,1300,480,160,'管理与服务','区域 / 共享 / 账号设置\n消息中心 / 意见反馈')
    for a,b in [('add','added'),('select','use'),('manage','settings')]: d.link(a,b)
    d.box('return',645,1660,510,105,'返回首页，继续使用',kind='end')
    for k,c in [('added',330),('use',900),('settings',1470)]:
        d.link(k,'return',via=[(c,1560),(900,1560)])
    d.note(1850,'业务说明',[
        '用户通过 APP 接入和管理自有设备，也可在获得共享权限后访问他人分享的设备。',
        '可使用的控制组件、数据内容及定时能力，以设备实际提供的功能为准。'])
    d.save('01-应用整体运行流程.png')


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    overview()

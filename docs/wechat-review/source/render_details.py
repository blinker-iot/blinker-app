"""Generate the remaining review flows, the upload ZIP, and QA manifest."""
from render_flows import Diagram, ROOT, FILES, overview
from PIL import Image, ImageDraw, ImageFont
import json
import zipfile

def wechat_login():
    d = Diagram(2, '微信授权登录与账号关联', '微信在本应用中用于用户授权登录，以及关联点灯应用账号。')
    d.box('page',490,325,820,125,'进入登录页','可查看《用户协议》与《隐私政策》')
    d.box('click',625,530,550,90,'点击微信登录')
    d.diamond('installed',900,750,400,160,'是否已安装微信？')
    d.box('missing',1255,665,455,170,'微信不可用','停留登录页\n可安装微信或改用邮箱登录')
    d.box('auth',660,940,480,120,'唤起微信授权','用户在微信中确认授权')
    d.box('cancel',1255,915,455,170,'取消、拒绝或失败','停留登录页\n可重试或改用邮箱登录')
    d.diamond('bound',900,1240,470,200,'是否已关联账号？','服务端处理授权结果')
    d.box('success',90,1450,480,145,'微信登录成功','加载用户及设备信息')
    d.box('email',1150,1430,560,225,'邮箱验证码登录 / 注册','未关联时仍停留登录页\n用户通过邮箱完成登录\n后台尝试关联本次微信授权')
    d.box('home',645,1760,510,105,'进入设备首页',kind='end')
    d.link('page','click')
    d.link('click','installed')
    d.link('installed','missing','r','l',label='否',at=(1180,705))
    d.link('installed','auth',label='是',at=(944,866))
    d.link('auth','cancel','r','l')
    d.link('auth','bound',label='授权成功',at=(974,1090))
    d.link('bound','success','l','t',via=[(330,1240)],label='已关联',at=(453,1192))
    d.link('bound','email','r','t',via=[(1430,1240)],label='未关联',at=(1285,1192))
    d.link('success','home',via=[(330,1690),(900,1690)])
    d.link('email','home',via=[(1430,1690),(900,1690)])
    d.note(1900,'结果说明',[
        '邮箱验证失败时留在登录页重试；微信关联失败不影响已经成功的邮箱登录。'])
    d.save('02-微信授权登录与账号关联.png')


def onboarding():
    d = Diagram(3, '设备添加与接入流程', '根据设备支持的接入方式，完成密钥配置、Wi-Fi 配网或蓝牙接入。')
    d.box('start',645,335,510,100,'首页 → 添加设备',kind='end')
    d.box('choose',615,515,570,100,'按设备类型选择接入方式')
    d.link('start','choose')
    d.section(90,725,'方式 A','密钥接入')
    d.section(660,725,'方式 B','Wi-Fi 配网')
    d.section(1230,725,'方式 C','蓝牙接入')
    d.box('key',90,840,480,225,'创建设备与密钥','填写设备名称\n创建并获取设备密钥')
    d.box('wifi',660,840,480,225,'连接待配网设备','设备进入配网模式\n按提示允许所需权限\n通过蓝牙或临时热点连接')
    d.box('ble',1230,840,480,225,'扫描附近蓝牙设备','设备进入接入模式\n允许蓝牙等所需权限\n发现并选择目标设备')
    for k,c in [('key',330),('wifi',900),('ble',1470)]:
        d.link('choose',k,via=[(900,670),(c,670)])
    d.box('keyconf',90,1130,480,225,'配置设备程序','将密钥配置到设备程序\n按固件要求设置网络\n启动设备并联网')
    d.box('wificonf',660,1130,480,225,'配置目标 Wi-Fi','选择网络并填写密码\n写入设备身份与网络信息\n等待配网结果')
    d.box('blebind',1230,1130,480,225,'完成接入与账号绑定','APP 处理设备接入\n显示接入结果')
    for a,b in [('key','keyconf'),('wifi','wificonf'),('ble','blebind')]:
        d.link(a,b)
    d.box('keydone',90,1430,480,135,'完成密钥接入步骤','等待设备连接云端')
    d.box('wifidone',660,1430,480,135,'配网完成','等待设备连接云端')
    d.box('bledone',1230,1430,480,135,'蓝牙接入完成','通过蓝牙与设备通信')
    for a,b in [('keyconf','keydone'),('wificonf','wifidone'),('blebind','bledone')]:
        d.link(a,b)
    d.box('result',540,1720,720,110,'刷新设备列表 / 进入设备页','查看设备连接状态',kind='end')
    for k,c in [('keydone',330),('wifidone',900),('bledone',1470)]:
        d.link(k,'result',via=[(c,1640),(900,1640)])
    d.note(1850,'未完成时的处理',[
        '权限未允许、未发现设备、连接或配网失败 → 按提示检查权限、设备状态和网络后重试。',
        'Wi-Fi 配网完成后仍需等待设备上线；蓝牙设备按其实际连接方式使用。'])
    d.save('03-设备添加与接入流程.png')


def control():
    d = Diagram(4, '设备控制、数据查看与定时', '用户进入设备面板后，使用该设备提供的控制和数据功能。')
    d.box('panel',575,355,650,180,'从设备列表选择设备','进入控制面板\n加载设备状态及可用功能')
    d.section(90,610,'设备控制')
    d.section(660,610,'数据查看')
    d.section(1230,610,'定时任务','支持时可用')
    d.box('operate',90,710,480,165,'操作控制组件','点击开关、调节参数等\n以设备提供的控件为准')
    d.box('data',660,710,480,165,'查看设备上报','显示最新状态\n查看传感器数据（若提供）')
    d.box('timer',1230,710,480,165,'进入「定时任务」','选择定时、循环或倒计时\n设置对应的任务类型')
    for k,c in [('operate',330),('data',900),('timer',1470)]:
        d.link('panel',k,via=[(900,580),(c,580)])
    d.box('send',90,1000,480,175,'发送控制指令','通过可用云端或蓝牙连接\n发送到目标设备')
    d.box('receive',660,1000,480,175,'接收设备数据','读取设备的后续上报\n更新面板中的对应数值')
    d.box('rule',1230,1000,480,175,'设置执行规则','按任务类型设置\n时间、周期与执行动作')
    d.link('operate','send')
    d.link('data','receive')
    d.link('timer','rule')
    d.box('feedback',90,1280,480,140,'接收设备反馈','设备执行后更新状态显示')
    d.box('latest',660,1280,480,140,'查看最新显示','以 APP 收到的设备数据为准')
    d.box('submit',1230,1280,480,140,'提交定时任务','发送给支持该功能的设备')
    d.link('send','feedback')
    d.link('receive','latest')
    d.link('rule','submit')
    d.box('execute',1230,1510,480,135,'设备按计划执行','由设备固件处理任务')
    d.link('submit','execute')
    d.rect((90,1510,1140,1645),'#F6F8FA',14)
    d.text(118,1530,'连接异常或暂未收到设备数据',28,bold=True)
    d.text(118,1580,'检查网络、蓝牙及设备状态后，重新进入面板。',27,color='#506579')
    d.box('return',645,1775,510,95,'返回设备列表，继续使用',kind='end')
    d.link('feedback','return',side_a='l',via=[(62,1350),(62,1710),(900,1710)])
    d.link('latest','return',side_a='r',via=[(1185,1350),(1185,1710),(900,1710)])
    d.link('execute','return',via=[(1470,1710),(900,1710)])
    d.note(1900,'功能条件',[
        '定时功能依赖设备硬件与固件支持；提交任务不等于设备已经执行，结果以设备反馈为准。'])
    d.save('04-设备控制数据查看与定时.png')


def sharing():
    d = Diagram(5, '设备共享与权限管理', '所有者生成一次性邀请码，接收者领取后按授予权限使用设备。')
    d.section(110,345,'设备所有者')
    d.section(1090,345,'共享接收者')
    d.line([(900,425),(900,1800)],'#E2E9EF',2)
    d.box('owner',110,485,600,145,'选择自己的设备','设备设置 → 设备共享')
    d.box('recipient',1090,485,600,185,'登录点灯 APP','我的 → 设备共享\n进入「接收的设备」')
    d.box('permission',110,745,600,185,'设置共享权限','选择「仅查看」\n或「可查看和控制」')
    d.box('invite',110,1015,600,145,'生成一次性邀请码','将邀请码提供给接收者')
    d.box('claim',1090,1015,600,145,'输入邀请码并领取','提交后校验邀请码及权限')
    d.diamond('valid',1390,1360,470,190,'邀请码是否有效？')
    d.box('invalid',110,1265,600,190,'邀请码不可用','无效、过期或已领取\n重新获取邀请码后再试')
    d.box('accepted',1090,1565,600,145,'共享设备加入列表','按授予权限查看或控制',kind='end')
    d.link('owner','permission')
    d.link('permission','invite')
    d.link('recipient','claim')
    d.link('invite','claim','r','l',label='传递邀请码',at=(900,1040))
    d.link('claim','valid')
    d.link('valid','invalid','l','r',label='否',at=(935,1315))
    d.link('valid','accepted',label='是',at=(1434,1490))
    d.link('invalid','invite','t','b',label='重新生成',at=(482,1200))
    d.rect((110,1570,710,1785),'#F6F8FA',14)
    d.text(138,1595,'所有者后续管理',30,bold=True)
    d.text(138,1657,'可撤销待领取邀请',28,color='#506579')
    d.text(138,1703,'可变更权限或移除共享成员',28,color='#506579')
    d.text(1390,1750,'接收者可主动退出该设备的共享',27,color='#506579',align='center')
    d.note(1865,'权限说明',[
        '「仅查看」用于查看设备；「可查看和控制」允许查看状态并操作控制组件。',
        '移除共享成员或退出共享后，结束该设备的共享访问。'])
    d.save('05-设备共享与权限管理.png')


def package():
    records=[]
    for path in sorted(FILES):
        with Image.open(path) as im:
            records.append({'file': path.name, 'format': im.format, 'width': im.width,
                            'height': im.height, 'bytes': path.stat().st_size,
                            'under_5MB': path.stat().st_size < 5_000_000})
    assert len(records) == 5 and len({x['file'] for x in records}) == 5
    assert all(x['format']=='PNG' and x['under_5MB'] for x in records)
    archive = ROOT / '微信应用审核-5张流程图.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for path in sorted(FILES):
            z.write(path,path.name)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == 5
    qa = ROOT / 'source' / 'image-checks.json'
    qa.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    # A contact sheet is for internal visual QA, not part of the upload set.
    sheet = Image.new('RGB',(1440,1800),'#E9EDF2')
    draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',24)
    for index,path in enumerate(sorted(FILES)):
        x=(index%3)*480
        y=(index//3)*900
        with Image.open(path) as im:
            im.thumbnail((456,810))
            sheet.paste(im,(x+12,y+48))
        draw.text((x+12,y+12),path.stem[:21],font=font,fill='#18324A')
    sheet.save(ROOT/'source'/'contact-sheet.jpg',quality=90)
    print(json.dumps({'images':records,'zip_bytes':archive.stat().st_size},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    ROOT.mkdir(parents=True,exist_ok=True)
    overview()
    wechat_login()
    onboarding()
    control()
    sharing()
    package()


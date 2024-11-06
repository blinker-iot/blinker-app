import { TextDecoder } from "text-encoding";
import CryptoJS from "crypto-js";

export function sha256(password) {
  return CryptoJS.SHA256(password);
}

export function arrayRemove(array, index) {
  if (index <= (array.length - 1)) {
    for (var i = index; i < array.length; i++) {
      array[i] = array[i + 1];
    }
  } else {
    // throw new Error('超出最大索引！');
  }
  array.length = array.length - 1;
  return array;
}

export function reorder(devices, deviceList) {
  let newdevices = [];
  for (let deviceName of deviceList) {
    let i = 0;
    for (let device of devices) {
      if (deviceName == device.deviceName) {
        newdevices.push(device);
        arrayRemove(devices, i);
        break;
      }
      i = i + 1;
    }
  }
  return newdevices;
}

export function initDevice(devices) {
  let newDevices = {};
  for (let device of devices) {
    device["id"] = deviceName12(device.deviceName);
    if (typeof device.data == "undefined") {
      device["data"] = {
        switch: "",
        state: "",
      };
    }
    if (typeof device.storage == "undefined") {
      device["storage"] = {};
    }
    newDevices[device["id"]] = device;
  }
  return newDevices;
}

export function deviceName12(deviceName) {
  return deviceName.substr(0, 12);
}

export function deviceName2id(deviceName) {
  return deviceName.substr(0, 12);
}

export function getDeviceId(device) {
  return device.deviceName.substr(0, 12);
}

export function mac2deviceId(mac) {
  return mac.replace(new RegExp(":", "g"), "");
}

export function mac2name(result) {
  let deviceName = "";
  //android
  if (result.id.length == 17) {
    deviceName = result.id.replace(new RegExp(":", "g"), "");
  } //ios
  else {
    let macBytes = new Uint8Array(
      result.advertising.kCBAdvDataManufacturerData,
    );
    for (let i = macBytes.length - 6; i < macBytes.length; i++) {
      if (macBytes[i] <= 16) deviceName += "0";
      deviceName += macBytes[i].toString(16);
    }
  }
  return deviceName.toUpperCase();
}

export function checkCodeUtf8(lastbuf: Uint8Array): boolean {
  const index = lastbuf.indexOf(10);
  let utf8cnt = 0;
  let gb18030cnt = 0;
  let asciicnt = 0;

  for (let i = 0; i < index; i++) {
    const byte = lastbuf[i];

    if (byte < 0x80) {
      asciicnt++;
      continue;
    }

    let p = i;
    let bytesToCheck = 0;

    if ((byte >> 3) === 31) {
      bytesToCheck = 3;
    } else if ((byte >> 4) === 14) {
      bytesToCheck = 2;
    } else if ((byte >> 5) === 6) {
      bytesToCheck = 1;
    }

    if (bytesToCheck > 0) {
      let isValidUtf8 = true;

      for (let j = 1; j <= bytesToCheck; j++) {
        p++;
        if ((lastbuf[p] > 0xbf) || (lastbuf[p] < 0x80)) {
          isValidUtf8 = false;
          break;
        }
      }

      if (isValidUtf8) {
        utf8cnt++;
        i = p;
      }
    }
  }

  const utf8scale = utf8cnt * 3 / (index - asciicnt);

  if (utf8scale > 0.99) {
    return true;
  }

  for (let i = 0; i < index; i++) {
    const byte = lastbuf[i];

    if (byte < 0x80) {
      continue;
    }

    let p = i;

    if ((byte >= 0x81) && (byte <= 0xfe)) {
      p++;

      if ((lastbuf[p] >= 0x40) && (lastbuf[p] <= 0xfe)) {
        if (lastbuf[p] !== 0x7f) {
          gb18030cnt++;
          i = p;
        }
      } else if ((lastbuf[p] >= 0x30) && (lastbuf[p] <= 0x39)) {
        p++;

        if ((lastbuf[p] >= 0x81) && (lastbuf[p] <= 0xfe)) {
          p++;

          if ((lastbuf[p] >= 0x30) && (lastbuf[p] <= 0x39)) {
            gb18030cnt++;
            i = p;
          }
        }
      }
    }
  }

  const gb18030scale = gb18030cnt * 2 / (index - asciicnt);

  return utf8scale >= gb18030scale;
}

export function transcoding(buf) {
  let message;
  if (checkCodeUtf8(buf)) {
    message = new TextDecoder("utf8").decode(
      new Uint8Array(buf.slice(0, buf.indexOf(10))),
    );
  } else {
    message = new TextDecoder("gb18030").decode(
      new Uint8Array(buf.slice(0, buf.indexOf(10))),
    );
  }
  return message;
}

export function ab2str(buf) {
  var str = new TextDecoder("utf8").decode(new Uint8Array(buf));
  return str;
}

export function str2ab(str) {
  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

export function Uint8Array2hex(u8a) {
  let data = "";
  let macBytes = new Uint8Array(u8a);
  for (let i = 0; i < macBytes.length; i++) {
    if (macBytes[i] <= 16) data += "0";
    data += macBytes[i].toString(16);
  }
  return data;
}

export function name2mac(deviceName) {
  let deviceMac = deviceName.substring(0, 2) + ":" +
    deviceName.substring(2, 4) + ":" + deviceName.substring(4, 6) + ":" +
    deviceName.substring(6, 8) + ":" + deviceName.substring(8, 10) + ":" +
    deviceName.substring(10, 12);
  return deviceMac;
}

// export function isNumber(str) {
//     if (/^[-]?[0-9]+\.?[0-9]+?$/.test(str)) return true;
//     else return false;
// }

export function isNumber(val) {
  var regPos = /^\d+(\.\d+)?$/; //非负浮点数
  var regNeg =
    /^(-(([0-9]+\.[0-9]*[1-9][0-9]*)|([0-9]*[1-9][0-9]*\.[0-9]+)|([0-9]*[1-9][0-9]*)))$/; //负浮点数
  if (regPos.test(val) || regNeg.test(val)) {
    return true;
  } else {
    // console.log("不是数字");
    return false;
  }
}

export function isJson(str) {
  if (isNumber(str)) {
    return false;
  }
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

export function randomString() {
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < 3; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function randomId() {
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < 8; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function minuteToTime(minute): string {
  let h = Math.floor(minute / 60);
  let time = "";
  let m = Math.floor(minute % 60);
  if (h < 10) time = "0" + h + ":";
  else time = h + ":";
  if (m < 10) time += "0" + m;
  else time += m;
  return time;
}

export function timeToMinute(time): number {
  let h = time.split(":")[0];
  let m = time.split(":")[1];
  let minute = Number(h) * 60 + Number(m);
  return minute;
}

export function version2Num(version: string) {
  return parseFloat(version.replace(".", ""));
}

export function isNewerVersion(version1: string, version2: string) {
  let verList1 = version1.split(".");
  let verList2 = version2.split(".");
  for (let index = 0; index < verList2.length; index++) {
    if (parseInt(verList2[index]) > parseInt(verList1[index])) {
      return true;
    }
  }
  return false;
}

export function randomNum(min, max) {
  if (max == 0) {
    return 0;
  }
  let Range = max - min;
  let Rand = Math.random();
  let num = min + Math.round(Rand * Range);
  return num;
}

export function convertToRgba(cssColorString, opacity) {
  var div = document.createElement("div");
  div.style.color = cssColorString;
  document.body.appendChild(div);

  var colors = window.getComputedStyle(div).color.match(/\d+/g).map(
    function (a) {
      return parseInt(a, 10);
    },
  );

  document.body.removeChild(div);

  return "rgba(" + colors[0] + ", " + colors[1] + ", " + colors[2] + ", " +
    opacity + ")";
}

import coordtransform from "coordtransform";

export function toBD09(position) {
  let tp = coordtransform.wgs84togcj02(position[0], position[1]);
  return coordtransform.gcj02tobd09(tp[0], tp[1]);
}

export function toWsg84(position) {
  let tp = coordtransform.bd09togcj02(position[0], position[1]);
  return coordtransform.gcj02towgs84(tp[0], tp[1]);
}


export function color2Rgba(hex, alpha = 0.5) {
  // 移除可能存在的 '#' 前缀
  hex = hex.replace(/^#/, '');
  // 检查颜色长度是否合法
  if (hex.length !== 6) {
    throw new Error('Invalid hex color');
  }
  // 分解十六进制颜色值
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // 返回RGBA格式的颜色值
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function color2Gray(hex: string) {
  // 移除井号
  hex = hex.replace(/^#/, '');

  // 将十六进制颜色转换为RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // 计算灰度值，使用加权公式
  const grayValue = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

  // 返回灰度值
  return grayValue;
}
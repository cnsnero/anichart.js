const _ = require("lodash");
const d3 = require("d3");

const ColorThiefUmd = require("colorthief/dist/color-thief.umd.js");
const colorThief = require("colorthief");
const fs = require("fs");
const Anichart = require("./anichart");
class AniBarChart extends Anichart {
  constructor(options = {}) {
    super();
    this.imagePath = "image/";
    this.language = "zh-CN";
    this.width = 1366;
    this.height = 768;
    this.frameRate = 30;
    this.outerMargin = { left: 10, right: 10, top: 10, bottom: 10 };
    this.freeze = 0;
    if (typeof window == "undefined") {
      this.colorThief = colorThief;
    } else {
      this.colorThief = new ColorThiefUmd();
    }
    this.interval = 1;
    this.barRedius = 4;
    this.itemCount = 22;
    this.labelPandding = 10;
    this.axisTextSize = 20;
    this.tickNumber = 6;
    this.dateLabelSize = 48;
    this.slogenSize = 24;
    this.output = false;
    this.outputName = "out";
    this.idField = "id";
    this.keyFrameDeltaTime = undefined;

    this.colorData = [];

    this.barInfo = (data) => {
      if (data.name != undefined) {
        if (data.type != undefined) {
          return `${data.type} - ${data.name}`;
        } else {
          return `${data.name}`;
        }
      } else {
        return data[this.idField];
      }
    };
    this.xDomain = (series) => [0, series.max];
    this.sort = 1;
    this.valueFormat = (d) => {
      let v = d.value;
      if (v == undefined) v = d;
      if (String(d).indexOf(".") > -1) return `${d3.format(",.2f")(v)}`;
      return `${d3.format(",d")(v)}`;
    };

    this.tickFormat = (val) =>
      new Intl.NumberFormat(this.language, { notation: "compact" }).format(val);

    this.dateFormat = "%Y-%m-%d %H:%M";

    this.listImageSrc = () => [];

    this.imageData = {};

    this.colorScheme = {
      background: "#1D1F21",
      colors: [
        "#27C",
        "#FB0",
        "#FFF",
        "#2C8",
        "#D23",
        "#0CE",
        "#F72",
        "#C8C",
        "#C86",
        "#F8B",
        "#DDA",
        "#BCA",
        "#F27",
      ],
    };

    this.useCtl = true;

    this.colorGener = (function* (cs) {
      let i = 0;
      while (true) {
        yield cs.colors[i++ % cs.colors.length];
      }
    })(this.colorScheme);

    this.numberKey = new Set();

    this.ready = false;
    this.innerMargin = {
      left: this.outerMargin.left,
      right: this.outerMargin.right,
      top: this.outerMargin.top,
      bottom: this.outerMargin.bottom,
    };

    this.drawBarExt = () => {};
    this.drawExt = () => {};
    this.setOptions(options);

    this.barHeight = Math.round(
      ((this.height - this.innerMargin.top - this.innerMargin.bottom) /
        this.itemCount) *
        0.8
    );
  }

  async loadMetaData(path) {
    let metaData = await this.readCsv(path);
    metaData = metaData.reduce((pv, cv) => {
      pv[cv[this.idField]] = { ...cv };
      return pv;
    }, {});
    if (metaData != undefined) {
      this.metaData = metaData;
    }
  }

  async readCsv(path) {
    if (typeof window == "undefined") {
      return d3.csvParse(fs.readFileSync(path).toString());
    } else {
      if ("object" == typeof path) {
        return d3.csv(path.default);
      }
      return await d3.csv(path);
    }
  }

  async loadCsv(path) {
    this.data = [];
    let csvData = await this.readCsv(path);
    let tsList = [...d3.group(csvData, (d) => d.date).keys()]
      .map(
        (d) =>
          new Date().getTimezoneOffset() * 60 * 1000 + new Date(d).getTime()
      )
      .sort((a, b) => a - b);
    let delta = (() => {
      let d = Infinity;
      for (let i = 1; i < tsList.length; i++) {
        const c = tsList[i];
        const p = tsList[i - 1];
        if (c - p < d) d = c - p;
      }
      return d;
    })();
    if (this.keyFrameDeltaTime != undefined)
      delta = this.keyFrameDeltaTime * 1000;

    let firstTs = tsList[0];
    let lastTs = tsList[tsList.length - 1];
    tsList = d3.range(firstTs, lastTs + 1, delta);
    let frameCount = this.frameRate * this.interval * (tsList.length - 1);

    this.getCurrentDate = d3
      .scaleLinear()
      .domain([0, frameCount - 1])
      .range([firstTs, lastTs])
      .clamp(true);

    csvData.forEach((d) => {
      if (this.id == undefined) this.id = d.name;
      d.date =
        new Date().getTimezoneOffset() * 60 * 1000 + new Date(d.date).getTime();
      d.value = +d.value;
    });
    let temp = d3.group(
      csvData,
      (d) => d[this.idField],
      (d) => d.date
    );
    // 对每一个项目
    for (let [id, data] of temp) {
      let dtList = [...data.keys()].sort((a, b) => a - b);
      let valList = [...data.values()]
        .map((d) => d[0])
        .sort((a, b) => a.date - b.date);
      let scales = {};
      _.keys(valList[0]).forEach((key) => {
        if (
          valList[0][key] != id &&
          Number(valList[0][key]) == Number(valList[0][key]) &&
          Number(valList[0][key]) != 0
        ) {
          this.numberKey.add(key);
          scales[key] = d3
            .scaleLinear()
            .domain(dtList)
            .range(valList.map((d) => d[key]));
        }
      });
      let obj = valList[0];
      // 对每一个关键帧
      for (let i = 0; i < tsList.length; i++) {
        if (valList[i] != undefined) obj = valList[i];
        let ct = tsList[i];
        if (ct <= dtList[dtList.length - 1] && ct >= dtList[0]) {
          // 在区间内
          obj = { ...obj };
          _.keys(scales).forEach((key) => {
            obj[key] = scales[key](Number(ct));
          });
          obj.date = ct;
        } else {
          obj = { ...obj };
          _.keys(scales).forEach((key) => {
            obj[key] = NaN;
          });
          obj.date = ct;
        }
        this.data.push(obj);
      }
    }
    this.keyFramesCount = tsList.length;
    this.setKeyFramesInfo();
    this.tsToFi = d3
      .scaleLinear()
      .domain(d3.extent(tsList))
      .range([0, this.totalFrames])
      .clamp(true);
    this.fiToTs = d3
      .scaleLinear()
      .range(d3.extent(tsList))
      .domain([0, this.totalFrames])
      .clamp(true);
  }

  calculateFrameData(data) {
    let frameData = [];
    let idSet = new Set();
    this.maxValue = -Infinity;
    this.minValue = Infinity;
    // 对每组数据
    let idMap = d3.group(data, (d) => d[this.idField]);
    for (let [id, dataList] of idMap) {
      idSet.add(id);
      // 对每个数据区间
      dataList.sort((a, b) => a.date - b.date);
      for (let i = 0; i < dataList.length - 1; i++) {
        const lData = dataList[i];
        const rData = dataList[i + 1];
        let ints = _.reduce(
          [...this.numberKey],
          (dict, key) => {
            dict[key] = {
              lValue: lData[key] == undefined ? NaN : lData[key],
              rValue: rData[key] == undefined ? NaN : rData[key],
            };
            return dict;
          },
          {}
        );
        const lValue = lData.value == undefined ? NaN : lData.value;
        const rValue = rData.value == undefined ? NaN : rData.value;
        const lDate = lData.date;
        const rDate = rData.date;
        let state = "normal";
        if (lValue != lValue && rValue != rValue) {
          state = "null";
        } else if (lValue != lValue && rValue == rValue) {
          state = "in";
        } else if (lValue == lValue && rValue != rValue) {
          state = "out";
        }
        _.keys(ints).forEach((key) => {
          ints[key].int = d3
            .scaleLinear()
            .range([ints[key].lValue, ints[key].rValue])
            .domain([0, 1])
            .clamp(true);
        });
        let aint = d3.interpolateNumber(1, 1);
        let offsetInt = () => 0;
        switch (state) {
          case "null":
            aint = d3.interpolateNumber(0, 0);
            break;
          case "out":
            offsetInt = d3
              .scaleLinear()
              .domain([0, 1])
              .range([0, 1])
              .clamp(true);
            _.keys(ints).forEach((key) => {
              ints[key].int = d3.interpolateNumber(
                ints[key].lValue,
                ints[key].lValue * 0.1
              );
            });
            aint = d3.scaleLinear().domain([0, 0.4]).range([1, 0]).clamp(true);
            break;
          case "in":
            _.keys(ints).forEach((key) => {
              ints[key].int = d3.interpolateNumber(
                ints[key].rValue * 0.3,
                ints[key].rValue
              );
            });
            aint = d3.scaleLinear().domain([0, 0.2]).range([0, 1]).clamp(true);
            offsetInt = d3
              .scaleLinear()
              .domain([0.2, 1])
              .range([1, 0])
              .clamp(true);
            break;
          default:
            break;
        }

        if (
          this.colorData[this.colorKey(lData, this.metaData, this)] == undefined
        ) {
          this.colorData[
            this.colorKey(lData, this.metaData, this)
          ] = this.colorGener.next().value;
        }
        // 对每一帧
        // f: 帧号
        for (let f of d3.range(
          Math.round(this.tsToFi(lDate)),
          Math.round(this.tsToFi(rDate))
        )) {
          if (frameData[f] == undefined) {
            frameData[f] = [];
          }
          let r =
            (f % (this.frameRate * this.interval)) /
            (this.frameRate * this.interval);
          let val = ints.value.int(r);
          let alpha = aint(d3.easePolyOut(r));
          if (alpha == 0 && state != "out") continue;
          let offset = offsetInt(d3.easePolyOut(r));
          let fd = {
            ...lData,
            alpha: alpha,
            state: state,
            pos: offset,
          };
          _.keys(ints).forEach((key) => {
            fd[key] = ints[key].int(r);
          });
          frameData[f].push(fd);
          // 全局最大值
          if (val > this.maxValue) {
            this.maxValue = val;
            this.maxData = fd;
          }
          // 全局最小值
          if (val < this.maxValue) {
            this.minValue = val;
            this.minData = fd;
          }
          // 获取每一帧的最大值和最小值
          if (frameData[f].max == undefined) frameData[f].max = val;
          if (frameData[f].max < val) {
            frameData[f].max = val;
          }
          if (frameData[f].min == undefined) frameData[f].min = val;
          if (frameData[f].min > val) {
            frameData[f].min = val;
          }
        }
      }
    }
    // 计算排序
    frameData.forEach((e) => {
      e.sort((a, b) => {
        if (a.value == undefined || a.state == "out" || a.state == "null")
          return 1;
        if (b.value == undefined || b.state == "out" || b.state == "null")
          return -1;
        return this.sort * (b.value - a.value);
      });
      e.forEach((d, i) => {
        if (d.state == "out" || d.state == "null") {
          d.rank = this.itemCount + 1;
        } else {
          d.rank = i;
        }
      });
    });
    this.frameData = frameData;
    this.idSet = idSet;
  }

  setKeyFramesInfo() {
    this.totalFrames =
      (this.keyFramesCount - 1) * this.frameRate * this.interval;
    this.keyFrames = d3.range(
      0,
      this.totalFrames,
      this.frameRate * this.interval
    );
  }

  async preRender() {
    await this.hintText("Loading Layout", this);
    this.innerMargin.top += this.axisTextSize;

    this.ctx.font = `${this.barHeight}px Sarasa Mono SC`;

    this.innerMargin.left += this.labelPandding;
    let w1 = this.ctx.measureText(this.valueFormat(this.maxData)).width;
    let w2 = this.ctx.measureText(this.valueFormat(this.minData)).width;
    this.innerMargin.right += d3.max([w1, w2]);
    this.innerMargin.right += this.labelPandding;

    let maxTextWidth = d3.max(this.frameData, (fd) =>
      d3.max(
        fd,
        (d) => this.ctx.measureText(this.label(d, this.metaData, this)).width
      )
    );
    this.innerMargin.left += maxTextWidth;
    this.currentFrame = 0;
  }

  async autoGetColorFromImage(key, src) {
    const rgbToHex = (r, g, b) =>
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("");
    if (this.colorData[key] == undefined) {
      if (typeof window == "undefined") {
        let color = await this.colorThief.getColor(src);
        this.colorData[key] = rgbToHex(...color);
      } else {
        if (this.imageData[key].complete) {
          let color = this.colorThief.getColor(this.imageData[key]);
          this.colorData[key] = rgbToHex(...color);
        } else {
          this.imageData[key].addEventListener("load", () => {
            let color = this.colorThief.getColor(this.imageData[key]);
            this.colorData[key] = rgbToHex(...color);
          });
        }
      }
    }
  }

  /**
   * Convolution 卷积
   *
   * @param {Set} idSet
   * @param {List} frameData
   */
  calPosition(idSet, frameData) {
    for (let __ of d3.range(this.freeze + this.frameRate * this.interval)) {
      frameData.push(_.cloneDeep(frameData[this.totalFrames - 1]));
      frameData[frameData.length - 1].max = frameData[this.totalFrames - 1].max;
      frameData[frameData.length - 1].min = frameData[this.totalFrames - 1].min;
    }
    let tempDict = [...idSet].reduce((dict, id) => {
      let rankList = frameData.map((dList) => {
        for (let d of dList) {
          if (d[this.idField] != id) {
            continue;
          }
          return d.rank;
        }
      });
      // 修复突变
      for (let i = 1; i < rankList.length - 1; i++) {
        if (rankList[i - 1] == rankList[i + 1]) rankList[i] = rankList[i - 1];
      }
      // 修复首位
      if (rankList[0] != rankList[1]) rankList[0] = rankList[1];

      let tmpList = [];
      for (let i = 0; i < rankList.length; i++) {
        let frames = (this.frameRate * this.interval) / 7;
        let tmpArray = rankList.slice(
          i - frames > 0 ? i - frames : 0,
          i + frames
        );
        let mean = d3.mean(tmpArray);
        // 优化条目变换的缓动效果
        tmpList[i] =
          d3.easePolyInOut.exponent(1.5)(mean % 1) + Math.floor(mean);
      }
      dict[id] = tmpList;
      return dict;
    }, {});
    for (let i = 0; i < frameData.length; i++) {
      const e = frameData[i];
      for (let j = 0; j < e.length; j++) {
        const d = e[j];
        d.pos += tempDict[d[this.idField]][i];
      }
    }
  }
  getKeyFrame(i) {
    let idx = i / (this.interval * this.frameRate);
    let idx1 = Math.floor(idx); // 下限
    let idx2 = Math.ceil(idx);
    return [idx1, idx2];
  }

  calScale() {
    this.tickArrays = this.keyFrames.map((f) => {
      let scale = d3
        .scaleLinear()
        .domain(this.xDomain(this.frameData[f]))
        .range([
          0,
          this.width - this.innerMargin.left - this.innerMargin.right,
        ]);
      return scale.ticks(this.tickNumber);
    });
    this.frameData.forEach((f, i) => {
      f.yScale = d3
        .scaleLinear()
        .domain([0, this.itemCount])
        .range([this.innerMargin.top, this.height - this.innerMargin.bottom]);
      f.xScale = d3
        .scaleLinear()
        .domain(this.xDomain(f))
        .range([
          0,
          this.width - this.innerMargin.left - this.innerMargin.right,
        ]);
    });
  }
  drawAxis(n, cData) {
    let xScale = cData.xScale;
    let idx = n / (this.interval * this.frameRate);
    let [idx1, idx2] = this.getKeyFrame(n);
    while (idx1 >= this.tickArrays.length) idx1 -= 1;
    if (idx2 >= this.tickArrays.length) idx2 = idx1;
    let a = d3.easePolyInOut.exponent(10)(idx % 1);
    let mainTicks = this.tickArrays[idx1];
    let secondTicks = this.tickArrays[idx2];
    this.ctx.globalAlpha = d3.max(mainTicks) == d3.max(secondTicks) ? 1 : a;
    this.ctx.font = `${this.axisTextSize}px Sarasa Mono SC`;
    this.ctx.fillStyle = "#888";
    this.ctx.strokeStyle = "#888";
    this.ctx.lineWidth = 2;
    this.ctx.textAlign = "center";
    secondTicks.forEach((val) => {
      this.drawTick(xScale, val);
      this.ctx.fillText(
        this.tickFormat(val),
        this.innerMargin.left + xScale(val),
        this.axisTextSize
      );
    });
    this.ctx.globalAlpha = d3.max(mainTicks) == d3.max(secondTicks) ? 1 : 1 - a;
    mainTicks.forEach((val) => {
      this.drawTick(xScale, val);
      this.ctx.fillText(
        this.tickFormat(val),
        this.innerMargin.left + xScale(val),
        this.axisTextSize
      );
    });
    this.ctx.globalAlpha = 1;
    this.ctx.lineWidth = 0;
  }
  drawTick(xScale, val) {
    this.ctx.beginPath();
    this.ctx.moveTo(this.innerMargin.left + xScale(val), this.innerMargin.top);
    this.ctx.lineTo(
      this.innerMargin.left + xScale(val),
      this.height - this.innerMargin.bottom
    );
    this.ctx.stroke();
  }

  drawWatermark() {
    this.ctx.textAlign = "right";
    this.ctx.font = `${this.slogenSize}px Sarasa Mono SC`;

    this.ctx.fillStyle = "#fff4";
    this.ctx.fillText(
      "Powered by Jannchie Studio",
      // window.atob("UE9XRVIgQlkgSkFOTkNISUU="),
      this.width - this.outerMargin.left,
      this.height - this.outerMargin.bottom
    );
  }

  async drawFrame(n) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    let cData = this.frameData[n];
    this.drawBackground();
    this.drawWatermark();
    this.drawAxis(n, cData);
    this.drawDate(n);
    cData.forEach((e) => {
      this.ctx.drawBar(e, cData);
    });
    this.drawExt(this.ctx, cData, this);
  }

  drawDate(n) {
    let timestamp = this.getCurrentDate(n);
    this.ctx.textAlign = "right";
    this.ctx.font = `${this.dateLabelSize}px Sarasa Mono SC`;
    this.ctx.fillStyle = "#fff4";
    this.ctx.fillText(
      d3.timeFormat(this.dateFormat)(new Date(timestamp)),
      this.width - this.outerMargin.left,
      this.height - this.outerMargin.bottom - this.slogenSize - 4
    );
  }

  drawBackground() {
    this.ctx.fillStyle = this.colorScheme.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  downloadBlob(blob, name = "untitled.mp4") {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href = url;
    a.download = `${name}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  calRenderSort() {
    // 调整渲染顺序
    for (let i = 0; i < this.frameData.length; i++) {
      const e = this.frameData[i];
      let t = i == this.frameData.length - 1 ? i : i + 1;
      let afterDict = this.frameData[t].reduce((pv, cv) => {
        pv[cv[this.idField]] = cv.pos;
        return pv;
      }, {});
      e.sort((a, b) => {
        // a上升
        if (
          afterDict[a[this.idField]] - a.pos < 0 ||
          afterDict[b[this.idField]] - b.pos > 0
        ) {
          return 1;
        }
        return -1;
      });
    }
  }

  async fixAlpha() {
    for (let fd of this.frameData) {
      for (let data of fd) {
        if (data.pos > this.itemCount - 1) {
          let newAlpha = d3
            .scaleLinear()
            .domain([0, 1])
            .range([1, 0])
            .clamp(true)(data.pos - this.itemCount + 1);
          if (data.alpha > newAlpha) data.alpha = newAlpha;
        }
      }
    }
  }
}
module.exports = AniBarChart;

window.__ModuleLoader__.load({
  id: "dsh-plugin-usage-stats",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // Platform modules only: no relative imports, no external CSS, no bundler.
    var React = require("react");
    var reactDom = require("react-dom");

    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;
    var useRef = React.useRef;
    var useMemo = React.useMemo;

    var PLUGIN_ID = "dsh-plugin-usage-stats";
    var CSS_TAG_ID = PLUGIN_ID + "/UsageStats.css";
    var NS = "usageStats";
    var PANEL_ID = "usage-stats";
    var DATA_URL = "/dsh-usage-stats/data";

    // Model series palette (blue, green, amber, violet, red, teal).
    var SERIES_COLORS = ["#0B7FFF", "#1E8A3E", "#B8791F", "#8A4FD1", "#C0392B", "#2C8C8C"];

    var CSS = `
.dsh-us-page{--us-bg:#FFFFFF;--us-text:#262626;--us-text-2:#777777;--us-line:#E8E8E8;--us-fill:#F0F0F0;--us-fill-2:#F6F6F6;--us-chip-b:#E0E0E0;--us-track:#EDEDED;--us-shadow:0 4px 16px rgba(0,0,0,.14);
  box-sizing:border-box;height:100%;min-height:0;overflow:auto;padding:22px 24px 40px;background:var(--us-bg);color:var(--us-text);
  font-family:inherit;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
html[data-dsh-us-theme="dark"] .dsh-us-page{--us-bg:#1B1B1E;--us-text:#EDEDEF;--us-text-2:#9A9AA2;--us-line:#2E2E33;--us-fill:#232326;--us-fill-2:#202023;--us-chip-b:#3A3A40;--us-track:#2A2A2E;--us-shadow:0 6px 22px rgba(0,0,0,.5)}
.dsh-us-page *,.dsh-us-page *::before,.dsh-us-page *::after{box-sizing:border-box}
.dsh-us-inner{max-width:1040px;margin:0 auto}
.dsh-us-head{display:flex;align-items:baseline;gap:10px;margin-bottom:22px}
.dsh-us-title{margin:0;font-size:17px;font-weight:600;letter-spacing:.01em}
.dsh-us-head-meta{margin-left:auto;font-size:12px;color:var(--us-text-2)}
.dsh-us-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:26px}
.dsh-us-metric{min-width:0}
.dsh-us-metric-value{font-size:19px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-us-metric-label{margin-top:2px;font-size:12px;color:var(--us-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-us-section{margin-bottom:26px}
.dsh-us-section-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;min-height:28px}
.dsh-us-section-title{margin:0;font-size:14.5px;font-weight:600}
.dsh-us-section-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.dsh-us-tabs{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:9px;background:var(--us-fill);corner-shape:round}
.dsh-us-tab{appearance:none;border:0;background:transparent;color:var(--us-text-2);font-family:inherit;font-size:12.5px;line-height:20px;padding:3px 10px;border-radius:7px;corner-shape:round;cursor:pointer}
.dsh-us-tab:hover{color:var(--us-text)}
.dsh-us-tab[aria-selected="true"]{background:var(--us-bg);color:var(--us-text);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dsh-us-tab:focus-visible{outline:none;box-shadow:0 0 0 2px #0B7FFF}
.dsh-us-chips{display:inline-flex;align-items:center;gap:6px}
.dsh-us-chip{appearance:none;font-family:inherit;font-size:12.5px;line-height:18px;padding:4px 12px;border-radius:999px;corner-shape:round;border:1px solid var(--us-chip-b);background:transparent;color:var(--us-text-2);cursor:pointer}
.dsh-us-chip:hover{color:var(--us-text)}
.dsh-us-chip[aria-checked="true"]{background:var(--us-text);border-color:var(--us-text);color:var(--us-bg)}
.dsh-us-chip:focus-visible{outline:none;box-shadow:0 0 0 2px #0B7FFF}
.dsh-us-card{position:relative;border-radius:12px;background:var(--us-fill-2);padding:14px 14px 8px}
.dsh-us-chart{position:relative;width:100%}
.dsh-us-chart svg{display:block;width:100%;height:auto;overflow:visible}
.dsh-us-months{display:flex;align-items:center;margin-top:6px}
.dsh-us-month{flex:1 1 0;min-width:0;text-align:center;font-size:11px;color:var(--us-text-2);white-space:nowrap}
.dsh-us-legend{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:2px 0 10px}
.dsh-us-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--us-text)}
.dsh-us-dot{width:9px;height:9px;border-radius:50%;corner-shape:round;flex:none}
.dsh-us-xaxis{display:flex;align-items:center;margin-top:6px;font-size:11px;color:var(--us-text-2)}
.dsh-us-xlabel{flex:1 1 0;min-width:0;text-align:center;white-space:nowrap;overflow:hidden}
.dsh-us-tip{position:absolute;z-index:5;pointer-events:none;transform:translate(-50%,-100%);padding:6px 10px;border-radius:8px;background:#FFFFFF;color:#262626;font-size:12px;line-height:1.5;white-space:nowrap;box-shadow:var(--us-shadow);border:1px solid rgba(0,0,0,.06)}
html[data-dsh-us-theme="dark"] .dsh-us-tip{background:#2A2A30;color:#F2F2F4;border-color:rgba(255,255,255,.08)}
.dsh-us-tip-row{display:flex;align-items:center;gap:6px}
.dsh-us-tip-name{color:inherit}
.dsh-us-tip-value{margin-left:auto;padding-left:10px;font-variant-numeric:tabular-nums}
.dsh-us-model-wrap{display:flex;align-items:center;gap:34px;flex-wrap:wrap}
.dsh-us-donut{flex:none;position:relative;width:184px;height:184px}
.dsh-us-donut svg{display:block;width:100%;height:100%}
.dsh-us-donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.dsh-us-donut-total{font-size:20px;font-weight:600;line-height:1.2}
.dsh-us-donut-unit{font-size:12px;color:var(--us-text-2)}
.dsh-us-model-list{flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:14px}
.dsh-us-model-row{position:relative;display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:6px 8px;border-radius:9px;cursor:default;corner-shape:round}
.dsh-us-model-row:hover{background:rgba(0,0,0,.035)}
html[data-dsh-us-theme="dark"] .dsh-us-model-row:hover{background:rgba(255,255,255,.05)}
.dsh-us-model-name{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px}
.dsh-us-model-name span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-us-model-pct{font-size:13px;font-variant-numeric:tabular-nums}
.dsh-us-model-tokens{grid-column:1 / -1;font-size:12px;color:var(--us-text-2);padding-left:17px;font-variant-numeric:tabular-nums}
.dsh-us-empty{display:flex;align-items:center;justify-content:center;min-height:96px;font-size:12.5px;color:var(--us-text-2)}
.dsh-us-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:4px}
.dsh-us-error{font-size:12px;color:#C0392B}
html[data-dsh-us-theme="dark"] .dsh-us-error{color:#FF7B72}
.dsh-us-refresh{appearance:none;display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12.5px;line-height:18px;padding:5px 12px;border-radius:8px;corner-shape:round;border:1px solid var(--us-chip-b);background:transparent;color:var(--us-text);cursor:pointer}
.dsh-us-refresh:hover:not(:disabled){background:var(--us-fill)}
.dsh-us-refresh:disabled{opacity:.55;cursor:default}
.dsh-us-refresh:focus-visible{outline:none;box-shadow:0 0 0 2px #0B7FFF}
.dsh-us-spin{width:11px;height:11px;border-radius:50%;corner-shape:round;border:1.5px solid currentColor;border-top-color:transparent;animation:dsh-us-spin .8s linear infinite}
@keyframes dsh-us-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dsh-us-spin{animation:none}}
@media (max-width:880px){.dsh-us-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px}}
`;

    //#region format helpers
    function stripTrailingZero(text) {
      return text.indexOf(".") >= 0 ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
    }

    /** 1234567 -> "1.2亿"; 66756000 -> "6675.6万"; 999 -> "999". */
    function formatTokens(value) {
      var n = Number(value);
      if (!isFinite(n) || n <= 0) return "0";
      if (n < 10000) return String(Math.round(n));
      if (n < 1e8) return stripTrailingZero((n / 1e4).toFixed(1)) + "万";
      return stripTrailingZero((n / 1e8).toFixed(1)) + "亿";
    }

    /** "10月31日" from a YYYY-MM-DD key. */
    function formatMonthDay(dateKey) {
      var parts = String(dateKey || "").split("-");
      if (parts.length < 3) return String(dateKey || "");
      return Number(parts[1]) + "月" + Number(parts[2]) + "日";
    }

    function formatMonthLabel(dateKey) {
      var parts = String(dateKey || "").split("-");
      if (parts.length < 2) return String(dateKey || "");
      return Number(parts[1]) + "月";
    }

    /** 12240000 -> "3小时24分钟". */
    function formatDuration(ms) {
      var total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
      if (total <= 0) return "0分钟";
      var hours = Math.floor(total / 3600);
      var minutes = Math.floor((total % 3600) / 60);
      if (hours > 0) return hours + "小时" + minutes + "分钟";
      if (minutes > 0) return minutes + "分钟";
      return total + "秒";
    }

    function formatDays(value) {
      var n = Number(value) || 0;
      return n + "天";
    }

    function formatPercent(share) {
      var n = Number(share);
      if (!isFinite(n)) return "0%";
      return Math.round(n * 100) + "%";
    }

    function formatClock(epochMs) {
      try {
        var d = new Date(epochMs);
        var hh = String(d.getHours()).padStart(2, "0");
        var mm = String(d.getMinutes()).padStart(2, "0");
        return hh + ":" + mm;
      } catch (error) {
        return "";
      }
    }

    function seriesColor(index) {
      return SERIES_COLORS[index % SERIES_COLORS.length];
    }
    //#endregion

    //#region data access
    /**
     * Single data entry point. The Host half serves the folded payload on a
     * named route of the same origin (see lib/index.js).
     *
     * TODO(transport): the route is stable; if this plugin ever moves onto a
     * Typert remote, replace only this function with
     * `await ctx.remote.usageStats.snapshot()` / `.refresh()`.
     */
    async function loadStats(options) {
      var force = !!(options && options.force);
      if (typeof fetch !== "function") throw new Error("fetch unavailable");
      var response = await fetch(DATA_URL + (force ? "?force=1" : ""), {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var payload = await response.json();
      if (!payload || typeof payload !== "object") throw new Error("empty payload");
      if (!payload.totals) throw new Error("malformed payload");
      return payload;
    }
    //#endregion

    //#region view helpers
    function useTooltip() {
      var state = useState(null);
      var tooltip = state[0];
      var setTooltip = state[1];
      var show = useCallback(function (event, content) {
        var host = event.currentTarget.closest(".dsh-us-chart") || event.currentTarget;
        var box = host.getBoundingClientRect();
        setTooltip({
          x: event.clientX - box.left,
          y: event.clientY - box.top,
          content: content,
        });
      }, []);
      var hide = useCallback(function () {
        setTooltip(null);
      }, []);
      return { tooltip: tooltip, show: show, hide: hide };
    }

    function Tooltip(props) {
      var tip = props.tooltip;
      if (!tip) return null;
      return h(
        "div",
        {
          className: "dsh-us-tip",
          style: { left: Math.max(40, tip.x) + "px", top: Math.max(6, tip.y - 8) + "px" },
          role: "status",
        },
        tip.content,
      );
    }

    /** Twelve month buckets ending with the current month, each holding its days. */
    function bucketMonths(days) {
      var buckets = [];
      var index = {};
      for (var i = 0; i < days.length; i += 1) {
        var key = String(days[i].date).slice(0, 7);
        if (!index[key]) {
          index[key] = { key: key, first: days[i].date, days: [] };
          buckets.push(index[key]);
        }
        index[key].days.push(days[i]);
      }
      return buckets.slice(-12);
    }

    /** ISO week buckets (Monday start) for the weekly activity mode. */
    function bucketWeeks(buckets) {
      var out = [];
      for (var b = 0; b < buckets.length; b += 1) {
        var month = buckets[b];
        var weeks = [];
        var current = null;
        for (var i = 0; i < month.days.length; i += 1) {
          var day = month.days[i];
          var date = new Date(day.date + "T00:00:00");
          var dow = (date.getDay() + 6) % 7;
          var weekStart = new Date(date.getTime() - dow * 86400000);
          var key = weekStart.toISOString().slice(0, 10);
          if (!current || current.key !== key) {
            current = { key: key, date: day.date, tokens: 0 };
            weeks.push(current);
          }
          current.tokens += Number(day.tokens) || 0;
        }
        out.push({ key: month.key, first: month.first, bars: weeks });
      }
      return out;
    }

    function activityModel(data, mode) {
      var months = bucketMonths(data.days || []);
      if (mode === "week") {
        return bucketWeeks(months).map(function (month) {
          return {
            key: month.key,
            label: formatMonthLabel(month.first),
            bars: month.bars.map(function (week) {
              return { label: formatMonthDay(week.date), tokens: week.tokens };
            }),
          };
        });
      }
      return months.map(function (month) {
        return {
          key: month.key,
          label: formatMonthLabel(month.first),
          bars: month.days.map(function (day) {
            return { label: formatMonthDay(day.date), tokens: Number(day.tokens) || 0 };
          }),
        };
      });
    }

    function ActivityChart(props) {
      var data = props.data;
      var mode = props.mode;
      var tip = useTooltip();
      var months = useMemo(function () {
        return activityModel(data, mode);
      }, [data, mode]);

      var flat = [];
      var max = 0;
      for (var m = 0; m < months.length; m += 1) {
        for (var b = 0; b < months[m].bars.length; b += 1) {
          var tokens = months[m].bars[b].tokens;
          flat.push(tokens);
          if (tokens > max) max = tokens;
        }
      }

      if (!flat.length || max <= 0) {
        return h("div", { className: "dsh-us-empty" }, props.emptyText);
      }

      var W = 1000;
      var H = 86;
      var groupWidth = W / months.length;
      var rects = [];
      var cumulative = [];
      var running = 0;
      var barWidth = 0;

      if (mode === "cumulative") {
        for (var i = 0; i < flat.length; i += 1) {
          running += flat[i];
          cumulative.push(running);
        }
        var peak = cumulative[cumulative.length - 1] || 1;
        var step = W / Math.max(1, cumulative.length - 1);
        var points = cumulative.map(function (value, index2) {
          return [index2 * step, H - (value / peak) * (H - 6)];
        });
        var line = points.map(function (p, index3) {
          return (index3 === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1);
        }).join(" ");
        var area = line + " L" + W + " " + H + " L0 " + H + " Z";
        rects.push(
          h("path", {
            key: "area",
            d: area,
            fill: "#0B7FFF",
            fillOpacity: "0.14",
          }),
        );
        rects.push(
          h("path", {
            key: "line",
            d: line,
            fill: "none",
            stroke: "#0B7FFF",
            strokeWidth: "1.6",
            strokeLinejoin: "round",
            strokeLinecap: "round",
          }),
        );
        rects.push(
          h("rect", {
            key: "hit",
            x: 0,
            y: 0,
            width: W,
            height: H,
            fill: "transparent",
            onMouseMove: function (event) {
              tip.show(event, h("div", { className: "dsh-us-tip-row" }, "累计 " + formatTokens(running) + " tokens"));
            },
            onMouseLeave: tip.hide,
          }),
        );
      } else {
        var maxBars = 0;
        for (var m2 = 0; m2 < months.length; m2 += 1) {
          if (months[m2].bars.length > maxBars) maxBars = months[m2].bars.length;
        }
        barWidth = Math.max(1.4, (groupWidth * 0.72) / Math.max(1, maxBars) - 2);
        for (var mi = 0; mi < months.length; mi += 1) {
          var month = months[mi];
          var baseX = mi * groupWidth + groupWidth * 0.14;
          for (var bi = 0; bi < month.bars.length; bi += 1) {
            var bar = month.bars[bi];
            var height = max > 0 ? Math.max(bar.tokens > 0 ? 2 : 0, (bar.tokens / max) * (H - 8)) : 0;
            var x = baseX + bi * (barWidth + 2);
            rects.push(
              h("rect", {
                key: month.key + "-" + bi,
                x: x.toFixed(2),
                y: (H - height).toFixed(2),
                width: barWidth.toFixed(2),
                height: Math.max(0, height).toFixed(2),
                rx: Math.min(1.5, barWidth / 2),
                fill: bar.tokens > 0 ? "#262626" : "#D9D9D9",
                fillOpacity: bar.tokens > 0 ? "0.82" : "0.35",
                onMouseEnter: function (event) {
                  tip.show(event, h("div", { className: "dsh-us-tip-row" }, bar.label + " · " + formatTokens(bar.tokens) + " tokens"));
                },
                onMouseMove: function (event) {
                  tip.show(event, h("div", { className: "dsh-us-tip-row" }, bar.label + " · " + formatTokens(bar.tokens) + " tokens"));
                },
                onMouseLeave: tip.hide,
              }),
            );
          }
        }
      }

      return h(
        "div",
        { className: "dsh-us-chart" },
        h("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", "aria-label": props.ariaLabel }, rects),
        h(
          "div",
          { className: "dsh-us-months" },
          months.map(function (month) {
            return h("div", { className: "dsh-us-month", key: month.key }, month.label);
          }),
        ),
        h(Tooltip, { tooltip: tip.tooltip }),
      );
    }

    function TrendChart(props) {
      var days = props.days || [];
      var models = props.models || [];
      var total = props.total || 0;
      var tip = useTooltip();
      var modelIndex = useMemo(function () {
        var map = {};
        for (var i = 0; i < models.length; i += 1) map[models[i].id] = i;
        return map;
      }, [models]);

      var W = 1000;
      var H = 210;
      var count = Math.max(1, days.length);
      var slot = W / count;
      var barWidth = Math.max(3, slot * (count <= 7 ? 0.34 : 0.62));

      var max = 0;
      for (var i = 0; i < days.length; i += 1) {
        var values = days[i].byModel || {};
        var sum = 0;
        for (var key in values) if (Object.prototype.hasOwnProperty.call(values, key)) sum += Number(values[key]) || 0;
        days[i].__sum = sum;
        if (sum > max) max = sum;
      }

      if (max <= 0 || total <= 0) {
        return h("div", { className: "dsh-us-empty" }, props.emptyText);
      }

      var grid = [];
      for (var g = 1; g <= 3; g += 1) {
        grid.push(
          h("line", {
            key: "g" + g,
            x1: 0,
            x2: W,
            y1: (H / 4) * g,
            y2: (H / 4) * g,
            stroke: "currentColor",
            strokeOpacity: "0.08",
            strokeDasharray: "3 4",
          }),
        );
      }

      var bars = [];
      var labelStep = count <= 7 ? 1 : Math.ceil(count / 6);

      /** One tooltip handler per day bar (hovering either enter or move works). */
      function trendTipHandler(day, dayValues) {
        return function (event) {
          var rowOrder = Object.keys(dayValues).sort(function (a, b) {
            return (modelIndex[a] || 0) - (modelIndex[b] || 0);
          });
          var lines = [
            h(
              "div",
              { key: "date", className: "dsh-us-tip-row", style: { marginBottom: "2px" } },
              h("strong", null, formatMonthDay(day.date)),
            ),
          ];
          for (var r = 0; r < rowOrder.length; r += 1) {
            var id = rowOrder[r];
            var model = null;
            for (var mi = 0; mi < models.length; mi += 1) if (models[mi].id === id) model = models[mi];
            lines.push(
              h(
                "div",
                { key: id, className: "dsh-us-tip-row" },
                h("span", { className: "dsh-us-dot", style: { background: seriesColor(modelIndex[id] || 0) } }),
                h("span", { className: "dsh-us-tip-name" }, model ? model.label : id),
                h("span", { className: "dsh-us-tip-value" }, formatTokens(dayValues[id]) + " tokens"),
              ),
            );
          }
          tip.show(event, lines);
        };
      }
      for (var d = 0; d < days.length; d += 1) {
        var day = days[d];
        var dayValues = day.byModel || {};
        var order = Object.keys(dayValues).sort(function (a, b) {
          return (modelIndex[a] || 0) - (modelIndex[b] || 0);
        });
        var stackTop = H;
        var x = d * slot + (slot - barWidth) / 2;
        for (var s = 0; s < order.length; s += 1) {
          var modelId = order[s];
          var value = Number(dayValues[modelId]) || 0;
          if (value <= 0) continue;
          var barHeight = (value / max) * (H - 10);
          stackTop -= barHeight;
          bars.push(
            h("rect", {
              key: day.date + "-" + modelId,
              x: x.toFixed(2),
              y: stackTop.toFixed(2),
              width: barWidth.toFixed(2),
              height: Math.max(0.6, barHeight).toFixed(2),
              rx: Math.min(2, barWidth / 2),
              fill: seriesColor(modelIndex[modelId] || 0),
            }),
          );
        }
        bars.push(
          h("rect", {
            key: day.date + "-hit",
            x: (d * slot).toFixed(2),
            y: 0,
            width: slot.toFixed(2),
            height: H,
            fill: "transparent",
            onMouseEnter: trendTipHandler(day, dayValues),
            onMouseMove: trendTipHandler(day, dayValues),
            onMouseLeave: tip.hide,
          }),
        );
      }

      var labels = [];
      for (var l = 0; l < days.length; l += 1) {
        if (l % labelStep !== 0 && l !== days.length - 1) {
          labels.push(h("div", { className: "dsh-us-xlabel", key: "x" + l }, ""));
          continue;
        }
        labels.push(h("div", { className: "dsh-us-xlabel", key: "x" + l }, formatMonthDay(days[l].date)));
      }

      return h(
        "div",
        { className: "dsh-us-chart" },
        h(
          "svg",
          { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", "aria-label": props.ariaLabel },
          h("g", { color: "#888" }, grid),
          bars,
        ),
        h("div", { className: "dsh-us-xaxis" }, labels),
        h(Tooltip, { tooltip: tip.tooltip }),
      );
    }

    function Donut(props) {
      var models = props.models || [];
      var total = props.total || 0;
      var hovered = useState(null);
      var active = hovered[0];
      var setActive = hovered[1];
      var size = 184;
      var radius = 74;
      var stroke = 30;
      var circumference = 2 * Math.PI * radius;
      var offset = 0;

      var segments = models.map(function (model, index) {
        var share = total > 0 ? (Number(model.tokens) || 0) / total : 0;
        var length = share * circumference;
        var segment = h("circle", {
          key: model.id,
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: "none",
          stroke: seriesColor(index),
          strokeWidth: stroke,
          strokeDasharray: Math.max(0, length) + " " + Math.max(0, circumference - length),
          strokeDashoffset: -offset,
          strokeLinecap: "butt",
          opacity: active === null || active === index ? 1 : 0.45,
          onMouseEnter: function () { setActive(index); },
          onMouseLeave: function () { setActive(null); },
          style: { transition: "opacity .16s ease" },
        });
        offset += length;
        return segment;
      });

      return h(
        "div",
        { className: "dsh-us-donut", onMouseLeave: function () { setActive(null); } },
        h(
          "svg",
          { viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": props.ariaLabel },
          h("circle", {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: "#EDEDED",
            strokeWidth: stroke,
            strokeOpacity: "0.5",
          }),
          h("g", { transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")" }, segments),
        ),
        h(
          "div",
          { className: "dsh-us-donut-center" },
          h("div", { className: "dsh-us-donut-total" }, formatTokens(total)),
          h("div", { className: "dsh-us-donut-unit" }, "tokens"),
        ),
      );
    }
    //#endregion

    //#region panel icon
    function PanelIcon() {
      return h(
        "svg",
        {
          width: 16,
          height: 16,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
          "aria-hidden": "true",
        },
        h("path", { d: "M2.5 13.5h11" }),
        h("path", { d: "M4.5 13.5V8.5" }),
        h("path", { d: "M8 13.5V4.5" }),
        h("path", { d: "M11.5 13.5V6.5" }),
      );
    }
    //#endregion

    //#region dictionaries
    var zh = {
      panel: "使用统计",
      title: "使用统计",
      metricTotal: "累计 Token 数",
      metricPeak: "峰值 Token 数",
      metricLongestChat: "最长聊天时长",
      metricStreak: "当前连续天数",
      metricLongestStreak: "最长连续天数",
      activity: "Token 活动",
      modeDay: "每日",
      modeWeek: "每周",
      modeCumulative: "累计",
      range: "时间范围",
      range7: "近7日",
      range30: "近30日",
      trend: "每日 Token 趋势图",
      models: "模型用量",
      refresh: "刷新",
      refreshing: "刷新中…",
      failed: "刷新失败，点击重试",
      empty: "暂无使用数据",
      updated: "更新于",
      activityAria: "Token 活动图",
      trendAria: "每日 Token 趋势图",
      donutAria: "模型用量环形图",
    };
    var en = {
      panel: "Usage",
      title: "Usage statistics",
      metricTotal: "Total tokens",
      metricPeak: "Peak tokens",
      metricLongestChat: "Longest chat",
      metricStreak: "Current streak",
      metricLongestStreak: "Longest streak",
      activity: "Token activity",
      modeDay: "Daily",
      modeWeek: "Weekly",
      modeCumulative: "Cumulative",
      range: "Time range",
      range7: "Last 7 days",
      range30: "Last 30 days",
      trend: "Daily token trend",
      models: "Model usage",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      failed: "Refresh failed, click to retry",
      empty: "No usage data yet",
      updated: "Updated",
      activityAria: "Token activity chart",
      trendAria: "Daily token trend chart",
      donutAria: "Model usage donut chart",
    };
    //#endregion

    function createPage(ctx, t) {
      return function UsageStatsPage() {
        var dataState = useState({ status: "loading", data: null, error: null });
        var state = dataState[0];
        var setState = dataState[1];
        var rangeState = useState("7d");
        var range = rangeState[0];
        var setRange = rangeState[1];
        var modeState = useState("day");
        var mode = modeState[0];
        var setMode = modeState[1];
        var refreshingState = useState(false);
        var refreshing = refreshingState[0];
        var setRefreshing = refreshingState[1];
        var aliveRef = useRef(true);

        var load = useCallback(function (force) {
          if (force) setRefreshing(true);
          return loadStats({ force: force })
            .then(function (payload) {
              if (!aliveRef.current) return;
              setState({ status: "ready", data: payload, error: null });
            })
            .catch(function (error) {
              if (!aliveRef.current) return;
              setState(function (previous) {
                return {
                  status: previous.data ? "ready" : "error",
                  data: previous.data,
                  error: String((error && error.message) || error),
                };
              });
            })
            .then(function () {
              if (aliveRef.current) setRefreshing(false);
            });
        }, []);

        useEffect(function () {
          aliveRef.current = true;
          load(false);
          return function () {
            aliveRef.current = false;
          };
        }, [load]);

        var data = state.data;
        var days = (data && data.days) || [];
        var totals = (data && data.totals) || { tokens: 0 };
        var peak = (data && data.peak) || { tokens: 0, date: null };
        var streak = (data && data.streak) || { current: 0, longest: 0 };
        var rangeKey = range === "30d" ? "30d" : "7d";
        var rangeDays = (data && data.daysInRange && data.daysInRange[rangeKey]) || [];
        var rangeModels = (data && data.modelsInRange && data.modelsInRange[rangeKey]) || (data && data.models) || [];
        var rangeTotal = 0;
        for (var i = 0; i < rangeDays.length; i += 1) rangeTotal += Number(rangeDays[i].tokens) || 0;

        var metrics = [
          { label: t("metricTotal"), value: formatTokens(totals.tokens) },
          { label: t("metricPeak"), value: formatTokens(peak.tokens) },
          { label: t("metricLongestChat"), value: formatDuration(data && data.longestChatMs) },
          { label: t("metricStreak"), value: formatDays(streak.current) },
          { label: t("metricLongestStreak"), value: formatDays(streak.longest) },
        ];

        var header = h(
          "div",
          { className: "dsh-us-head" },
          h("h1", { className: "dsh-us-title" }, t("title")),
          data ? h("div", { className: "dsh-us-head-meta" }, t("updated") + " " + formatClock(data.generatedAt)) : null,
        );

        var metricsRow = h(
          "div",
          { className: "dsh-us-metrics", role: "list" },
          metrics.map(function (metric) {
            return h(
              "div",
              { className: "dsh-us-metric", role: "listitem", key: metric.label },
              h("div", { className: "dsh-us-metric-value", title: metric.value }, metric.value),
              h("div", { className: "dsh-us-metric-label" }, metric.label),
            );
          }),
        );

        var activitySection = h(
          "section",
          { className: "dsh-us-section", "aria-label": t("activity") },
          h(
            "div",
            { className: "dsh-us-section-head" },
            h("h2", { className: "dsh-us-section-title" }, t("activity")),
            h(
              "div",
              { className: "dsh-us-section-right" },
              h(
                "div",
                { className: "dsh-us-tabs", role: "tablist", "aria-label": t("activity") },
                [
                  { id: "day", label: t("modeDay") },
                  { id: "week", label: t("modeWeek") },
                  { id: "cumulative", label: t("modeCumulative") },
                ].map(function (tab) {
                  return h(
                    "button",
                    {
                      key: tab.id,
                      type: "button",
                      className: "dsh-us-tab",
                      role: "tab",
                      "aria-selected": mode === tab.id ? "true" : "false",
                      onClick: function () { setMode(tab.id); },
                    },
                    tab.label,
                  );
                }),
              ),
            ),
          ),
          data
            ? h(ActivityChart, { data: data, mode: mode, emptyText: t("empty"), ariaLabel: t("activityAria") })
            : h("div", { className: "dsh-us-empty" }, state.status === "error" ? t("failed") : "…"),
        );

        var rangeRow = h(
          "div",
          { className: "dsh-us-section-head" },
          h("h2", { className: "dsh-us-section-title" }, t("range")),
          h(
            "div",
            { className: "dsh-us-section-right" },
            h(
              "div",
              { className: "dsh-us-chips", role: "radiogroup", "aria-label": t("range") },
              [
                { id: "7d", label: t("range7") },
                { id: "30d", label: t("range30") },
              ].map(function (chip) {
                return h(
                  "button",
                  {
                    key: chip.id,
                    type: "button",
                    className: "dsh-us-chip",
                    role: "radio",
                    "aria-checked": range === chip.id ? "true" : "false",
                    onClick: function () { setRange(chip.id); },
                  },
                  chip.label,
                );
              }),
            ),
          ),
        );

        var legend = h(
          "div",
          { className: "dsh-us-legend" },
          rangeModels.map(function (model, index) {
            return h(
              "span",
              { className: "dsh-us-legend-item", key: model.id },
              h("span", { className: "dsh-us-dot", style: { background: seriesColor(index) } }),
              model.label || model.id,
            );
          }),
        );

        var trendSection = h(
          "section",
          { className: "dsh-us-section", "aria-label": t("trend") },
          h(
            "div",
            { className: "dsh-us-section-head" },
            h("h2", { className: "dsh-us-section-title" }, t("trend")),
          ),
          legend,
          data
            ? h(TrendChart, {
                days: rangeDays,
                models: rangeModels,
                total: rangeTotal,
                emptyText: t("empty"),
                ariaLabel: t("trendAria"),
              })
            : h("div", { className: "dsh-us-empty" }, state.status === "error" ? t("failed") : "…"),
        );

        var modelRows = rangeModels.map(function (model, index) {
          return h(
            "div",
            { className: "dsh-us-model-row", key: model.id },
            h(
              "div",
              { className: "dsh-us-model-name" },
              h("span", { className: "dsh-us-dot", style: { background: seriesColor(index) } }),
              h("span", { title: model.id }, model.label || model.id),
            ),
            h("div", { className: "dsh-us-model-pct" }, formatPercent(model.share !== undefined ? model.share : rangeTotal > 0 ? model.tokens / rangeTotal : 0)),
            h("div", { className: "dsh-us-model-tokens" }, formatTokens(model.tokens) + " tokens"),
          );
        });

        var modelsSection = h(
          "section",
          { className: "dsh-us-section", "aria-label": t("models") },
          h(
            "div",
            { className: "dsh-us-section-head" },
            h("h2", { className: "dsh-us-section-title" }, t("models")),
          ),
          data && rangeTotal > 0
            ? h(
                "div",
                { className: "dsh-us-card" },
                h(
                  "div",
                  { className: "dsh-us-model-wrap" },
                  h(Donut, { models: rangeModels, total: rangeTotal, ariaLabel: t("donutAria") }),
                  h("div", { className: "dsh-us-model-list" }, modelRows),
                ),
              )
            : h("div", { className: "dsh-us-empty" }, t("empty")),
        );

        var footer = h(
          "div",
          { className: "dsh-us-foot" },
          state.error && state.status === "ready" ? h("span", { className: "dsh-us-error" }, t("failed")) : null,
          h(
            "button",
            {
              type: "button",
              className: "dsh-us-refresh",
              onClick: function () { load(true); },
              disabled: refreshing || state.status === "loading",
              "aria-busy": refreshing ? "true" : "false",
            },
            refreshing ? h("span", { className: "dsh-us-spin", "aria-hidden": "true" }) : null,
            refreshing ? t("refreshing") : t("refresh"),
          ),
        );

        return h(
          "div",
          { className: "dsh-us-page" },
          h(
            "div",
            { className: "dsh-us-inner" },
            header,
            metricsRow,
            activitySection,
            rangeRow,
            trendSection,
            modelsSection,
            footer,
          ),
        );
      };
    }

    /** Inject the stylesheet once, guarded by a data attribute. */
    function injectStyles() {
      if (typeof document === "undefined") return;
      if (document.head.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]')) return;
      var style = document.createElement("style");
      style.setAttribute("data-plugin-css", CSS_TAG_ID);
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    /** Mirror the host color scheme onto <html> so CSS can branch. */
    function syncTheme(ctx) {
      if (typeof document === "undefined") return function () {};
      var root = document.documentElement;
      var disposers = [];

      function apply(scheme) {
        root.setAttribute("data-dsh-us-theme", scheme === "light" ? "light" : "dark");
      }
      function fromDocument() {
        if (document.body && document.body.hasAttribute("data-ds-dark-theme")) return "dark";
        var source = document.documentElement.getAttribute("data-ds-theme-source");
        if (source === "light") return "light";
        if (source === "dark") return "dark";
        try {
          if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
        } catch (error) {
          return "dark";
        }
        return "light";
      }

      apply(fromDocument());

      // 1) The host reflects the resolved scheme onto <body>; follow that attribute.
      if (typeof MutationObserver === "function" && document.body) {
        var observer = new MutationObserver(function () {
          apply(fromDocument());
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        disposers.push(function () { observer.disconnect(); });
      }

      // 2) The host also records the chosen source on <html>.
      if (typeof MutationObserver === "function") {
        var htmlObserver = new MutationObserver(function () {
          apply(fromDocument());
        });
        htmlObserver.observe(root, { attributes: true, attributeFilter: ["data-ds-theme-source", "style"] });
        disposers.push(function () { htmlObserver.disconnect(); });
      }

      // 3) System preference flips.
      try {
        if (typeof matchMedia === "function") {
          var media = matchMedia("(prefers-color-scheme: dark)");
          var onMedia = function () { apply(fromDocument()); };
          if (typeof media.addEventListener === "function") {
            media.addEventListener("change", onMedia);
            disposers.push(function () { media.removeEventListener("change", onMedia); });
          }
        }
      } catch (error) {
        /* matchMedia is optional */
      }

      // 4) The optional theme service, when the composition provides it.
      ctx.inject(["theme"], function (scope) {
        var sync = function () {
          try {
            var snapshot = scope.theme.getTheme();
            var scheme = snapshot && snapshot.active && snapshot.active.colorScheme;
            apply(scheme === "dark" ? "dark" : "light");
          } catch (error) {
            apply(fromDocument());
          }
        };
        sync();
        scope.on("theme/change", sync);
      });

      return function () {
        for (var i = 0; i < disposers.length; i += 1) {
          try { disposers[i](); } catch (error) { /* ignore */ }
        }
        root.removeAttribute("data-dsh-us-theme");
      };
    }

    var inject = ["slots", "locale", "layout"];

    function apply(ctx) {
      injectStyles();

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-plugin-usage-stats: dictionaries");

      ctx.effect(function () {
        return syncTheme(ctx);
      }, "dsh-plugin-usage-stats: theme");

      var t = ctx.locale.bind(NS);
      var UsageStatsPage = createPage(ctx, t);

      ctx.inject(["slots", "layout"], function (scope) {
        scope.slots.inject("main", function* () {
          yield scope.slots.register({ name: "main", key: PANEL_ID, locale: NS }, UsageStatsPage);
        });

        scope.slots.inject("sidebar.panellist", function () {
          return scope.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL_ID,
              order: 10,
              label: function () { return t("panel"); },
              locale: NS,
            },
            PanelIcon,
          );
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

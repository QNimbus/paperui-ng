'use strict';

import Chart from './../../Chart.js';
// import moment from 'moment';
import helpers from '../core/core.helpers';

var scaleService = Chart.scaleService;
var TimeScale = scaleService.constructors['time'];

var valueOrDefault = helpers.valueOrDefault;

// Ported from Chart.js 2.7.3 1cd0469.
function momentify(value, options) {
  var parser = options.parser;
  var format = options.parser || options.format;

  if (typeof parser === 'function') {
    return parser(value);
  }

  if (typeof value === 'string' && typeof format === 'string') {
    return value;
  }

  if (value.isValid()) {
    return value;
  }

  // Labels are in an incompatible moment format and no `parser` has been provided.
  // The user might still use the deprecated `format` option to convert his inputs.
  if (typeof format === 'function') {
    return format(value);
  }

  return value;
}

// Ported from Chart.js 2.7.3 1cd0469.
function parse(input, scale) {
  if (helpers.isNullOrUndef(input)) {
    return null;
  }

  var options = scale.options.time;
  var value = momentify(scale.getRightValue(input), options);
  if (!value.isValid()) {
    return null;
  }

  if (options.round) {
    value.startOf(options.round);
  }

  return value.valueOf();
}

function resolveOption(scale, key) {
  var realtimeOpts = scale.options.realtime;
  var streamingOpts = scale.chart.options.plugins.streaming;
  return valueOrDefault(realtimeOpts[key], streamingOpts[key]);
}

var datasetPropertyKeys = [
  'pointBackgroundColor',
  'pointBorderColor',
  'pointBorderWidth',
  'pointRadius',
  'pointRotation',
  'pointStyle',
  'pointHitRadius',
  'pointHoverBackgroundColor',
  'pointHoverBorderColor',
  'pointHoverBorderWidth',
  'pointHoverRadius',
  'backgroundColor',
  'borderColor',
  'borderSkipped',
  'borderWidth',
  'hoverBackgroundColor',
  'hoverBorderColor',
  'hoverBorderWidth',
  'hoverRadius',
  'hitRadius',
  'radius'
];

function refreshData(scale) {
  var chart = scale.chart;
  var id = scale.id;
  var duration = resolveOption(scale, 'duration');
  var delay = resolveOption(scale, 'delay');
  var ttl = resolveOption(scale, 'ttl');
  var pause = resolveOption(scale, 'pause');
  var onRefresh = resolveOption(scale, 'onRefresh');
  var max = scale.max;
  var min = Date.now() - (isNaN(ttl) ? duration + delay : ttl);
  var meta, data, length, i, start, count, removalRange;

  if (onRefresh) {
    onRefresh(chart);
  }

  // Remove old data
  chart.data.datasets.forEach(function (dataset, datasetIndex) {
    meta = chart.getDatasetMeta(datasetIndex);
    if (id === meta.xAxisID || id === meta.yAxisID) {
      data = dataset.data;
      length = data.length;

      if (pause) {
        // If the scale is paused, preserve the visible data points
        for (i = 0; i < length; ++i) {
          if (!(scale._getTimeForIndex(i, datasetIndex) < max)) {
            break;
          }
        }
        start = i + 2;
      } else {
        start = 0;
      }

      for (i = start; i < length; ++i) {
        if (!(scale._getTimeForIndex(i, datasetIndex) <= min)) {
          break;
        }
      }
      count = i - start;
      if (isNaN(ttl)) {
        // Keep the last two data points outside the range not to affect the existing bezier curve
        count = Math.max(count - 2, 0);
      }

      data.splice(start, count);
      datasetPropertyKeys.forEach(function (key) {
        if (dataset.hasOwnProperty(key) && helpers.isArray(dataset[key])) {
          dataset[key].splice(start, count);
        }
      });
      if (typeof data[0] !== 'object') {
        removalRange = {
          start: start,
          count: count
        };
      }
    }
  });
  if (removalRange) {
    chart.data.labels.splice(removalRange.start, removalRange.count);
  }

  chart.update({
    preservation: true
  });
}

function stopDataRefreshTimer(scale) {
  var realtime = scale.realtime;
  var refreshTimerID = realtime.refreshTimerID;

  if (refreshTimerID) {
    clearInterval(refreshTimerID);
    delete realtime.refreshTimerID;
    delete realtime.refreshInterval;
  }
}

function startDataRefreshTimer(scale) {
  var realtime = scale.realtime;
  var interval = resolveOption(scale, 'refresh');

  realtime.refreshTimerID = setInterval(function () {
    var newInterval = resolveOption(scale, 'refresh');

    refreshData(scale);
    if (realtime.refreshInterval !== newInterval && !isNaN(newInterval)) {
      stopDataRefreshTimer(scale);
      startDataRefreshTimer(scale);
    }
  }, interval);
  realtime.refreshInterval = interval;
}

var transitionKeys = {
  x: {
    data: ['x', 'controlPointPreviousX', 'controlPointNextX'],
    dataset: ['x'],
    tooltip: ['x', 'caretX']
  },
  y: {
    data: ['y', 'controlPointPreviousY', 'controlPointNextY'],
    dataset: ['y'],
    tooltip: ['y', 'caretY']
  }
};

function transition(element, keys, translate) {
  var start = element._start || {};
  var view = element._view || {};
  var model = element._model || {};
  var i, ilen;

  for (i = 0, ilen = keys.length; i < ilen; ++i) {
    var key = keys[i];
    if (start.hasOwnProperty(key)) {
      start[key] -= translate;
    }
    if (view.hasOwnProperty(key) && view !== start) {
      view[key] -= translate;
    }
    if (model.hasOwnProperty(key) && model !== view) {
      model[key] -= translate;
    }
  }
}

function scroll(scale) {
  var chart = scale.chart;
  var realtime = scale.realtime;
  var duration = resolveOption(scale, 'duration');
  var delay = resolveOption(scale, 'delay');
  var id = scale.id;
  var tooltip = chart.tooltip;
  var activeTooltip = tooltip._active;
  var now = Date.now();
  var length, keys, offset, meta, elements, i, ilen;

  if (scale.isHorizontal()) {
    length = scale.width;
    keys = transitionKeys.x;
  } else {
    length = scale.height;
    keys = transitionKeys.y;
  }
  offset = length * (now - realtime.head) / duration;

  if (scale.options.ticks.reverse) {
    offset = -offset;
  }

  // Shift all the elements leftward or upward
  helpers.each(chart.data.datasets, function (dataset, datasetIndex) {
    meta = chart.getDatasetMeta(datasetIndex);
    if (id === meta.xAxisID || id === meta.yAxisID) {
      elements = meta.data || [];

      for (i = 0, ilen = elements.length; i < ilen; ++i) {
        transition(elements[i], keys.data, offset);
      }

      if (meta.dataset) {
        transition(meta.dataset, keys.dataset, offset);
      }
    }
  });

  // Shift tooltip leftward or upward
  if (activeTooltip && activeTooltip[0]) {
    meta = chart.getDatasetMeta(activeTooltip[0]._datasetIndex);
    if (id === meta.xAxisID || id === meta.yAxisID) {
      transition(tooltip, keys.tooltip, offset);
    }
  }

  scale.max = scale._table[1].time = now - delay;
  scale.min = scale._table[0].time = scale.max - duration;

  realtime.head = now;
}

var defaultConfig = {
  position: 'bottom',
  distribution: 'linear',
  bounds: 'data',

  time: {
    parser: false, // false == a pattern string from http://momentjs.com/docs/#/parsing/string-format/ or a custom callback that converts its argument to a moment
    format: false, // DEPRECATED false == date objects, moment object, callback or a pattern string from http://momentjs.com/docs/#/parsing/string-format/
    unit: false, // false == automatic or override with week, month, year, etc.
    round: false, // none, or override with week, month, year, etc.
    displayFormat: false, // DEPRECATED
    isoWeekday: false, // override week start day - see http://momentjs.com/docs/#/get-set/iso-weekday/
    minUnit: 'millisecond',

    // defaults to unit's corresponding unitFormat below or override using pattern string from http://momentjs.com/docs/#/displaying/format/
    displayFormats: {
      millisecond: 'h:mm:ss.SSS a', // 11:20:01.123 AM,
      second: 'h:mm:ss a', // 11:20:01 AM
      minute: 'h:mm a', // 11:20 AM
      hour: 'hA', // 5PM
      day: 'MMM D', // Sep 4
      week: 'll', // Week 46, or maybe "[W]WW - YYYY" ?
      month: 'MMM YYYY', // Sept 2015
      quarter: '[Q]Q - YYYY', // Q3
      year: 'YYYY' // 2015
    },
  },
  realtime: {},
  ticks: {
    autoSkip: false,
    source: 'auto',
    major: {
      enabled: true
    }
  }
};

var RealTimeScale = TimeScale.extend({
  initialize: function () {
    var me = this;

    TimeScale.prototype.initialize.apply(me, arguments);

    me.realtime = me.realtime || {};

    startDataRefreshTimer(me);
  },

  update: function () {
    var me = this;
    var realtime = me.realtime;

    if (resolveOption(me, 'pause')) {
      helpers.stopFrameRefreshTimer(realtime);
    } else {
      helpers.startFrameRefreshTimer(realtime, function () {
        scroll(me);
      });
      realtime.head = Date.now();
    }

    return TimeScale.prototype.update.apply(me, arguments);
  },

  buildTicks: function () {
    var me = this;
    var options = me.options;

    var timeOpts = options.time;
    var majorTicksOpts = options.ticks.major;
    var duration = resolveOption(me, 'duration');
    var delay = resolveOption(me, 'delay');
    var refresh = resolveOption(me, 'refresh');
    var bounds = options.bounds;
    var distribution = options.distribution;
    var offset = options.offset;
    var minTime = timeOpts.min;
    var maxTime = timeOpts.max;
    var majorEnabled = majorTicksOpts.enabled;
    var max = me.realtime.head - delay;
    var min = max - duration;
    var maxArray = [max + refresh, max];
    var ticks;

    options.bounds = undefined;
    options.distribution = 'linear';
    options.offset = false;
    timeOpts.min = -1e15;
    timeOpts.max = 1e15;
    majorTicksOpts.enabled = true;

    Object.defineProperty(me, 'min', {
      get: function () {
        return min;
      },
      set: helpers.noop
    });
    Object.defineProperty(me, 'max', {
      get: function () {
        return maxArray.shift();
      },
      set: helpers.noop
    });

    ticks = TimeScale.prototype.buildTicks.apply(me, arguments);

    delete me.min;
    delete me.max;

    me.min = min;
    me.max = max;
    options.bounds = bounds;
    options.distribution = distribution;
    options.offset = offset;
    timeOpts.min = minTime;
    timeOpts.max = maxTime;
    majorTicksOpts.enabled = majorEnabled;
    me._table = [{ time: min, pos: 0 }, { time: max, pos: 1 }];

    return ticks;
  },

  fit: function () {
    var me = this;
    var options = me.options;

    TimeScale.prototype.fit.apply(me, arguments);

    if (options.ticks.display && options.display && me.isHorizontal()) {
      me.paddingLeft = 3;
      me.paddingRight = 3;
      me.handleMargins();
    }
  },

  draw: function (chartArea) {
    var me = this;
    var chart = me.chart;

    var context = me.ctx;
    var clipArea = me.isHorizontal() ?
      {
        left: chartArea.left,
        top: 0,
        right: chartArea.right,
        bottom: chart.height
      } : {
        left: 0,
        top: chartArea.top,
        right: chart.width,
        bottom: chartArea.bottom
      };

    // Clip and draw the scale
    helpers.canvas.clipArea(context, clipArea);
    TimeScale.prototype.draw.apply(me, arguments);
    helpers.canvas.unclipArea(context);
  },

  destroy: function () {
    var me = this;

    helpers.stopFrameRefreshTimer(me.realtime);
    stopDataRefreshTimer(me);
  },

	/*
	 * @private
	 */
  _getTimeForIndex: function (index, datasetIndex) {
    var me = this;
    var timestamps = me._timestamps;
    var time = timestamps.datasets[datasetIndex][index];
    var value;

    if (helpers.isNullOrUndef(time)) {
      value = me.chart.data.datasets[datasetIndex].data[index];
      if (helpers.isObject(value)) {
        time = parse(me.getRightValue(value), me);
      } else {
        time = parse(timestamps.labels[index], me);
      }
    }

    return time;
  }
});

scaleService.registerScaleType('realtime', RealTimeScale, defaultConfig);

export default RealTimeScale;
export {
  defaultConfig as realtimeDefaults
};

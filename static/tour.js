(function() {
'use strict';

var STORAGE_KEY = 'forge-tour-state';
var _steps = [];
var _currentStepIdx = -1;
var _overlayEl = null;
var _bubbleEl = null;
var _onComplete = null;
var _mode = null;
var _userClickHandler = null;

function startTour(steps, mode, onComplete) {
  _steps = steps;
  _mode = mode || 'full';
  _currentStepIdx = -1;
  _onComplete = onComplete || null;
  _ensureOverlay();
  nextTourStep();
}

function resumeTour(steps, mode, stepIndex) {
  _steps = steps;
  _mode = mode;
  _currentStepIdx = stepIndex - 1;
  _onComplete = null;
  _ensureOverlay();
  nextTourStep();
}

function endTour() {
  _removeOverlay();
  _clearUserClick();
  _steps = [];
  _currentStepIdx = -1;
  _mode = null;
  sessionStorage.removeItem(STORAGE_KEY);
  if (_onComplete) _onComplete();
}

function nextTourStep() {
  _clearUserClick();
  _currentStepIdx++;
  if (_currentStepIdx >= _steps.length) { endTour(); return; }
  _persistState();
  var step = _steps[_currentStepIdx];
  _executeAction(step, function() {
    _highlightStep(step);
  });
}

function prevTourStep() {
  _clearUserClick();
  if (_currentStepIdx > 0) {
    _currentStepIdx--;
    _persistState();
    var step = _steps[_currentStepIdx];
    _highlightStep(step);
  }
}

function _persistState() {
  if (_mode === 'full') {
    var page = window._tourPage || 'home';
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: _mode,
      currentPage: page,
      stepIndex: _currentStepIdx,
      startedAt: new Date().toISOString()
    }));
  }
}

function _executeAction(step, callback) {
  if (!step.action) { callback(); return; }
  var action = step.action;
  if (action.type === 'click') {
    var el = document.querySelector(action.target);
    if (el) el.click();
    setTimeout(callback, action.delay || 300);
  } else if (action.type === 'userClick') {
    callback();
  } else if (action.type === 'navigate') {
    _persistState();
    window.location.href = action.url;
  } else if (action.type === 'wait') {
    setTimeout(callback, action.ms || 500);
  } else {
    callback();
  }
}

function _startUserClick(step) {
  _clearUserClick();
  var actionTarget = step.action && step.action.target ? step.action.target : step.target;
  var el = document.querySelector(actionTarget);
  if (!el) return;
  var handler = function() {
    el.removeEventListener('click', handler);
    _userClickHandler = null;
    setTimeout(nextTourStep, step.action.delay || 400);
  };
  el.addEventListener('click', handler);
  _userClickHandler = { target: el, handler: handler };
}

function _clearUserClick() {
  if (_userClickHandler) {
    _userClickHandler.target.removeEventListener('click', _userClickHandler.handler);
    _userClickHandler = null;
  }
}

function _ensureOverlay() {
  if (_overlayEl) return;
  _overlayEl = document.createElement('div');
  _overlayEl.className = 'tour-overlay';
  document.body.appendChild(_overlayEl);
  _bubbleEl = document.createElement('div');
  _bubbleEl.className = 'tour-bubble';
  document.body.appendChild(_bubbleEl);
}

function _removeOverlay() {
  if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }
  if (_bubbleEl) { _bubbleEl.remove(); _bubbleEl = null; }
  document.querySelectorAll('.tour-highlighted').forEach(function(el) { el.classList.remove('tour-highlighted'); });
}

function _highlightStep(step) {
  document.querySelectorAll('.tour-highlighted').forEach(function(el) { el.classList.remove('tour-highlighted'); });
  var target = document.querySelector(step.target);
  if (!target) { nextTourStep(); return; }
  var parentSection = target.closest('.sidebar-section');
  if (parentSection) parentSection.classList.add('open');
  target.classList.add('tour-highlighted');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(function() {
    var rect = target.getBoundingClientRect();
    var pad = 8;
    if (_overlayEl) {
      var l = rect.left - pad, t = rect.top - pad;
      var r = rect.right + pad, b = rect.bottom + pad;
      _overlayEl.style.clipPath =
        'polygon(0% 0%, 0% 100%, ' + l + 'px 100%, ' + l + 'px ' + t + 'px, ' +
        r + 'px ' + t + 'px, ' + r + 'px ' + b + 'px, ' +
        l + 'px ' + b + 'px, ' + l + 'px 100%, 100% 100%, 100% 0%)';
    }
    if (_bubbleEl) {
      var stepNum = _currentStepIdx + 1;
      var totalSteps = _steps.length;
      var html = '<div class="tour-bubble-header">' +
        '<span class="tour-bubble-title">' + (step.title || '') + '</span>' +
        '<span class="tour-bubble-counter">' + stepNum + ' / ' + totalSteps + '</span>' +
        '</div>';
      if (step.body) html += '<div class="tour-bubble-body">' + step.body + '</div>';
      if (step.tip) html += '<div class="tour-bubble-tip">\uD83D\uDCA1 ' + step.tip + '</div>';
      var isUserClick = step.action && step.action.type === 'userClick';
      html += '<div class="tour-bubble-nav">' +
        '<button type="button" class="tour-btn-skip" onclick="endTour()">Skip tour</button>' +
        '<div class="tour-bubble-buttons">' +
          (_currentStepIdx > 0 ? '<button type="button" class="tour-btn-back" onclick="prevTourStep()">\u2190 Back</button>' : '') +
          '<button type="button" class="tour-btn-next" onclick="nextTourStep()"' +
            (isUserClick ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : '') +
          '>Next \u2192</button>' +
        '</div></div>';
      if (isUserClick) {
        setTimeout(function() { _startUserClick(step); }, 0);
      }

      _bubbleEl.innerHTML = html;

      var pos = step.position || 'bottom';
      _bubbleEl.style.position = 'fixed';
      _bubbleEl.style.display = 'block';
      _bubbleEl.style.top = '';
      _bubbleEl.style.left = '';
      _bubbleEl.style.right = '';
      _bubbleEl.style.bottom = '';

      if (pos === 'bottom') {
        _bubbleEl.style.top = (rect.bottom + pad + 12) + 'px';
        _bubbleEl.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 360)) + 'px';
      } else if (pos === 'top') {
        _bubbleEl.style.top = Math.max(16, rect.top - pad - 12 - _bubbleEl.offsetHeight) + 'px';
        _bubbleEl.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 360)) + 'px';
      } else if (pos === 'right') {
        _bubbleEl.style.top = rect.top + 'px';
        _bubbleEl.style.left = (rect.right + pad + 12) + 'px';
      } else if (pos === 'left') {
        _bubbleEl.style.top = rect.top + 'px';
        _bubbleEl.style.right = (window.innerWidth - rect.left + pad + 12) + 'px';
      }

      // Smart viewport clamping — keep bubble adjacent to target
      var bubbleH = _bubbleEl.offsetHeight;
      var bubbleW = _bubbleEl.offsetWidth;
      var vh = window.innerHeight;
      var vw = window.innerWidth;
      var desiredTop = parseFloat(_bubbleEl.style.top);

      if (desiredTop + bubbleH > vh - 16) {
        desiredTop = rect.top - pad - 12 - bubbleH;
      }
      _bubbleEl.style.top = Math.max(16, Math.min(desiredTop, vh - bubbleH - 16)) + 'px';

      var desiredLeft = parseFloat(_bubbleEl.style.left);
      _bubbleEl.style.left = Math.max(16, Math.min(desiredLeft, vw - bubbleW - 16)) + 'px';
    }
  }, 350);
}

function checkTourResume() {
  var raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    var state = JSON.parse(raw);
    var startedAt = new Date(state.startedAt);
    if (Date.now() - startedAt.getTime() > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    var page = window._tourPage || 'home';
    if (typeof TOUR_STEPS === 'undefined') return;

    var steps = TOUR_STEPS[page] || [];
    if (state.currentPage !== page && page === 'scenarios') {
      var params = new URLSearchParams(window.location.search);
      if (params.get('tour') === 'compare' && TOUR_STEPS.scenarios_compare) {
        steps = TOUR_STEPS.scenarios_compare;
      } else if (TOUR_STEPS.scenarios_manage) {
        steps = TOUR_STEPS.scenarios_manage;
      }
      if (params.has('tour')) {
        params.delete('tour');
        var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        history.replaceState(null, '', clean);
      }
    }
    if (!steps.length) return;

    if (state.currentPage !== page) {
      resumeTour(steps, 'full', 0);
    } else if (state.stepIndex < steps.length) {
      resumeTour(steps, 'full', state.stepIndex);
    }
  } catch (e) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

window.startTour = startTour;
window.resumeTour = resumeTour;
window.endTour = endTour;
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.checkTourResume = checkTourResume;

document.addEventListener('DOMContentLoaded', function() {
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', function() {
      setTimeout(checkTourResume, 100);
    }, { once: true });
  } else {
    setTimeout(checkTourResume, 1000);
  }
});

})();

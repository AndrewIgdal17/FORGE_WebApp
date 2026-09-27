(function() {
'use strict';

var STORAGE_KEY = 'forge-tutorial-state';
var _steps = [];
var _currentStepIdx = -1;
var _overlayEl = null;
var _bubbleEl = null;
var _scenarioId = null;
var _validationInterval = null;
var _gotoHandler = null;

function startTutorial(steps, scenarioId) {
  _steps = steps;
  _currentStepIdx = -1;
  _scenarioId = scenarioId;
  _ensureOverlay();
  _nextStep();
}

function _resumeTutorial(steps, stepIndex, scenarioId) {
  _steps = steps;
  _currentStepIdx = stepIndex - 1;
  _scenarioId = scenarioId;
  _ensureOverlay();
  _nextStep();
}

function endTutorial() {
  _removeOverlay();
  _clearValidation();
  _clearGotoListener();
  _steps = [];
  _currentStepIdx = -1;
  sessionStorage.removeItem(STORAGE_KEY);
}

function _nextStep() {
  _clearValidation();
  _clearGotoListener();
  _currentStepIdx++;
  if (_currentStepIdx >= _steps.length) { endTutorial(); return; }
  _persistState();
  var step = _steps[_currentStepIdx];

  if (step.type === 'navigate') {
    var el = document.querySelector(step.target);
    if (el) el.click();
    setTimeout(_nextStep, step.delay || 400);
    return;
  }

  if (step.action) {
    var actionEl = document.querySelector(step.action.target);
    if (actionEl) actionEl.click();
  }

  setTimeout(function() { _renderStep(step); }, step.action ? 350 : 50);
}

function _prevStep() {
  if (_currentStepIdx > 0) {
    _clearValidation();
    _clearGotoListener();
    _currentStepIdx--;
    _persistState();
    var step = _steps[_currentStepIdx];
    if (step.type === 'navigate') { _prevStep(); return; }
    _renderStep(step);
  }
}

function _renderStep(step) {
  document.querySelectorAll('.tour-highlighted').forEach(function(el) { el.classList.remove('tour-highlighted'); });

  var target = step.target ? document.querySelector(step.target) : null;
  if ((step.type === 'set' || step.type === 'goto') && !target) {
    _nextStep();
    return;
  }

  if (target) {
    target.classList.add('tour-highlighted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setTimeout(function() {
    _buildBubble(step, target);
    if (step.type === 'set') {
      _startValidation(step);
    }
    if (step.type === 'goto') {
      _startGotoListener(step);
    }
  }, 350);
}

function _buildBubble(step, target) {
  if (!_bubbleEl) return;
  var stepNum = _currentStepIdx + 1;
  var totalSteps = _steps.length;
  var pct = ((stepNum / totalSteps) * 100).toFixed(0);
  var isSet = step.type === 'set';
  var isInteractive = isSet || step.type === 'goto';

  var html = '<div class="tour-bubble-header">' +
    '<span class="tour-bubble-title">' + (step.title || '') + '</span>' +
    '<span class="tour-bubble-counter">' + stepNum + ' / ' + totalSteps + '</span>' +
    '</div>';
  html += '<div class="tour-bubble-body">' + (step.body || '') + '</div>';
  if (step.value != null && isSet) {
    html += '<div class="tutorial-value-hint">\u2192 ' + step.value + '</div>';
  }
  if (isInteractive) {
    html += '<button type="button" class="tutorial-show-answer" onclick="window._tutorialShowAnswer()">Show answer</button>';
  }
  html += '<div class="tour-bubble-nav">' +
    '<button type="button" class="tour-btn-skip" onclick="window.endTutorial()">Skip tutorial</button>' +
    '<div class="tour-bubble-buttons">' +
      (_currentStepIdx > 0 ? '<button type="button" class="tour-btn-back" onclick="window._tutorialPrev()">\u2190 Back</button>' : '') +
      '<button type="button" class="tour-btn-next" id="tutorial-next-btn"' +
        (isInteractive ? ' disabled' : '') +
        ' onclick="window._tutorialNext()">Next \u2192</button>' +
    '</div></div>';
  html += '<div class="tutorial-progress-bar"><div class="tutorial-progress-fill" style="width:' + pct + '%"></div></div>';

  _bubbleEl.innerHTML = html;
  _bubbleEl.style.display = 'block';

  if (target) {
    var rect = target.getBoundingClientRect();
    var pad = 8;
    var pos = step.position || 'bottom';
    _bubbleEl.style.position = 'fixed';
    _bubbleEl.style.transform = '';
    _bubbleEl.style.top = '';
    _bubbleEl.style.left = '';
    if (pos === 'bottom') {
      _bubbleEl.style.top = (rect.bottom + pad + 12) + 'px';
      _bubbleEl.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 360)) + 'px';
    } else if (pos === 'top') {
      _bubbleEl.style.top = Math.max(16, rect.top - pad - 12 - _bubbleEl.offsetHeight) + 'px';
      _bubbleEl.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 360)) + 'px';
    } else if (pos === 'right') {
      _bubbleEl.style.top = rect.top + 'px';
      _bubbleEl.style.left = (rect.right + pad + 12) + 'px';
    }

    if (_overlayEl) {
      var l = rect.left - pad, t = rect.top - pad;
      var r = rect.right + pad, b = rect.bottom + pad;
      _overlayEl.style.clipPath =
        'polygon(0% 0%, 0% 100%, ' + l + 'px 100%, ' + l + 'px ' + t + 'px, ' +
        r + 'px ' + t + 'px, ' + r + 'px ' + b + 'px, ' +
        l + 'px ' + b + 'px, ' + l + 'px 100%, 100% 100%, 100% 0%)';
    }

    // Smart viewport clamping — keep bubble adjacent to target
    var bubbleH = _bubbleEl.offsetHeight;
    var bubbleW = _bubbleEl.offsetWidth;
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    var desiredTop = parseFloat(_bubbleEl.style.top);

    // If overflows bottom, try placing above the target
    if (desiredTop + bubbleH > vh - 16) {
      desiredTop = rect.top - pad - 12 - bubbleH;
    }
    // Clamp within viewport bounds
    _bubbleEl.style.top = Math.max(16, Math.min(desiredTop, vh - bubbleH - 16)) + 'px';

    // Horizontal: keep within viewport
    var desiredLeft = parseFloat(_bubbleEl.style.left);
    _bubbleEl.style.left = Math.max(16, Math.min(desiredLeft, vw - bubbleW - 16)) + 'px';
  } else {
    _bubbleEl.style.position = 'fixed';
    _bubbleEl.style.top = '50%';
    _bubbleEl.style.left = '50%';
    _bubbleEl.style.transform = 'translate(-50%, -50%)';
    if (_overlayEl) _overlayEl.style.clipPath = '';
  }
}

function _startValidation(step) {
  var target = document.querySelector(step.target);
  if (!target) return;
  _validationInterval = setInterval(function() {
    if (_checkValue(target, step)) {
      _enableNext();
      _clearValidation();
    }
  }, 300);
}

function _checkValue(el, step) {
  var expected = step.expected;
  if (expected == null) return true;
  var actual;
  if (el.type === 'checkbox') {
    actual = el.checked;
    return actual === expected;
  }
  actual = el.value;
  if (typeof expected === 'number') {
    var num = parseFloat(actual.replace(/[,$%\s]/g, ''));
    if (isNaN(num)) return false;
    if (expected === 0) return num === 0;
    return Math.abs(num - expected) / Math.abs(expected) < 0.02;
  }
  return actual === expected;
}

function _enableNext() {
  var btn = document.getElementById('tutorial-next-btn');
  if (btn) btn.disabled = false;
}

function _showAnswer() {
  var step = _steps[_currentStepIdx];
  if (!step) return;
  if (step.type === 'goto') {
    var gotoTarget = document.querySelector(step.target);
    if (gotoTarget) gotoTarget.click();
    return;
  }
  if (step.type !== 'set') return;
  var target = document.querySelector(step.target);
  if (!target) return;
  if (target.type === 'checkbox') {
    target.checked = step.expected;
  } else if (target.tagName === 'SELECT') {
    target.value = step.expected;
  } else {
    target.value = step.displayValue || String(step.expected);
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  _enableNext();
  _clearValidation();
}

function _clearValidation() {
  if (_validationInterval) { clearInterval(_validationInterval); _validationInterval = null; }
}

function _startGotoListener(step) {
  _clearGotoListener();
  var target = document.querySelector(step.target);
  if (!target) return;
  var parentSection = target.closest('.sidebar-section');
  if (parentSection) parentSection.classList.add('open');
  var handler = function() {
    target.removeEventListener('click', handler);
    _gotoHandler = null;
    setTimeout(_nextStep, step.delay || 400);
  };
  target.addEventListener('click', handler);
  _gotoHandler = { target: target, handler: handler };
}

function _clearGotoListener() {
  if (_gotoHandler) {
    _gotoHandler.target.removeEventListener('click', _gotoHandler.handler);
    _gotoHandler = null;
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

function _persistState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    tutorial: 'sunzia',
    stepIndex: _currentStepIdx,
    scenarioId: _scenarioId,
    startedAt: new Date().toISOString()
  }));
}

function checkTutorialResume() {
  var raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    var state = JSON.parse(raw);
    if (Date.now() - new Date(state.startedAt).getTime() > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    if (typeof TUTORIAL_STEPS === 'undefined' || !TUTORIAL_STEPS.sunzia) return false;
    _resumeTutorial(TUTORIAL_STEPS.sunzia, state.stepIndex, state.scenarioId);
    return true;
  } catch (e) {
    sessionStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

window.startTutorial = startTutorial;
window.endTutorial = endTutorial;
window.checkTutorialResume = checkTutorialResume;
window._tutorialNext = _nextStep;
window._tutorialPrev = _prevStep;
window._tutorialShowAnswer = _showAnswer;

})();

(function() {
'use strict';

let _iconEl = null;
let _bubbleEl = null;

function initAssistant() {
  if (_iconEl) return;
  _iconEl = document.createElement('div');
  _iconEl.className = 'assistant-icon';
  _iconEl.innerHTML = '?';
  _iconEl.title = 'Help & Tour';
  _iconEl.addEventListener('click', toggleAssistantBubble);
  document.body.appendChild(_iconEl);
  _bubbleEl = document.createElement('div');
  _bubbleEl.className = 'assistant-bubble';
  _bubbleEl.style.display = 'none';
  document.body.appendChild(_bubbleEl);
}

function toggleAssistantBubble() {
  if (!_bubbleEl) return;
  if (_bubbleEl.style.display === 'none') {
    showAssistantBubble(getContextualTip());
  } else {
    _bubbleEl.style.display = 'none';
  }
}

function showAssistantBubble(content) {
  if (!_bubbleEl) return;
  _bubbleEl.innerHTML =
    '<div class="assistant-bubble-content">' + content + '</div>' +
    '<div class="assistant-bubble-actions">' +
      '<button type="button" onclick="startQuickTour()">Quick tour of this page</button>' +
      '<button type="button" onclick="startFullTour()">Full guided tour</button>' +
    '</div>' +
    '<button type="button" class="assistant-bubble-close" onclick="hideAssistant()">&times;</button>';
  _bubbleEl.style.display = '';
}

function showAssistantMessage(text) {
  if (!_bubbleEl) return;
  _bubbleEl.innerHTML =
    '<div class="assistant-bubble-content">' + text + '</div>' +
    '<button type="button" class="assistant-bubble-close" onclick="hideAssistant()">&times;</button>';
  _bubbleEl.style.display = '';
}

function hideAssistant() {
  if (_bubbleEl) _bubbleEl.style.display = 'none';
}

function markTutorialDone() {
  if (window.FORGE && window.FORGE.currentUserId && typeof _sb !== 'undefined') {
    _sb.from('profiles').update({ has_done_tutorial: true })
      .eq('id', window.FORGE.currentUserId);
  }
}

function dismissTutorial() {
  hideAssistant();
  markTutorialDone();
}

function getContextualTip() {
  var activeTab = document.querySelector('.view-toggle-btn.active');
  var tab = activeTab ? activeTab.dataset.view : '';
  if (tab === 'inputs') {
    var current = typeof getCurrentSubItem === 'function' ? getCurrentSubItem() : null;
    var subLabel = '';
    if (current && typeof SIDEBAR_SECTIONS !== 'undefined') {
      var sections = SIDEBAR_SECTIONS.inputs || [];
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].id === current.sectionId) {
          for (var j = 0; j < sections[i].subItems.length; j++) {
            if (sections[i].subItems[j].id === current.subItemId) {
              subLabel = sections[i].subItems[j].label;
              break;
            }
          }
          break;
        }
      }
    }
    if (subLabel) return 'You\'re on <strong>' + subLabel + '</strong>. Fields with a lock icon have researched defaults \u2014 unlock to override.';
    return 'The Inputs sidebar contains ~340 fields across 10 sections. Most have researched defaults \u2014 you only need to set project-specific values.';
  }
  if (tab === 'results') return 'Results update live as you change inputs. The <strong>Summary</strong> shows headline BCR and cost/benefit totals.';
  if (tab === 'scenarios') return 'Manage your scenarios here. Use <strong>Compare</strong> for side-by-side metrics. <strong>Duplicate</strong> a scenario to create a variant.';
  return 'Welcome to the FORGE. Click <strong>+ New Scenario</strong> to get started.';
}

function startQuickTour() {
  hideAssistant();
  startPageTour();
}

function startFullTour() {
  var page = window._tourPage || 'home';
  var steps = (typeof TOUR_STEPS !== 'undefined' && TOUR_STEPS[page]) ? TOUR_STEPS[page] : [];
  if (steps.length > 0) startTour(steps, 'full');
}

function startPageTour() {
  var page = window._tourPage || 'home';
  var steps = (typeof TOUR_STEPS !== 'undefined' && TOUR_STEPS[page]) ? TOUR_STEPS[page] : [];
  var pageSteps = steps.filter(function(s) { return !s.action || s.action.type !== 'navigate'; });
  if (pageSteps.length > 0) startTour(pageSteps, page);
}

function showWelcomeBubble() {
  if (!_bubbleEl) return;
  _bubbleEl.innerHTML =
    '<div class="assistant-bubble-content">' +
      'Looks like you\'re new to the FORGE. We recommend you take a tour with us as we walk through a tutorial!' +
    '</div>' +
    '<div class="assistant-bubble-actions">' +
      '<button type="button" onclick="startFullTour()">Start Tour</button>' +
      '<button type="button" onclick="dismissTutorial()">No thanks</button>' +
    '</div>' +
    '<button type="button" class="assistant-bubble-close" onclick="dismissTutorial()">&times;</button>';
  _bubbleEl.style.display = '';
}

window.initAssistant = initAssistant;
window.showWelcomeBubble = showWelcomeBubble;
window.showAssistantMessage = showAssistantMessage;
window.showAssistantBubble = showAssistantBubble;
window.hideAssistant = hideAssistant;
window.startQuickTour = startQuickTour;
window.startFullTour = startFullTour;
window.startPageTour = startPageTour;
window.dismissTutorial = dismissTutorial;
window.markTutorialDone = markTutorialDone;
})();

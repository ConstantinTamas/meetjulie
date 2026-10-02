(function () {
  'use strict';
  var doc = document.documentElement;
  var cleanup = function () {};

  /* ---------- first-visit news notice ----------
     Shown once per browser, never twice in one document load. The flag is a
     versioned localStorage key: a new piece of news gets a new key, so the old
     flag simply stops mattering. Storage can be blocked or throw (private mode,
     strict settings); then the notice falls back to "once per page load" and
     nothing else breaks. It is marked seen the moment it is shown, so it never
     follows the visitor from page to page. */
  var NEWS_KEY = 'julie-news-2026-10-grade';
  var newsDone = false;   // shown or skipped in this document load
  var newsEl = null;      // the live notice, while it is on screen

  function newsSeen() {
    try { return window.localStorage.getItem(NEWS_KEY) === 'seen'; } catch (e) { return false; }
  }
  function markNewsSeen() {
    try { window.localStorage.setItem(NEWS_KEY, 'seen'); } catch (e) { /* storage unavailable */ }
  }
  function closeNews() {
    if (!newsEl) return;
    var hadFocus = newsEl.contains(document.activeElement);
    newsEl.remove();
    newsEl = null;
    markNewsSeen();
    // Focus was never taken; only hand it back if the visitor was inside the notice.
    if (hadFocus) {
      var main = document.getElementById('main-content');
      if (main) main.focus({preventScroll: true});
    }
  }
  function buildNews() {
    // The preview renders every page in one document behind a hash router,
    // so the link has to use the router's form there.
    var href = window.JULIE_PREVIEW
      ? '#p/how-it-works?section=how-it-works-two-standards'
      : 'how-it-works.html#two-standards';
    var box = document.createElement('aside');
    box.className = 'news';
    box.setAttribute('aria-label', 'News');
    box.innerHTML =
      '<p class="news-eyebrow">New</p>' +
      '<p class="news-text">Julie now works with both Oxford CEBM and GRADE.</p>' +
      '<a class="onward news-link" href="' + href + '">How the two standards fit in<span aria-hidden="true">&#8594;</span></a>' +
      '<button class="news-close" type="button" aria-label="Close the news notice">' +
      '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">' +
      '<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.25" fill="none"/></svg></button>';
    return box;
  }

  function init(scope) {
    cleanup();
    scope = scope || document;
    var observers = [];
    var listeners = [];
    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }
    doc.classList.add('js', 'is-ready');
    var head = document.querySelector('.masthead');
    var toggle = document.querySelector('.menu-toggle');
    var menu = document.querySelector('.topnav');

    if (toggle && menu && !toggle.dataset.bound) {
      toggle.dataset.bound = 'true';
      function closeMenu(restoreFocus) {
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.remove('is-open');
        if (restoreFocus) toggle.focus();
      }
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        menu.classList.toggle('is-open', open);
      });
      head.addEventListener('click', function (event) {
        if (event.target.closest('a')) closeMenu(false);
      });
      head.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
          // Marked so the news notice leaves this Escape to the menu.
          event.julieMenuClosed = true;
          closeMenu(true);
        }
      });
      head.addEventListener('focusout', function (event) {
        if (event.relatedTarget && !head.contains(event.relatedTarget)) closeMenu(false);
      });
      var desktop = window.matchMedia('(min-width:72rem)');
      if (desktop.addEventListener) desktop.addEventListener('change', function () { closeMenu(false); });
    }

    if (head) {
      function measureHeader() { doc.style.setProperty('--head', head.offsetHeight + 'px'); }
      measureHeader();
      if ('ResizeObserver' in window) {
        var resize = new ResizeObserver(measureHeader);
        resize.observe(head); observers.push(resize);
      }
    }

    var targets = scope.querySelectorAll('.sec-head,.chainfig');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && 'IntersectionObserver' in window) {
      var reveal = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('is-in'); reveal.unobserve(entry.target); }
        });
      }, {rootMargin: '0px 0px -8% 0px'});
      targets.forEach(function (target) { reveal.observe(target); });
      observers.push(reveal);
    } else targets.forEach(function (target) { target.classList.add('is-in'); });

    var rail = scope.querySelector('.sidenav');
    if (rail && 'IntersectionObserver' in window) {
      var links = Array.from(rail.querySelectorAll('ol a'));
      var sections = links.map(function (link) {
        var id = link.dataset.sectionTarget || link.hash.slice(1);
        return Array.from(scope.querySelectorAll('section[id]')).find(function (section) { return section.id === id; });
      });
      var visible = new Map();
      var tracker = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { visible.set(entry.target, entry.isIntersecting); });
        var active = sections.filter(function (section) { return visible.get(section); }).pop();
        if (!active) return;
        links.forEach(function (link, i) {
          if (sections[i] === active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      }, {rootMargin: '-25% 0px -65% 0px'});
      sections.forEach(function (section) { if (section) tracker.observe(section); });
      observers.push(tracker);
    }

    var form = scope.querySelector('form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      var status = form.querySelector('[role="status"]');
      var submit = form.querySelector('[type="submit"]');
      var tokenRequest;
      function getToken() {
        if (!tokenRequest) tokenRequest = fetch(form.action, {
          headers: {'Accept': 'application/json'}, credentials: 'same-origin', cache: 'no-store'
        }).then(function (response) {
          if (!response.ok) throw new Error('unavailable');
          return response.json();
        }).then(function (data) {
          if (!data.csrf) throw new Error('unavailable');
          form.elements.csrf.value = data.csrf;
        }).catch(function (error) { tokenRequest = null; throw error; });
        return tokenRequest;
      }
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (form.dataset.sending === 'true') return;
        if (window.JULIE_PREVIEW) {
          status.textContent = 'This is a preview. Messages are not sent from this page.';
          return;
        }
        form.dataset.sending = 'true';
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'Sending your message…';
        status.classList.remove('is-error');
        Array.from(form.elements).forEach(function (field) { field.removeAttribute('aria-invalid'); });
        var posting = false;
        try {
          await getToken();
          posting = true;
          var response = await fetch(form.action, {
            method: 'POST', body: new FormData(form), credentials: 'same-origin',
            headers: {'Accept': 'application/json'}
          });
          var data = await response.json();
          status.textContent = data.message || 'Your message could not be sent. Your details are still here.';
          if (!response.ok || !data.ok) {
            status.classList.add('is-error');
            var errors = data.errors || {};
            Object.keys(errors).forEach(function (name) {
              if (form.elements[name]) form.elements[name].setAttribute('aria-invalid', 'true');
            });
            var invalid = form.querySelector('[aria-invalid="true"]');
            if (invalid) invalid.focus();
            if (response.status === 403) { tokenRequest = null; form.elements.csrf.value = ''; }
          } else { form.reset(); tokenRequest = null; }
        } catch (error) {
          status.classList.add('is-error');
          status.textContent = posting
            ? 'We could not confirm whether your message was sent. Your details are still here; please wait before trying again.'
            : 'The contact form is temporarily unavailable. Your details are still here. Please try again later.';
        } finally {
          form.dataset.sending = 'false'; submit.disabled = false; form.removeAttribute('aria-busy');
        }
      });
    }

    // The news notice. Pages that opt out (the privacy notice) carry
    // data-news="off"; they neither show it nor use up the one showing.
    var newsOff = !!scope.querySelector('[data-news="off"]');
    if (!newsEl && !newsDone && !newsOff) {
      newsDone = true;
      if (!newsSeen()) {
        newsEl = buildNews();
        document.body.appendChild(newsEl);
        markNewsSeen();
      }
    }
    // Only the preview can route to an opted-out page with the notice still
    // open (one document, many pages): there it steps out of sight, without
    // listeners, and comes back on the next page. A real page never gets here.
    if (newsEl) newsEl.hidden = newsOff;
    if (newsEl && !newsOff) {
      var notice = newsEl;
      listen(notice.querySelector('.news-close'), 'click', closeNews);
      // Removing a link inside its own click would cancel the navigation, so
      // the notice leaves on the next tick, after the link has done its job.
      listen(notice.querySelector('.news-link'), 'click', function () { setTimeout(closeNews, 0); });
      listen(document, 'keydown', function (event) {
        if (event.key !== 'Escape' || event.julieMenuClosed) return;
        // An open mobile menu takes the first Escape, wherever the focus is.
        if (toggle && toggle.getAttribute('aria-expanded') === 'true') return;
        closeNews();
      });
      // The notice must not sit over the contact form: it steps aside for good
      // once the form comes into view or receives focus.
      var contactForm = scope.querySelector('#contact-form, form[action="contact.php"]');
      if (contactForm) {
        listen(contactForm, 'focusin', closeNews);
        if ('IntersectionObserver' in window) {
          var formWatch = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) closeNews();
          });
          formWatch.observe(contactForm);
          observers.push(formWatch);
        }
      }
    }

    cleanup = function () {
      observers.forEach(function (observer) { observer.disconnect(); });
      listeners.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
    };
  }
  window.JulieSite = {init: init};
  if (!window.JULIE_PREVIEW) init(document);
})();

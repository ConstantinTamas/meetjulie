(function () {
  'use strict';
  var doc = document.documentElement;
  var cleanup = function () {};

  function init(scope) {
    cleanup();
    scope = scope || document;
    var observers = [];
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
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
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

    cleanup = function () { observers.forEach(function (observer) { observer.disconnect(); }); };
  }
  window.JulieSite = {init: init};
  if (!window.JULIE_PREVIEW) init(document);
})();

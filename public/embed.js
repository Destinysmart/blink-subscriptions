/* Blink Subscriptions embed. Usage:
   <div id="blink-sub" data-username="yourname"></div>
   <script src="https://YOUR-HOST/embed.js"></script>
   Renders the subscribe box in an isolated iframe. No keys, nothing stored on the host page. */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : window.location.origin;

  function mount(el) {
    if (el.getAttribute('data-blink-mounted')) return;
    var user = el.getAttribute('data-username') || el.getAttribute('data-blink-sub');
    if (!user) return;
    el.setAttribute('data-blink-mounted', '1');

    var iframe = document.createElement('iframe');
    iframe.src = origin + '/embed/' + encodeURIComponent(user);
    iframe.title = 'Subscribe';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('loading', 'lazy');
    iframe.style.cssText = 'width:100%;border:0;overflow:hidden;min-height:420px;color-scheme:normal;';
    el.innerHTML = '';
    el.appendChild(iframe);

    window.addEventListener('message', function (e) {
      if (e.origin !== origin) return;
      if (e.source !== iframe.contentWindow) return;
      if (e.data && typeof e.data.blinkSubHeight === 'number') {
        iframe.style.height = e.data.blinkSubHeight + 'px';
      }
    });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-blink-sub],[data-username]');
    var one = document.getElementById('blink-sub');
    var list = [];
    if (one) list.push(one);
    Array.prototype.forEach.call(nodes, function (n) { if (list.indexOf(n) === -1) list.push(n); });
    list.forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

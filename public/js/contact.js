/* صفحة اتصل بنا */
(function () {
  'use strict';
  document.getElementById('inquiryBtn').addEventListener('click', function () {
    const text = document.getElementById('inquiryText').value.trim();
    const msg = text || 'السلام عليكم، لدي استفسار عن منتجاتكم.';
    const number = document.querySelector('a.wa-float').href.match(/wa\.me\/(\d+)/)[1];
    window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  });
})();

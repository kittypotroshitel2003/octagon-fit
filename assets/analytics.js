/* ═══════════════════════════════════════════════════
   OCTAGON-FIT — аналитика

   ЧТО ЗАПОЛНИТЬ: номер счётчика Яндекс.Метрики ниже.
   Пока стоит 0 — счётчик не подключается, скрипт Метрики
   не загружается, на сайт это никак не влияет.

   Цели, которые отправляются автоматически:
     lead_trial — заявка на гостевой визит
     lead_job   — отклик на вакансию
═══════════════════════════════════════════════════ */
window.OCT_METRIKA_ID = 0;

(function () {
  "use strict";
  if (!window.OCT_METRIKA_ID) return;

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

  ym(window.OCT_METRIKA_ID, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    accurateTrackBounce: true,
    trackLinks: true
  });
})();

/* ═══════════════════════════════════════════════════
   OCTAGON-FIT — заявки с сайта

   Все формы отправляются на один эндпоинт (OCT_LEAD_ENDPOINT),
   который пересылает заявку на почту и в Telegram-группу.

   Публичный API:
     openLeadModal(source)   — окно заявки на консультацию
     openJobModal(position)  — окно отклика на вакансию
     sendLead(payload, file) — отправка произвольной заявки
═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var MODAL_HTML = [
    '<div class="job-modal-overlay" id="octModalOverlay" role="dialog" aria-modal="true" aria-labelledby="octModalTitle" tabindex="-1" onclick="closeOctModal(event)">',
    '  <div class="job-modal" id="octModal">',
    '    <button class="job-modal-close" type="button" onclick="closeOctModal(null)" aria-label="Закрыть">✕</button>',
    '    <div class="oct-promo-media" id="octPromoMedia" hidden>',
    '      <img class="oct-modal-banner" id="octModalBanner" alt="">',
    '      <button class="oct-promo-arrow oct-promo-arrow--prev" type="button" onclick="octStepPromo(-1)" aria-label="Предыдущая акция" hidden><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
    '      <button class="oct-promo-arrow oct-promo-arrow--next" type="button" onclick="octStepPromo(1)" aria-label="Следующая акция" hidden><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
    '      <div class="oct-promo-dots" id="octPromoDots" hidden></div>',
    '    </div>',
    '',
    '    <form id="octModalForm" data-tg="off" onsubmit="return submitOctModal(event)" novalidate>',
    '      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">',
    '      <p class="job-modal-position" id="octModalEyebrow">Заявка</p>',
    '      <h2 class="job-modal-title" id="octModalTitle">Получить консультацию</h2>',
    '      <p class="job-modal-sub" id="octModalSub">Оставьте контакты — перезвоним, расскажем об абонементах и подберём тренера под вашу цель.</p>',
    '',
    '      <div class="oct-switch" id="octSwitch" data-active="first" role="group" aria-label="Вы у нас впервые?">',
    '        <span class="oct-switch-thumb" aria-hidden="true"></span>',
    '        <button class="oct-switch-btn is-active" type="button" data-visit="first" aria-pressed="true" onclick="octSetVisit(\'first\')">Первый раз</button>',
    '        <button class="oct-switch-btn" type="button" data-visit="member" aria-pressed="false" onclick="octSetVisit(\'member\')">Уже занимаюсь</button>',
    '      </div>',
    '',
    '      <div class="job-modal-field" id="octNameField">',
    '        <label class="job-modal-label" for="octName">Имя и фамилия *</label>',
    '        <input class="job-modal-input" id="octName" type="text" placeholder="Иван Иванов" autocomplete="name">',
    '      </div>',
    '      <div class="job-modal-field" id="octPhoneField">',
    '        <label class="job-modal-label" for="octPhone">Номер телефона *</label>',
    '        <input class="job-modal-input" id="octPhone" type="tel" placeholder="+7 (900) 000-00-00" autocomplete="tel" inputmode="tel">',
    '      </div>',
    '',
    '      <div class="oct-member" id="octMemberFields" hidden>',
    '        <div class="job-modal-field" id="octTrainerField">',
    '          <label class="job-modal-label" for="octTrainer">К кому записаться</label>',
    '          <select class="job-modal-input job-modal-select" id="octTrainer" onchange="octTrainerChanged()"></select>',
    '        </div>',
    '        <div class="job-modal-field" id="octWhenField">',
    '          <label class="job-modal-label" for="octWhen">Когда удобно</label>',
    '          <input class="job-modal-input" id="octWhen" type="text" placeholder="Например: будни после 19:00">',
    '        </div>',
    '        <p class="oct-note" id="octSelfNote" hidden><strong>Записываться не нужно.</strong> Тренажёрный зал открыт по абонементу ежедневно с 07:00 до 23:00. Групповые занятия идут по расписанию.</p>',
    '      </div>',
    '',
    '      <div class="job-modal-field" id="octFileField" style="display:none">',
    '        <label class="job-modal-label">Резюме (необязательно)</label>',
    '        <label class="job-modal-file-label" for="octFileInput">',
    '          <span class="file-icon">📎</span>',
    '          <span class="file-text">',
    '            <strong id="octFileName">Прикрепить резюме</strong>',
    '            PDF, DOC, DOCX — до 5 МБ',
    '          </span>',
    '        </label>',
    '        <input type="file" id="octFileInput" accept=".pdf,.doc,.docx" onchange="handleResumeFile(this,\'octFileName\')">',
    '      </div>',
    '',
    '      <label class="consent">',
    '        <input class="consent-box" type="checkbox" id="octConsent">',
    '        <span class="consent-mark" aria-hidden="true"></span>',
    '        <span class="consent-text">Я согласен на обработку персональных данных и принимаю условия <a href="/privacy.html" target="_blank" rel="noopener">политики конфиденциальности</a>.</span>',
    '      </label>',
    '',
    '      <button class="job-modal-submit" type="submit" id="octModalSubmit">Отправить заявку</button>',
    '      <p class="form-status" id="octStatus" role="status" aria-live="polite"></p>',
    '    </form>',
    '',
    '    <div class="job-modal-success" id="octModalSuccess" style="display:none">',
    '      <div class="success-icon">✓</div>',
    '      <h3 id="octSuccessTitle">Заявка отправлена</h3>',
    '      <p id="octSuccessText">Мы получили вашу заявку и свяжемся с вами в ближайшее время.</p>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  function injectModal() {
    if (document.getElementById("octModalOverlay")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = MODAL_HTML;
    while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectModal);
  } else {
    injectModal();
  }
})();

/* ═══════════════════════════════════════════════════
   ОТПРАВКА ЗАЯВОК
   Все формы сайта уходят на один эндпоинт, а он уже
   рассылает заявку на почту и в Telegram-группу.
   Адрес эндпоинта задаётся в OCT_LEAD_ENDPOINT.
═══════════════════════════════════════════════════ */
window.OCT_LEAD_ENDPOINT = '/api/lead';
window.OCT_FALLBACK_CONTACT = 'Не получилось отправить заявку. Позвоните нам: +7 (967) 555-43-97';
var OCT_MAX_FILE = 5 * 1024 * 1024;

/* honeypot конкретной формы */
function octHp(formId) {
  var form = document.getElementById(formId);
  var input = form && form.querySelector('input[name="website"]');
  return input ? input.value : '';
}

function octDigits(v) { return (v || '').replace(/\D/g, ''); }

/* ── Телефон: только российские номера, +7 и ровно 10 цифр ── */
function octPhoneValid(v) {
  var d = octDigits(v);
  return d.length === 11 && d.charAt(0) === '7';
}

/* Цифры номера без кода страны: 8 и 7 в начале считаем кодом,
   всё остальное — началом номера. Больше 10 цифр не берём. */
function octPhoneRest(v) {
  var d = octDigits(v);
  if (/^[78]/.test(d)) d = d.slice(1);
  return d.slice(0, 10);
}

function octFormatPhone(rest) {
  var out = '+7';
  if (!rest) return out + ' ';
  out += ' (' + rest.slice(0, 3);
  if (rest.length > 3) out += ') ' + rest.slice(3, 6);
  if (rest.length > 6) out += '-' + rest.slice(6, 8);
  if (rest.length > 8) out += '-' + rest.slice(8, 10);
  return out;
}

/* Маска для всех полей type="tel" на странице, в том числе в модальном окне */
function octMaskPhone(e) {
  var el = e.target;
  if (!el || el.type !== 'tel') return;
  var deleting = e.inputType && e.inputType.indexOf('delete') === 0;
  var rest = octPhoneRest(el.value);
  var caret = el.selectionStart == null ? el.value.length : el.selectionStart;
  /* сколько цифр номера стояло перед курсором — туда его и вернём */
  var before = octPhoneRest(el.value.slice(0, caret)).length;
  /* Backspace по скобке или дефису: цифры не изменились — стираем цифру слева */
  if (e.inputType === 'deleteContentBackward' && rest === el._octPrev && before > 0) {
    rest = rest.slice(0, before - 1) + rest.slice(before);
    before--;
  }
  /* «8-918…», «8-800…»: если за первой 8 идёт 9 или 8 — это код страны.
     Таких кодов после +7 не бывает, а городские вроде 861 остаются целыми. */
  if (!deleting && el._octPrev === '8' && /^8[89]$/.test(rest)) { rest = rest.slice(1); before = Math.max(0, before - 1); }
  /* «+7» набрали поверх уже подставленного +7 — кодов на 7 после +7 нет */
  if (!deleting && !el._octPrev && rest === '7') { rest = ''; before = 0; }
  el._octPrev = rest;
  if (deleting && !rest) { el.value = ''; return; }
  var formatted = octFormatPhone(rest);
  el.value = formatted;
  var pos = formatted.length;
  if (before < rest.length) {
    pos = 4;
    for (var seen = 0; pos < formatted.length && seen < before; pos++) {
      if (pos > 2 && /\d/.test(formatted.charAt(pos))) seen++;
    }
  }
  try { el.setSelectionRange(pos, pos); } catch (err) {}
  if (octPhoneValid(el.value)) octMarkError(el, false);
}

document.addEventListener('focusin', function (e) {
  var form = e.target.closest && e.target.closest('form');
  if (!form || form._octAnalyticsStarted) return;
  form._octAnalyticsStarted = true;
  octGoal('form_start');
});

document.addEventListener('input', octMaskPhone);
document.addEventListener('focusin', function (e) {
  var el = e.target;
  if (el && el.type === 'tel' && !el.value) el.value = '+7 ';
});
document.addEventListener('focusout', function (e) {
  var el = e.target;
  if (el && el.type === 'tel' && !octPhoneRest(el.value)) { el.value = ''; el._octPrev = ''; }
});

function octMarkError(el, isError) {
  if (!el) return;
  el.classList.toggle('error', !!isError);
}

function octSetStatus(id, text, isError) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

/* После неудачной попытки согласие можно поставить сразу: снимаем подсветку
   ошибки и устаревшее сообщение, чтобы следующая отправка проходила штатно. */
document.addEventListener('change', function (e) {
  var consent = e.target;
  if (!consent || !consent.classList.contains('consent-box')) return;
  var row = consent.closest('.consent');
  if (!row) return;
  if (consent.checked) {
    row.classList.remove('error');
    var form = consent.closest('form');
    var status = form && form.querySelector('.form-status');
    if (status && status.classList.contains('error')) {
      status.textContent = '';
      status.classList.remove('error');
    }
  }
});

/* Кастомная область чекбокса должна работать и при клике по галочке,
   и при клике по тексту. Убираем зависимость от скрытого input и label-for. */
document.addEventListener('click', function (e) {
  var row = e.target.closest && e.target.closest('.consent');
  if (!row || e.target.closest('a') || e.target.classList.contains('consent-box')) return;
  var consent = row.querySelector('.consent-box');
  if (!consent) return;
  e.preventDefault();
  consent.checked = !consent.checked;
  consent.dispatchEvent(new Event('change', { bubbles: true }));
});

function octGoal(name) {
  try {
    if (window.ym && window.OCT_METRIKA_ID) window.ym(window.OCT_METRIKA_ID, 'reachGoal', name);
  } catch (e) {}
}

function handleResumeFile(input, targetId) {
  var target = document.getElementById(targetId);
  var file = input.files && input.files[0];
  if (!file) { target.textContent = 'Прикрепить резюме'; return; }
  if (file.size > OCT_MAX_FILE) {
    input.value = '';
    target.textContent = 'Файл больше 5 МБ — выберите другой';
    return;
  }
  target.textContent = file.name;
}

/* Общая валидация: имя, телефон, согласие */
function octValidate(nameEl, phoneEl, consentEl, statusId) {
  var ok = true;
  var nameField = nameEl ? nameEl.closest('.job-modal-field') : null;
  var needName = !!nameEl && !(nameField && nameField.hidden);
  if (needName && !nameEl.value.trim()) { octMarkError(nameEl, true); ok = false; }
  else if (nameEl) { octMarkError(nameEl, false); }
  if (!octPhoneValid(phoneEl.value)) { octMarkError(phoneEl, true); ok = false; } else { octMarkError(phoneEl, false); }

  var consentRow = consentEl ? consentEl.closest('.consent') : null;
  if (consentEl && !consentEl.checked) {
    if (consentRow) consentRow.classList.add('error');
    ok = false;
  } else if (consentRow) {
    consentRow.classList.remove('error');
  }

  if (!ok) {
    var noConsent = consentEl && !consentEl.checked;
    var msg;
    if (noConsent) {
      msg = needName
        ? 'Заполните имя и телефон и подтвердите согласие на обработку данных.'
        : 'Укажите телефон и подтвердите согласие на обработку данных.';
    } else {
      msg = needName ? 'Проверьте имя и номер телефона: +7 и ещё 10 цифр.' : 'Проверьте номер телефона: +7 и ещё 10 цифр.';
    }
    octSetStatus(statusId, msg, true);
  } else {
    octSetStatus(statusId, '');
  }
  if (!ok) octGoal('form_validation_error');
  return ok;
}

/* Реле форм студии (forms.a-4-to.ru → Telegram-группа клуба).
   Скрипт form.js подставляется в HTML при деплое. Наши формы помечены
   data-tg="off", чтобы реле не перехватывало их само: оно читает поля по
   атрибуту name и прислало бы заявку с пустыми или техническими полями.
   Вместо этого отдаём данные явно и с человекочитаемыми названиями. */
function octRelay(data, file) {
  if (!window.FormRelay || typeof window.FormRelay.send !== 'function') return false;
  var fields = { 'Тип заявки': data.type || 'Заявка с сайта' };
  /* в окне акции имя не спрашиваем — пустую строку в заявку не кладём */
  if (data.name) fields['Имя'] = data.name;
  fields['Телефон'] = data.phone || '';
  fields['Откуда'] = data.source || '';
  fields['Страница'] = data.page || '';
  fields['Адрес'] = data.url || '';
  fields['Согласие на обработку данных'] = data.consent || '';
  if (data.trainer) fields['Тренер'] = data.trainer;
  if (data.when) fields['Когда удобно'] = data.when;
  if (file) fields['Резюме'] = file.name + ' — файл придёт на почту';
  try {
    return window.FormRelay.send(fields, { form: data.type || 'Заявка' });
  } catch (e) {
    return false;
  }
}

/* Отправка на сервер: JSON + резюме в base64 */
function sendLead(payload, file) {
  var data = {};
  Object.keys(payload).forEach(function (k) { data[k] = payload[k] == null ? '' : String(payload[k]); });
  data.page = document.title;
  data.url = location.href;
  data.website = data.website || ''; /* honeypot: у живых людей всегда пусто */

  function post() {
    return fetch(window.OCT_LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (result) {
      if (!result || result.ok !== true) throw new Error((result && result.error) || 'server');
      return result;
    });
  }

  /* Telegram — дополнительный канал без подтверждения доставки.
     Успех формы подтверждает только сервер, сохранивший заявку для почты. */
  octRelay(data, file);

  if (!file) return post();

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      data.resume = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: String(reader.result).split(',')[1]
      };
      resolve();
    };
    reader.onerror = function () { reject(new Error('file read failed')); };
    reader.readAsDataURL(file);
  }).then(post);
}

/* ── Универсальное модальное окно ── */
var octModalMode = 'lead';     /* lead | job */
var octVisitKind = 'first';    /* first — первый визит, member — действующий клиент */
var octLastTrigger = null;

/* Тренеры клуба — список для записи действующих клиентов.
   Порядок и написание — как на странице «Тренеры». */
var OCT_TRAINERS = [
  'Ежов Максим',
  'Александр Бучминский',
  'Петросян Микаел',
  'Калюжная Наталья',
  'Верба Дарья',
  'Кириченко Валерия',
  'Баранов Евгений',
  'Гунько Дарья',
  'Пичиуз Роман'
];
var OCT_TRAINER_ANY = '';          /* значение «подберите тренера» */
var OCT_TRAINER_SELF = '__self';   /* «занимаюсь самостоятельно» */
var OCT_SCHEDULE_URL = '/schedule.html';

var OCT_MODAL_PRESETS = {
  lead: {
    eyebrow: 'Заявка',
    title: 'Получить консультацию',
    sub: 'Оставьте контакты — перезвоним, расскажем об абонементах и подберём тренера под вашу цель.',
    submit: 'Отправить заявку',
    file: false,
    successTitle: 'Заявка отправлена',
    successText: 'Мы получили заявку и перезвоним в ближайшее время.',
    goal: 'lead_trial'
  },
  member: {
    eyebrow: 'Запись',
    title: 'Запись к тренеру',
    sub: 'Выберите тренера и удобное время — администратор подтвердит запись по телефону.',
    submit: 'Записаться на тренировку',
    file: false,
    successTitle: 'Заявка на запись отправлена',
    successText: 'Передали тренеру и администратору — позвоним, чтобы подтвердить время.',
    goal: 'lead_booking'
  },
  job: {
    eyebrow: 'Вакансия',
    title: 'Работа в OCTAGON-FIT',
    sub: 'Оставьте контакты и резюме — посмотрим опыт и позвоним в течение рабочего дня.',
    submit: 'Отправить отклик',
    file: true,
    successTitle: 'Отклик отправлен',
    successText: 'Мы получили вашу заявку и свяжемся с вами в ближайшее время.',
    goal: 'lead_job'
  },
  /* текущая акция окна — подставляется из OCT_PROMOS при открытии */
  promo: null
};

/* Акции по приоритету: первая живая открывается в окне сразу,
   к остальным листают стрелками на баннере.
   Закончилась (until) — пропадает сама. */
var OCT_PROMO_FORM = {
  eyebrow: '',
  submit: 'Отправить',
  file: false,
  successTitle: 'Заявка отправлена',
  successText: 'Мы получили заявку и позвоним, чтобы рассказать условия акции и помочь с оформлением.',
  goal: 'lead_promo'
};

var OCT_PROMOS = [
  {
    until: '2026-10-29T23:59:59+03:00',
    name: 'Акция «Страшные скидки — год за 13 000 ₽»',
    title: 'Страшные скидки — год за 13 000 ₽',
    sub: [
      'Встречай Хэллоуин в OCTAGON-FIT! Только 27, 28 и 29 октября оформляй годовую клубную карту за 13 000 ₽. Всего три дня, чтобы забрать предложение.',
      'Оставь заявку — расскажем об условиях акции и поможем оформить карту!'
    ],
    banner: '/img/promo-halloween-13000.webp',
    bannerAlt: 'Акция на Хэллоуин: год за 13 000 ₽, только 27, 28 и 29 октября',
    /* надпись занимает почти весь квадрат — кадрируем так, чтобы влезли цена и даты */
    bannerPos: 'center 50%',
    bannerPosMobile: 'center 40%'
  },
  {
    until: '2026-10-31T23:59:59+03:00',
    name: 'Акция «Каждый 4-й месяц в подарок»',
    title: 'Каждый 4-й месяц тренировок — в подарок',
    sub: [
      'Больше тренировок с OCTAGON-FIT! Оформи клубную карту до конца октября и получи каждый 4-й месяц тренировок в подарок. Количество карт по акции ограничено.',
      'Оставь заявку — поможем подобрать абонемент и расскажем об условиях акции.'
    ],
    banner: '/img/promo-4th-month-oct.webp',
    bannerAlt: 'Акция: каждый 4-й месяц в подарок, до конца месяца',
    bannerPos: 'center 65%',
    bannerPosMobile: 'center 62%'
  }
];

OCT_PROMOS.forEach(function (promo) {
  Object.keys(OCT_PROMO_FORM).forEach(function (k) { if (!(k in promo)) promo[k] = OCT_PROMO_FORM[k]; });
});

function octLivePromos() {
  var now = Date.now();
  return OCT_PROMOS.filter(function (promo) {
    var until = new Date(promo.until).getTime();
    return !isNaN(until) && now < until;
  });
}

/* Наполняем список тренеров один раз */
function octFillTrainers() {
  var sel = document.getElementById('octTrainer');
  if (!sel || sel.options.length) return;
  var opts = ['<option value="">Подберите тренера</option>'];
  for (var i = 0; i < OCT_TRAINERS.length; i++) {
    opts.push('<option value="' + OCT_TRAINERS[i] + '">' + OCT_TRAINERS[i] + '</option>');
  }
  opts.push('<option value="' + OCT_TRAINER_SELF + '">Занимаюсь самостоятельно</option>');
  sel.innerHTML = opts.join('');
}

/* Текущий пресет с учётом выбранной вкладки */
function octPreset() {
  if (octModalMode === 'job') return OCT_MODAL_PRESETS.job;
  if (octModalMode === 'promo') return OCT_MODAL_PRESETS.promo;
  return octVisitKind === 'member' ? OCT_MODAL_PRESETS.member : OCT_MODAL_PRESETS.lead;
}

/* Подзаголовок: строка или несколько абзацев */
function octSetSub(el, sub) {
  if (!el) return;
  var lines = sub ? (typeof sub === 'string' ? [sub] : sub) : [];
  el.textContent = '';
  el.hidden = !lines.length;
  for (var i = 0; i < lines.length; i++) {
    var line = document.createElement('span');
    line.className = 'oct-sub-line';
    line.textContent = lines[i];
    el.appendChild(line);
  }
}

/* Страница на широких экранах масштабируется через documentElement.style.zoom
   (вёрстка сделана под 1920). Из-за этого 92vh внутри окна — уже не 92% экрана:
   окно считает себя высоким, а видно только его часть. Считаем предел сами. */
function octFitPromo() {
  var modal = document.getElementById('octModal');
  if (!modal) return;
  if (!modal.classList.contains('is-promo')) { modal.style.maxHeight = ''; return; }
  var zoom = parseFloat(document.documentElement.style.zoom) || 1;
  modal.style.maxHeight = Math.round((window.innerHeight - 32) / zoom) + 'px';
}

window.addEventListener('resize', octFitPromo);

/* Баннер акции: грузим один раз, в остальных режимах прячем */
function octSetBanner(preset) {
  var media = document.getElementById('octPromoMedia');
  var img = document.getElementById('octModalBanner');
  if (!media || !img) return;
  if (!preset.banner) { media.hidden = true; return; }
  if (img.getAttribute('src') !== preset.banner) {
    img.setAttribute('src', preset.banner);
    img.setAttribute('alt', preset.bannerAlt || '');
    img.style.setProperty('--oct-banner-pos', preset.bannerPos || 'center top');
    img.style.setProperty('--oct-banner-pos-m', preset.bannerPosMobile || 'center top');
  }
  media.hidden = false;
}

function octApplyPreset(titleOverride) {
  var preset = octPreset();
  var trainer = document.getElementById('octTrainer');
  var chosen = trainer && trainer.value && trainer.value !== OCT_TRAINER_SELF ? trainer.value : '';
  var sub = preset.sub;
  var title = titleOverride || preset.title;
  if (octModalMode === 'lead' && octVisitKind === 'first' && chosen) {
    sub = 'Оставьте контакты — перезвоним и запишем к тренеру ' + chosen + '.';
  }
  if (octIsSelf()) {
    title = 'Зал без записи';
    sub = '';
  }
  var eyebrowEl = document.getElementById('octModalEyebrow');
  eyebrowEl.textContent = preset.eyebrow;
  eyebrowEl.hidden = !preset.eyebrow;
  document.getElementById('octModalTitle').textContent = title;
  octSetSub(document.getElementById('octModalSub'), sub);
  octSetBanner(preset);
  document.getElementById('octSuccessTitle').textContent = preset.successTitle;
  document.getElementById('octSuccessText').textContent = preset.successText;
  document.getElementById('octFileField').style.display = preset.file ? '' : 'none';
  octUpdateSubmit();
}

/* Кнопка отправки: для самостоятельных занятий заявка не нужна — ведём в расписание */
function octUpdateSubmit() {
  var btn = document.getElementById('octModalSubmit');
  if (!btn) return;
  btn.textContent = octIsSelf() ? 'Смотреть расписание' : octPreset().submit;
}

function octIsSelf() {
  var sel = document.getElementById('octTrainer');
  return octModalMode === 'lead' && octVisitKind === 'member' && sel && sel.value === OCT_TRAINER_SELF;
}

/* Переключение «Первый раз» / «Уже занимаюсь» */
function octSetVisit(kind) {
  octVisitKind = kind === 'member' ? 'member' : 'first';
  var sw = document.getElementById('octSwitch');
  var fields = document.getElementById('octMemberFields');
  if (sw) {
    sw.setAttribute('data-active', octVisitKind);
    var btns = sw.querySelectorAll('.oct-switch-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-visit') === octVisitKind;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  if (fields) {
    if (octVisitKind === 'member') {
      fields.hidden = false;
      /* перезапуск появления полей: opacity + сдвиг, без анимации высоты */
      fields.classList.remove('is-in');
      void fields.offsetWidth;
      fields.classList.add('is-in');
    } else {
      fields.hidden = true;
      fields.classList.remove('is-in');
    }
  }
  octTrainerChanged();
  octApplyPreset(null);
  octSetStatus('octStatus', '');
}

/* Выбор тренера: «занимаюсь самостоятельно» — записываться не нужно */
function octTrainerChanged() {
  var form = document.getElementById('octModalForm');
  var note = document.getElementById('octSelfNote');
  var self = octIsSelf();
  if (form) form.classList.toggle('is-self', self);
  if (note) note.hidden = !self;
  octApplyPreset(null);
}

function octOpenModal(mode, titleOverride, source, trainer) {
  octModalMode = (mode === 'job' || mode === 'promo') ? mode : 'lead';
  octVisitKind = 'first';
  octLastTrigger = document.activeElement;
  window.OCT_LEAD_SOURCE = source || titleOverride || '';

  octFillTrainers();

  var form = document.getElementById('octModalForm');
  var promo = octModalMode === 'promo';
  var sw = document.getElementById('octSwitch');
  sw.style.display = octModalMode === 'lead' ? '' : 'none';

  /* Окно акции повторяет баннер: одно поле и кнопка, имя не спрашиваем */
  document.getElementById('octModal').classList.toggle('is-promo', promo);
  octRenderPromoNav();
  document.getElementById('octNameField').hidden = promo;
  octFitPromo();

  form.style.display = '';
  form.classList.remove('is-self');
  document.getElementById('octModalSuccess').style.display = 'none';
  document.getElementById('octName').value = '';
  document.getElementById('octPhone').value = '';
  document.getElementById('octWhen').value = '';
  document.getElementById('octTrainer').value = trainer && OCT_TRAINERS.indexOf(trainer) > -1 ? trainer : OCT_TRAINER_ANY;
  document.getElementById('octConsent').checked = false;
  document.getElementById('octFileInput').value = '';
  document.getElementById('octFileName').textContent = 'Прикрепить резюме';
  octMarkError(document.getElementById('octName'), false);
  octMarkError(document.getElementById('octPhone'), false);
  document.querySelector('#octModalForm .consent').classList.remove('error');
  octSetStatus('octStatus', '');

  octSetVisit('first');
  octApplyPreset(titleOverride);

  document.getElementById('octModalOverlay').classList.add('open');
  octGoal(octModalMode === 'job' ? 'form_open_job' : 'form_open');
  document.body.classList.add('oct-modal-open');
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  /* Окно акции всплывает само: фокус на сам диалог, а не в поле —
     автофокус на телефоне поднял бы клавиатуру поверх баннера. */
  var focusTarget = promo
    ? document.getElementById('octModalOverlay')
    : document.getElementById('octName');
  setTimeout(function () { if (focusTarget) focusTarget.focus(); }, 120);
}

function openLeadModal(source) { octOpenModal('lead', null, source); }
function openJobModal(position) { octOpenModal('job', position || null, position); }

/* Кнопка «Записаться» у конкретного тренера */
function openTrainerModal(name) {
  var trainer = (name || '').trim();
  octOpenModal('lead', null, trainer ? 'Тренер: ' + trainer : 'Карточка тренера', trainer);
}

/* Ссылка «Уже занимаетесь?» — сразу вкладка действующего клиента */
function openMemberModal(source) {
  octOpenModal('lead', null, source || 'Запись действующего клиента');
  octSetVisit('member');
}

/* ═══════════════════════════════════════════════════
   ОКНО АКЦИИ
   Открывается по клику и само — после первого экрана
   прокрутки, пока акция идёт, и не чаще раза в неделю
   на человека. Новая акция: добавьте её в OCT_PROMOS
   (выше — приоритетнее) и смените key, чтобы показ начался заново.
═══════════════════════════════════════════════════ */
var OCT_PROMO = {
  key: 'oct-promo-halloween-13000',
  repeatAfterDays: 7,
  source: 'Автопопап акции'
};

function openPromoModal(source) {
  var live = octLivePromos();
  if (!live.length) { openLeadModal(source); return; }
  OCT_MODAL_PRESETS.promo = live[0];
  octOpenModal('promo', null, source || live[0].name);
  octRenderPromoNav();
}

/* Стрелки и точки на баннере — только если акций больше одной */
function octRenderPromoNav() {
  var live = octLivePromos();
  var many = octModalMode === 'promo' && live.length > 1;
  var media = document.getElementById('octPromoMedia');
  var dots = document.getElementById('octPromoDots');
  if (!media || !dots) return;
  media.querySelectorAll('.oct-promo-arrow').forEach(function (btn) { btn.hidden = !many; });
  dots.hidden = !many;
  dots.textContent = '';
  if (!many) return;
  var current = live.indexOf(OCT_MODAL_PRESETS.promo);
  live.forEach(function (promo, i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'oct-promo-dot' + (i === current ? ' is-active' : '');
    dot.setAttribute('aria-label', 'Акция ' + (i + 1) + ' из ' + live.length);
    if (i === current) dot.setAttribute('aria-current', 'true');
    dot.addEventListener('click', function () { octShowPromo(promo); });
    dots.appendChild(dot);
  });
}

/* Листаем по кругу */
function octStepPromo(dir) {
  var live = octLivePromos();
  if (live.length < 2) return;
  var i = live.indexOf(OCT_MODAL_PRESETS.promo);
  octShowPromo(live[(i + dir + live.length) % live.length], dir);
}

/* Переключение акции прямо в окне: телефон и согласие сохраняются */
var octPromoSwapTimer;
function octShowPromo(promo, dir) {
  if (!promo || promo === OCT_MODAL_PRESETS.promo) return;
  var img = document.getElementById('octModalBanner');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function swap() {
    OCT_MODAL_PRESETS.promo = promo;
    document.getElementById('octModalForm').style.display = '';
    document.getElementById('octModalSuccess').style.display = 'none';
    octSetStatus('octStatus', '');
    octApplyPreset();
    octRenderPromoNav();
    img.classList.remove('is-out-left', 'is-out-right');
  }

  clearTimeout(octPromoSwapTimer);
  if (reduce) { swap(); return; }
  img.classList.add(dir < 0 ? 'is-out-right' : 'is-out-left');
  octPromoSwapTimer = setTimeout(swap, 180);
}

/* Свайп по баннеру на телефоне */
document.addEventListener('touchstart', function (e) {
  var media = e.target.closest && e.target.closest('#octPromoMedia');
  if (!media) return;
  media._x = e.touches[0].clientX;
  media._y = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', function (e) {
  var media = e.target.closest && e.target.closest('#octPromoMedia');
  if (!media || media._x == null) return;
  var dx = e.changedTouches[0].clientX - media._x;
  var dy = e.changedTouches[0].clientY - media._y;
  media._x = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) octStepPromo(dx < 0 ? 1 : -1);
}, { passive: true });

/* Кнопки «акции» на сайте: пока акция идёт — её окно,
   между акциями — обычная заявка, чтобы не показать прошедшую */
function openActivePromo(source) {
  if (octPromoIsLive()) openPromoModal(source);
  else openLeadModal(source);
}

function octPromoIsLive() {
  return octLivePromos().length > 0;
}

/* localStorage, а не sessionStorage: тот живёт в пределах одной вкладки,
   и в новой вкладке окно всплыло бы снова. */
function octPromoSeen() {
  try {
    var shownAt = parseInt(localStorage.getItem(OCT_PROMO.key), 10);
    if (!shownAt) return false;
    return Date.now() - shownAt < OCT_PROMO.repeatAfterDays * 86400000;
  } catch (e) { return false; }
}

function octPromoRemember() {
  try { localStorage.setItem(OCT_PROMO.key, String(Date.now())); } catch (e) {}
}

/* Автопоказ включается страницей: window.OCT_PROMO_AUTO = true */
function octPromoAutoOpen() {
  if (!octPromoIsLive() || octPromoSeen()) return;
  var fired = false;

  /* баннер кладём в кеш заранее: окно всплывает само, ждать картинку в нём нечего */
  var warm = new Image();
  warm.src = octLivePromos()[0].banner;

  function stop() {
    window.removeEventListener('scroll', onScroll);
  }

  function fire() {
    if (fired) return;
    var overlay = document.getElementById('octModalOverlay');
    if (!overlay) return;
    /* не перебиваем форму, которую человек открыл сам */
    if (overlay.classList.contains('open')) { fired = true; stop(); return; }
    fired = true;
    stop();
    octPromoRemember();
    openPromoModal(OCT_PROMO.source);
  }

  function onScroll() {
    if (window.pageYOffset > window.innerHeight * 0.9) fire();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

if (window.OCT_PROMO_AUTO) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', octPromoAutoOpen);
  } else {
    octPromoAutoOpen();
  }
}

function closeOctModal(e) {
  if (e && e.target !== document.getElementById('octModalOverlay')) return;
  document.getElementById('octModalOverlay').classList.remove('open');
  document.body.classList.remove('oct-modal-open');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  if (octLastTrigger && octLastTrigger.focus) octLastTrigger.focus();
}

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var overlay = document.getElementById('octModalOverlay');
  if (overlay && overlay.classList.contains('open')) closeOctModal(null);
});

function submitOctModal(e) {
  if (e) e.preventDefault();

  /* Самостоятельные тренировки — записи нет, ведём в расписание групповых */
  if (octIsSelf()) {
    window.location.href = OCT_SCHEDULE_URL;
    return false;
  }

  var nameEl = document.getElementById('octName');
  var phoneEl = document.getElementById('octPhone');
  var consentEl = document.getElementById('octConsent');
  var btn = document.getElementById('octModalSubmit');
  if (!octValidate(nameEl, phoneEl, consentEl, 'octStatus')) return false;
  octGoal('form_submit_attempt');

  var preset = octPreset();
  var file = octModalMode === 'job' ? document.getElementById('octFileInput').files[0] : null;
  var member = octModalMode === 'lead' && octVisitKind === 'member';
  var trainer = member ? document.getElementById('octTrainer').value : '';
  var when = member ? document.getElementById('octWhen').value.trim() : '';

  btn.classList.add('is-sending');
  octSetStatus('octStatus', 'Отправляем…');

  var type = 'Заявка на консультацию';
  if (octModalMode === 'job') type = 'Отклик на вакансию';
  else if (octModalMode === 'promo') type = OCT_MODAL_PRESETS.promo.name;
  else if (member) type = 'Запись к тренеру (действующий клиент)';

  sendLead({
    type: type,
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    trainer: trainer,
    when: when,
    source: window.OCT_LEAD_SOURCE || '',
    website: octHp('octModalForm'),
    consent: 'да'
  }, file).then(function () {
    octGoal(preset.goal);
    document.getElementById('octModalForm').style.display = 'none';
    document.getElementById('octModalSuccess').style.display = '';
  }).catch(function () {
    octSetStatus('octStatus', window.OCT_FALLBACK_CONTACT, true);
  }).then(function () {
    btn.classList.remove('is-sending');
  });

  return false;
}

/* Подтверждение для форм, встроенных в страницу: форма уступает место
   заметной карточке — мелкая строка статуса терялась под кнопкой. */
function octInlineSuccess(formId, title, text) {
  var form = document.getElementById(formId);
  if (!form) return;
  var box = document.getElementById(formId + 'Success');
  if (!box) {
    box = document.createElement('div');
    box.className = 'form-success';
    box.id = formId + 'Success';
    box.setAttribute('role', 'status');
    box.innerHTML =
      '<div class="success-icon" aria-hidden="true">✓</div>' +
      '<h3></h3><p></p>';
    form.insertAdjacentElement('afterend', box);
  }
  box.querySelector('h3').textContent = title;
  box.querySelector('p').textContent = text;
  form.style.display = 'none';
  box.style.display = '';
  void box.offsetWidth;
  box.classList.add('is-in');
  if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ── Форма «Хотите работать с нами?» ── */
function submitJobsForm(e) {
  if (e) e.preventDefault();
  var form = document.getElementById('jobsForm');
  var nameEl = document.getElementById('jfName');
  var phoneEl = document.getElementById('jfPhone');
  var consentEl = document.getElementById('jfConsent');
  var btn = form.querySelector('.job-modal-submit');
  if (!octValidate(nameEl, phoneEl, consentEl, 'jfStatus')) return false;
  octGoal('form_submit_attempt');

  btn.classList.add('is-sending');
  octSetStatus('jfStatus', 'Отправляем…');

  sendLead({
    type: 'Отклик на вакансию',
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    source: document.getElementById('jfRole').value.trim() || 'Блок «Хотите работать с нами?»',
    website: octHp('jobsForm'),
    consent: 'да'
  }, document.getElementById('jfFile').files[0]).then(function () {
    octGoal('lead_job');
    form.classList.add('sent');
  }).catch(function () {
    octSetStatus('jfStatus', window.OCT_FALLBACK_CONTACT, true);
  }).then(function () {
    btn.classList.remove('is-sending');
  });

  return false;
}

/* ── Форма в блоке «Закажи обратный звонок» ── */
function submitCtaForm(e) {
  if (e) e.preventDefault();
  var nameEl = document.getElementById('ctaName');
  var phoneEl = document.getElementById('ctaPhone');
  var consentEl = document.getElementById('ctaConsent');
  var btn = document.getElementById('ctaSubmit');
  if (!octValidate(nameEl, phoneEl, consentEl, 'ctaStatus')) return false;
  octGoal('form_submit_attempt');

  btn.classList.add('is-sending');
  octSetStatus('ctaStatus', 'Отправляем…');

  sendLead({
    type: 'Заказ обратного звонка',
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    source: 'Форма в блоке «Закажи обратный звонок»',
    website: octHp('ctaForm'),
    consent: 'да'
  }).then(function () {
    octGoal('lead_trial');
    octSetStatus('ctaStatus', '');
    nameEl.value = ''; phoneEl.value = ''; consentEl.checked = false;
    octInlineSuccess('ctaForm', 'Заявка отправлена',
      'Мы получили заявку и перезвоним в ближайшее время.');
  }).catch(function () {
    octSetStatus('ctaStatus', window.OCT_FALLBACK_CONTACT, true);
  }).then(function () {
    btn.classList.remove('is-sending');
  });

  return false;
}

/* ── Форма под статьёй в блоге ── */
function submitArtForm(e) {
  if (e) e.preventDefault();
  var nameEl = document.getElementById('artName');
  var phoneEl = document.getElementById('artPhone');
  var consentEl = document.getElementById('artConsent');
  var btn = document.getElementById('artSubmit');
  if (!octValidate(nameEl, phoneEl, consentEl, 'artStatus')) return false;
  octGoal('form_submit_attempt');

  btn.classList.add('is-sending');
  octSetStatus('artStatus', 'Отправляем…');

  sendLead({
    type: 'Заявка на консультацию',
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    source: 'Форма под статьёй: ' + document.title,
    website: octHp('artForm'),
    consent: 'да'
  }).then(function () {
    octGoal('lead_trial');
    octSetStatus('artStatus', '');
    nameEl.value = ''; phoneEl.value = ''; consentEl.checked = false;
    octInlineSuccess('artForm', 'Заявка отправлена',
      'Мы получили заявку и перезвоним в ближайшее время.');
  }).catch(function () {
    octSetStatus('artStatus', window.OCT_FALLBACK_CONTACT, true);
  }).then(function () {
    btn.classList.remove('is-sending');
  });

  return false;
}

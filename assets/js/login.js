(function () {
  'use strict';
  var PA = window.PA, $ = PA.$, ic = PA.ic;

  var form = $('#login-form');
  var pw = $('#password'), tg = $('#toggle-pw');

  tg.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    tg.innerHTML = ic(show ? 'eye-off' : 'eye', 16);
    tg.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('#username').value, p = pw.value, ok = true;
    var eu = $('#err-username'), ep = $('#err-password');
    eu.hidden = true; ep.hidden = true;
    if (!u.trim()) { eu.textContent = 'Informe um usuário.'; eu.hidden = false; ok = false; }
    if (!p.trim()) { ep.textContent = 'Informe uma senha.'; ep.hidden = false; ok = false; }
    if (!ok) return;
    var btn = $('#login-btn');
    btn.disabled = true; btn.textContent = 'Entrando…';
    setTimeout(function () {
      PA.setSession({ username: u.trim(), loginAt: new Date().toISOString() });
      PA.queueToast('Sessão administrativa iniciada.');
      window.location.href = 'admin.html';
    }, 500);
  });
})();

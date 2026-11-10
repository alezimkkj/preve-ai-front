(function () {
  'use strict';

  var PA = window.PA;
  var $ = PA.$;
  var ic = PA.ic;

  var form = $('#login-form');
  var passwordInput = $('#password');
  var toggleButton = $('#toggle-pw');
  var usernameInput = $('#username');
  var usernameError = $('#err-username');
  var passwordError = $('#err-password');
  var submitButton = $('#login-btn');

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function hideError(element) {
    element.hidden = true;
  }

  function validate(username, password) {
    var valid = true;

    hideError(usernameError);
    hideError(passwordError);

    if (!username.trim()) {
      showError(usernameError, 'Informe um usuário.');
      valid = false;
    }

    if (!password.trim()) {
      showError(passwordError, 'Informe uma senha.');
      valid = false;
    }

    return valid;
  }

  function togglePasswordVisibility() {
    var show = passwordInput.type === 'password';

    passwordInput.type = show ? 'text' : 'password';
    toggleButton.innerHTML = ic(show ? 'eye-off' : 'eye', 16);
    toggleButton.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  }

  function handleSubmit(e) {
    e.preventDefault();

    var username = usernameInput.value;
    var password = passwordInput.value;

    if (!validate(username, password)) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Entrando…';

    setTimeout(function () {
      PA.setSession({
        username: username.trim(),
        loginAt: new Date().toISOString()
      });
      PA.queueToast('Sessão administrativa iniciada.');
      window.location.href = 'admin.html';
    }, 500);
  }

  toggleButton.addEventListener('click', togglePasswordVisibility);
  form.addEventListener('submit', handleSubmit);
})();
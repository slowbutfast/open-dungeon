let confirmResolve = null;
let toastTimer = null;

export { confirmResolve as _confirmResolve };

export function showToast(message, isError = false) {
  const toast = document.getElementById("toast-notification");
  toast.innerText = message;
  toast.classList.remove("toast-show", "toast-error");
  if (isError) toast.classList.add("toast-error");
  void toast.offsetWidth;
  toast.classList.add("toast-show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("toast-show", "toast-error");
  }, 2800);
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    document.getElementById("confirm-message").innerText = message;
    setTimeout(() => {
      document.getElementById("modal-confirm").classList.remove("hidden");
    }, 0);
  });
}
const parts = location.pathname.match(/^\/r\/([a-f0-9]{16})\/([a-f0-9]{12})\/?$/);
if (parts) {
  location.replace(`/api/r/${parts[1]}/${parts[2]}`);
} else {
  document.getElementById('redirect-status').textContent = 'This QR link is invalid.';
}

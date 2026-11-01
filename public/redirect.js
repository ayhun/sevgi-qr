const parts = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{3,43})\/([A-Za-z0-9_-]{6})\/?$/)
  || location.pathname.match(/^\/r\/([a-f0-9]{16})\/([a-f0-9]{12})\/?$/)
  || location.pathname.match(/^\/r\/([a-f0-9]{24})\/([a-f0-9]{20})\/?$/);
if (parts) {
  location.replace(`/api/r/${parts[1]}/${parts[2]}`);
} else {
  document.getElementById('redirect-status').textContent = 'This QR link is invalid.';
}

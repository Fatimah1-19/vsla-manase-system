const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

const PDF_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  body { margin: 0 !important; color: #1f2933; }
  body * { visibility: visible !important; }
  .print-area {
    position: static !important; left: auto !important; top: auto !important;
    width: auto !important; padding: 0 !important;
  }
  .no-print { display: none !important; }
  .report-head, .panel, .reports__panel, .profile__card, .loans__detail,
  table, tr, .reports__facts > div { break-inside: avoid; }
  .reports__tableWrap, .profile__card, .loans__detail {
    overflow: visible !important; max-height: none !important;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  a { color: inherit; text-decoration: none; }
`;

/**
 * Print the given report element as a standalone PDF document. The element is
 * copied into a hidden iframe, so the dashboard, navigation, filters and
 * buttons are never part of the printed report.
 */
export function exportReportAsPdf(node, { title = '' } = {}) {
  if (!node || typeof document === 'undefined') return false;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;height:1200px;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((el) => el.outerHTML)
    .join('\n');

  const clone = node.cloneNode(true);
  clone.querySelectorAll('.no-print').forEach((el) => el.remove());

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${escapeHtml(new URL('/', window.location.href).href)}">
  <title>${escapeHtml(title || document.title)}</title>
  ${styles}
  <style>${PDF_CSS}</style>
</head>
<body>${clone.outerHTML}</body>
</html>`;

  let printed = false;
  let cleaned = false;
  let finishing = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const print = () => {
    if (printed || cleaned) return;
    printed = true;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      cleanup();
    }
  };

  const finish = () => {
    if (finishing || cleaned) return;
    finishing = true;
    const images = [...doc.images];
    Promise.all(images.map((img) => (
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })
    ))).then(() => setTimeout(print, 120));
  };

  iframe.addEventListener('load', finish, { once: true });
  iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });

  doc.open();
  doc.write(html);
  doc.close();

  if (doc.readyState === 'complete') finish();
  setTimeout(finish, 900);
  setTimeout(cleanup, 60000);
  return true;
}

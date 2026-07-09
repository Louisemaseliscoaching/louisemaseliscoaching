(function () {
  var script = document.currentScript;
  var lang = (script && script.getAttribute('data-lang')) || 'fr';
  var base = 'content/';

  function fetchJSON(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Impossible de charger ' + path);
      return r.json();
    });
  }

  function applyFields(data) {
    document.querySelectorAll('[data-field]').forEach(function (el) {
      var key = el.getAttribute('data-field');
      if (Object.prototype.hasOwnProperty.call(data, key) && data[key]) {
        el.textContent = data[key];
      }
    });
  }

  function applyContact(data) {
    if (!data) return;
    document.querySelectorAll('[data-contact="email"]').forEach(function (el) { if (data.email) el.textContent = data.email; });
    document.querySelectorAll('[data-contact="email-link"]').forEach(function (el) { if (data.email) el.setAttribute('href', 'mailto:' + data.email); });
    document.querySelectorAll('[data-contact="phone"]').forEach(function (el) { if (data.phone) el.textContent = data.phone; });
    document.querySelectorAll('[data-contact="phone-link"]').forEach(function (el) { if (data.phone) el.setAttribute('href', 'tel:' + data.phone.replace(/\s+/g, '')); });
    document.querySelectorAll('[data-contact="address"]').forEach(function (el) { if (data.address) el.textContent = data.address; });
    document.querySelectorAll('[data-contact="website"]').forEach(function (el) { if (data.website) el.textContent = data.website; });
    document.querySelectorAll('[data-contact="website-link"]').forEach(function (el) {
      if (data.website) el.setAttribute('href', 'https://' + data.website.replace(/^https?:\/\//, ''));
    });
    document.querySelectorAll('[data-contact="instagram"]').forEach(function (el) { if (data.instagram) el.textContent = '@' + data.instagram.replace(/^@/, ''); });
    document.querySelectorAll('[data-contact="instagram-link"]').forEach(function (el) {
      if (data.instagram) el.setAttribute('href', 'https://instagram.com/' + data.instagram.replace(/^@/, ''));
    });
  }

  var sunIcon = '<svg width="130" height="130" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 C47 5 59 17 58 32 C57 47 45 59 30 58 C15 57 5 45 6 30 C7 16 18 5 32 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="32" r="6" fill="currentColor"/></svg>';

  function applyTestimonials(data) {
    var container = document.getElementById('testimonial-cards');
    if (!container || !data || !Array.isArray(data.items) || !data.items.length) return;
    var accentColors = ['var(--accent)', 'var(--sage)', 'var(--accent)'];
    container.innerHTML = data.items.map(function (item, i) {
      var initials = (item.author || '').trim();
      return (
        '<div style="background:var(--white); border:1px solid var(--line); border-radius:10px; padding:var(--s-4); display:flex; flex-direction:column; gap:var(--s-3);">' +
          '<blockquote class="quote" style="font-size:22px; border-left-color:' + (accentColors[i % accentColors.length]) + ';">' + item.quote + '</blockquote>' +
          '<div style="display:flex; align-items:center; gap:12px; padding-top:var(--s-2); border-top:1px solid var(--line);">' +
            '<div style="width:42px; height:42px; border-radius:50%; background:var(--argile-2); flex-shrink:0;"></div>' +
            '<div>' +
              '<div style="font-family:var(--sans); font-weight:700; font-size:14px;">' + initials + '</div>' +
              '<div style="font-size:13px; color:var(--ink-soft);">' + (item.context || '') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  Promise.all([
    fetchJSON(base + 'site-' + lang + '.json').catch(function () { return null; }),
    fetchJSON(base + 'temoignages-' + lang + '.json').catch(function () { return null; }),
    fetchJSON(base + 'contact.json').catch(function () { return null; })
  ]).then(function (results) {
    var site = results[0], temoignages = results[1], contact = results[2];
    if (site) applyFields(site);
    if (temoignages) applyTestimonials(temoignages);
    if (contact) applyContact(contact);
  });
})();

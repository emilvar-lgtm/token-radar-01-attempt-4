// Risk Radar dashboard: board, detail and live views, all from window.RADAR
// (data.js, written by main.ts). No network, no fetch: the page is static.
(function () {
  var D = window.RADAR;
  if (!D) { document.getElementById('app').textContent = 'No radar data loaded.'; return; }
  var rows = D.rows || [];
  var live = D.live || [];
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(c) {
    if (c === null || c === undefined) return '—';
    var s = (c > 0 ? '+' : '') + c.toFixed(1) + '%';
    return '<span class="growth ' + (c >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function barClass(risk) { return risk >= 70 ? 'vhigh' : risk >= 50 ? 'high' : risk >= 30 ? 'mid' : ''; }
  function riskCell(r) {
    return '<span class="riskcell"><span class="bar"><i class="' + barClass(r.risk) + '" style="width:' + r.risk + '%"></i></span><b>' + r.risk + '</b><span class="pill ' + r.risk_band + '">' + r.risk_band + '</span></span>';
  }

  // Stats + filter options.
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  var catSel = document.getElementById('f-cat');
  cats.forEach(function (c) { var o = document.createElement('option'); o.textContent = c; catSel.appendChild(o); });
  var chainSel = document.getElementById('f-chain');
  chains.forEach(function (c) { var o = document.createElement('option'); o.textContent = c; chainSel.appendChild(o); });
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + D.board_size + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + D.median_risk + '</b><span>median risk score</span></div>' +
    '<div class="stat"><b>' + D.high_risk_count + '</b><span>high-risk rows</span></div>' +
    '<div class="stat"><b>' + money(rows[0] ? rows[0].implied_value_usd : 0) + '</b><span>top implied value</span></div>';
  document.getElementById('foot').textContent = 'Snapshot ' + D.as_of + ' · floor $' + (D.floor_usd / 1e6) + 'M · model ' + D.model_version + ' · ' + D.source;

  function filtered() {
    var band = document.getElementById('f-band').value;
    var cat = catSel.value, chain = chainSel.value;
    var q = document.getElementById('f-q').value.trim().toLowerCase();
    var sort = document.getElementById('f-sort').value;
    var out = rows.filter(function (r) {
      if (band && r.risk_band !== band) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    if (sort === 'risk') out.sort(function (a, b) { return a.risk - b.risk || b.implied_value_usd - a.implied_value_usd; });
    else if (sort === 'tvl') out.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'growth') out.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else out.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    return out;
  }

  function renderBoard() {
    var list = filtered();
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols shown';
    document.getElementById('rows').innerHTML = list.map(function (r) {
      return '<tr><td>' + r.rank + '</td><td><a class="rowlink" href="#/detail/' + esc(r.slug) + '">' + esc(r.name) + '</a></td>' +
        '<td class="wrap">' + esc(r.category || '—') + '</td><td class="wrap">' + esc((r.chains || []).length > 1 ? (r.chains[0] + ' +' + ((r.chains || []).length - 1)) : ((r.chains || [])[0] || '—')) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td>' + riskCell(r) + '</td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
  }

  function factorHtml(label, value, note) {
    return '<div class="factor"><b><span>' + label + '</span><span>' + value + '</span></b>' +
      '<span class="bar"><i class="' + barClass(value) + '" style="width:' + value + '%"></i></span><p>' + note + '</p></div>';
  }

  function renderDetail(slug) {
    var r = bySlug[slug];
    var el = document.getElementById('detail');
    if (!r) { el.innerHTML = '<p>Unknown protocol.</p>'; return; }
    var f = r.risk_factors;
    var age = r.age_days === null ? 'unknown age' : r.age_days + ' days old';
    el.innerHTML =
      '<div class="detail-head"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' + riskCell(r) + '</div>' +
      '<p class="lede">' + esc(r.category || 'Uncategorised') + ' · ' + esc((r.chains || []).join(', ') || 'no chain listed') + ' · ' + age +
      ' · TVL ' + money(r.tvl_usd) + ' · 7-day change ' + (r.change_7d === null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' · implied value <strong>' + money(r.implied_value_usd) + '</strong> after a risk discount of ×' + r.risk_discount.toFixed(2) + '.</p>' +
      '<h3>Risk breakdown — composite ' + r.risk + ' (' + r.risk_band + ')</h3><div class="factors">' +
      factorHtml('Volatility', f.volatility, '7-day TVL swing, either direction.') +
      factorHtml('Youth', f.youth, 'Short track record with no token.') +
      factorHtml('Concentration', f.concentration, 'Few chains means one point of failure.') +
      factorHtml('Category', f.category, 'Some categories blow up more often.') +
      factorHtml('Size', f.size, 'Small TVL is fragile.') + '</div>' +
      '<h3>Farm plan — six steps, with cost and time</h3><ol class="steps">' +
      (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Implied value is this entry\u2019s own claim, not a prediction that a token will be issued or what it will be worth. This protocol records no token in the snapshot.</p>';
  }

  function renderLive() {
    document.getElementById('live-rows').innerHTML = live.map(function (r) {
      return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '—') + '</td><td>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
  }

  function show(view) {
    ['board', 'detail', 'live', 'model'].forEach(function (v) {
      document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view || (view === 'detail' && b.getAttribute('data-view') === 'board')); });
  }

  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/detail/') === 0) { renderDetail(h.slice(9)); show('detail'); }
    else if (h.indexOf('#/band/') === 0) {
      var band = decodeURIComponent(h.slice(7));
      document.getElementById('f-band').value = band;
      renderBoard(); show('board');
      document.getElementById('count').textContent = document.getElementById('count').textContent + ' — filtered to ' + band + ' risk';
    }
    else if (h === '#/live') { renderLive(); show('live'); }
    else if (h === '#/model') { show('model'); }
    else { renderBoard(); show('board'); }
  }

  document.querySelectorAll('.navbtn').forEach(function (b) {
    b.addEventListener('click', function () { location.hash = b.getAttribute('data-view') === 'board' ? '#/' : '#/' + b.getAttribute('data-view'); });
  });
  document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
  ['f-band', 'f-cat', 'f-chain', 'f-sort'].forEach(function (id) { document.getElementById(id).addEventListener('change', renderBoard); });
  document.getElementById('f-q').addEventListener('input', renderBoard);
  window.addEventListener('hashchange', route);
  route();
})();

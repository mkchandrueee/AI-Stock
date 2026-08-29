// Phase 1 dashboard — read-only view over the existing JSON API. No client-side
// state is invented: every number shown here came back from a fetch() call, and
// every empty/error state is rendered explicitly rather than defaulted to zero.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
function formatInr(value) {
  return `₹${inr.format(value)}`;
}
function formatDate(value) {
  return new Date(value).toLocaleString("en-IN");
}

async function getJSON(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error(`Network error reaching ${url}: ${err.message}`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.error ? ` — ${body.error}` : "";
    } catch {
      // response body wasn't JSON; fall through with no extra detail
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

function renderError(container, message) {
  container.innerHTML = "";
  container.appendChild(el(`<div class="error-state">Unable to load this data. ${escapeHtml(message)}</div>`));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- System status badges ----

async function loadSystemStatus() {
  const healthBadge = document.getElementById("badge-health");
  const auditBadge = document.getElementById("badge-audit");

  try {
    await getJSON("/health");
    healthBadge.textContent = "API: ok";
    healthBadge.className = "badge badge-ok";
  } catch (err) {
    healthBadge.textContent = "API: unreachable";
    healthBadge.className = "badge badge-error";
  }

  try {
    const result = await getJSON("/audit-log/verify");
    if (result.valid) {
      auditBadge.textContent = "Audit chain: valid";
      auditBadge.className = "badge badge-ok";
    } else {
      auditBadge.textContent = `Audit chain: broken at #${result.brokenAtId}`;
      auditBadge.className = "badge badge-error";
    }
  } catch (err) {
    auditBadge.textContent = "Audit chain: check failed";
    auditBadge.className = "badge badge-error";
  }
}

// ---- Accounts ----

async function loadAccounts() {
  const container = document.getElementById("accounts-content");
  let accounts;
  try {
    accounts = await getJSON("/accounts");
  } catch (err) {
    renderError(container, err.message);
    return;
  }

  if (accounts.length === 0) {
    container.innerHTML = "";
    container.appendChild(
      el(`<div class="empty-state">No broker accounts connected yet. Use "Connect a broker account" above to add one.</div>`),
    );
    return;
  }

  const table = el(`
    <table>
      <thead>
        <tr><th>Account</th><th>Broker</th><th>Exchanges</th><th>Products</th><th>Connected</th><th></th></tr>
      </thead>
      <tbody></tbody>
    </table>
  `);
  const tbody = table.querySelector("tbody");
  for (const account of accounts) {
    const row = el(`
      <tr class="clickable" data-account-id="${account.account_id}">
        <td>${escapeHtml(account.display_name)}</td>
        <td>${escapeHtml(account.broker)}</td>
        <td>${escapeHtml((account.exchanges || []).join(", "))}</td>
        <td>${escapeHtml((account.products || []).join(", "))}</td>
        <td>${formatDate(account.created_at)}</td>
        <td><button class="button button-danger button-small" data-disconnect="${account.account_id}">Disconnect</button></td>
      </tr>
    `);
    row.querySelector("td:first-child").addEventListener("click", () => openAccountDetail(account));
    row.querySelector("[data-disconnect]").addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (!confirm(`Disconnect ${account.display_name}? This deletes the stored session; synced data is kept.`)) return;
      try {
        await getJSON(`/accounts/${account.account_id}/session`, { method: "DELETE" });
        loadAccounts();
      } catch (err) {
        alert(`Disconnect failed: ${err.message}`);
      }
    });
    tbody.appendChild(row);
  }
  container.innerHTML = "";
  container.appendChild(table);
}

// ---- Unified portfolio ----

function renderHoldingsTable(holdings, { perAccount }) {
  if (holdings.length === 0) {
    return el(`<div class="empty-state">No holdings on record.</div>`);
  }
  const cols = perAccount
    ? "<th>Symbol</th><th>Exchange</th><th>Type</th><th>Qty</th><th>Avg price</th><th>Current value</th><th>Weight</th>"
    : "<th>Symbol</th><th>Exchange</th><th>Type</th><th>Total qty</th><th>Current value</th><th>Invested value</th><th>Weight</th><th>Accounts</th>";
  const table = el(`<table><thead><tr>${cols}</tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector("tbody");
  for (const h of holdings) {
    const row = perAccount
      ? el(`<tr>
          <td>${escapeHtml(h.tradingSymbol)}</td>
          <td>${escapeHtml(h.exchange)}</td>
          <td>${escapeHtml(h.instrumentType)}</td>
          <td>${h.quantity}</td>
          <td>${formatInr(h.averagePrice)}</td>
          <td>${formatInr(h.currentValue)}</td>
          <td>${h.weightPct.toFixed(1)}%</td>
        </tr>`)
      : el(`<tr>
          <td>${escapeHtml(h.tradingSymbol)}</td>
          <td>${escapeHtml(h.exchange)}</td>
          <td>${escapeHtml(h.instrumentType)}</td>
          <td>${h.totalQuantity}</td>
          <td>${formatInr(h.totalCurrentValue)}</td>
          <td>${formatInr(h.totalInvestedValue)}</td>
          <td>${h.weightPct.toFixed(1)}%</td>
          <td>${h.byAccount.map((a) => escapeHtml(a.accountDisplayName)).join(", ")}</td>
        </tr>`);
    tbody.appendChild(row);
  }
  return table;
}

/**
 * Renders rows into a table from a column spec: [header, valueFn]. Values are set
 * via textContent, not interpolated HTML — broker-sourced strings (symbols, native
 * status text) are untrusted input and must not be able to inject markup.
 */
function renderRowsTable(rows, columns, emptyMessage) {
  if (rows.length === 0) {
    return el(`<div class="empty-state">${escapeHtml(emptyMessage)}</div>`);
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const [header] of columns) {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const [, valueOf] of columns) {
      const td = document.createElement("td");
      td.textContent = valueOf(row);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** Findings for one reconciliation run. REQUIRES_ATTENTION is visually distinct
 * because those are the ones that blocked the write for that cycle. */
function renderFindings(findings) {
  if (findings.length === 0) {
    return el(`<div class="empty-state">No findings recorded for this run.</div>`);
  }
  const list = el(`<div class="findings-list"></div>`);
  for (const f of findings) {
    const item = el(`
      <div class="finding finding-${f.severity}">
        <div class="finding-head">
          <span class="finding-kind"></span>
          <span class="finding-severity"></span>
        </div>
        <div class="finding-details"><code></code></div>
      </div>
    `);
    item.querySelector(".finding-kind").textContent = f.kind;
    item.querySelector(".finding-severity").textContent =
      f.severity === "REQUIRES_ATTENTION" ? "needs attention" : "informational";
    item.querySelector(".finding-details code").textContent = JSON.stringify(f.details);
    list.appendChild(item);
  }
  return list;
}

/** Horizontal-bar breakdown for an ExposureBucket[] (asset-type/broker exposure) —
 * pure weight display, no return/performance figure involved. */
function renderExposure(buckets) {
  if (buckets.length === 0) {
    return el(`<div class="empty-state">No data.</div>`);
  }
  const wrapper = el(`<div class="exposure-list"></div>`);
  for (const b of buckets) {
    wrapper.appendChild(el(`
      <div class="exposure-row">
        <div class="exposure-label">${escapeHtml(b.label)}</div>
        <div class="exposure-bar-track"><div class="exposure-bar-fill" style="width:${b.pct}%"></div></div>
        <div class="exposure-pct">${b.pct.toFixed(1)}%</div>
      </div>
    `));
  }
  return wrapper;
}

function renderSummaryCards(container, cards) {
  container.innerHTML = "";
  for (const [label, value] of cards) {
    container.appendChild(el(`
      <div class="card">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
      </div>
    `));
  }
}

async function loadUnifiedPortfolio() {
  const summary = document.getElementById("portfolio-summary");
  const holdingsContainer = document.getElementById("portfolio-holdings");
  let portfolio;
  try {
    portfolio = await getJSON("/portfolio");
  } catch (err) {
    renderError(summary, err.message);
    holdingsContainer.innerHTML = "";
    return;
  }

  renderSummaryCards(summary, [
    ["Current value", formatInr(portfolio.totalCurrentValue)],
    ["Invested value", formatInr(portfolio.totalInvestedValue)],
    ["Cash", formatInr(portfolio.totalCash)],
    ["Margin used", formatInr(portfolio.totalMargin)],
    ["Holdings", String(portfolio.holdingCount)],
  ]);

  holdingsContainer.innerHTML = "";
  holdingsContainer.appendChild(renderHoldingsTable(portfolio.holdings, { perAccount: false }));

  const exposureContainer = document.getElementById("portfolio-exposure");
  exposureContainer.innerHTML = "";
  const assetTypeBlock = el(`<div class="sub-block"><h3>Asset type exposure</h3></div>`);
  assetTypeBlock.appendChild(renderExposure(portfolio.assetTypeExposure));
  const brokerBlock = el(`<div class="sub-block"><h3>Broker exposure</h3></div>`);
  brokerBlock.appendChild(renderExposure(portfolio.brokerExposure));
  exposureContainer.appendChild(assetTypeBlock);
  exposureContainer.appendChild(brokerBlock);
}

// ---- Account detail (portfolio, positions, orders, trades, reconciliation, audit) ----

/** Fetches a URL and renders it into a slot, showing the error in place rather than
 * failing the whole panel — one section's failure shouldn't blank the others. */
async function loadInto(slot, url, render) {
  try {
    const data = await getJSON(url);
    slot.innerHTML = "";
    slot.appendChild(render(data));
  } catch (err) {
    renderError(slot, err.message);
  }
}

let currentDetailAccount = null;

async function openAccountDetail(account) {
  currentDetailAccount = account;
  const section = document.getElementById("account-detail-section");
  const title = document.getElementById("account-detail-title");
  const content = document.getElementById("account-detail-content");
  section.hidden = false;
  title.textContent = `Account detail — ${account.display_name}`;
  content.innerHTML = `<div class="loading-state">Loading…</div>`;
  section.scrollIntoView({ behavior: "smooth", block: "start" });

  content.innerHTML = "";

  const portfolioBlock = el(`<div class="sub-block"><h3>Portfolio</h3><div class="portfolio-slot">Loading…</div></div>`);
  const positionsBlock = el(`<div class="sub-block"><h3>Positions</h3><div class="positions-slot">Loading…</div></div>`);
  const ordersBlock = el(`<div class="sub-block"><h3>Orders</h3><div class="orders-slot">Loading…</div></div>`);
  const tradesBlock = el(`<div class="sub-block"><h3>Trades</h3><div class="trades-slot">Loading…</div></div>`);
  const reconBlock = el(`<div class="sub-block"><h3>Reconciliation runs</h3><div class="recon-slot">Loading…</div></div>`);
  const auditBlock = el(`<div class="sub-block"><h3>Audit log</h3><div class="audit-slot">Loading…</div></div>`);
  content.appendChild(portfolioBlock);
  content.appendChild(positionsBlock);
  content.appendChild(ordersBlock);
  content.appendChild(tradesBlock);
  content.appendChild(reconBlock);
  content.appendChild(auditBlock);

  const portfolioSlot = portfolioBlock.querySelector(".portfolio-slot");
  const positionsSlot = positionsBlock.querySelector(".positions-slot");
  const ordersSlot = ordersBlock.querySelector(".orders-slot");
  const tradesSlot = tradesBlock.querySelector(".trades-slot");
  const reconSlot = reconBlock.querySelector(".recon-slot");
  const auditSlot = auditBlock.querySelector(".audit-slot");

  try {
    const portfolio = await getJSON(`/accounts/${account.account_id}/portfolio`);
    portfolioSlot.innerHTML = "";
    const cards = document.createElement("div");
    cards.className = "summary-cards";
    renderSummaryCards(cards, [
      ["Current value", formatInr(portfolio.totalCurrentValue)],
      ["Invested value", formatInr(portfolio.totalInvestedValue)],
      ["Cash", formatInr(portfolio.cash)],
      ["Margin used", formatInr(portfolio.margin)],
    ]);
    portfolioSlot.appendChild(cards);
    portfolioSlot.appendChild(renderHoldingsTable(portfolio.holdings, { perAccount: true }));
    const assetTypeBlock = el(`<div class="sub-block"><h3>Asset type exposure</h3></div>`);
    assetTypeBlock.appendChild(renderExposure(portfolio.assetTypeExposure));
    portfolioSlot.appendChild(assetTypeBlock);
  } catch (err) {
    renderError(portfolioSlot, err.message);
  }

  // Positions / orders / trades. Empty is a real, correct answer here — an account
  // with no open positions genuinely has none, so it says so rather than implying
  // something failed to load.
  await loadInto(positionsSlot, `/accounts/${account.account_id}/positions`, (rows) =>
    renderRowsTable(
      rows,
      [
        ["Symbol", (r) => r.tradingSymbol],
        ["Exchange", (r) => r.exchange],
        ["Product", (r) => r.product],
        ["Net qty", (r) => String(r.netQuantity)],
        ["Day buy", (r) => String(r.dayBuyQuantity)],
        ["Day sell", (r) => String(r.daySellQuantity)],
        ["Avg price", (r) => formatInr(r.averagePrice)],
      ],
      "No open positions.",
    ),
  );

  await loadInto(ordersSlot, `/accounts/${account.account_id}/orders`, (rows) =>
    renderRowsTable(
      rows,
      [
        ["Symbol", (r) => r.tradingSymbol],
        ["Side", (r) => r.transactionType],
        ["Qty", (r) => `${r.filledQuantity}/${r.quantity}`],
        ["Price", (r) => (r.price === null ? "—" : formatInr(r.price))],
        ["Status", (r) => r.status],
        // Broker's own status string, kept alongside the canonical one (rule 6).
        ["Broker status", (r) => r.brokerNativeStatus],
        ["Origin", (r) => r.origin],
        ["Placed", (r) => formatDate(r.placedAt)],
      ],
      "No orders on record.",
    ),
  );

  await loadInto(tradesSlot, `/accounts/${account.account_id}/trades`, (rows) =>
    renderRowsTable(
      rows,
      [
        ["Symbol", (r) => r.tradingSymbol],
        ["Side", (r) => r.transactionType],
        ["Qty", (r) => String(r.quantity)],
        ["Price", (r) => formatInr(r.price)],
        ["Traded at", (r) => formatDate(r.tradedAt)],
      ],
      "No trades on record.",
    ),
  );

  try {
    const runs = await getJSON(`/accounts/${account.account_id}/reconciliation-runs`);
    if (runs.length === 0) {
      reconSlot.innerHTML = "";
      reconSlot.appendChild(el(`<div class="empty-state">No reconciliation runs recorded yet.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>Trigger</th><th>Started</th><th>Completed</th><th>Status</th><th>Findings</th></tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tbody = table.querySelector("tbody");
      for (const run of runs) {
        const total = run.requiresAttentionCount + run.informationalCount;
        const findingLabel =
          total === 0
            ? "none"
            : run.requiresAttentionCount > 0
              ? `${run.requiresAttentionCount} needs attention` +
                (run.informationalCount > 0 ? `, ${run.informationalCount} info` : "")
              : `${run.informationalCount} info`;

        const row = el(`
          <tr${total > 0 ? ' class="clickable"' : ""}>
            <td>${escapeHtml(run.trigger)}</td>
            <td>${formatDate(run.started_at)}</td>
            <td>${run.completed_at ? formatDate(run.completed_at) : "—"}</td>
            <td><span class="status-tag status-${run.status}">${escapeHtml(run.status)}</span></td>
            <td>${escapeHtml(findingLabel)}${total > 0 ? ' <span class="expand-hint">▸</span>' : ""}</td>
          </tr>
        `);
        tbody.appendChild(row);

        // Findings load on demand, into a row inserted directly beneath this one —
        // a run list with every run's findings inlined would bury the runs.
        if (total > 0) {
          let detailRow = null;
          row.addEventListener("click", async () => {
            if (detailRow) {
              detailRow.remove();
              detailRow = null;
              row.querySelector(".expand-hint").textContent = "▸";
              return;
            }
            detailRow = el(`<tr><td colspan="5"><div class="findings-slot">Loading…</div></td></tr>`);
            row.after(detailRow);
            row.querySelector(".expand-hint").textContent = "▾";
            await loadInto(
              detailRow.querySelector(".findings-slot"),
              `/reconciliation-runs/${run.run_id}/findings`,
              (findings) => renderFindings(findings),
            );
          });
        }
      }
      reconSlot.innerHTML = "";
      reconSlot.appendChild(table);
    }
  } catch (err) {
    renderError(reconSlot, err.message);
  }

  try {
    const entries = await getJSON(`/accounts/${account.account_id}/audit-log`);
    if (entries.length === 0) {
      auditSlot.innerHTML = "";
      auditSlot.appendChild(el(`<div class="empty-state">No audit log entries for this account.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>#</th><th>Event</th><th>Details</th><th>When</th></tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tbody = table.querySelector("tbody");
      for (const entry of entries) {
        tbody.appendChild(el(`
          <tr>
            <td>${entry.audit_log_id}</td>
            <td>${escapeHtml(entry.event_type)}</td>
            <td><code>${escapeHtml(JSON.stringify(entry.details))}</code></td>
            <td>${formatDate(entry.created_at)}</td>
          </tr>
        `));
      }
      auditSlot.innerHTML = "";
      auditSlot.appendChild(table);
    }
  } catch (err) {
    renderError(auditSlot, err.message);
  }
}

// ---- Screener ----
//
// The user builds the filter here; nothing in this UI ranks or suggests instruments.
// Results are listed in the order the engine returned them (input order), and skipped
// instruments are shown with their reason rather than quietly missing.

const selectedInstruments = new Map(); // instrumentId -> {tradingSymbol, exchange}
const criteria = [];

const INDICATORS = ["CLOSE", "RSI", "SMA", "EMA", "DISTANCE_FROM_SMA_PCT"];
const OPERATORS = [
  ["LT", "<"],
  ["LTE", "≤"],
  ["GT", ">"],
  ["GTE", "≥"],
];

function renderSelectedInstruments() {
  const container = document.getElementById("selected-instruments");
  container.innerHTML = "";
  if (selectedInstruments.size === 0) {
    container.appendChild(el(`<div class="empty-state">No instruments selected yet.</div>`));
    return;
  }
  for (const [id, info] of selectedInstruments) {
    const chip = el(`<span class="chip"><span class="chip-label"></span> <button class="chip-remove">×</button></span>`);
    chip.querySelector(".chip-label").textContent = `${info.tradingSymbol} · ${info.exchange}`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      selectedInstruments.delete(id);
      renderSelectedInstruments();
    });
    container.appendChild(chip);
  }
}

let searchTimer = null;
document.getElementById("instrument-search").addEventListener("input", (evt) => {
  const q = evt.target.value.trim();
  const results = document.getElementById("search-results");
  clearTimeout(searchTimer);
  if (q.length < 2) {
    results.hidden = true;
    return;
  }
  // Debounced: this queries a 155k-row table on every keystroke otherwise.
  searchTimer = setTimeout(async () => {
    try {
      const rows = await getJSON(`/instruments/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = "";
      if (rows.length === 0) {
        results.appendChild(el(`<div class="empty-state">No match.</div>`));
      } else {
        for (const row of rows) {
          const item = el(`<div class="search-result"></div>`);
          item.textContent = `${row.tradingSymbol} · ${row.exchange} · ${row.instrumentType}`;
          item.addEventListener("click", () => {
            if (selectedInstruments.size >= 25 && !selectedInstruments.has(row.instrumentId)) {
              alert("At most 25 instruments per run — the broker's rate limit makes larger runs impractically slow.");
              return;
            }
            selectedInstruments.set(row.instrumentId, {
              tradingSymbol: row.tradingSymbol,
              exchange: row.exchange,
            });
            renderSelectedInstruments();
            results.hidden = true;
            document.getElementById("instrument-search").value = "";
          });
          results.appendChild(item);
        }
      }
      results.hidden = false;
    } catch (err) {
      results.innerHTML = "";
      results.appendChild(el(`<div class="error-state">${escapeHtml(err.message)}</div>`));
      results.hidden = false;
    }
  }, 250);
});

function renderCriteria() {
  const container = document.getElementById("criteria-list");
  container.innerHTML = "";
  if (criteria.length === 0) {
    container.appendChild(el(`<div class="empty-state">No criteria yet — add at least one.</div>`));
    return;
  }
  criteria.forEach((criterion, index) => {
    const row = el(`
      <div class="criterion-row">
        <select class="c-indicator"></select>
        <input type="number" class="c-period" placeholder="period" />
        <select class="c-operator"></select>
        <input type="number" class="c-value" step="any" />
        <button class="button button-danger button-small c-remove">Remove</button>
      </div>
    `);

    const indicatorSelect = row.querySelector(".c-indicator");
    for (const name of INDICATORS) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === criterion.indicator) option.selected = true;
      indicatorSelect.appendChild(option);
    }
    const operatorSelect = row.querySelector(".c-operator");
    for (const [value, label] of OPERATORS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (value === criterion.operator) option.selected = true;
      operatorSelect.appendChild(option);
    }

    const periodInput = row.querySelector(".c-period");
    // CLOSE is the one indicator with no period; hide it rather than accept a value
    // the server would reject.
    periodInput.hidden = criterion.indicator === "CLOSE";
    periodInput.value = criterion.period ?? "";

    const valueInput = row.querySelector(".c-value");
    valueInput.value = criterion.value;

    indicatorSelect.addEventListener("change", (e) => {
      criterion.indicator = e.target.value;
      if (criterion.indicator === "CLOSE") delete criterion.period;
      else if (criterion.period === undefined) criterion.period = 14;
      renderCriteria();
    });
    periodInput.addEventListener("input", (e) => {
      criterion.period = e.target.value === "" ? undefined : Number(e.target.value);
    });
    operatorSelect.addEventListener("change", (e) => {
      criterion.operator = e.target.value;
    });
    valueInput.addEventListener("input", (e) => {
      criterion.value = Number(e.target.value);
    });
    row.querySelector(".c-remove").addEventListener("click", () => {
      criteria.splice(index, 1);
      renderCriteria();
    });

    container.appendChild(row);
  });
}

document.getElementById("add-criterion").addEventListener("click", () => {
  criteria.push({ indicator: "RSI", period: 14, operator: "LT", value: 30 });
  renderCriteria();
});

document.getElementById("run-screen").addEventListener("click", async () => {
  const results = document.getElementById("screen-results");
  if (selectedInstruments.size === 0 || criteria.length === 0) {
    results.innerHTML = "";
    results.appendChild(el(`<div class="error-state">Select at least one instrument and one criterion.</div>`));
    return;
  }

  const accounts = await getJSON("/accounts").catch(() => []);
  if (accounts.length === 0) {
    results.innerHTML = "";
    results.appendChild(el(`<div class="error-state">No connected account — a screen uses your broker session for prices.</div>`));
    return;
  }

  const count = selectedInstruments.size;
  results.innerHTML = "";
  results.appendChild(
    el(`<div class="loading-state">Running — fetching ${count} instrument${count === 1 ? "" : "s"} sequentially at the broker's rate limit, roughly ${Math.ceil(count * 1.2)}s…</div>`),
  );

  try {
    const outcome = await getJSON(`/accounts/${accounts[0].account_id}/screener/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrumentIds: [...selectedInstruments.keys()],
        criteria,
        interval: "ONE_DAY",
        lookbackDays: 60,
      }),
    });
    renderScreenResults(results, outcome);
  } catch (err) {
    renderError(results, err.message);
  }
});

function renderScreenResults(container, outcome) {
  container.innerHTML = "";
  const { result, requestedCount } = outcome;

  const summary = el(`<div class="sub-block"><h3>Results</h3><div class="screen-summary"></div></div>`);
  summary.querySelector(".screen-summary").textContent =
    `${result.matches.length} matched of ${result.evaluatedCount} evaluated ` +
    `(${requestedCount} requested, ${result.skipped.length} skipped)`;
  container.appendChild(summary);

  if (result.matches.length > 0) {
    // Column set is derived from the criteria actually used, so every number shown
    // traces to something the user asked for.
    const valueKeys = Object.keys(result.matches[0].values);
    const columns = [
      ["Symbol", (r) => r.tradingSymbol],
      ["Exchange", (r) => r.exchange],
      ...valueKeys.map((key) => [key, (r) => (r.values[key] ?? 0).toFixed(2)]),
    ];
    container.appendChild(renderRowsTable(result.matches, columns, "No matches."));
  } else {
    container.appendChild(el(`<div class="empty-state">No instrument matched every criterion.</div>`));
  }

  if (result.skipped.length > 0) {
    const skipBlock = el(`<div class="sub-block"><h3>Skipped — could not be evaluated</h3></div>`);
    skipBlock.appendChild(
      renderRowsTable(
        result.skipped,
        [
          ["Symbol", (r) => r.tradingSymbol],
          ["Reason", (r) => r.reason],
        ],
        "None.",
      ),
    );
    container.appendChild(skipBlock);
  }
}

renderSelectedInstruments();
renderCriteria();

document.getElementById("close-account-detail").addEventListener("click", () => {
  document.getElementById("account-detail-section").hidden = true;
  currentDetailAccount = null;
});

async function refreshAll() {
  const button = document.getElementById("refresh-all");
  button.classList.add("spinning");
  const tasks = [loadSystemStatus(), loadAccounts(), loadUnifiedPortfolio()];
  if (currentDetailAccount) tasks.push(openAccountDetail(currentDetailAccount));
  await Promise.all(tasks);
  setTimeout(() => button.classList.remove("spinning"), 600);
}

document.getElementById("refresh-all").addEventListener("click", refreshAll);

loadSystemStatus();
loadAccounts();
loadUnifiedPortfolio();

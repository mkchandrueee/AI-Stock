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

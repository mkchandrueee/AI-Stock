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
    ? "<th>Symbol</th><th>Exchange</th><th>Type</th><th>Qty</th><th>Avg price</th><th>Current value</th>"
    : "<th>Symbol</th><th>Exchange</th><th>Type</th><th>Total qty</th><th>Current value</th><th>Invested value</th><th>Accounts</th>";
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
        </tr>`)
      : el(`<tr>
          <td>${escapeHtml(h.tradingSymbol)}</td>
          <td>${escapeHtml(h.exchange)}</td>
          <td>${escapeHtml(h.instrumentType)}</td>
          <td>${h.totalQuantity}</td>
          <td>${formatInr(h.totalCurrentValue)}</td>
          <td>${formatInr(h.totalInvestedValue)}</td>
          <td>${h.byAccount.map((a) => escapeHtml(a.accountDisplayName)).join(", ")}</td>
        </tr>`);
    tbody.appendChild(row);
  }
  return table;
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
}

// ---- Account detail (portfolio, reconciliation runs, audit log) ----

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
  const reconBlock = el(`<div class="sub-block"><h3>Reconciliation runs</h3><div class="recon-slot">Loading…</div></div>`);
  const auditBlock = el(`<div class="sub-block"><h3>Audit log</h3><div class="audit-slot">Loading…</div></div>`);
  content.appendChild(portfolioBlock);
  content.appendChild(reconBlock);
  content.appendChild(auditBlock);

  const portfolioSlot = portfolioBlock.querySelector(".portfolio-slot");
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
  } catch (err) {
    renderError(portfolioSlot, err.message);
  }

  try {
    const runs = await getJSON(`/accounts/${account.account_id}/reconciliation-runs`);
    if (runs.length === 0) {
      reconSlot.innerHTML = "";
      reconSlot.appendChild(el(`<div class="empty-state">No reconciliation runs recorded yet.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>Trigger</th><th>Started</th><th>Completed</th><th>Status</th></tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tbody = table.querySelector("tbody");
      for (const run of runs) {
        tbody.appendChild(el(`
          <tr>
            <td>${escapeHtml(run.trigger)}</td>
            <td>${formatDate(run.started_at)}</td>
            <td>${run.completed_at ? formatDate(run.completed_at) : "—"}</td>
            <td><span class="status-tag status-${run.status}">${escapeHtml(run.status)}</span></td>
          </tr>
        `));
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

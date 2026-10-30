// ========== CONFIG ==========
const SUPABASE_URL = "https://klkqhllylooezrohnpdh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsa3FobGx5bG9vZXpyb2hucGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTQ1MzksImV4cCI6MjEwODk3MDUzOX0.vRQkIr2EmGN3K20bLvgWlQShyUsizIVzG3r-VugIBTc";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CURRENCY = "₦";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function money(n) {
  return (
    CURRENCY +
    Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })
  );
}
function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  $("#toastStack").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ========== VIEW SWITCHING ==========
function switchView(name) {
  $$(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === name),
  );
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${name}`).classList.remove("hidden");
  const titles = {
    dashboard: ["Dashboard", "Your business at a glance"],
    transactions: ["Transactions", "Search history"],
    reports: ["Reports", "Monthly summary"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
  if (name === "transactions") loadTransactions();
  if (name === "reports") loadReports();
}
$$(".nav-item").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    switchView(el.dataset.view);
  }),
);

// ========== DASHBOARD ==========
async function loadDashboard() {
  const dateStr = $("#dashboardDate").value || todayISO();
  const monthStr = dateStr.slice(0, 7);

  const { data: dayData } = await supabase
    .from("sales_transactions")
    .select("*")
    .eq("transaction_date", dateStr)
    .order("created_at", { ascending: false });
  const { data: monthData } = await supabase
    .from("sales_transactions")
    .select("*")
    .gte("transaction_date", monthStr + "-01")
    .lte("transaction_date", monthStr + "-31");

  const daySales = (dayData || []).reduce(
    (s, t) => s + Number(t.total_amount),
    0,
  );
  const dayProfit = (dayData || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );
  const monthSales = (monthData || []).reduce(
    (s, t) => s + Number(t.total_amount),
    0,
  );
  const monthProfit = (monthData || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );

  $("#statSales").textContent = money(daySales);
  $("#statProfit").textContent = money(dayProfit);
  $("#statMonthSales").textContent = money(monthSales);
  $("#statMonthProfit").textContent = money(monthProfit);

  renderRecent(dayData || []);
}

function renderRecent(list) {
  const tbody = $("#recentTable tbody");
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No transactions yet</td></tr>';
    return;
  }
  list.slice(0, 8).forEach((t) => {
    const profit = (t.selling_price - t.cost_price) * t.quantity;
    tbody.innerHTML += `<tr>
      <td>${t.product_name}</td>
      <td>${t.customer_name || "—"}</td>
      <td>${money(t.total_amount)}</td>
      <td class="text-green">${money(profit)}</td>
      <td><button class="btn-receipt" data-id="${t.id}">Receipt</button></td>
    </tr>`;
  });
  $$(".btn-receipt").forEach((b) =>
    b.addEventListener("click", () => openReceipt(b.dataset.id)),
  );
}

// ========== TRANSACTIONS ==========
async function loadTransactions() {
  let query = supabase
    .from("sales_transactions")
    .select("*")
    .order("transaction_date", { ascending: false });
  const dateFilter = $("#txnDate").value;
  const searchFilter = $("#txnSearch").value.trim();
  if (dateFilter) query = query.eq("transaction_date", dateFilter);
  if (searchFilter)
    query = query.or(
      `product_name.ilike.%${searchFilter}%,customer_name.ilike.%${searchFilter}%`,
    );

  const { data } = await query;
  const tbody = $("#txnTable tbody");
  tbody.innerHTML = "";
  if (!data || !data.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No results</td></tr>';
    return;
  }
  data.forEach((t) => {
    const profit = (t.selling_price - t.cost_price) * t.quantity;
    tbody.innerHTML += `<tr>
      <td>${t.transaction_date}</td>
      <td>${t.product_name}</td>
      <td>${t.customer_name || "—"}</td>
      <td>${money(t.total_amount)}</td>
      <td class="text-green">${money(profit)}</td>
      <td><button class="btn-receipt" data-id="${t.id}">Receipt</button></td>
    </tr>`;
  });
  $$(".btn-receipt").forEach((b) =>
    b.addEventListener("click", () => openReceipt(b.dataset.id)),
  );
}
$("#txnSearch")?.addEventListener("input", loadTransactions);
$("#txnDate")?.addEventListener("change", loadTransactions);

// ========== REPORTS ==========
async function loadReports() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data } = await supabase
    .from("sales_transactions")
    .select("*")
    .gte("transaction_date", monthStr + "-01")
    .lte("transaction_date", monthStr + "-31");
  const sales = (data || []).reduce((s, t) => s + Number(t.total_amount), 0);
  const profit = (data || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );
  $("#rSales").textContent = money(sales);
  $("#rProfit").textContent = money(profit);
  $("#rCount").textContent = (data || []).length;
}

// ========== NEW TRANSACTION ==========
$("#openNewTxn").addEventListener("click", () =>
  $("#txnModal").classList.remove("hidden"),
);
$("#closeModal").addEventListener("click", () =>
  $("#txnModal").classList.add("hidden"),
);
$("#cancelTxn").addEventListener("click", () =>
  $("#txnModal").classList.add("hidden"),
);

$("#txnForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    toast("Please log in first", "error");
    return;
  }

  const payload = {
    user_id: user.id,
    product_name: fd.get("product_name"),
    quantity: Number(fd.get("quantity")),
    cost_price: Number(fd.get("cost_price")),
    selling_price: Number(fd.get("selling_price")),
    customer_name: fd.get("customer_name") || null,
    customer_phone: fd.get("customer_phone") || null,
    customer_email: fd.get("customer_email") || null,
  };

  const { error } = await supabase.from("sales_transactions").insert(payload);
  if (error) {
    toast("Save failed: " + error.message, "error");
    return;
  }
  toast("Sale recorded!");
  form.reset();
  $("#txnModal").classList.add("hidden");
  loadDashboard();
});

// Live profit preview
$("#txnForm").addEventListener("input", () => {
  const fd = new FormData($("#txnForm"));
  const qty = Number(fd.get("quantity")) || 0;
  const cost = Number(fd.get("cost_price")) || 0;
  const sell = Number(fd.get("selling_price")) || 0;
  $("#liveProfit").textContent = money((sell - cost) * qty);
});

// ========== RECEIPT + WHATSAPP ==========
let currentReceiptTxn = null;

async function openReceipt(id) {
  const { data } = await supabase
    .from("sales_transactions")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) return;
  currentReceiptTxn = data;
  const profit = (data.selling_price - data.cost_price) * data.quantity;
  $("#receiptSummary").innerHTML = `
    <strong>${data.product_name}</strong> × ${data.quantity}<br>
    Total: ${money(data.total_amount)} · Profit: <span class="text-green">${money(profit)}</span><br>
    Customer: ${data.customer_name || "Walk-in"}
  `;
  $("#receiptModal").classList.remove("hidden");
}

$("#closeReceipt").addEventListener("click", () =>
  $("#receiptModal").classList.add("hidden"),
);

// Generate PDF (using pdf-gen-js)
async function generateReceiptPDF(txn) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("LEDGERLY STORE", 40, 60);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Sales Receipt", 40, 82);
  doc.text("Receipt #: " + txn.id.slice(0, 8), 40, 98);
  doc.text("Date: " + txn.transaction_date, 40, 114);

  doc.setDrawColor(220);
  doc.line(40, 130, 555, 130);

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Item", 40, 154);
  doc.text("Qty", 350, 154);
  doc.text("Price", 420, 154);
  doc.text("Total", 490, 154);

  doc.setFontSize(11);
  doc.text(String(txn.product_name), 40, 178);
  doc.text(String(txn.quantity), 350, 178);
  doc.text(Number(txn.selling_price).toFixed(2), 420, 178);
  doc.text(Number(txn.total_amount).toFixed(2), 490, 178);

  doc.line(40, 200, 555, 200);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Total:", 420, 224);
  doc.text("NGN " + Number(txn.total_amount).toLocaleString(), 490, 224);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Thank you for your purchase!", 40, 270);

  return doc.output("blob");
}

async function uploadReceiptAndGetUrl(txn) {
  const blob = await generateReceiptPDF(txn);
  const path = `receipts/${txn.id}.pdf`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("receipts").getPublicUrl(path);
  return data.publicUrl;
}

// Send via WhatsApp (calls Edge Function)
$("#sendWhatsapp").addEventListener("click", async () => {
  if (!currentReceiptTxn?.customer_phone) {
    toast("Customer phone number missing", "error");
    return;
  }
  try {
    toast("Generating receipt...");
    const url = await uploadReceiptAndGetUrl(currentReceiptTxn);
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone: currentReceiptTxn.customer_phone,
        receiptUrl: url,
        name: currentReceiptTxn.customer_name || "Customer",
      },
    });
    if (error) throw error;
    toast("Receipt sent to WhatsApp!");
    $("#receiptModal").classList.add("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
});

// Send via Email (calls Edge Function)
$("#sendEmail").addEventListener("click", async () => {
  if (!currentReceiptTxn?.customer_email) {
    toast("Customer email missing", "error");
    return;
  }
  try {
    toast("Generating receipt...");
    const url = await uploadReceiptAndGetUrl(currentReceiptTxn);
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        to: currentReceiptTxn.customer_email,
        name: currentReceiptTxn.customer_name || "Customer",
        receiptUrl: url,
      },
    });
    if (error) throw error;
    toast("Receipt sent to email!");
    $("#receiptModal").classList.add("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
});

// ========== INIT ==========
$("#dashboardDate").value = todayISO();
$("#dashboardDate").addEventListener("change", loadDashboard);

// Login (simplified: anonymous sign-in for demo; production should use proper auth)
(async () => {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    const { error } = await db.auth.signInAnonymously();
    if (error) toast("Login failed: " + error.message, "error");
  }
  loadDashboard();
})();

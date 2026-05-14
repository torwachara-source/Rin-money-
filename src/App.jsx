import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

const formatThaiDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const calcInterest = (principal, ratePercent) => {
  if (!principal || !ratePercent) return 0;
  return parseFloat((Number(principal) * Number(ratePercent) / 100).toFixed(2));
};

const getStatusLabel = (dueDate) => {
  if (!dueDate) return "ไม่ระบุ";
  const today = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "เกินกำหนด";
  if (diffDays <= 7) return "ใกล้ครบ";
  return "ปกติ";
};

const StatusBadge = ({ dueDate }) => {
  const label = getStatusLabel(dueDate);
  const cls = label === "เกินกำหนด" ? "badge-overdue" : label === "ใกล้ครบ" ? "badge-warn" : label === "ปกติ" ? "badge-ok" : "badge-none";
  return <span className={`badge ${cls}`}>{label}</span>;
};

const emptyForm = { name: "", principal: "", rate: "", loanDate: "2026-04-28", dueDate: "", note: "" };

export default function LoanTracker() {
  // Initialize from localStorage or use default data
  const [loans, setLoans] = useState(() => {
    try {
      const saved = localStorage.getItem('rin-money-loans');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
    }
    // Default data
    return [
      { id: 1, name: "สมชาย ใจดี", principal: 10000, rate: 5, loanDate: "2026-04-28", dueDate: "2026-07-28", note: "กู้ฉุกเฉิน" }
    ];
  });

  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("loanDate");
  const [filterStatus, setFilterStatus] = useState("all");
  const [exporting, setExporting] = useState(false);

  // Save to localStorage whenever loans change
  useEffect(() => {
    try {
      localStorage.setItem('rin-money-loans', JSON.stringify(loans));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [loans]);

  const getStatus = (dueDate) => {
    if (!dueDate) return "none";
    const today = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "overdue";
    if (diff <= 7) return "warn";
    return "ok";
  };

  const filtered = useMemo(() => {
    return loans
      .filter(l => {
        const matchSearch = l.name.toLowerCase().includes(search.toLowerCase());
        const status = getStatus(l.dueDate);
        const matchStatus = filterStatus === "all" || status === filterStatus;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        if (sortKey === "loanDate") return new Date(b.loanDate) - new Date(a.loanDate);
        if (sortKey === "principal") return b.principal - a.principal;
        if (sortKey === "name") return a.name.localeCompare(b.name);
        return 0;
      });
  }, [loans, search, sortKey, filterStatus]);

  const totals = useMemo(() => {
    const totalPrincipal = loans.reduce((s, l) => s + Number(l.principal), 0);
    const totalInterest = loans.reduce((s, l) => s + calcInterest(l.principal, l.rate), 0);
    return { totalPrincipal, totalInterest, total: totalPrincipal + totalInterest };
  }, [loans]);

  const handleSubmit = () => {
    if (!form.name || !form.principal || !form.rate || !form.loanDate) { alert("กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return; }
    const entry = { ...form, principal: Number(form.principal), rate: Number(form.rate) };
    if (editId !== null) {
      setLoans(loans.map(l => l.id === editId ? { ...entry, id: editId } : l));
      setEditId(null);
    } else {
      setLoans([...loans, { ...entry, id: Date.now() }]);
    }
    setForm(emptyForm); setShowForm(false);
  };

  const handleEdit = (loan) => { setForm({ ...loan }); setEditId(loan.id); setShowForm(true); };
  const handleDelete = (id) => { if (confirm("ยืนยันการลบรายการนี้?")) setLoans(loans.filter(l => l.id !== id)); };

  // ── Export Excel ──
  const exportExcel = () => {
    const rows = loans.map(l => {
      const interest = calcInterest(l.principal, l.rate);
      return {
        "ชื่อ - นามสกุล": l.name,
        "เงินต้น (บาท)": l.principal,
        "อัตราดอก (%)": l.rate,
        "วันที่ยืม": formatThaiDate(l.loanDate),
        "กำหนดคืน": l.dueDate ? formatThaiDate(l.dueDate) : "-",
        "ดอกเบี้ย (บาท)": interest,
        "ยอดรวม (บาท)": l.principal + interest,
        "สถานะ": getStatusLabel(l.dueDate),
        "หมายเหตุ": l.note || "-",
      };
    });
    // Summary row
    rows.push({});
    rows.push({
      "ชื่อ - นามสกุล": "รวมทั้งหมด",
      "เงินต้น (บาท)": totals.totalPrincipal,
      "อัตราดอก (%)": "",
      "วันที่ยืม": "",
      "กำหนดคืน": "",
      "ดอกเบี้ย (บาท)": totals.totalInterest,
      "ยอดรวม (บาท)": totals.total,
      "สถานะ": "",
      "หมายเหตุ": "",
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "บัญชียืมเงิน");
    XLSX.writeFile(wb, `บัญชียืมเงิน_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Export PDF (print-based) ──
  const exportPDF = () => {
    setExporting(true);
    setTimeout(() => {
      const today = new Date();
      const dateStr = formatThaiDate(today.toISOString().slice(0, 10));
      const rows = loans.map(l => {
        const interest = calcInterest(l.principal, l.rate);
        const total = l.principal + interest;
        const status = getStatusLabel(l.dueDate);
        const statusColor = status === "เกินกำหนด" ? "#ef4444" : status === "ใกล้ครบ" ? "#f59e0b" : status === "ปกติ" ? "#22c55e" : "#6b7280";
        return `
          <tr>
            <td>${l.name}</td>
            <td class="num">฿${Number(l.principal).toLocaleString()}</td>
            <td class="num">${l.rate}%</td>
            <td>${formatThaiDate(l.loanDate)}</td>
            <td>${l.dueDate ? formatThaiDate(l.dueDate) : "-"}</td>
            <td class="num" style="color:#b45309">฿${interest.toLocaleString("th-TH",{minimumFractionDigits:2})}</td>
            <td class="num total">฿${total.toLocaleString("th-TH",{minimumFractionDigits:2})}</td>
            <td><span style="color:${statusColor};font-weight:600">${status}</span></td>
            <td style="color:#6b7280;font-size:11px">${l.note || "-"}</td>
          </tr>`;
      }).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <title>บัญชียืมเงิน</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Sarabun', sans-serif; color: #1f2937; background: #fff; padding: 32px; font-size: 13px; }
          .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #d4af6f; padding-bottom: 16px; }
          .doc-title { font-size: 22px; font-weight: 700; color: #92400e; }
          .doc-date { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
          .stat { background: #fef9f0; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; text-align: center; }
          .stat-label { font-size: 10px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .stat-value { font-size: 16px; font-weight: 700; color: #1f2937; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #92400e; color: #fff; padding: 9px 10px; text-align: left; font-weight: 600; font-size: 11px; }
          td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
          tr:nth-child(even) td { background: #fafafa; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .total { font-weight: 700; color: #166534; }
          .summary-row td { background: #fef3c7 !important; font-weight: 700; border-top: 2px solid #d4af6f; }
          .footer { margin-top: 20px; font-size: 11px; color: #9ca3af; text-align: right; }
          @media print { body { padding: 0; } @page { margin: 20mm; } }
        </style>
      </head><body>
        <div class="doc-header">
          <div><div class="doc-title">📒 บัญชียืมเงิน</div><div class="doc-date">วันที่พิมพ์: ${dateStr}</div></div>
          <div style="text-align:right;font-size:12px;color:#6b7280">จำนวน ${loans.length} รายการ</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-label">รายการทั้งหมด</div><div class="stat-value">${loans.length} รายการ</div></div>
          <div class="stat"><div class="stat-label">เงินต้นรวม</div><div class="stat-value">฿${totals.totalPrincipal.toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">ดอกเบี้ยรวม</div><div class="stat-value" style="color:#dc2626">฿${totals.totalInterest.toLocaleString("th-TH",{minimumFractionDigits:2})}</div></div>
          <div class="stat"><div class="stat-label">ยอดรวมทั้งสิ้น</div><div class="stat-value" style="color:#166534">฿${totals.total.toLocaleString("th-TH",{minimumFractionDigits:2})}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>ชื่อ - นามสกุล</th><th style="text-align:right">เงินต้น</th><th style="text-align:right">ดอก/ครั้ง</th>
            <th>วันที่ยืม</th><th>กำหนดคืน</th><th style="text-align:right">ดอกเบี้ย</th>
            <th style="text-align:right">ยอดรวม</th><th>สถานะ</th><th>หมายเหตุ</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="summary-row">
              <td>รวมทั้งหมด</td>
              <td class="num">฿${totals.totalPrincipal.toLocaleString()}</td>
              <td></td><td></td><td></td>
              <td class="num" style="color:#b45309">฿${totals.totalInterest.toLocaleString("th-TH",{minimumFractionDigits:2})}</td>
              <td class="num total">฿${totals.total.toLocaleString("th-TH",{minimumFractionDigits:2})}</td>
              <td></td><td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">สร้างโดย บัญชียืมเงิน • ${dateStr}</div>
        <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
      </body></html>`;

      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();
      setExporting(false);
    }, 100);
  };

  const previewInterest = calcInterest(form.principal, form.rate);
  const previewTotal = Number(form.principal || 0) + previewInterest;

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", minHeight: "100vh", background: "#0f1117", color: "#e8e3d8" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .header { background: linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%); border-bottom: 1px solid #2a3045; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .header-title { font-family: 'Playfair Display', serif; font-size: 26px; color: #d4af6f; letter-spacing: 0.5px; }
        .header-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-primary { background: linear-gradient(135deg, #d4af6f, #b8934a); color: #0f1117; border: none; padding: 10px 20px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; white-space: nowrap; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-ghost { background: transparent; border: 1px solid #2a3045; color: #9ca3af; padding: 8px 16px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .btn-ghost:hover { border-color: #d4af6f; color: #d4af6f; }
        .btn-excel { background: transparent; border: 1px solid #166534; color: #4ade80; padding: 8px 16px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .btn-excel:hover { background: #052e16; }
        .btn-pdf { background: transparent; border: 1px solid #7f1d1d; color: #f87171; padding: 8px 16px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .btn-pdf:hover { background: #450a0a; }
        .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 32px; }
        .stat-card { background: #1a1f2e; border: 1px solid #2a3045; border-radius: 12px; padding: 20px; }
        .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .stat-value { font-size: 22px; font-weight: 700; color: #d4af6f; }
        .stat-value.green { color: #4ade80; }
        .stat-value.amber { color: #fbbf24; }
        .toolbar { padding: 0 32px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .search-input { background: #1a1f2e; border: 1px solid #2a3045; color: #e8e3d8; padding: 9px 14px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 14px; width: 220px; outline: none; }
        .search-input:focus { border-color: #d4af6f; }
        .select-input { background: #1a1f2e; border: 1px solid #2a3045; color: #9ca3af; padding: 9px 12px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 13px; outline: none; cursor: pointer; }
        .table-wrap { padding: 0 32px 32px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 12px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #2a3045; white-space: nowrap; }
        td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #1a1f2e; vertical-align: middle; }
        tr:hover td { background: #1a1f2e; }
        .name-col { font-weight: 600; color: #e8e3d8; }
        .amount { font-weight: 600; color: #d4af6f; font-variant-numeric: tabular-nums; }
        .total-amount { font-weight: 700; color: #4ade80; font-variant-numeric: tabular-nums; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .badge-ok { background: #052e16; color: #4ade80; }
        .badge-warn { background: #451a03; color: #fbbf24; }
        .badge-overdue { background: #450a0a; color: #f87171; }
        .badge-none { background: #1a1f2e; color: #6b7280; }
        .action-btn { background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 6px; font-size: 13px; transition: background 0.15s; }
        .action-btn:hover { background: #2a3045; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .modal { background: #1a1f2e; border: 1px solid #2a3045; border-radius: 16px; width: 100%; max-width: 460px; padding: 28px; }
        .modal-title { font-family: 'Playfair Display', serif; font-size: 20px; color: #d4af6f; margin-bottom: 20px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .form-label { font-size: 12px; color: #9ca3af; font-weight: 500; }
        .form-input { background: #0f1117; border: 1px solid #2a3045; color: #e8e3d8; padding: 10px 12px; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-size: 14px; outline: none; width: 100%; }
        .form-input:focus { border-color: #d4af6f; }
        .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
        .preview-box { background: #0f1117; border: 1px solid #2a3045; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
        .preview-label { font-size: 11px; color: #6b7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .preview-total { color: #4ade80; font-weight: 700; font-size: 20px; }
        .preview-detail { font-size: 12px; color: #fbbf24; margin-top: 4px; }
        .empty-state { text-align: center; padding: 60px 20px; color: #4b5563; }
        .empty-icon { font-size: 48px; margin-bottom: 12px; }
        .rate-hint { font-size: 11px; color: #6b7280; margin-top: 2px; }
        @media (max-width: 640px) {
          .stat-row { grid-template-columns: 1fr 1fr; padding: 16px; gap: 10px; }
          .header { padding: 16px; }
          .table-wrap { padding: 0 12px 24px; }
          .toolbar { padding: 0 12px 12px; }
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <div className="header-title">📒 บัญชียืมเงิน</div>
          <div className="header-sub">ติดตามรายการยืม-คืนเงิน พร้อมดอกเบี้ยต่อครั้ง</div>
        </div>
        <div className="header-actions">
          <button className="btn-excel" onClick={exportExcel}>⬇ Excel</button>
          <button className="btn-pdf" onClick={exportPDF} disabled={exporting}>🖨 PDF</button>
          <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>+ เพิ่มรายการ</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">รายการทั้งหมด</div>
          <div className="stat-value">{loans.length} รายการ</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ยอดเงินต้นรวม</div>
          <div className="stat-value amber">฿{totals.totalPrincipal.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ดอกเบี้ยทั้งหมด</div>
          <div className="stat-value" style={{ color: "#f87171" }}>฿{totals.totalInterest.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ยอดรวม (ต้น + ดอก)</div>
          <div className="stat-value green">฿{totals.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <input className="search-input" placeholder="🔍 ค้นหาชื่อ..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">ทุกสถานะ</option>
          <option value="ok">ปกติ</option>
          <option value="warn">ใกล้ครบ</option>
          <option value="overdue">เกินกำหนด</option>
          <option value="none">ไม่ระบุ</option>
        </select>
        <select className="select-input" value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="loanDate">เรียงตามวันที่ยืม</option>
          <option value="principal">เรียงตามยอดเงิน</option>
          <option value="name">เรียงตามชื่อ</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ชื่อ - นามสกุล</th>
              <th>เงินต้น</th>
              <th>ดอกเบี้ย/ครั้ง</th>
              <th>วันที่ยืม</th>
              <th>กำหนดคืน</th>
              <th>ดอกเบี้ย (บาท)</th>
              <th>ยอดรวม</th>
              <th>สถานะ</th>
              <th>หมายเหตุ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10}><div className="empty-state"><div className="empty-icon">📭</div><div>ไม่พบรายการ</div></div></td></tr>
            ) : filtered.map(loan => {
              const interest = calcInterest(loan.principal, loan.rate);
              const total = loan.principal + interest;
              return (
                <tr key={loan.id}>
                  <td className="name-col">{loan.name}</td>
                  <td className="amount">฿{Number(loan.principal).toLocaleString()}</td>
                  <td style={{ color: "#9ca3af", fontSize: 13 }}>{loan.rate}%</td>
                  <td style={{ color: "#9ca3af", fontSize: 13, whiteSpace: "nowrap" }}>{formatThaiDate(loan.loanDate)}</td>
                  <td style={{ color: "#9ca3af", fontSize: 13, whiteSpace: "nowrap" }}>{loan.dueDate ? formatThaiDate(loan.dueDate) : "-"}</td>
                  <td style={{ color: "#fbbf24", fontSize: 13 }}>฿{interest.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="total-amount">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td><StatusBadge dueDate={loan.dueDate} /></td>
                  <td style={{ color: "#6b7280", fontSize: 12, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loan.note || "-"}</td>
                  <td>
                    <button className="action-btn" onClick={() => handleEdit(loan)}>✏️</button>
                    <button className="action-btn" onClick={() => handleDelete(loan.id)}>🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="modal-title">{editId ? "✏️ แก้ไขรายการ" : "➕ เพิ่มรายการยืมเงิน"}</div>
            <div className="form-group">
              <div className="form-label">ชื่อ - นามสกุล *</div>
              <input className="form-input" placeholder="เช่น สมชาย ใจดี" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <div className="form-label">ยอดเงินต้น (บาท) *</div>
              <input className="form-input" type="number" placeholder="เช่น 10000" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
            </div>
            <div className="form-group">
              <div className="form-label">อัตราดอกเบี้ยต่อครั้ง (%) *</div>
              <input className="form-input" type="number" placeholder="เช่น 5" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
              <div className="rate-hint">คิดแบบ Flat Rate — ดอก = เงินต้น × อัตรา%</div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div className="form-label">วันที่ยืม *</div>
                <input className="form-input" type="date" value={form.loanDate} onChange={e => setForm({ ...form, loanDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div className="form-label">กำหนดคืน</div>
                <input className="form-input" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <div className="form-label">หมายเหตุ</div>
              <input className="form-input" placeholder="เช่น กู้ฉุกเฉิน" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
            {form.principal && form.rate && (
              <div className="preview-box">
                <div className="preview-label">ยอดที��ต้องคืน</div>
                <div className="preview-total">฿{previewTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                <div className="preview-detail">เงินต้น ฿{Number(form.principal).toLocaleString()} + ดอก ฿{previewInterest.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
              </div>
            )}
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => { setShowForm(false); setEditId(null); }}>ยกเลิก</button>
              <button className="btn-primary" onClick={handleSubmit}>{editId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

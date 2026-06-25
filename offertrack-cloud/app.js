import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const STORAGE_KEY = "offertrack.jobs.v2";
const SUPABASE_SCRIPT = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const statusLabels = {
  saved: "收藏",
  applied: "已投递",
  interview: "面试中",
  offer: "Offer",
  rejected: "已结束",
};

const typeLabels = {
  internship: "实习",
  fulltime: "工作",
};

const sampleJobs = [
  {
    id: crypto.randomUUID(),
    company: "示例科技",
    role: "前端开发实习生",
    jobType: "internship",
    status: "interview",
    date: todayOffset(-7),
    followUp: todayOffset(1),
    link: "https://example.com",
    notes: "重点准备 React 状态管理、项目部署和 AI API 调用经验。",
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    company: "云端智能",
    role: "Web 开发工程师",
    jobType: "fulltime",
    status: "applied",
    date: todayOffset(-3),
    followUp: todayOffset(4),
    link: "",
    notes: "JD 提到 Serverless、Supabase 和数据可视化，简历里突出跨设备同步。",
    createdAt: new Date().toISOString(),
  },
];

let jobs = loadLocalJobs();
let currentFilter = "all";
let editingJobId = null;
let bulkMode = false;
let selectedJobIds = new Set();
let supabase = null;
let currentUser = null;
let cloudReady = false;

const elements = {
  jobForm: document.querySelector("#jobForm"),
  jobList: document.querySelector("#jobList"),
  actionList: document.querySelector("#actionList"),
  template: document.querySelector("#jobCardTemplate"),
  metricTotal: document.querySelector("#metricTotal"),
  metricInterview: document.querySelector("#metricInterview"),
  metricOffer: document.querySelector("#metricOffer"),
  metricFollowUp: document.querySelector("#metricFollowUp"),
  filterButtons: document.querySelectorAll(".filter-chip"),
  resetFormButton: document.querySelector("#resetFormButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  saveJobButton: document.querySelector("#saveJobButton"),
  exportDataButton: document.querySelector("#exportDataButton"),
  downloadTemplateButton: document.querySelector("#downloadTemplateButton"),
  importDataInput: document.querySelector("#importDataInput"),
  bulkToolbar: document.querySelector("#bulkToolbar"),
  bulkModeButton: document.querySelector("#bulkModeButton"),
  selectAllJobsButton: document.querySelector("#selectAllJobsButton"),
  cancelBulkButton: document.querySelector("#cancelBulkButton"),
  deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
  bulkCount: document.querySelector("#bulkCount"),
  resumeForm: document.querySelector("#resumeForm"),
  resumeOutput: document.querySelector("#resumeOutput"),
  copyResumeButton: document.querySelector("#copyResumeButton"),
  clearResumeButton: document.querySelector("#clearResumeButton"),
  clearResumeResultButton: document.querySelector("#clearResumeResultButton"),
  authForm: document.querySelector("#authForm"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  uploadLocalButton: document.querySelector("#uploadLocalButton"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  syncTitle: document.querySelector("#syncTitle"),
  syncMessage: document.querySelector("#syncMessage"),
  cloudStatusTitle: document.querySelector("#cloudStatusTitle"),
  cloudStatusText: document.querySelector("#cloudStatusText"),
  statusDot: document.querySelector("#statusDot"),
};

document.querySelector("#dateInput").value = todayOffset(0);

elements.jobForm.addEventListener("submit", handleJobSubmit);
elements.jobList.addEventListener("click", handleJobListClick);
elements.resetFormButton.addEventListener("click", resetJobForm);
elements.cancelEditButton?.addEventListener("click", resetJobForm);
elements.exportDataButton.addEventListener("click", exportData);
elements.downloadTemplateButton?.addEventListener("click", downloadTemplate);
elements.importDataInput.addEventListener("change", importData);
elements.bulkModeButton?.addEventListener("click", enterBulkMode);
elements.cancelBulkButton?.addEventListener("click", exitBulkMode);
elements.selectAllJobsButton?.addEventListener("click", selectAllVisibleJobs);
elements.deleteSelectedButton?.addEventListener("click", deleteSelectedJobs);
elements.resumeForm.addEventListener("submit", generateResumeBullets);
elements.copyResumeButton.addEventListener("click", copyResumeOutput);
elements.clearResumeButton?.addEventListener("click", clearResumeForm);
elements.clearResumeResultButton?.addEventListener("click", clearResumeForm);
elements.authForm.addEventListener("submit", signIn);
elements.signUpButton.addEventListener("click", signUp);
elements.signOutButton.addEventListener("click", signOut);
elements.uploadLocalButton.addEventListener("click", uploadLocalJobs);

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    elements.filterButtons.forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedJobIds.clear();
    render();
  });
});

render();
initializeCloud();

async function initializeCloud() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setSyncState("本地模式", "请先在 config.js 填入 Supabase URL 和 anon key，随后即可注册登录并跨设备同步。");
    return;
  }

  try {
    await loadScript(SUPABASE_SCRIPT);
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    cloudReady = true;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;

    supabase.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      await refreshDataSource();
    });

    await refreshDataSource();
  } catch (error) {
    setSyncState("云端连接失败", `Supabase 初始化失败：${error.message}`);
  }
}

async function refreshDataSource() {
  if (!cloudReady || !currentUser) {
    jobs = loadLocalJobs();
    elements.signOutButton.classList.add("is-hidden");
    elements.uploadLocalButton.classList.add("is-hidden");
    setSyncState("本地模式", "当前未登录，数据保存在这个浏览器。登录后会切换到云端数据。");
    render();
    return;
  }

  elements.signOutButton.classList.remove("is-hidden");
  elements.uploadLocalButton.classList.remove("is-hidden");
  elements.emailInput.value = currentUser.email || "";
  setSyncState("云端已同步", `当前账号：${currentUser.email}。新增、删除和状态修改会保存到 Supabase。`, true);
  await loadCloudJobs();
}

async function signIn(event) {
  event.preventDefault();
  if (!ensureCloudConfigured()) return;

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  if (!email || !password) {
    setSyncState("缺少登录信息", "请输入邮箱和密码。");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setSyncState("登录失败", error.message);
  }
}

async function signUp() {
  if (!ensureCloudConfigured()) return;

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  if (!email || !password) {
    setSyncState("缺少注册信息", "请输入邮箱和至少 6 位密码。");
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    setSyncState("注册失败", error.message);
    return;
  }

  setSyncState("注册成功", "如果 Supabase 开启了邮箱确认，请先到邮箱点击确认链接，然后再登录。");
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function loadCloudJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    setSyncState("读取云端失败", error.message);
    return;
  }

  jobs = data.map(fromCloudJob);
  render();
}

async function handleJobSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const existingJob = editingJobId ? jobs.find((job) => job.id === editingJobId) : null;
  const job = {
    id: editingJobId || crypto.randomUUID(),
    company: formData.get("company").trim(),
    role: formData.get("role").trim(),
    jobType: formData.get("jobType") || "internship",
    status: formData.get("status"),
    date: formData.get("date"),
    followUp: formData.get("followUp"),
    link: formData.get("link").trim(),
    notes: formData.get("notes").trim(),
    createdAt: existingJob?.createdAt || new Date().toISOString(),
  };

  if (editingJobId) {
    await saveEditedJob(job);
  } else {
    await createJob(job);
  }
}

async function createJob(job) {
  jobs = [job, ...jobs];
  render();
  resetJobForm();

  if (currentUser && cloudReady) {
    const { error } = await supabase.from("jobs").insert(toCloudJob(job));
    if (error) {
      setSyncState("保存失败", error.message);
      jobs = jobs.filter((item) => item.id !== job.id);
      render();
      return;
    }
    await loadCloudJobs();
  } else {
    saveLocalJobs();
  }
}

async function saveEditedJob(job) {
  const previousJobs = jobs;
  jobs = jobs.map((item) => (item.id === job.id ? job : item));
  render();
  resetJobForm();

  if (currentUser && cloudReady) {
    const { error } = await supabase.from("jobs").update(toCloudUpdate(job)).eq("id", job.id);
    if (error) {
      setSyncState("更新失败", error.message);
      jobs = previousJobs;
      render();
      return;
    }
    await loadCloudJobs();
  } else {
    saveLocalJobs();
  }
}

function editJob(id) {
  const job = jobs.find((item) => item.id === id);
  if (!job) return;

  editingJobId = id;
  document.querySelector("#companyInput").value = job.company || "";
  document.querySelector("#roleInput").value = job.role || "";
  document.querySelector("#jobTypeInput").value = job.jobType || "internship";
  document.querySelector("#statusInput").value = job.status || "saved";
  document.querySelector("#dateInput").value = job.date || "";
  document.querySelector("#followUpInput").value = job.followUp || "";
  document.querySelector("#linkInput").value = job.link || "";
  document.querySelector("#notesInput").value = job.notes || "";

  elements.jobForm.classList.add("is-editing");
  if (elements.saveJobButton) elements.saveJobButton.textContent = "更新岗位";
  elements.cancelEditButton?.classList.remove("is-hidden");
  elements.jobForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetJobForm() {
  editingJobId = null;
  elements.jobForm.reset();
  document.querySelector("#dateInput").value = todayOffset(0);
  document.querySelector("#jobTypeInput").value = "internship";
  elements.jobForm.classList.remove("is-editing");
  if (elements.saveJobButton) elements.saveJobButton.textContent = "保存岗位";
  elements.cancelEditButton?.classList.add("is-hidden");
}
async function updateJobStatus(id, status) {
  if (currentUser && cloudReady) {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
    if (error) {
      setSyncState("更新失败", error.message);
      return;
    }
  }

  jobs = jobs.map((job) => (job.id === id ? { ...job, status } : job));
  saveLocalJobsIfNeeded();
  render();
}

async function deleteJob(id) {
  const job = jobs.find((item) => item.id === id);
  if (!job) return;
  const confirmed = window.confirm(`删除 ${job.company} 的 ${job.role} 记录吗？`);
  if (!confirmed) return;

  if (currentUser && cloudReady) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      setSyncState("删除失败", error.message);
      return;
    }
  }

  jobs = jobs.filter((item) => item.id !== id);
  saveLocalJobsIfNeeded();
  render();
}

async function uploadLocalJobs() {
  if (!currentUser || !cloudReady) return;
  const localJobs = loadLocalJobs().filter((job) => !jobs.some((cloudJob) => cloudJob.id === job.id));
  if (!localJobs.length) {
    setSyncState("无需上传", "本地没有新的记录需要上传。", true);
    return;
  }

  const { error } = await supabase.from("jobs").insert(localJobs.map(toCloudJob));
  if (error) {
    setSyncState("上传失败", error.message);
    return;
  }

  setSyncState("上传完成", `已上传 ${localJobs.length} 条本地记录到云端。`, true);
  await loadCloudJobs();
}

function getVisibleJobs() {
  return jobs.filter((job) => currentFilter === "all" || job.status === currentFilter);
}

function enterBulkMode() {
  bulkMode = true;
  selectedJobIds.clear();
  updateBulkControls();
  render();
}

function exitBulkMode() {
  bulkMode = false;
  selectedJobIds.clear();
  updateBulkControls();
  render();
}

function selectAllVisibleJobs() {
  getVisibleJobs().forEach((job) => selectedJobIds.add(job.id));
  updateBulkControls();
  render();
}

function toggleJobSelection(id, checked) {
  if (checked) {
    selectedJobIds.add(id);
  } else {
    selectedJobIds.delete(id);
  }
  updateBulkControls();
  render();
}

async function deleteSelectedJobs() {
  const ids = Array.from(selectedJobIds).filter((id) => jobs.some((job) => job.id === id));
  if (!ids.length) return;

  const confirmed = window.confirm(`确定删除选中的 ${ids.length} 条投递记录吗？`);
  if (!confirmed) return;

  const previousJobs = jobs;
  jobs = jobs.filter((job) => !ids.includes(job.id));
  selectedJobIds.clear();
  bulkMode = false;
  render();
  updateBulkControls();

  if (currentUser && cloudReady) {
    const { error } = await supabase.from("jobs").delete().in("id", ids);
    if (error) {
      setSyncState("批量删除失败", error.message);
      jobs = previousJobs;
      render();
      return;
    }
    await loadCloudJobs();
  } else {
    saveLocalJobs();
  }
}

function updateBulkControls() {
  elements.bulkToolbar?.classList.toggle("is-active", bulkMode);
  elements.bulkModeButton?.classList.toggle("is-hidden", bulkMode);
  elements.selectAllJobsButton?.classList.toggle("is-hidden", !bulkMode);
  elements.cancelBulkButton?.classList.toggle("is-hidden", !bulkMode);
  elements.deleteSelectedButton?.classList.toggle("is-hidden", !bulkMode);
  elements.bulkCount?.classList.toggle("is-hidden", !bulkMode);
  if (elements.bulkCount) elements.bulkCount.textContent = `已选择 ${selectedJobIds.size} 条`;
  if (elements.deleteSelectedButton) elements.deleteSelectedButton.disabled = selectedJobIds.size === 0;
}
function handleJobListClick(event) {
  const checkbox = event.target.closest(".job-checkbox");
  if (checkbox) {
    const card = checkbox.closest(".job-card");
    if (card?.dataset.jobId) toggleJobSelection(card.dataset.jobId, checkbox.checked);
    return;
  }

  const editButton = event.target.closest(".edit-job");
  if (editButton) {
    const card = editButton.closest(".job-card");
    if (card?.dataset.jobId) editJob(card.dataset.jobId);
    return;
  }

  const deleteButton = event.target.closest(".delete-job");
  if (deleteButton) {
    const card = deleteButton.closest(".job-card");
    if (card?.dataset.jobId) deleteJob(card.dataset.jobId);
  }
}
function render() {
  renderMetrics();
  renderActions();
  renderJobs();
  updateBulkControls();
}

function renderMetrics() {
  elements.metricTotal.textContent = jobs.length;
  elements.metricInterview.textContent = jobs.filter((job) => job.status === "interview").length;
  elements.metricOffer.textContent = jobs.filter((job) => job.status === "offer").length;
  elements.metricFollowUp.textContent = jobs.filter(isFollowUpDue).length;
}

function renderActions() {
  const actions = jobs
    .filter((job) => job.status !== "offer" && job.status !== "rejected")
    .sort((a, b) => normalizeDate(a.followUp) - normalizeDate(b.followUp))
    .slice(0, 4);

  elements.actionList.innerHTML = "";

  if (!actions.length) {
    elements.actionList.innerHTML = "<li>暂无待办。可以新增一个目标岗位，或更新已投递岗位的跟进日期。</li>";
    return;
  }

  actions.forEach((job) => {
    const item = document.createElement("li");
    const followUp = job.followUp ? formatDate(job.followUp) : "未设置日期";
    item.textContent = `${job.company} - ${job.role}：${followUp} 跟进，当前状态 ${statusLabels[job.status]}`;
    elements.actionList.append(item);
  });
}

function renderJobs() {
  const visibleJobs = getVisibleJobs();
  elements.jobList.innerHTML = "";

  if (!visibleJobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有匹配的岗位记录。新增一个岗位后，这里会自动出现。";
    elements.jobList.append(empty);
    return;
  }

  visibleJobs.forEach((job) => {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    card.dataset.jobId = job.id;
    card.classList.toggle("is-selected", selectedJobIds.has(job.id));
    card.classList.toggle("is-bulk-mode", bulkMode);
    const checkbox = card.querySelector(".job-checkbox");
    checkbox.checked = selectedJobIds.has(job.id);
    checkbox.tabIndex = bulkMode ? 0 : -1;
    const status = card.querySelector(".job-status");
    status.textContent = statusLabels[job.status];
    status.classList.add(`status-${job.status}`);

    card.querySelector("h4").textContent = job.role;
    card.querySelector(".job-card-header p").textContent = `${typeLabels[job.jobType] || "工作"} · ${job.company}`;
    card.querySelector(".job-date").textContent = job.date ? formatDate(job.date) : "未记录";
    card.querySelector(".job-follow-up").textContent = job.followUp ? formatDate(job.followUp) : "未设置";
    card.querySelector(".job-notes").textContent = job.notes || "暂无备注";

    const link = card.querySelector(".job-link");
    if (job.link) {
      link.href = job.link;
    } else {
      link.href = "#";
      link.classList.add("is-disabled");
      link.textContent = "无链接";
    }

    const select = card.querySelector(".status-select");
    select.value = job.status;
    select.addEventListener("change", () => updateJobStatus(job.id, select.value));

    elements.jobList.append(card);
  });
}

async function generateResumeBullets(event) {
  event.preventDefault();
  const payload = {
    projectName: document.querySelector("#projectNameInput").value.trim(),
    keywords: (document.querySelector("#keywordsInput") || document.querySelector("#techStackInput"))?.value.trim() || "",
    details: document.querySelector("#projectDetailInput").value.trim(),
  };

  if (!payload.projectName || !payload.details) {
    elements.resumeOutput.textContent = "请先填写经历名称和你的具体贡献。";
    return;
  }

  elements.resumeOutput.textContent = "正在生成...";

  try {
    const data = await requestResumeAI(payload);
    elements.resumeOutput.textContent = data.result;
  } catch (error) {
    elements.resumeOutput.textContent = buildLocalResumeBullets(payload);
  }
}

async function requestResumeAI(payload, attempts = 3) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("AI endpoint failed");
      return await response.json();
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        elements.resumeOutput.textContent = `正在生成...（第 ${index + 2} 次尝试）`;
        await new Promise((resolve) => setTimeout(resolve, 500 * (index + 1)));
      }
    }
  }
  throw lastError;
}

function clearResumeForm() {
  elements.resumeForm?.reset();
  elements.resumeOutput.textContent = "填写左侧内容后，生成适合写进简历的经历描述。";
  document.querySelector("#projectNameInput")?.focus();
}

async function copyResumeOutput() {
  await navigator.clipboard.writeText(elements.resumeOutput.textContent);
  elements.copyResumeButton.textContent = "已复制";
  setTimeout(() => {
    elements.copyResumeButton.textContent = "复制";
  }, 1400);
}

function exportData() {
  const rows = jobs.map(jobToExcelRow);
  writeWorkbook(rows, `工作实习投递进度-${todayOffset(0)}.xlsx`);
}

async function downloadTemplate() {
  if (window.ExcelJS) {
    await downloadTemplateWithDropdowns();
    return;
  }

  window.alert("模板下拉框工具加载失败，将下载普通模板。刷新页面后可重试下拉框模板。");
  const rows = [templateExampleRow()];
  writeWorkbook(rows, "工作实习投递模板.xlsx");
}

async function downloadTemplateWithDropdowns() {
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "OfferTrack";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("投递信息", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "类型", key: "类型", width: 12 },
    { header: "公司", key: "公司", width: 22 },
    { header: "岗位", key: "岗位", width: 24 },
    { header: "状态", key: "状态", width: 14 },
    { header: "投递日期", key: "投递日期", width: 14 },
    { header: "跟进日期", key: "跟进日期", width: 14 },
    { header: "链接", key: "链接", width: 36 },
    { header: "备注", key: "备注", width: 44 },
  ];

  sheet.addRow(templateExampleRow());
  sheet.addRows(Array.from({ length: 29 }, () => emptyExcelRow()));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D766E" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  for (let row = 2; row <= 31; row += 1) {
    sheet.getCell(`A${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"实习,工作"'],
      showErrorMessage: true,
      errorTitle: "请选择类型",
      error: "类型只能选择：实习、工作。",
    };
    sheet.getCell(`D${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"收藏,已投递,面试中,Offer,已结束"'],
      showErrorMessage: true,
      errorTitle: "请选择状态",
      error: "状态只能选择：收藏、已投递、面试中、Offer、已结束。",
    };
    sheet.getCell(`E${row}`).numFmt = "yyyy-mm-dd";
    sheet.getCell(`F${row}`).numFmt = "yyyy-mm-dd";
  }

  const help = workbook.addWorksheet("填写说明");
  help.columns = [
    { header: "字段", key: "field", width: 16 },
    { header: "填写说明", key: "note", width: 70 },
  ];
  help.addRows([
    { field: "类型", note: "使用下拉框选择：实习、工作。" },
    { field: "状态", note: "使用下拉框选择：收藏、已投递、面试中、Offer、已结束。" },
    { field: "投递日期/跟进日期", note: "建议使用 2026-06-24 这样的日期格式。" },
    { field: "公司、岗位", note: "导入时这两列必填；缺少任意一项会跳过该行。" },
    { field: "链接、备注", note: "可选，用于记录 JD 链接、HR 信息、面试反馈或下一步计划。" },
  ]);
  help.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "工作实习投递模板.xlsx",
  );
}

function templateExampleRow() {
  return {
    类型: "实习",
    公司: "示例公司",
    岗位: "前端开发实习生",
    状态: "已投递",
    投递日期: todayOffset(0),
    跟进日期: todayOffset(3),
    链接: "https://example.com/job",
    备注: "这里填写 JD 重点、面试反馈或下一步计划",
  };
}
async function importData(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const rows = await readExcelRows(file);
    const importedJobs = rows.map(excelRowToJob).filter(Boolean);
    if (!importedJobs.length) throw new Error("No valid rows");

    jobs = [...importedJobs, ...jobs];
    render();

    if (currentUser && cloudReady) {
      const { error } = await supabase.from("jobs").insert(importedJobs.map(toCloudJob));
      if (error) throw error;
      await loadCloudJobs();
    } else {
      saveLocalJobs();
    }
  } catch (error) {
    window.alert("导入失败，请确认使用的是 Excel 模板，且包含公司、岗位、状态等字段。");
  } finally {
    event.target.value = "";
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function writeWorkbook(rows, filename) {
  if (!window.XLSX) {
    window.alert("Excel 工具加载失败，请检查网络后刷新页面。");
    return;
  }

  const worksheet = window.XLSX.utils.json_to_sheet(rows.length ? rows : [emptyExcelRow()]);
  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
    { wch: 42 },
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "投递信息");
  window.XLSX.writeFile(workbook, filename);
}

async function readExcelRows(file) {
  if (!window.XLSX) throw new Error("XLSX not loaded");
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

function jobToExcelRow(job) {
  return {
    类型: typeLabels[job.jobType] || "实习",
    公司: job.company || "",
    岗位: job.role || "",
    状态: statusLabels[job.status] || "收藏",
    投递日期: job.date || "",
    跟进日期: job.followUp || "",
    链接: job.link || "",
    备注: job.notes || "",
  };
}

function excelRowToJob(row) {
  const company = normalizeCell(row.公司 || row.company || row.Company);
  const role = normalizeCell(row.岗位 || row.role || row.Role);
  if (!company || !role) return null;

  return {
    id: crypto.randomUUID(),
    company,
    role,
    jobType: parseJobType(row.类型 || row.type || row.Type),
    status: parseStatus(row.状态 || row.status || row.Status),
    date: normalizeExcelDate(row.投递日期 || row.date || row.applied_date),
    followUp: normalizeExcelDate(row.跟进日期 || row.followUp || row.follow_up_date),
    link: normalizeCell(row.链接 || row.link || row.Link),
    notes: normalizeCell(row.备注 || row.notes || row.Notes),
    createdAt: new Date().toISOString(),
  };
}

function emptyExcelRow() {
  return {
    类型: "",
    公司: "",
    岗位: "",
    状态: "",
    投递日期: "",
    跟进日期: "",
    链接: "",
    备注: "",
  };
}

function parseJobType(value) {
  const text = normalizeCell(value).toLowerCase();
  if (text.includes("工作") || text.includes("full") || text.includes("正式")) return "fulltime";
  return "internship";
}

function parseStatus(value) {
  const text = normalizeCell(value).toLowerCase();
  if (text.includes("已投递") || text.includes("applied")) return "applied";
  if (text.includes("面试") || text.includes("interview")) return "interview";
  if (text.includes("offer")) return "offer";
  if (text.includes("结束") || text.includes("拒") || text.includes("reject")) return "rejected";
  return "saved";
}

function normalizeExcelDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  const text = normalizeCell(value);
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeCell(value) {
  return String(value ?? "").trim();
}
function loadLocalJobs() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return sampleJobs;

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : sampleJobs;
  } catch (error) {
    return sampleJobs;
  }
}

function saveLocalJobs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function saveLocalJobsIfNeeded() {
  if (!currentUser) saveLocalJobs();
}

function toCloudUpdate(job) {
  return {
    company: job.company,
    role: job.role,
    job_type: job.jobType || "internship",
    status: job.status,
    applied_date: job.date || null,
    follow_up_date: job.followUp || null,
    link: job.link || null,
    notes: job.notes || null,
  };
}
function toCloudJob(job) {
  return {
    id: job.id,
    user_id: currentUser.id,
    company: job.company,
    role: job.role,
    job_type: job.jobType || "internship",
    status: job.status,
    applied_date: job.date || null,
    follow_up_date: job.followUp || null,
    link: job.link || null,
    notes: job.notes || null,
    created_at: job.createdAt || new Date().toISOString(),
  };
}

function fromCloudJob(row) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobType: row.job_type || "internship",
    status: row.status,
    date: row.applied_date || "",
    followUp: row.follow_up_date || "",
    link: row.link || "",
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

function ensureCloudConfigured() {
  if (cloudReady && supabase) return true;
  setSyncState("尚未配置 Supabase", "请先在 config.js 填入 SUPABASE_URL 和 SUPABASE_ANON_KEY。");
  return false;
}

function setSyncState(title, message, online = false) {
  elements.syncTitle.textContent = title;
  elements.syncMessage.textContent = message;
  elements.cloudStatusTitle.textContent = title;
  elements.cloudStatusText.textContent = message;
  elements.statusDot.classList.toggle("is-online", online);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("无法加载 Supabase SDK"));
    document.head.append(script);
  });
}

function isFollowUpDue(job) {
  if (!job.followUp || job.status === "offer" || job.status === "rejected") return false;
  const today = new Date(todayOffset(0));
  return normalizeDate(job.followUp) <= today;
}

function normalizeDate(value) {
  if (!value) return new Date("2999-12-31");
  return new Date(`${value}T00:00:00`);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function todayOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildLocalResumeBullets({ projectName, keywords, details }) {
  const conciseDetails = details.length > 90 ? `${details.slice(0, 90)}...` : details;
  const keywordText = keywords ? `，可结合 ${keywords} 等关键词展开` : "";
  return [
    `- 围绕 ${projectName} 提炼出适合简历呈现的经历亮点，突出目标、职责分工、执行过程与结果${keywordText}。`,
    "- 将原始经历整理为更清晰的简历表达，帮助在投递中更准确地呈现个人贡献、协作内容和实际产出。",
    `- 根据提供的经历细节生成可直接复用的简历要点，核心内容包括：${conciseDetails}`,
  ].join("\n");
}


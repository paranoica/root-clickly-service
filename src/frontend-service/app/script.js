document.addEventListener("DOMContentLoaded", async function () {
    fetch("modals/settings_modal.html").then(r => r.text()).then(html => {
        const placeholder = document.getElementById("settings-modal-placeholder");
        if (placeholder) {
            placeholder.innerHTML = html;
            if (typeof initSettingsModalEvents === "function") initSettingsModalEvents();
        }
    });

    const myLinksList = document.getElementById("my-links-list");
    const myLinksSummary = document.getElementById("my-links-summary");
    const myLinksPagination = document.getElementById("my-links-pagination");

    window.LINKS_LIMIT = 5;
    window.linksSkip = 0;

    window.loadPasswordResetModal = async function () {
        if (document.getElementById("password-reset-modal"))
            return;

        const html = await fetch("modals/password_reset_modal.html").then(r => r.text());
        document.getElementById("password-reset-modal-placeholder").innerHTML = html;

        initPasswordResetModalHandlers();
    };

    function initPasswordResetModalHandlers() {
        const modal = document.getElementById("password-reset-modal");
        if (!modal)
            return;

        const closeBtn = modal.querySelector("#close-password-reset");
        if (closeBtn)
            closeBtn.onclick = () => closeModal(modal);

        const backToLoginBtn = modal.querySelector("#back-to-login-from-reset");
        if (backToLoginBtn)
            backToLoginBtn.onclick = () => {
                closeModal(modal); const loginModal = document.getElementById("login-modal"); if (loginModal)
                    openModal(loginModal);
            };

        const form = modal.querySelector("#password-reset-form");
        if (form) {
            form.onsubmit = async function (e) {
                e.preventDefault();

                const emailInput = modal.querySelector("#password-reset-email");
                if (!emailInput)
                    return;

                const email = emailInput.value.trim();
                if (!email) {
                    showNotification("Enter your email", "error");
                    return;
                }

                try {
                    await APIClient.makeAnonymousRequest("http://localhost/api/users/password-reset-request", {
                        method: "POST",
                        body: JSON.stringify({ email })
                    });

                    showNotification("Password recovery email sent! Check your email.", "success");
                    closeModal(modal);
                } catch (err) {
                    if (err && err.message) {
                        showNotification(err.message, "error");
                    } else {
                        showNotification("Error sending email", "error");
                    }
                }
            };
        }
    }

    document.addEventListener("click", async function (e) {
        const target = e.target;
        if (target && target.matches("a, button")) {
            if (target.textContent && target.textContent.replace(/\s+/g, "").toLowerCase().includes("забылипароль")) {
                e.preventDefault();

                await window.loadPasswordResetModal();
                const modal = document.getElementById("password-reset-modal");

                if (modal)
                    openModal(modal);
            }
        }
    });

    window.loadMyLinks = async function (skip = 0, limit = window.LINKS_LIMIT, filterParams = null) {
        if (!myLinksList || !myLinksSummary || !myLinksPagination)
            return;

        if (!TokenManager.isAuthenticated()) {
            renderMyLinks([]);

            myLinksSummary.textContent = "";
            myLinksPagination.innerHTML = "";

            if (window.wasAuthenticated) {
                showNotification("Your session has expired. Please sign in again.", "error");
                UserManager.logout();
            }

            return;
        }

        if (filterParams) {
            filterParams.skip = skip;
            filterParams.limit = limit;

            window.lastMyLinksFilterParams = { ...filterParams };
            localStorage.setItem("myLinksFilterParams", JSON.stringify(window.lastMyLinksFilterParams));
        }

        myLinksList.innerHTML = "<div class='text-zinc-400 text-center py-6'>Loading...</div>";

        try {
            let isDefaultFilter = false;
            if (filterParams) {
                const { created_from, created_to, min_clicks, max_clicks, domain } = filterParams;

                isDefaultFilter =
                    (!created_from && !created_to) &&
                    (min_clicks === null || min_clicks === undefined) &&
                    (max_clicks === null || max_clicks === undefined) &&
                    (!domain || domain === "");
            }

            let params = { skip, limit }; if (filterParams && !isDefaultFilter)
                params = { ...params, ...filterParams };

            const res = await APIClient.getMyUrls(params);
            const { urls, total, limit: pageLimit, skip: pageSkip } = res;

            renderMyLinks(urls);
            renderMyLinksSummary(urls.length, total);
            renderMyLinksPagination(pageSkip, pageLimit, total);
        } catch (e) {
            const isAuthError = e && (
                e.status === 401 ||
                e.status === 403 ||
                (e.message && (/401|403|unauth|сессия истекла|войдите заново/i).test(e.message))
            );

            if (isAuthError) {
                renderMyLinks([]);

                myLinksSummary.textContent = "";
                myLinksPagination.innerHTML = "";

                if (window.wasAuthenticated) {
                    showNotification("Your session has expired. Please sign in again.", "error");
                    UserManager.logout();
                }

                window.wasAuthenticated = false;
            } else {
                myLinksList.innerHTML = "<div class='text-red-400 text-center py-6'>Error loading links</div>";
                myLinksSummary.textContent = ""; myLinksPagination.innerHTML = "";
            }
        }
    }

    async function renderMyLinks(urls) {
        const notAuth = !TokenManager.isAuthenticated();
        if (notAuth || urls === null || (Array.isArray(urls) && urls.length === 0 && notAuth)) {
            myLinksList.innerHTML =
                `<div class="flex flex-col items-center justify-center py-12 text-center gap-4">
                    <svg class="w-12 h-12 text-indigo-400 mb-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 11c1.104 0 2-.896 2-2s-.896-2-2-2-2 .896-2 2 .896 2 2 2zm0 2c-2.21 0-4 1.79-4 4v1h8v-1c0-2.21-1.79-4-4-4z"/></svg>
                    <div class="text-lg text-zinc-200 font-semibold">Sign in or register to see your links</div>
                    <div class="text-zinc-400">Authorization will give you access to history, statistics, and management of your links.</div>
                </div>`;

            return;
        }

        if (Array.isArray(urls) && urls.length === 0) {
            myLinksList.innerHTML = `<div class="text-zinc-400 text-center py-8">You don't have any links yet.</div>`;
            return;
        }

        myLinksList.innerHTML = urls.map((link, idx) => {
            const isActive = link.is_active !== false;
            const statusIcon = isActive
                ? "<svg class='w-3 h-3 text-indigo-400 inline-block mr-1' fill='currentColor' viewBox='0 0 24 24' style='margin-bottom: 2px;'><circle cx='12' cy='12' r='6' /></svg>"
                : "<svg class='w-3 h-3 text-zinc-400 inline-block mr-1' fill='currentColor' viewBox='0 0 24 24' style='margin-bottom: 2px;'><circle cx='12' cy='12' r='6' /></svg>"

            const toggleBtn = isActive
                ?
                `<button class="p-2 text-zinc-400 hover:text-green-400 hover:bg-zinc-700 rounded-lg transition-colors" title="Activate" data-toggle-idx="${idx}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 12 a10 10 0 1 1 -20 0 a10 10 0 0 1 20 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5"></path></svg>
                </button>`
                :
                `<button class="p-2 text-zinc-400 hover:text-green-400 hover:bg-zinc-700 rounded-lg transition-colors" title="Activate" data-toggle-idx="${idx}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                </button>`;

            return `
                <div class="grid grid-cols-12 gap-4 items-center bg-zinc-800/50 rounded-lg px-4 py-3 hover:bg-zinc-800/70 transition-colors group" data-link-idx="${idx}">
                    <div class="col-span-5">
                    <div class="text-zinc-200 text-sm truncate" title="${escapeHtml(link.original_url)}">${statusIcon}${escapeHtml(link.original_url)}</div>
                    <div class="text-xs text-zinc-500 mt-1">Created at ${formatCreatedAgo(link.created_at)}</div>
                    </div>
                    <div class="col-span-3">
                    <div class="flex items-center gap-2">
                        <span class="text-indigo-300 font-mono text-sm">${escapeHtml(link.short_url)}</span>
                        <button class="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-indigo-400" title="Copy" onclick="navigator.clipboard.writeText("${escapeHtml(link.short_url)}")">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                        <button class="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-green-400" title="QR-code" type="button" data-qr-idx="${idx}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013.75 9.375v-4.5zM3.75 14.625c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013.75 19.125v-4.5zM13.5 4.875c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0113.5 9.375v-4.5z"/><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 14.625a1.875 1.875 0 011.875-1.875h4.5a1.875 1.875 0 011.875 1.875v4.5c0 1.035-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0113.5 19.125v-4.5z"/></svg>
                        </button>
                    </div>
                    </div>
                    <div class="col-span-2 flex items-center ml-8">
                    <span class="text-zinc-200 font-semibold" id="my-link-clicks-${idx}">...</span>
                    </div>
                    <div class="col-span-1.5">
                    <div class="flex gap-1">
                        <button class="p-2 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-700 rounded-lg transition-colors" title="Statistics" type="button" data-stats-idx="${idx}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                        </button>
                        <button class="p-2 text-zinc-400 hover:text-yellow-400 hover:bg-zinc-700 rounded-lg transition-colors" title="Edit" type="button" data-edit-idx="${idx}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        ${toggleBtn}
                    </div>
                    </div>
                </div>
            `;
        }).join("");

        setTimeout(() => {
            urls.forEach((link, idx) => {
                const btn = document.querySelector(`button[data-toggle-idx="${idx}"]`);
                if (btn) {
                    btn.onclick = async function (e) {
                        e.preventDefault();

                        const token = TokenManager.getToken();
                        const urlId = link.id || link.url_id;

                        if (!urlId)
                            return;

                        try {
                            btn.disabled = true;

                            const isActive = link.is_active !== false;
                            const action = isActive ? "deactivate" : "activate";

                            const resp = await fetch(`http://localhost/api/urls/${urlId}/${action}`, {
                                method: "PATCH",
                                headers: {
                                    "accept": "application/json",
                                    "Authorization": `Bearer ${token}`
                                }
                            });

                            if (!resp.ok)
                                throw new Error("Status update error");

                            showNotification(isActive ? "Link deactivated" : "Link activated", "success");
                            window.loadMyLinks(window.linksSkip, window.LINKS_LIMIT, window.lastMyLinksFilterParams || null);
                        } catch (err) {
                            showNotification("Status update error", "error");
                        } finally {
                            btn.disabled = false;
                        }
                    };
                }

                const editBtn = document.querySelector(`button[data-edit-idx="${idx}"]`);
                if (editBtn) {
                    editBtn.onclick = function (e) {
                        e.preventDefault();

                        if (window.openEditLinkModal) {
                            openEditLinkModal(link);
                        } else {
                            loadEditLinkModal().then(() => openEditLinkModal(link));
                        }
                    };
                }

                const statsBtn = document.querySelector(`button[data-stats-idx="${idx}"]`);
                if (statsBtn) {
                    statsBtn.onclick = function (e) {
                        e.preventDefault();
                        openStatsModal(link);
                    };
                }
            });
        }, 0);

        async function openStatsModal(link) {
            let statsModal = document.getElementById("stats-modal");
            if (!statsModal) {
                const res = await fetch("modals/stats_modal.html");
                if (!res.ok) {
                    showNotification("Error loading statistics window", "error");
                    return;
                }

                const html = await res.text();
                const div = document.createElement("div");

                div.innerHTML = html;
                document.body.appendChild(div.firstElementChild);

                statsModal = document.getElementById("stats-modal");
            }

            statsModal.classList.remove("hidden");
            statsModal.style.display = "flex";

            document.body.classList.add("modal-open");
            document.documentElement.classList.add("modal-open");
            statsModal.querySelector("#close-stats").onclick = () => closeModal(statsModal);

            const startInput = statsModal.querySelector("#stats-start-date");
            const endInput = statsModal.querySelector("#stats-end-date");

            const selectedInput = statsModal.querySelector("#stats-selected-date");
            const applyBtn = statsModal.querySelector("#stats-apply-filter");
            const today = new Date().toISOString().slice(0, 10);

            if (!startInput.value)
                startInput.value = "";

            if (!endInput.value)
                endInput.value = "";

            if (!selectedInput.value)
                selectedInput.value = today;

            window.currentStatsLink = link;

            async function loadStats() {
                const statsContent = statsModal.querySelector("#stats-content");
                const statsLoading = statsModal.querySelector("#stats-loading");

                statsContent.innerHTML = "";
                statsLoading.classList.remove("hidden");

                try {
                    const params = [];
                    const urlId = link.id || link.url_id;

                    params.push("url_id=" + encodeURIComponent(urlId));

                    if (startInput.value)
                        params.push("start_date=" + encodeURIComponent(startInput.value));

                    if (endInput.value)
                        params.push("end_date=" + encodeURIComponent(endInput.value));

                    if (selectedInput.value)
                        params.push("selected_date=" + encodeURIComponent(selectedInput.value));

                    const url = `http://localhost/api/analytics/stats?${params.join("&")}`;
                    const resp = await fetch(url, {
                        headers: {
                            "accept": "application/json",
                            ...TokenManager.getAuthHeaders()
                        }
                    });

                    if (!resp.ok)
                        throw new Error("Error loading statistics");

                    const data = await resp.json();
                    data.url_id = urlId; renderStatsContent(statsContent, data);
                } catch (e) {
                    statsContent.innerHTML = `<div class="text-red-400 text-center py-8">Error loading statistics</div>`;
                } finally {
                    statsLoading.classList.add("hidden");
                }
            }

            applyBtn.onclick = loadStats;
            loadStats();
        }

        function renderStatsContent(container, data) {
            let html =
                `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-2">
                    <div class="bg-zinc-800/60 rounded-lg p-4 col-span-2 md:col-span-1">
                        <div class="text-xs text-zinc-400 mb-1">Total clicks</div>
                        <div class="text-2xl font-bold text-indigo-400">${data.total_clicks ?? 0}</div>
                    </div>
                    <div class="bg-zinc-800/60 rounded-lg p-4 col-span-2 md:col-span-1">
                        <div class="text-xs text-zinc-400 mb-1">Unique IP</div>
                        <div class="text-2xl font-bold text-indigo-400">${data.unique_ips ?? 0}</div>
                    </div>
                    <div class="bg-zinc-800/60 rounded-lg p-4 col-span-2 md:col-span-1">
                        <div class="text-xs text-zinc-400 mb-1">Total links</div>
                        <div class="text-2xl font-bold text-indigo-400">${data.total_links ?? 0}</div>
                    </div>
                    <div class="bg-zinc-800/60 rounded-lg p-4 col-span-2 md:col-span-1">
                        <div class="text-xs text-zinc-400 mb-1">Report date</div>
                        <div class="text-2xl font-bold text-indigo-400">${(data.generated_at || "").slice(0, 10)}</div>
                    </div>
                </div>`;

            html +=
                `<div class="w-full flex flex-col md:flex-row gap-4 items-center justify-start mb-4 mt-2">
                    <div>
                        <label class="text-xs text-zinc-400 mr-1">Export statistics:</label>
                        <select id="export-stats-format" class="bg-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs border border-zinc-700 focus:outline-none">
                            <option value="json">JSON</option>
                            <option value="xlsx">XLSX</option>
                        </select>
                        <button id="export-stats-btn" class="ml-2 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                            Download
                        </button>
                    </div>
                    <div>
                        <label class="text-xs text-zinc-400 mr-1">Export clicks:</label>
                        <select id="export-clicks-format" class="bg-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs border border-zinc-700 focus:outline-none">
                            <option value="json">JSON</option>
                            <option value="xlsx">XLSX</option>
                        </select>
                        <button id="export-clicks-btn" class="ml-2 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition">
                            Download
                        </button>
                    </div>
                </div>`;

            setTimeout(() => {
                const statsBtn = document.getElementById("export-stats-btn");
                const statsFormat = document.getElementById("export-stats-format");

                const clicksBtn = document.getElementById("export-clicks-btn");
                const clicksFormat = document.getElementById("export-clicks-format");

                function getUrlId() {
                    return (
                        data.url_id ||
                        data.id ||
                        (window.currentStatsLink && (window.currentStatsLink.url_id || window.currentStatsLink.id)) ||
                        (window.statsModalLink && (window.statsModalLink.url_id || window.statsModalLink.id))
                    );
                }

                if (statsBtn && statsFormat) {
                    statsBtn.onclick = async () => {
                        try {
                            const format = statsFormat.value;
                            const urlId = getUrlId();

                            if (!urlId) {
                                showNotification("Link ID not found. Try opening the statistics again.", "error");
                                return;
                            }

                            let params = [];

                            params.push("url_id=" + encodeURIComponent(urlId));
                            params.push("format=" + encodeURIComponent(format));

                            const startInput = document.getElementById("stats-start-date"); const endInput = document.getElementById("stats-end-date");
                            const selectedInput = document.getElementById("stats-selected-date");

                            if (startInput && startInput.value)
                                params.push("start_date=" + encodeURIComponent(startInput.value));

                            if (endInput && endInput.value)
                                params.push("end_date=" + encodeURIComponent(endInput.value));

                            if (selectedInput && selectedInput.value)
                                params.push("selected_date=" + encodeURIComponent(selectedInput.value));

                            const token = TokenManager.getToken();
                            const url = `http://localhost/api/analytics/stats/export?${params.join("&")}`;

                            const resp = await fetch(url, {
                                headers: {
                                    "accept": "application/json",
                                    "Authorization": `Bearer ${token}`
                                }
                            });

                            if (!resp.ok) {
                                let msg = "Error exporting statistics";
                                try { const err = await resp.json(); msg = err.detail || msg; } catch { }

                                showNotification(msg, "error");
                                return;
                            }

                            const blob = await resp.blob();
                            const a = document.createElement("a");

                            a.href = window.URL.createObjectURL(blob); a.download = `stats_export.${format}`;
                            document.body.appendChild(a);

                            a.click();
                            a.remove();
                        } catch (e) {
                            showNotification(e.message || "Export error", "error");
                        }
                    };
                }

                if (clicksBtn && clicksFormat) {
                    clicksBtn.onclick = async () => {
                        try {
                            const format = clicksFormat.value;
                            const urlId = getUrlId();

                            if (!urlId) {
                                showNotification("Link ID not found. Try opening the statistics again.", "error");
                                return;
                            }

                            let params = [];

                            params.push("url_id=" + encodeURIComponent(urlId));
                            params.push("format=" + encodeURIComponent(format));

                            const startInput = document.getElementById("stats-start-date");
                            const endInput = document.getElementById("stats-end-date");

                            if (startInput && startInput.value)
                                params.push("start_date=" + encodeURIComponent(startInput.value));

                            if (endInput && endInput.value)
                                params.push("end_date=" + encodeURIComponent(endInput.value));

                            const token = TokenManager.getToken();
                            const url = `http://localhost/api/analytics/clicks/export?${params.join("&")}`;

                            const resp = await fetch(url, {
                                headers: {
                                    "accept": "application/json",
                                    "Authorization": `Bearer ${token}`
                                }
                            });

                            if (!resp.ok) {
                                let msg = "Clicks export error";
                                try { const err = await resp.json(); msg = err.detail || msg; } catch { }

                                showNotification(msg, "error");
                                return;
                            }

                            const blob = await resp.blob();
                            const a = document.createElement("a");

                            a.href = window.URL.createObjectURL(blob); a.download = `clicks_export.${format}`;
                            document.body.appendChild(a);

                            a.click();
                            a.remove();
                        } catch (e) {
                            showNotification(e.message || "Export error", "error");
                        }
                    };
                }
            }, 0);

            if (data.hourly_stats && data.hourly_stats.length) {
                html += `<div class="mt-8 w-full"><div class="text-lg font-semibold text-indigo-300 mb-2">Hourly activity</div><canvas id="stats-hourly-chart" height="80"></canvas></div>`;
            }

            if (data.daily_stats && data.daily_stats.length) {
                html += `<div class="mt-8 w-full"><div class="text-lg font-semibold text-indigo-300 mb-2">Dynamics by day</div><canvas id="stats-daily-chart" height="80"></canvas></div>`;
            }

            html += `<div class="flex flex-col md:flex-row gap-6 mt-8 w-full">`;
            html += `<div class="flex-1"><div class="chart-card h-full flex flex-col justify-center items-center"><div class="chart-title text-indigo-300 text-base font-semibold mb-2">Devices</div><canvas id="stats-devices-chart" width="320" height="320" style="max-width:320px;max-height:320px;"></canvas></div></div>`;
            html += `<div class="flex-1"><div class="chart-card h-full flex flex-col justify-center items-center"><div class="chart-title text-indigo-300 text-base font-semibold mb-2">OC</div><canvas id="stats-os-chart" width="320" height="320" style="max-width:320px;max-height:320px;"></canvas></div></div>`;
            html += `</div>`;
            html += `<div class="mt-8 w-full"><div class="text-md font-semibold text-indigo-300 mb-2">Browsers</div><ul class="text-zinc-300 text-sm flex flex-wrap gap-2">`;

            for (const [browser, count] of Object.entries(data.browsers || {}))
                html += `<li class="bg-zinc-800/60 rounded px-3 py-1">${browser}: <span class="text-indigo-400 font-bold">${count}</span></li>`;

            html += `</ul></div>`;
            html += `<div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">`;
            html += `<div><div class="text-md font-semibold text-indigo-300 mb-2">Counties</div><ul class="text-zinc-300 text-sm flex flex-wrap gap-2">`;

            for (const [country, count] of Object.entries(data.countries || {}))
                html += `<li class="bg-zinc-800/60 rounded px-3 py-1">${country}: <span class="text-indigo-400 font-bold">${count}</span></li>`;

            html += `</ul></div>`;
            html += `<div><div class="text-md font-semibold text-indigo-300 mb-2">Cities</div><ul class="text-zinc-300 text-sm flex flex-wrap gap-2">`;

            for (const [city, count] of Object.entries(data.cities || {}))
                html += `<li class="bg-zinc-800/60 rounded px-3 py-1">${city}: <span class="text-indigo-400 font-bold">${count}</span></li>`;

            html += `</ul></div>`;
            html += `</div>`;

            if (data.recent_clicks && data.recent_clicks.length) {
                html +=
                    `<div class="mt-8">
                        <div class="text-md font-semibold text-indigo-300 mb-2">Last clicks</div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm stylish-table">
                                <thead>
                                    <tr class="bg-zinc-800/80 text-indigo-200">
                                    <th class="px-3 py-2 rounded-tl-xl">Time</th>
                                    <th class="px-3 py-2">Country</th>
                                    <th class="px-3 py-2">City</th>
                                    <th class="px-3 py-2">Device</th>
                                    <th class="px-3 py-2 rounded-tr-xl">Browser</th>
                                    </tr>
                                </thead>
                                <tbody>`;

                for (const click of data.recent_clicks) {
                    const countryFlag = click.country_code ? `<img src="https://flagcdn.com/24x18/${click.country_code.toLowerCase()}.png" alt="${click.country}" class="inline-block rounded shadow mr-2 align-middle" style="width:24px;height:18px;">` : "";

                    const deviceIcon = click.device_type === "Mobile" ? "<svg class='inline w-5 h-5 text-indigo-400 mr-1 align-middle' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24'><rect x='7' y='2' width='10' height='20' rx='2'/><circle cx='12' cy='18' r='1.5'/></svg>" : "<svg class='inline w-5 h-5 text-indigo-400 mr-1 align-middle' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24'><rect x='3' y='4' width='18' height='14' rx='2'/><path d='M8 20h8'/></svg>";
                    const browserIcon = click.browser && click.browser.toLowerCase().includes("chrome") ? "<svg class='inline w-5 h-5 text-yellow-400 mr-1 align-middle' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10'/><path d='M12 2v10l8 4'/></svg>" : "<svg class='inline w-5 h-5 text-blue-400 mr-1 align-middle' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10'/></svg>";

                    html +=
                        `<tr class="hover:bg-indigo-950/40 transition">
                            <td class="px-3 py-2 font-mono text-zinc-200">${click.clicked_at.replace("T", " ").slice(0, 16)}</td>
                            <td class="px-3 py-2">${countryFlag}<span class="align-middle">${click.country || ""}</span></td>
                            <td class="px-3 py-2">${click.city || ""}</td>
                            <td class="px-3 py-2">${deviceIcon}<span class="align-middle">${click.device_type || ""}</span></td>
                            <td class="px-3 py-2">${browserIcon}<span class="align-middle">${click.browser || ""}</span></td>
                        </tr>`;
                }

                html +=
                    `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = html;
            if (data.hourly_stats && data.hourly_stats.length) {
                const ctx = document.getElementById("stats-hourly-chart").getContext("2d");
                new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels: data.hourly_stats.map(x => x.hour),
                        datasets: [{ label: "Clicks", data: data.hourly_stats.map(x => x.clicks), backgroundColor: "#818cf8", borderRadius: 8, borderSkipped: false, hoverBackgroundColor: "#a5b4fc" }]
                    },
                    options: {
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor: "#23232b", titleColor: "#a5b4fc", bodyColor: "#e4e4e7", borderColor: "#6366f1", borderWidth: 1, cornerRadius: 8, displayColors: false }
                        },
                        scales: { x: { grid: { display: false }, ticks: { color: "#a1a1aa" } }, y: { beginAtZero: true, grid: { color: "#27272a" }, ticks: { color: "#a1a1aa" } } },
                        animation: { duration: 700, easing: "easeOutQuart" },
                        layout: { padding: 16 },
                    }
                });
            }

            if (data.daily_stats && data.daily_stats.length) {
                const ctx = document.getElementById("stats-daily-chart").getContext("2d");
                new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: data.daily_stats.map(x => x.date),
                        datasets: [{
                            label: "Clicks",
                            data: data.daily_stats.map(x => x.clicks),
                            borderColor: "#a5b4fc",
                            backgroundColor: "rgba(129,140,248,0.18)",
                            tension: 0.45,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: "#818cf8",
                            pointBorderColor: "#23232b",
                            pointBorderWidth: 2,
                            fill: true,
                            shadowColor: "#a5b4fc",
                            shadowBlur: 16
                        }]
                    },
                    options: {
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor: "#23232b", titleColor: "#a5b4fc", bodyColor: "#e4e4e7", borderColor: "#6366f1", borderWidth: 1, cornerRadius: 8, displayColors: false }
                        },
                        scales: { x: { grid: { display: false }, ticks: { color: "#a1a1aa" } }, y: { beginAtZero: true, grid: { color: "#27272a" }, ticks: { color: "#a1a1aa" } } },
                        animation: { duration: 900, easing: "easeOutQuart" },
                        layout: { padding: 16 },
                    }
                });
            }

            if (data.devices) {
                const ctx = document.getElementById("stats-devices-chart").getContext("2d");
                new Chart(ctx, {
                    type: "doughnut",
                    data: {
                        labels: Object.keys(data.devices),
                        datasets: [{
                            data: Object.values(data.devices),
                            backgroundColor: ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#f472b6", "#fbbf24"],
                            borderWidth: 3,
                            borderColor: "#18181b",
                            hoverBorderColor: "#a5b4fc",
                            hoverOffset: 8,
                        }]
                    },
                    options: {
                        cutout: "68%",
                        plugins: {
                            legend: {
                                display: true,
                                position: "bottom",
                                labels: {
                                    color: "#c7d2fe",
                                    font: { size: 13, weight: "bold" },
                                    padding: 12
                                }
                            },
                            tooltip: {
                                backgroundColor: "#23232b",
                                titleColor: "#a5b4fc",
                                bodyColor: "#e4e4e7",
                                borderColor: "#6366f1",
                                borderWidth: 1,
                                cornerRadius: 8,
                                displayColors: true
                            },
                        },
                        animation: { duration: 900, easing: "easeOutQuart" },
                        layout: { padding: 24 },
                    }
                });
            }

            if (data.operating_systems) {
                const ctx = document.getElementById("stats-os-chart").getContext("2d");
                new Chart(ctx, {
                    type: "doughnut",
                    data: {
                        labels: Object.keys(data.operating_systems),
                        datasets: [{
                            data: Object.values(data.operating_systems),
                            backgroundColor: ["#818cf8", "#6366f1", "#fbbf24", "#f472b6", "#a5b4fc", "#c7d2fe"],
                            borderWidth: 3,
                            borderColor: "#18181b",
                            hoverBorderColor: "#a5b4fc",
                            hoverOffset: 8,
                        }]
                    },
                    options: {
                        cutout: "68%",
                        plugins: {
                            legend: {
                                display: true,
                                position: "bottom",
                                labels: {
                                    color: "#c7d2fe",
                                    font: { size: 13, weight: "bold" },
                                    padding: 12
                                }
                            },
                            tooltip: {
                                backgroundColor: "#23232b",
                                titleColor: "#a5b4fc",
                                bodyColor: "#e4e4e7",
                                borderColor: "#6366f1",
                                borderWidth: 1,
                                cornerRadius: 8,
                                displayColors: true
                            },
                        },
                        animation: { duration: 900, easing: "easeOutQuart" },
                        layout: { padding: 24 },
                    }
                });
            }
        }

        async function loadEditLinkModal() {
            if (document.getElementById("edit-link-modal"))
                return;

            const html = await fetch("modals/edit_link_modal.html").then(r => r.text());
            document.getElementById("edit-link-modal-placeholder").innerHTML = html;

            initEditLinkModalHandlers();
        }

        function initEditLinkModalHandlers() {
            window.openEditLinkModal = function (link) {
                let modal = document.getElementById("edit-link-modal"); if (!modal)
                    return;

                modal.classList.remove("hidden");
                modal.style.display = "";

                document.getElementById("edit-link-password").value = link.password || "";
                document.getElementById("edit-link-expires").value = link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 16) : "";

                document.getElementById("edit-link-clicks").value = link.remaining_clicks != null ? link.remaining_clicks : "";
                document.getElementById("edit-link-hide-thumb").checked = !!link.hide_thumbnail;

                modal.dataset.urlId = link.id || link.url_id;
            };

            function closeEditLinkModal() {
                let modal = document.getElementById("edit-link-modal");
                if (modal) {
                    modal.classList.add("hidden");
                    modal.style.display = "none";
                }
            }

            const modal = document.getElementById("edit-link-modal");
            if (modal) {
                modal.addEventListener("click", function (e) {
                    const closeBtn = e.target.closest("#close-edit-link");
                    const cancelBtn = e.target.closest("#cancel-edit-link");

                    if (closeBtn || cancelBtn)
                        closeEditLinkModal();
                });
            }

            document.addEventListener("submit", async function (e) {
                if (e.target && e.target.id === "edit-link-form") {
                    e.preventDefault();

                    const modal = document.getElementById("edit-link-modal");
                    const urlId = modal ? modal.dataset.urlId : null;

                    if (!urlId)
                        return;

                    const token = TokenManager.getToken();
                    let password = document.getElementById("edit-link-password").value.trim();

                    let expires_at = document.getElementById("edit-link-expires").value;
                    let remaining_clicks = document.getElementById("edit-link-clicks").value;
                    let hide_thumbnail = document.getElementById("edit-link-hide-thumb").checked;

                    password = password === "" ? null : password;
                    expires_at = expires_at === "" ? null : new Date(expires_at).toISOString();
                    remaining_clicks = remaining_clicks === "" ? null : Number(remaining_clicks);

                    const payload = {
                        password,
                        hide_thumbnail,
                        expires_at,
                        remaining_clicks
                    };

                    try {
                        const resp = await fetch(`http://localhost/api/urls/${urlId}`, {
                            method: "PUT",
                            headers: {
                                "accept": "application/json",
                                "Authorization": `Bearer ${token}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(payload)
                        });

                        if (!resp.ok)
                            throw new Error("Save error");

                        showNotification("The link is updated", "success"); closeEditLinkModal();
                        window.loadMyLinks(window.linksSkip, window.LINKS_LIMIT, window.lastMyLinksFilterParams || null);
                    } catch (err) {
                        showNotification("Save error", "error");
                    }
                }
            });
        }

        loadEditLinkModal();

        if (TokenManager.isAuthenticated()) {
            urls.forEach(async (link, idx) => {
                try {
                    const token = TokenManager.getToken();
                    const urlId = link.id || link.url_id;

                    if (!urlId)
                        return;

                    const resp = await fetch(`http://localhost/api/analytics/clicks/${urlId}`, {
                        method: "GET",
                        headers: {
                            "accept": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    });

                    if (!resp.ok) {
                        if (resp.status === 401 || resp.status === 403) {
                            const el = document.getElementById(`my-link-clicks-${idx}`); if (el)
                                el.textContent = "—";

                            return;
                        }
                        throw new Error("Error receiving clicks");
                    }

                    const data = await resp.json();
                    const clicks = typeof data.total_clicks === "number" ? data.total_clicks : 0;

                    const el = document.getElementById(`my-link-clicks-${idx}`); if (el)
                        el.textContent = clicks;
                } catch (e) {
                    const el = document.getElementById(`my-link-clicks-${idx}`); if (el)
                        el.textContent = "—";
                }
            });
        }

        setTimeout(() => {
            urls.forEach((link, idx) => {
                const qrBtn = document.querySelector(`button[data-qr-idx="${idx}"]`);
                if (qrBtn) {
                    qrBtn.onclick = async function (e) {
                        e.preventDefault();

                        try {
                            const qrUrl = document.getElementById("qr-url");
                            const qrModal = document.getElementById("qr-modal");
                            const qrPlaceholder = document.getElementById("qr-placeholder");

                            const qrCanvas = document.getElementById("qr-canvas");
                            const qrCodeContainer = document.getElementById("qr-code-container");

                            if (!qrModal)
                                return;

                            if (qrCodeContainer)
                                qrCodeContainer.innerHTML = "";

                            if (qrPlaceholder)
                                qrPlaceholder.classList.remove("hidden");

                            if (qrCanvas)
                                qrCanvas.classList.add("hidden");

                            if (qrUrl)
                                qrUrl.textContent = link.short_url;

                            const token = TokenManager.getToken();
                            const urlId = link.id || link.url_id;

                            if (!urlId)
                                throw new Error("No link id");

                            const apiBase = API_CONFIG.URLS_BASE_URL || "";
                            let base = apiBase.replace(/\/?urls\/?$/, "");

                            const resp = await fetch(`${base}/urls/${urlId}/qr`, {
                                method: "GET",
                                headers: {
                                    "accept": "application/json",
                                    "Authorization": `Bearer ${token}`
                                }
                            });

                            if (!resp.ok)
                                throw new Error("Error receiving QR code");

                            const data = await resp.json();
                            if (data && data.qr_code) {
                                const img = document.createElement("img");

                                img.src = data.qr_code;
                                img.alt = "QR-code";
                                img.width = 200;
                                img.height = 200;
                                img.className = "mx-auto rounded";

                                if (qrCodeContainer)
                                    qrCodeContainer.appendChild(img);

                                if (qrPlaceholder)
                                    qrPlaceholder.classList.add("hidden");

                                if (qrCanvas)
                                    qrCanvas.classList.add("hidden");
                            } else {
                                throw new Error("QR code not found in response");
                            }

                            openModal(qrModal);
                        } catch (error) {
                            showNotification("Error receiving QR code", "error");
                        }
                    };
                }
            });
        }, 0);
    }

    function renderMyLinksSummary(count, total) {
        myLinksSummary.textContent = `${count} of ${total} links shown`;
    }

    function renderMyLinksPagination(skip, limit, total) {
        const currentPage = Math.floor(skip / limit) + 1;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        if (currentPage > totalPages) {
            window.linksSkip = 0; if (window.lastMyLinksFilterParams)
                window.lastMyLinksFilterParams.skip = 0;

            window.loadMyLinks(0, limit, window.lastMyLinksFilterParams || null);
            return;
        }

        let html = ""; html += `<button class="px-3 py-1 bg-zinc-800 text-zinc-400 rounded text-sm hover:bg-zinc-700 transition-colors" ${currentPage === 1 ? "disabled" : ""} data-page="prev">Previous</button>`;
        for (let i = 1; i <= totalPages; i++)
            html += `<button class="px-3 py-1 ${i === currentPage ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"} rounded text-sm" data-page="${i}">${i}</button>`;

        html += `<button class="px-3 py-1 bg-zinc-800 text-zinc-300 rounded text-sm hover:bg-zinc-700 transition-colors" ${currentPage === totalPages ? "disabled" : ""} data-page="next">Next</button>`;
        myLinksPagination.innerHTML = html;

        Array.from(myLinksPagination.querySelectorAll("button[data-page]")).forEach(btn => {
            btn.onclick = function () {
                let page = this.getAttribute("data-page");

                let filterParams = window.lastMyLinksFilterParams ? { ...window.lastMyLinksFilterParams } : null;
                let newSkip = window.linksSkip;

                if (page === "prev") {
                    if (currentPage > 1)
                        newSkip = window.linksSkip - window.LINKS_LIMIT;
                } else if (page === "next") {
                    if (currentPage < totalPages)
                        newSkip = window.linksSkip + window.LINKS_LIMIT;
                } else {
                    newSkip = (parseInt(page) - 1) * window.LINKS_LIMIT;
                }

                window.linksSkip = newSkip; if (filterParams) {
                    filterParams.skip = newSkip;
                    filterParams.limit = window.LINKS_LIMIT;
                }

                window.loadMyLinks(newSkip, window.LINKS_LIMIT, filterParams);
            };
        });
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>""]/g, function (m) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': '&quot;', '\'': '&#39;' })[m];
        });
    }

    function formatCreatedAgo(dateStr) {
        if (!dateStr)
            return "";

        const date = new Date(dateStr);
        const now = new Date();

        const dateYMD = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
        const nowYMD = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();

        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayYMD = yesterday.getFullYear() + "-" + (yesterday.getMonth() + 1) + "-" + yesterday.getDate();

        if (dateYMD === nowYMD)
            return "today";

        if (dateYMD === yesterdayYMD)
            return "yesterday";

        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24)); if (diffDays < 5)
            return `${diffDays} days ago`;

        return `${diffDays} days ago`;
    }

    window.loadMyLinks(window.linksSkip, window.LINKS_LIMIT);

    try {
        if (typeof APIClient === "undefined") {
            console.error("APIClient not loaded!");
            return;
        }

        if (typeof TokenManager === "undefined") {
            console.error("TokenManager not loaded!");
            return;
        }

        if (typeof UserManager === "undefined") {
            console.error("UserManager not loaded!");
            return;
        }

        if (typeof Chart === "undefined") {
            console.error("Chart.js not loaded!");
            return;
        }

        await loadModalHTML();
        await initializeMainFunctionality();
    } catch (error) {
        console.error("Initialization error:", error);
    }
});

async function loadModalHTML() {
    try {
        const [qrHTML, loginHTML, registerHTML, filterHTML, emailVerificationHTML] = await Promise.all([
            fetch("modals/qr_modal.html").then(res => {
                if (!res.ok)
                    throw new Error(`QR modal: ${res.statusText}`);

                return res.text();
            }),

            fetch("modals/login_modal.html").then(res => {
                if (!res.ok)
                    throw new Error(`Login modal: ${res.statusText}`);

                return res.text();
            }),

            fetch("modals/register_modal.html").then(res => {
                if (!res.ok)
                    throw new Error(`Register modal: ${res.statusText}`);

                return res.text();
            }),

            fetch("modals/filter_modal.html").then(res => {
                if (!res.ok)
                    throw new Error(`Filter modal: ${res.statusText}`);

                return res.text();
            }),

            fetch("modals/email_verification_modal.html").then(res => {
                if (!res.ok)
                    throw new Error(`Email verification modal: ${res.statusText}`);

                return res.text();
            })
        ]);

        document.getElementById("qr-modal-placeholder").innerHTML = qrHTML;
        document.getElementById("login-modal-placeholder").innerHTML = loginHTML;
        document.getElementById("register-modal-placeholder").innerHTML = registerHTML;
        document.getElementById("filter-modal-placeholder").innerHTML = filterHTML;
        document.getElementById("email-verification-modal-placeholder").innerHTML = emailVerificationHTML;

        initializeModalHandlers();
        return true;
    } catch (error) {
        console.error("Error loading modal windows:", error);
        return false;
    }
}

function initializeModalHandlers() {
    const loginBtn = document.getElementById("login-btn");
    const registerBtn = document.getElementById("register-btn");

    const loginModal = document.getElementById("login-modal");
    const registerModal = document.getElementById("register-modal");

    const closeLogin = document.getElementById("close-login");
    const closeRegister = document.getElementById("close-register");

    const switchToRegister = document.getElementById("switch-to-register");
    const switchToLogin = document.getElementById("switch-to-login");

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const forgotPasswordLink = loginModal && loginModal.querySelector('a[href="#"]:not([id])');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", async function (e) {
            e.preventDefault();

            await window.loadPasswordResetModal();
            const modal = document.getElementById("password-reset-modal");

            if (modal)
                openModal(modal);
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", function (e) {
            e.preventDefault();
            if (loginModal) openModal(loginModal); else console.error("The login modal window was not found");
        });
    } else {
        console.error("Login button not found");
    }

    if (registerBtn) {
        registerBtn.addEventListener("click", function (e) {
            e.preventDefault();
            if (registerModal) openModal(registerModal); else console.error("The registration modal window was not found");
        });
    } else {
        console.error("Registration button not found");
    }

    if (closeLogin) {
        closeLogin.addEventListener("click", function () {
            if (loginModal)
                closeModal(loginModal);
        });
    }

    if (closeRegister) {
        closeRegister.addEventListener("click", function () {
            if (registerModal)
                closeModal(registerModal);
        });
    }

    if (switchToRegister) {
        switchToRegister.addEventListener("click", function (e) {
            e.preventDefault();

            if (loginModal)
                closeModal(loginModal);

            if (registerModal)
                openModal(registerModal);
        });
    }

    if (switchToLogin) {
        switchToLogin.addEventListener("click", function (e) {
            e.preventDefault();

            if (registerModal)
                closeModal(registerModal);

            if (loginModal)
                openModal(loginModal);
        });
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const identifier = loginForm.querySelector('input[name="identifier"]').value;
            const password = loginForm.querySelector('input[name="password"]').value;
            const rememberMe = loginForm.querySelector('input[name="remember - me"]').checked;

            if (!identifier || !password) {
                showNotification("Please fill in all fields", "error");
                return;
            }

            const submitBtn = loginForm.querySelector("button[type='submit']");
            const originalText = submitBtn.textContent;

            submitBtn.disabled = true;
            submitBtn.textContent = "Signing...";

            try {
                const response = await APIClient.login({
                    identifier: identifier,
                    password: password
                });

                if (rememberMe)
                    TokenManager.setToken(response.access_token);
                else
                    TokenManager.setSessionToken(response.access_token);

                await UserManager.loadCurrentUser(); if (loginModal)
                    closeModal(loginModal);

                UserManager.updateUI();
                showNotification("Welcome back!", "success"); setTimeout(() => {
                    window.location.reload();
                }, 700);
            } catch (error) {
                console.error("Login error:", error);

                if (error.originalMessage && error.originalMessage.includes("Please verify your email address before logging in")) {
                    if (loginModal)
                        closeModal(loginModal);

                    setTimeout(() => {
                        openEmailVerificationModal(identifier);
                    }, 300);

                    return;
                }

                let message = error.message || "Error logging into the system"; if (error.originalMessage && error.originalMessage !== error.message)
                    message += `\n(${error.originalMessage})`;

                showNotification(message, "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const name = registerForm.querySelector("input[name='username']").value;
            const email = registerForm.querySelector("input[name='email']").value;

            const password = registerForm.querySelector("input[name='password']").value;
            const confirmPassword = registerForm.querySelector("input[name='confirmPassword']").value;

            const agreement = registerForm.querySelector("input[type='checkbox']").checked;

            if (!name || !email || !password || !confirmPassword) {
                showNotification("Please fill in all fields", "error");
                return;
            }

            if (password !== confirmPassword) {
                showNotification("The passwords does not match", "error");
                return;
            }

            if (password.length < 8) {
                showNotification("The password must contain at least 8 characters.", "error");
                return;
            }

            if (!/[A-Z]/.test(password)) {
                showNotification("The password must contain at least one uppercase letter", "error");
                return;
            }

            if (!/[a-z]/.test(password)) {
                showNotification("The password must contain at least one lowercase letter", "error");
                return;
            }

            if (!/\d/.test(password)) {
                showNotification("The password must contain at least one number", "error");
                return;
            }

            if (!agreement) {
                showNotification("You must accept the terms & conditions of use", "error");
                return;
            }

            const submitBtn = registerForm.querySelector("button[type='submit']");
            const originalText = submitBtn.textContent;

            submitBtn.disabled = true;
            submitBtn.textContent = "Registration...";

            try {
                const response = await APIClient.register({
                    email: email,
                    username: name,
                    password: password
                });

                showNotification("Registration was successful! Check your email to activate your account.", "success"); if (registerModal)
                    closeModal(registerModal);

                setTimeout(() => {
                    const loginModal = document.getElementById("login-modal");
                    if (loginModal) {
                        openModal(loginModal);

                        const emailInput = loginModal.querySelector("input[name='identifier']"); if (emailInput)
                            emailInput.value = email;
                    }
                }, 1000);

                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } catch (error) {
                console.error("Registration error:", error);
                showNotification(error.message || "Registration error", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    initializeOtherModals();
}

function initializeOtherModals() {
    const qrBtn = document.getElementById("qr-btn");
    const qrModal = document.getElementById("qr-modal");
    const closeQr = document.getElementById("close-qr");

    const qrPlaceholder = document.getElementById("qr-placeholder");
    const qrCanvas = document.getElementById("qr-canvas");

    const qrCodeContainer = document.getElementById("qr-code-container");
    const qrUrl = document.getElementById("qr-url");

    let qrTooltip = document.getElementById("qr-auth-tooltip");
    if (!qrTooltip && qrBtn) {
        let wrapper = qrBtn.parentNode;
        if (!wrapper.classList.contains("relative") || !wrapper.classList.contains("inline-block")) {
            wrapper = document.createElement("div");
            wrapper.className = "relative inline-block";

            qrBtn.parentNode.insertBefore(wrapper, qrBtn);
            wrapper.appendChild(qrBtn);
        }

        qrTooltip = document.createElement("div");
        qrTooltip.id = "qr-auth-tooltip";

        qrTooltip.textContent = "Authorization is required to receive the QR code";
        qrTooltip.className = "pointer-events-none select-none text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-red-400 text-red-300 shadow-lg absolute z-[9999] opacity-0 transition-opacity duration-200";

        qrTooltip.style.left = "50%";
        qrTooltip.style.transform = "translateX(-50%)";
        qrTooltip.style.bottom = `calc(100% + 8px)`;
        qrTooltip.style.top = "";

        qrTooltip.style.whiteSpace = "nowrap";
        qrTooltip.style.minWidth = "max-content";

        qrTooltip.style.pointerEvents = "none";
        qrTooltip.style.display = "block";

        wrapper.appendChild(qrTooltip);
    }

    if (qrBtn && qrModal) {
        function showTooltip() {
            if (qrTooltip && qrBtn.disabled)
                qrTooltip.style.opacity = "1";
        }

        function hideTooltip() {
            if (qrTooltip)
                qrTooltip.style.opacity = "0";
        }

        qrBtn.addEventListener("mouseenter", showTooltip);
        qrBtn.addEventListener("mouseleave", hideTooltip);

        qrBtn.addEventListener("focus", showTooltip);
        qrBtn.addEventListener("blur", hideTooltip);

        function updateQrBtnState() {
            const isAuthenticated = TokenManager.isAuthenticated();
            if (!isAuthenticated) {
                qrBtn.setAttribute("disabled", "disabled");
                qrBtn.classList.add("opacity-60", "cursor-not-allowed");
            } else {
                qrBtn.removeAttribute("disabled");
                qrBtn.classList.remove("opacity-60", "cursor-not-allowed");

                if (qrTooltip)
                    qrTooltip.style.opacity = "0";
            }
        }

        updateQrBtnState();
        setInterval(updateQrBtnState, 1000);

        qrBtn.addEventListener("click", async function () {
            if (qrBtn.disabled)
                return;

            const shortenedUrl = document.getElementById("shortened-url").textContent;
            const urlId = window.lastShortUrlId;

            if (!urlId) {
                showNotification("Failed to get link ID for QR code", "error");
                return;
            }

            if (qrUrl)
                qrUrl.textContent = shortenedUrl;

            if (qrPlaceholder)
                qrPlaceholder.classList.remove("hidden");

            if (qrCanvas)
                qrCanvas.classList.add("hidden");

            const oldImg = qrCodeContainer ? qrCodeContainer.querySelector("img") : null; if (oldImg)
                oldImg.remove();

            try {
                const token = TokenManager.getToken();

                const apiBase = API_CONFIG.URLS_BASE_URL || "";
                let base = apiBase.replace(/\/?urls\/?$/, "");

                const resp = await fetch(`${base}/urls/${urlId}/qr`, {
                    method: "GET",
                    headers: {
                        "accept": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (!resp.ok)
                    throw new Error("Error receiving QR code");

                const data = await resp.json();
                if (data && data.qr_code) {
                    const img = document.createElement("img");

                    img.src = data.qr_code;
                    img.alt = "QR-code";
                    img.width = 200;
                    img.height = 200;
                    img.className = "mx-auto rounded";

                    if (qrCodeContainer)
                        qrCodeContainer.appendChild(img);

                    if (qrPlaceholder)
                        qrPlaceholder.classList.add("hidden");

                    if (qrCanvas)
                        qrCanvas.classList.add("hidden");
                } else {
                    throw new Error("QR code not found in response");
                }
            } catch (error) {
                if (qrPlaceholder)
                    qrPlaceholder.classList.remove("hidden");

                showNotification("Error receiving QR code", "error");
            }

            openModal(qrModal);
        });
    }

    if (closeQr && qrModal) {
        closeQr.addEventListener("click", function () {
            closeModal(qrModal);
        });
    }

    const downloadQr = document.getElementById("download-qr");
    if (downloadQr) {
        downloadQr.addEventListener("click", function () {
            try {
                const img = qrCodeContainer ? qrCodeContainer.querySelector("img") : null;
                if (img && img.src) {
                    const link = document.createElement("a");

                    link.download = "qr-code.png";
                    link.href = img.src;

                    link.click();
                } else {
                    showNotification("QR code not generated", "error");
                }
            } catch (error) {
                console.error("Error downloading QR code:", error);
                showNotification("Error downloading QR code", "error");
            }
        });
    }

    const filterBtn = document.getElementById("filter-btn");
    const filterModal = document.getElementById("filter-modal");
    const closeFilter = document.getElementById("close-filter");
    const applyFilter = document.getElementById("apply-filter");
    const resetFilter = document.getElementById("reset-filter");

    if (filterBtn && filterModal) {
        filterBtn.addEventListener("click", function () {
            openModal(filterModal);
        });
    }

    if (closeFilter && filterModal) {
        closeFilter.addEventListener("click", function () {
            closeModal(filterModal);
        });
    }

    if (applyFilter && filterModal) {
        applyFilter.addEventListener("click", function () {
            const selects = filterModal.querySelectorAll("select"); const inputs = filterModal.querySelectorAll("input");
            let created_from = null, created_to = null, min_clicks = null, max_clicks = null, domain = null;

            if (selects[0]) {
                const val = selects[0].value;
                const now = new Date();

                if (val === "Today") {
                    created_from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                    created_to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
                } else if (val === "This week") {
                    const day = now.getDay() || 7;

                    created_from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).toISOString();
                    created_to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
                } else if (val === "This month") {
                    created_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                    created_to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
                }
            }

            if (selects[1]) {
                const val = selects[1].value;
                if (val === "0 clicks") {
                    min_clicks = 0; max_clicks = 0;
                } else if (val === "1-10 clicks") {
                    min_clicks = 1; max_clicks = 10;
                } else if (val === "11-100 clicks") {
                    min_clicks = 11; max_clicks = 100;
                } else if (val === "100+ clicks") {
                    min_clicks = 101;
                }
            }

            if (inputs[0])
                domain = inputs[0].value.trim() || null;

            const params = {
                skip: window.linksSkip || 0,
                limit: window.LINKS_LIMIT || 5,
            };

            if (created_from)
                params.created_from = created_from;

            if (created_to)
                params.created_to = created_to;

            if (min_clicks !== null)
                params.min_clicks = min_clicks;

            if (max_clicks !== null)
                params.max_clicks = max_clicks;

            if (domain)
                params.domain = domain;

            window.linksSkip = 0; params.skip = 0;
            window.lastMyLinksFilterParams = params;

            localStorage.setItem("myLinksFilterParams", JSON.stringify(params));
            window.loadMyLinks(0, params.limit, params);

            closeModal(filterModal);
        });
    }

    if (resetFilter && filterModal) {
        resetFilter.addEventListener("click", function () {
            const selects = filterModal.querySelectorAll("select");
            const inputs = filterModal.querySelectorAll("input");

            selects.forEach(select => select.selectedIndex = 0);
            inputs.forEach(input => input.value = "");

            window.lastMyLinksFilterParams = null;
            localStorage.removeItem("myLinksFilterParams");

            window.linksSkip = 0;
            window.loadMyLinks(0, window.LINKS_LIMIT);
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        const saved = localStorage.getItem("myLinksFilterParams");
        if (saved) {
            try {
                const params = JSON.parse(saved);

                window.lastMyLinksFilterParams = params;
                window.loadMyLinks(params.skip || 0, params.limit || window.LINKS_LIMIT, params);
            } catch (e) {
                window.loadMyLinks(window.linksSkip, window.LINKS_LIMIT);
            }
        } else {
            window.loadMyLinks(window.linksSkip, window.LINKS_LIMIT);
        }
    });
}

async function checkAuthenticationStatus() {
    if (TokenManager.isAuthenticated()) {
        try {
            await UserManager.loadCurrentUser();

            UserManager.updateUI();
            window.wasAuthenticated = true;
        } catch (error) {
            console.error("Token validation failed:", error);

            TokenManager.removeToken(); UserManager.updateUI();
            window.wasAuthenticated = false;
        }
    } else {
        UserManager.updateUI();
        window.wasAuthenticated = false;
    }
}

async function initializeMainFunctionality() {
    const allModals = document.querySelectorAll("[id$=' - modal']");

    allModals.forEach(modal => {
        modal.classList.add("hidden");
        modal.style.display = "none";
    });

    document.body.classList.remove("modal-open");
    document.documentElement.classList.remove("modal-open");

    await checkAuthenticationStatus();
    await loadPublicStats();

    initializeCharts();
    initializeUrlForm();

    initializeOtherFeatures();
    checkAuthenticationStatus();
}

let clickStatsData = {
    week: [],
    month: [],
    three_month: []
};

let clicksChart = null;
let currentClicksRange = "week"; // "week", "month", "three_month"

function initializeCharts() {
    const ctxLinks = document.getElementById("chart-links");
    const ctxDomains = document.getElementById("chart-domains");

    if (!ctxLinks || !ctxDomains) {
        console.error("No chart elements found:", {
            ctxLinks: !!ctxLinks,
            ctxDomains: !!ctxDomains
        }); return;
    }

    renderClicksChart("week");
    initializeDoughnutChart(ctxDomains); initializeClicksFilter();
}

function renderClicksChart(range) {
    const ctxLinks = document.getElementById("chart-links"); if (!ctxLinks)
        return;

    let statsArr = []; if (range === "week")
        statsArr = clickStatsData.week;
    else if (range === "month")
        statsArr = clickStatsData.month;
    else if (range === "three_month")
        statsArr = clickStatsData.three_month;

    const labels = statsArr.map(item => {
        const d = new Date(item.date);
        if (range === "three_month")
            return d.toLocaleDateString("en-EN", { day: "2-digit", month: "2-digit", year: "2-digit" });
        else
            return d.toLocaleDateString("en-EN", { day: "2-digit", month: "2-digit" });
    });

    const data = statsArr.map(item => item.clicks);

    let pointRadius = 6;
    let pointHoverRadius = 8;

    if (range === "month" || range === "three_month") {
        pointRadius = 0;
        pointHoverRadius = 0;
    }

    if (clicksChart) {
        clicksChart.data.labels = labels;

        clicksChart.data.datasets[0].data = data;
        clicksChart.data.datasets[0].pointRadius = pointRadius;
        clicksChart.data.datasets[0].pointHoverRadius = pointHoverRadius;

        clicksChart.options.scales.x.ticks.maxTicksLimit = range === "three_month" ? 15 : undefined;
        clicksChart.options.animation = { duration: 400 };

        clicksChart.update();
    } else {
        clicksChart = new Chart(ctxLinks.getContext("2d"), {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Clicks",
                    data: data,
                    borderColor: "#818cf8",
                    backgroundColor: "rgba(129,140,248,0.15)",
                    tension: 0.4,
                    fill: true,
                    pointRadius: pointRadius,
                    pointHoverRadius: pointHoverRadius,
                    pointBackgroundColor: "#818cf8",
                    pointBorderColor: "#1e1b4b",
                    pointBorderWidth: 2,
                }]
            },
            options: {
                animation: { duration: 400 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(39, 39, 42, 0.95)",
                        titleColor: "#a5b4fc",
                        bodyColor: "#e4e4e7",
                        borderColor: "#52525b",
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: function (context) {
                                return context[0].label;
                            },
                            label: function (context) {
                                return `${context.parsed.y} clicks`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: "#a1a1aa", font: { size: 12 }, maxTicksLimit: range === "three_month" ? 15 : undefined },
                        grid: { color: "rgba(161, 161, 170, 0.1)" }
                    },
                    y: {
                        ticks: { color: "#a1a1aa", font: { size: 12 } },
                        beginAtZero: true,
                        grid: { color: "rgba(161, 161, 170, 0.1)" }
                    }
                },
                layout: { padding: 20 },
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: "index"
                }
            }
        });
    }

    currentClicksRange = range;
    updateClicksFilterUI(range); updateStatsBlockById(range);
}

function updateStatsBlockById(range) {
    let statsArr = []; if (range === "week")
        statsArr = clickStatsData.week;
    else if (range === "month")
        statsArr = clickStatsData.month;
    else if (range === "three_month")
        statsArr = clickStatsData.three_month;

    let recordValue = 0;
    let recordDate = "";

    if (statsArr && statsArr.length > 0) {
        let maxItem = statsArr.reduce((max, item) => (item.clicks > max.clicks ? item : max), statsArr[0]); recordValue = maxItem.clicks;
        const d = new Date(maxItem.date); recordDate = d.toLocaleDateString("en-EN", { day: "numeric", month: "long" });
    }

    const recordValueElem = document.getElementById("record-day-value"); if (recordValueElem)
        recordValueElem.textContent = recordValue.toLocaleString("en-EN");

    const recordDateElem = document.getElementById("record-day-date"); if (recordDateElem)
        recordDateElem.textContent = recordDate;

    function getClicks(item) {
        if (typeof item === "number")
            return item;

        if (item && typeof item.clicks === "number")
            return item.clicks;

        return 0;
    }

    const today = statsArr && statsArr.length > 0 ? getClicks(statsArr[statsArr.length - 1]) : 0;
    const yesterday = statsArr && statsArr.length > 1 ? getClicks(statsArr[statsArr.length - 2]) : 0;

    let avg = 0;
    if (statsArr && statsArr.length > 0) {
        avg = statsArr.reduce((sum, item) => sum + getClicks(item), 0) / statsArr.length;
        avg = Number(avg.toFixed(1));
    }

    let percent = 0;
    if (yesterday === 0 && today > 0) {
        percent = 100;
    } else if (yesterday === 0 && today === 0) {
        percent = 0;
    } else {
        percent = Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
    }

    let percentColor = "text-zinc-500"; if (percent > 0)
        percentColor = "text-green-400";
    else if (percent < 0)
        percentColor = "text-red-400";

    let percentText = percent > 0 ? "+" + percent + "%" : percent < 0 ? "-" + Math.abs(percent) + "%" : "0%";
    let yesterdayChange = 0;

    if (statsArr && statsArr.length > 2) {
        const dayBeforeYesterday = getClicks(statsArr[statsArr.length - 3]);
        if (dayBeforeYesterday === 0 && yesterday > 0) {
            yesterdayChange = 100;
        } else if (dayBeforeYesterday === 0 && yesterday === 0) {
            yesterdayChange = 0;
        } else {
            yesterdayChange = Math.round(((yesterday - dayBeforeYesterday) / Math.abs(dayBeforeYesterday || 1)) * 100);
        }
    }

    const todayValue = document.getElementById("stat-today-value"); if (todayValue)
        todayValue.textContent = today.toLocaleString("en-EN");

    const todayPercent = document.getElementById("stat-today-percent"); if (todayPercent) {
        todayPercent.textContent = percentText;
        todayPercent.className = "text-xs " + percentColor;
    }

    const yesterdayValue = document.getElementById("stat-yesterday-value"); if (yesterdayValue)
        yesterdayValue.textContent = yesterday.toLocaleString("en-EN");

    const yesterdayPercent = document.getElementById("stat-yesterday-percent"); if (yesterdayPercent) {
        let yText = yesterdayChange > 0 ? "+" + yesterdayChange + "%" : yesterdayChange < 0 ? "-" + Math.abs(yesterdayChange) + "%" : "0%";
        let yColor = "text-zinc-500";

        if (yesterdayChange > 0)
            yColor = "text-green-400";
        else if (yesterdayChange < 0)
            yColor = "text-red-400";

        yesterdayPercent.textContent = yText;
        yesterdayPercent.className = "text-xs " + yColor;
    }

    const avgValue = document.getElementById("stat-avg-value"); if (avgValue)
        avgValue.textContent = avg.toLocaleString("en-EN");

    const avgLabel = document.getElementById("stat-avg-label"); if (avgLabel) {
        const rangeText = range === "week" ? "per week" : range === "month" ? "per 30 days" : "per 90 days";

        avgLabel.textContent = rangeText;
        avgLabel.className = "text-xs text-zinc-500";
    }
}

function initializeClicksFilter() {
    const btn7 = document.getElementById("clicks-filter-7");
    const btn30 = document.getElementById("clicks-filter-30");
    const btn90 = document.getElementById("clicks-filter-90");

    if (btn7)
        btn7.onclick = () => renderClicksChart("week");

    if (btn30)
        btn30.onclick = () => renderClicksChart("month");

    if (btn90)
        btn90.onclick = () => renderClicksChart("three_month");

    updateClicksFilterUI(currentClicksRange);
}

function updateClicksFilterUI(range) {
    const btn7 = document.getElementById("clicks-filter-7");
    const btn30 = document.getElementById("clicks-filter-30");
    const btn90 = document.getElementById("clicks-filter-90");

    [btn7, btn30, btn90].forEach(btn => {
        if (btn) {
            btn.classList.remove("bg-indigo-600", "text-white");
            btn.classList.add("bg-zinc-800/50", "text-zinc-400");
        }
    });

    if (btn7 && range === "week") {
        btn7.classList.add("bg-indigo-600", "text-white");
        btn7.classList.remove("bg-zinc-800/50", "text-zinc-400");
    }

    if (btn30 && range === "month") {
        btn30.classList.add("bg-indigo-600", "text-white");
        btn30.classList.remove("bg-zinc-800/50", "text-zinc-400");
    }

    if (btn90 && range === "three_month") {
        btn90.classList.add("bg-indigo-600", "text-white");
        btn90.classList.remove("bg-zinc-800/50", "text-zinc-400");
    }
}

function initializeUrlForm() {
    const urlInput = document.getElementById("url-input");

    const validationIcon = document.getElementById("validation-icon");
    const submitBtn = document.getElementById("submit-btn");

    const btnText = document.getElementById("btn-text");
    const btnLoading = document.getElementById("btn-loading");

    const urlForm = document.getElementById("url-form");
    const resultBlock = document.getElementById("result-block");

    if (!urlInput || !urlForm) {
        console.error("URL form elements not found");
        return;
    }

    urlInput.addEventListener("input", function () {
        const url = this.value;
        if (url && isValidURL(url)) {
            if (validationIcon)
                validationIcon.classList.remove("hidden");

            this.classList.add("border-green-500");
            this.classList.remove("border-zinc-700");
        } else {
            if (validationIcon)
                validationIcon.classList.add("hidden");

            this.classList.remove("border-green-500");
            this.classList.add("border-zinc-700");
        }
    });

    urlForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        try {
            if (submitBtn)
                ubmitBtn.disabled = true;

            if (btnText)
                btnText.classList.add("hidden");

            if (btnLoading)
                btnLoading.classList.remove("hidden");

            const originalUrl = urlInput.value.trim();
            if (!originalUrl || !isValidURL(originalUrl)) {
                throw new Error("Please enter a valid link");
            }

            const customCode = document.getElementById("custom-code-input")?.value.trim() || undefined;
            const password = document.getElementById("password-input")?.value.trim() || undefined;

            const clickLimit = document.getElementById("click-limit-input")?.value;
            const expiresAt = document.getElementById("expires-at-input")?.value;

            const hideThumbnail = document.getElementById("hide-thumbnail-toggle")?.checked || false;
            const isAnonymous = document.getElementById("anonymous-toggle")?.checked || false;
            const urlData = { original_url: originalUrl };

            if (customCode)
                urlData.custom_code = customCode;

            if (password)
                urlData.password = password;

            if (clickLimit && parseInt(clickLimit) > 0)
                urlData.remaining_clicks = parseInt(clickLimit);

            if (expiresAt)
                urlData.expires_at = new Date(expiresAt).toISOString();

            if (hideThumbnail)
                urlData.hide_thumbnail = true;

            const isAuthenticated = TokenManager.isAuthenticated();
            const shouldUseAuth = isAuthenticated && !isAnonymous;

            let response;
            if (shouldUseAuth) {
                response = await APIClient.shortenUrl(urlData);
            } else {
                response = await APIClient.makeAnonymousRequest(`${API_CONFIG.URLS_BASE_URL}/shorten`, {
                    method: "POST",
                    body: JSON.stringify(urlData)
                });
            }

            let created = false;
            if (response && response.short_url) {
                const shortenedUrlElement = document.getElementById("shortened-url"); if (shortenedUrlElement)
                    shortenedUrlElement.textContent = response.short_url;

                if (resultBlock) {
                    resultBlock.classList.remove("hidden");
                    resultBlock.scrollIntoView({ behavior: "smooth", block: "center" });
                }

                if (response.id)
                    window.lastShortUrlId = response.id;
                else
                    window.lastShortUrlId = undefined;

                clearFormAndHideOptions();
                created = true;
            } else if (response && response.success && response.data) {
                const shortenedUrlElement = document.getElementById("shortened-url");
                if (shortenedUrlElement)
                    shortenedUrlElement.textContent = response.data.short_url;

                if (resultBlock) {
                    resultBlock.classList.remove("hidden");
                    resultBlock.scrollIntoView({ behavior: "smooth", block: "center" });
                }

                if (response.data.id)
                    window.lastShortUrlId = response.data.id;
                else
                    window.lastShortUrlId = undefined;

                clearFormAndHideOptions();
                created = true;
            } else {
                throw new Error("Unexpected response format from server");
            }

            if (created && typeof loadMyLinks === "function") {
                linksSkip = 0;
                await loadMyLinks(0, LINKS_LIMIT);
            }
        } catch (error) {
            console.error("Error creating link:", error);
            showErrorMessage(error.message || "There was an error creating the link");
        } finally {
            if (submitBtn)
                submitBtn.disabled = false;

            if (btnText)
                btnText.classList.remove("hidden");

            if (btnLoading)
                btnLoading.classList.add("hidden");
        }
    });

    const copyBtn = document.getElementById("copy-btn");
    const copyText = document.getElementById("copy-text");

    if (copyBtn) {
        copyBtn.addEventListener("click", function () {
            const shortenedUrlElement = document.getElementById("shortened-url");
            if (shortenedUrlElement) {
                const shortenedUrl = shortenedUrlElement.textContent;

                navigator.clipboard.writeText(shortenedUrl).then(() => {
                    if (copyText)
                        copyText.textContent = "Copied!";

                    copyBtn.classList.add("bg-green-600");
                    copyBtn.classList.remove("bg-indigo-600");

                    setTimeout(() => {
                        if (copyText)
                            copyText.textContent = "Copy";
                        
                        copyBtn.classList.remove("bg-green-600");
                        copyBtn.classList.add("bg-indigo-600");
                    }, 2000);
                });
            }
        });
    }

    const passwordToggle = document.getElementById("password-toggle");
    const passwordInput = document.getElementById("password-input");

    const passwordIconHidden = document.getElementById("password-icon-hidden");
    const passwordIconVisible = document.getElementById("password-icon-visible");

    if (passwordToggle && passwordInput && passwordIconHidden && passwordIconVisible) {
        passwordToggle.addEventListener("click", function () {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                passwordIconHidden.classList.add("hidden");
                passwordIconVisible.classList.remove("hidden");
            } else {
                passwordInput.type = "password";
                passwordIconHidden.classList.remove("hidden");
                passwordIconVisible.classList.add("hidden");
            }
        });
    }

    const anonymousToggle = document.getElementById("anonymous-toggle"); if (anonymousToggle) {
        const isAuthenticated = TokenManager.isAuthenticated(); if (isAuthenticated) {
            anonymousToggle.checked = false;
        } else {
            anonymousToggle.checked = true;
            anonymousToggle.disabled = true;
        }

        function updateAnonymousToggleState() {
            const isAuth = TokenManager.isAuthenticated(); if (!isAuth) {
                anonymousToggle.checked = true;
                anonymousToggle.disabled = true;
            } else {
                anonymousToggle.disabled = false;
            }
        }

        setInterval(updateAnonymousToggleState, 1000);
    }
}

function initializeOtherFeatures() {
    const toggleOptions = document.getElementById("toggle-options");
    if (toggleOptions) {
        toggleOptions.onclick = function () {
            const block = document.getElementById("options-block");
            const arrow = document.getElementById("toggle-arrow");

            if (block)
                block.classList.toggle("hidden");

            if (arrow)
                arrow.classList.toggle("rotate-180");
        };
    }

    function updateFilterAndReloadState() {
        const isAuth = TokenManager.isAuthenticated();

        const reloadBtn = document.getElementById("reload-my-links-btn");
        const filterBtn = document.getElementById("filter-btn");

        if (reloadBtn) {
            if (!isAuth) {
                reloadBtn.setAttribute("disabled", "disabled");
                reloadBtn.classList.add("opacity-60", "cursor-not-allowed");
            } else {
                reloadBtn.removeAttribute("disabled");
                reloadBtn.classList.remove("opacity-60", "cursor-not-allowed");
            }
        }

        if (filterBtn) {
            if (!isAuth) {
                filterBtn.setAttribute("disabled", "disabled");
                filterBtn.classList.add("opacity-60", "cursor-not-allowed");
            } else {
                filterBtn.removeAttribute("disabled");
                filterBtn.classList.remove("opacity-60", "cursor-not-allowed");
            }
        }
    }

    updateFilterAndReloadState();
    setInterval(updateFilterAndReloadState, 1000);

    const reloadBtn = document.getElementById("reload-my-links-btn");
    if (reloadBtn) {
        if (!document.getElementById("reload-spin-style")) {
            const style = document.createElement("style");

            style.id = "reload-spin-style";
            style.innerHTML = `.reload-spin.spin { animation: spin-cw 0.7s linear; } @keyframes spin-cw { 100% { transform: rotate(360deg); } }`;

            document.head.appendChild(style);
        }

        reloadBtn.onclick = async function () {
            if (reloadBtn.disabled)
                return;

            const svg = reloadBtn.querySelector("svg");
            if (svg)
                svg.classList.add("spin");

            let filterParams = window.lastMyLinksFilterParams || null; if (typeof loadMyLinks === "function")
                await loadMyLinks(linksSkip, LINKS_LIMIT, filterParams);

            setTimeout(() => {
                if (svg)
                    svg.classList.remove("spin");
            }, 70);
        };
    }

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape")
            closeAllModals();
    });
}

function clearFormAndHideOptions() {
    const urlForm = document.getElementById("url-form"); if (urlForm)
        urlForm.reset();

    const urlInput = document.getElementById("url-input");
    const validationIcon = document.getElementById("validation-icon");

    if (urlInput) {
        urlInput.classList.remove("border-green-500");
        urlInput.classList.add("border-zinc-700");
    }

    if (validationIcon)
        validationIcon.classList.add("hidden");

    const anonymousToggle = document.getElementById("anonymous-toggle"); if (anonymousToggle) {
        const isAuthenticated = TokenManager.isAuthenticated();

        if (isAuthenticated) {
            anonymousToggle.checked = false;
        } else {
            anonymousToggle.checked = true;
            anonymousToggle.disabled = true;
        }
    }
}

function showErrorMessage(message) {
    const errorTranslations = [
        { pattern: /custom code.*exist|already exists|unique/i, text: "This short code is already taken. Try another one." },
        { pattern: /limit.*exceeded|rate.*limit/i, text: "Limit exceeded. Try again later." },
        { pattern: /password.*short|password.*weak/i, text: "The password is too simple or short." },
        { pattern: /invalid.*url/i, text: "Invalid link." },
        { pattern: /not authenticated|unauthorized|auth/i, text: "Authorization required." },
        { pattern: /not found/i, text: "Not found." },
        { pattern: /forbidden|access denied/i, text: "Access denied." },
        { pattern: /expired/i, text: "Expired." },
        { pattern: /too short/i, text: "Value too short." },
        { pattern: /too long/i, text: "Value too long." },
        { pattern: /required/i, text: "Fill in the required fields." },
        { pattern: /database|server|internal/i, text: "Server error. Please try again later." },
        { pattern: /validation/i, text: "Validation error. Please check your input." },
        { pattern: /already registered|already used/i, text: "Already in use." },
        { pattern: /email.*invalid/i, text: "Invalid email." },
        { pattern: /clicks.*limit/i, text: "Click limit exceeded." },
        { pattern: /date.*invalid/i, text: "Invalid date." },
        { pattern: /unknown/i, text: "Unknown error." },
    ];

    let translated = message; for (const t of errorTranslations) {
        if (t.pattern.test(message)) {
            translated = t.text;
            break;
        }
    }

    const notification = document.createElement("div");

    notification.className = "fixed top-4 right-4 z-50 bg-red-900/90 border border-red-700 text-red-100 px-6 py-4 rounded-lg shadow-lg max-w-md fade-in";
    notification.innerHTML =
        `
            <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.732 4c-.77-.833-1.964-.833-2.732 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
            <span class="flex-1">${translated}</span>
            <button class="text-red-300 hover:text-red-100 transition-colors ml-2" onclick="this.parentElement.parentElement.remove()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
            </div>
        `;

    document.body.appendChild(notification); setTimeout(() => {
        if (notification.parentElement)
            notification.remove();
    }, 5000);
}

function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

let scrollPosition = 0;
function openModal(modal) {
    if (!modal)
        return;

    const isAlreadyModalOpen = document.body.classList.contains("modal-open");
    const allModals = document.querySelectorAll("[id$=' - modal']");

    allModals.forEach(m => {
        if (m !== modal) {
            m.classList.add("hidden");
            m.style.display = "none";
        }
    });

    if (!isAlreadyModalOpen) {
        scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

        document.body.style.top = `-${scrollPosition}px`;
        document.body.classList.add("modal-open");

        document.documentElement.classList.add("modal-open");
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";

    const modalContent = modal.querySelector(".modal-content"); if (modalContent) {
        modalContent.style.filter = "none";
        modalContent.style.backdropFilter = "none";
    }
}

function closeModal(modal) {
    if (!modal) return;

    modal.classList.add("hidden");
    modal.style.display = "none";

    const anyModalOpen = document.querySelector("[id$=' - modal']:not(.hidden)");
    if (!anyModalOpen) {
        document.body.classList.remove("modal-open");
        document.documentElement.classList.remove("modal-open");

        document.body.style.top = "";
        window.scrollTo(0, scrollPosition);
    }
}

function closeAllModals() {
    const allModals = document.querySelectorAll("[id$=' - modal']");
    const anyModalOpen = document.querySelector("[id$=' - modal']:not(.hidden)");

    allModals.forEach(modal => {
        modal.classList.add("hidden");
        modal.style.display = "none";
    });

    if (anyModalOpen) {
        document.body.classList.remove("modal-open");
        document.documentElement.classList.remove("modal-open");

        document.body.style.top = "";
        window.scrollTo(0, scrollPosition);
    }
}

function showNotification(message, type = "info") {
    document.querySelectorAll(".notification-toast").forEach(toast => {
        if (toast.querySelector(".notification-message").textContent === message) {
            toast.remove();
        }
    });

    const notification = document.createElement("div");
    const bgColor = type === "error" ? "bg-red-500/90" : type === "success" ? "bg-emerald-500/90" : "bg-blue-500/90";

    const iconSvg = type === "error" ?
        `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
        </svg>`
        :
        type === "success" ?
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`
            :
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`;

    notification.className = `fixed bottom-4 right-4 ${bgColor} backdrop-blur-md text-white px-5 py-4 rounded-xl shadow-2xl border border-white/10 z-[99999] transform translate-x-full transition-all duration-300 max-w-sm text-sm font-medium notification-toast`;
    notification.innerHTML =
        `
            <div class="flex items-start gap-3">
            <div class="flex-shrink-0 mt-0.5 text-white">
                ${iconSvg}
            </div>
            <div class="flex-1 notification-message leading-relaxed">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()" class="flex-shrink-0 text-white/70 hover:text-white transition-colors ml-2 p-1 rounded hover:bg-white/10">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
            </div>
        `;

    let bottomOffset = 16;
    const existingNotifications = document.querySelectorAll(".notification-toast");

    if (existingNotifications.length > 0) {
        existingNotifications.forEach(toast => {
            const rect = toast.getBoundingClientRect();
            bottomOffset = Math.max(bottomOffset, window.innerHeight - rect.top + 16);
        });

        notification.style.bottom = `${bottomOffset}px`;
    }

    document.body.appendChild(notification);
    notification.style.zIndex = "99999";

    setTimeout(() => {
        notification.classList.remove("translate-x-full");
    }, 10);

    setTimeout(() => {
        notification.classList.add("translate-x-full"); setTimeout(() => {
            if (notification.parentNode)
                notification.remove();
        }, 500);
    }, 5000);
}

function updateUserInterface(isLoggedIn) {
    const loginBtn = document.getElementById("login-btn");
    const registerBtn = document.getElementById("register-btn");

    if (isLoggedIn) {
        const currentUser = UserManager.getCurrentUser();

        const username = currentUser ? (currentUser.username || currentUser.name || "User") : "User";
        const email = currentUser ? (currentUser.email || "") : "";

        loginBtn.style.display = "none"; if (registerBtn)
            registerBtn.style.display = "none";

        let userMenu = document.getElementById("user-menu");
        if (!userMenu) {
            userMenu = document.createElement("div");
            userMenu.id = "user-menu";

            userMenu.className = "relative";
            loginBtn.parentNode.insertBefore(userMenu, loginBtn);
        }

        userMenu.innerHTML =
            `
                <button id="user-menu-button" class="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-indigo-400 hover:bg-zinc-800/50 rounded-lg transition font-medium">
                    <div class="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                        <span class="text-white text-sm font-semibold leading-none">${username.charAt(0).toUpperCase()}</span>
                    </div>
                    <span class="hidden md:block align-middle leading-tight">${username}</span>
                    <svg class="w-4 h-4 transition-transform" id="user-menu-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div id="user-dropdown" class="hidden absolute right-0 mt-2 w-48 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 z-50">
                    <div class="py-1">
                        <div class="px-4 py-2 border-b border-zinc-700">
                            <div class="text-sm text-zinc-300 font-medium">${username}</div>
                            <div class="text-xs text-zinc-500">${email}</div>
                        </div>
                        <button id="user-settings" class="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            Settings
                        </button>
                        <button id="user-logout" class="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                            </svg>
                            Logout
                        </button>
                    </div>
                </div>
            `;

        const menuButton = document.getElementById("user-menu-button");
        const dropdown = document.getElementById("user-dropdown");
        const arrow = document.getElementById("user-menu-arrow");
        const logoutBtn = document.getElementById("user-logout");
        const settingsBtn = document.getElementById("user-settings");

        if (menuButton && dropdown) {
            menuButton.onclick = (e) => {
                e.stopPropagation();

                dropdown.classList.toggle("hidden");
                arrow.classList.toggle("rotate-180");
            };

            document.addEventListener("click", (e) => {
                if (!userMenu.contains(e.target)) {
                    dropdown.classList.add("hidden");
                    arrow.classList.remove("rotate-180");
                }
            });
        }

        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                try {
                    await UserManager.logout(); showNotification("You have successfully logged out", "success"); dropdown.classList.add("hidden"); setTimeout(() => {
                        window.location.reload();
                    }, 700);
                } catch (error) {
                    showNotification("Error while logout", "error");
                }
            };
        }

        if (settingsBtn) {
            settingsBtn.onclick = () => {
                dropdown.classList.add("hidden");
                arrow.classList.remove("rotate-180");

                openSettingsModal();
            };
        }

    } else {
        const userMenu = document.getElementById("user-menu"); if (userMenu)
            userMenu.remove();

        loginBtn.style.display = "block";
        loginBtn.textContent = "Sign In";

        loginBtn.onclick = function (e) {
            e.preventDefault(); const loginModal = document.getElementById("login-modal"); if (loginModal)
                openModal(loginModal);
        };

        if (registerBtn) {
            registerBtn.style.display = "block";
            registerBtn.onclick = function (e) {
                e.preventDefault(); const registerModal = document.getElementById("register-modal"); if (registerModal)
                    openModal(registerModal);
            };
        }
    }
}

function initializeDoughnutChart(ctxDomains) {
    try {
        const getOrCreateTooltip = (chart) => {
            let tooltipEl = chart.canvas.parentNode.querySelector(".custom-tooltip");
            if (!tooltipEl) {
                tooltipEl = document.createElement("div");

                tooltipEl.className = "custom-tooltip";
                tooltipEl.style.background = "rgba(39, 39, 42, 0.95)";
                tooltipEl.style.borderRadius = "8px";

                tooltipEl.style.color = "white";
                tooltipEl.style.opacity = "0";

                tooltipEl.style.pointerEvents = "none";
                tooltipEl.style.position = "absolute";

                tooltipEl.style.transform = "translate(-50%, 0)";
                tooltipEl.style.transition = "all .1s ease";

                tooltipEl.style.border = "1px solid #52525b";
                tooltipEl.style.width = "auto";
                tooltipEl.style.zIndex = "100";

                tooltipEl.style.padding = "8px 12px";
                tooltipEl.style.fontSize = "14px";

                chart.canvas.parentNode.appendChild(tooltipEl);
            }

            return tooltipEl;
        };

        const externalTooltipHandler = (context) => {
            const { chart, tooltip } = context;
            const tooltipEl = getOrCreateTooltip(chart);

            if (tooltip.opacity === 0) {
                tooltipEl.style.opacity = "0";
                return;
            }

            if (tooltip.body) {
                const dataPoint = tooltip.dataPoints[0];
                const total = dataPoint.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((dataPoint.raw / total) * 100).toFixed(1);

                tooltipEl.innerHTML = `<strong>${dataPoint.label}</strong><br/>${percentage}%`;
            }

            const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
            const canvasRect = chart.canvas.getBoundingClientRect();

            const centerX = canvasRect.width / 2;
            const centerY = canvasRect.height / 2;

            const mouseX = tooltip.caretX;
            const mouseY = tooltip.caretY;

            let offsetX = mouseX;
            let offsetY = mouseY;

            const distanceFromCenter = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
            if (distanceFromCenter < 80) {
                const angle = Math.atan2(mouseY - centerY, mouseX - centerX);

                offsetX = centerX + Math.cos(angle) * 120;
                offsetY = centerY + Math.sin(angle) * 120;
            }

            tooltipEl.style.opacity = "1";
            tooltipEl.style.left = positionX + offsetX + "px";
            tooltipEl.style.top = positionY + offsetY - 30 + "px";
        };

        domainsChart = new Chart(ctxDomains.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: ["vk.com", "youtube.com", "t.me", "instagram.com", "etc."],
                datasets: [{
                    label: "Domains",
                    data: [300, 100, 80, 60, 50],
                    backgroundColor: [
                        "#6366f1", "#818cf8", "#a5b4fc", "#38bdf8", "#f472b6"
                    ],
                    borderWidth: 0,
                    cutout: "60%"
                }]
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: externalTooltipHandler
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
            }
        });
    } catch (error) {
        console.error("Error creating pie chart:", error);
    }
}

function togglePassword(button) {
    const input = button.parentElement.querySelector("input");
    const svgElement = button.querySelector("svg");

    if (!input || !svgElement)
        return;

    button.classList.add("animate-lock"); if (input.type === "password") {
        input.type = "text";
        svgElement.innerHTML =
            `
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"></rect>
                <circle cx="12" cy="16" r="1" stroke-width="2"></circle>
                <path d="M7 11V7a5 5 0 0 1 9 -3 5 5 0 0 1 1 3" stroke-width="2"></path>
            `;

        button.setAttribute("title", "Hide password");
    } else {
        input.type = "password";
        svgElement.innerHTML =
            `
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"></rect>
                <circle cx="12" cy="16" r="1" stroke-width="2"></circle>
                <path d="m7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"></path>
            `;

        button.setAttribute("title", "Show password");
    }

    setTimeout(() => button.classList.remove("animate-lock"), 350);
}

function openEmailVerificationModal(email = "") {
    const modal = document.getElementById("email-verification-modal");

    const emailInput = document.getElementById("resend-email");
    const closeBtn = document.getElementById("close-email-verification");

    const backToLoginBtn = document.getElementById("back-to-login");
    const resendForm = document.getElementById("resend-verification-form");

    if (!modal) {
        console.error("Email verification modal not found");
        return;
    }

    if (emailInput && email)
        emailInput.value = email;

    if (closeBtn)
        closeBtn.onclick = () => closeModal(modal);

    if (backToLoginBtn) {
        backToLoginBtn.onclick = (e) => {
            e.preventDefault(); closeModal(modal); setTimeout(() => {
                const loginModal = document.getElementById("login-modal"); if (loginModal)
                    openModal(loginModal);
            }, 300);
        };
    }

    if (resendForm) {
        resendForm.onsubmit = async (e) => {
            e.preventDefault();

            const emailValue = emailInput ? emailInput.value : "";
            if (!emailValue) {
                showNotification("Enter your email address", "error");
                return;
            }

            const submitBtn = resendForm.querySelector("button[type='submit']");
            const originalText = submitBtn.textContent;

            submitBtn.disabled = true;
            submitBtn.textContent = "Sending...";

            try {
                await APIClient.resendActivation(emailValue);

                showNotification("Activation email sent! Check your email", "success");
                closeModal(modal);
            } catch (error) {
                if (error && error.originalMessage && typeof error.originalMessage === "object" && error.originalMessage.error === "cooldown") {
                    const min = error.originalMessage.remaining_minutes;
                    showNotification(error.originalMessage.message || `Please wait ${min} minutes before trying again`, "error");
                } else {
                    showNotification(error.message || "Error sending email", "error");
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        };
    }

    openModal(modal);
}

async function loadPublicStats() {
    try {
        const stats = await APIClient.getPublicStats();

        clickStatsData.week = Array.isArray(stats.week_stats) ? stats.week_stats : [];
        clickStatsData.month = Array.isArray(stats.month_stats) ? stats.month_stats : [];
        clickStatsData.three_month = Array.isArray(stats.three_month_stats) ? stats.three_month_stats : [];

        const totalClicksElem = document.getElementById("total-clicks-value"); if (totalClicksElem && stats.links && typeof stats.links.total_clicks === "number")
            totalClicksElem.textContent = stats.links.total_clicks.toLocaleString("en-EN");

        const statsBlocks = document.querySelectorAll("#stats .grid .col-span-12");
        if (statsBlocks[0] && stats.links) {
            const linksTotal = statsBlocks[0].querySelector(".text-4xl");
            const linksToday = statsBlocks[0].querySelector(".text-xs");

            if (linksTotal)
                linksTotal.textContent = formatNumber(stats.links.total);

            if (linksToday)
                linksToday.textContent = `+${formatNumber(stats.links.today)} today`;
        }

        if (statsBlocks[1] && stats.users) {
            const usersTotal = statsBlocks[1].querySelector(".text-4xl");
            const usersMonth = statsBlocks[1].querySelector(".text-xs");

            if (usersTotal)
                usersTotal.textContent = formatNumber(stats.users.total);

            if (usersMonth)
                usersMonth.textContent = `+${formatNumber(stats.users.active_month)} per month`;
        }

        if (stats.popular_domains && stats.popular_domains.data)
            updateDomainsChart(stats.popular_domains.data, stats.popular_domains.data.length);

        if (clicksChart)
            renderClicksChart(currentClicksRange);
        else
            renderClicksChart("week");

        updateStatsBlockById(currentClicksRange);
    } catch (error) {
        console.error("Error loading statistics:", error);
    }
}

function formatNumber(num) {
    if (typeof num !== "number")
        num = parseInt(num) || 0;

    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + "K";
    }

    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getOrCreateTooltip(chart) {
    let tooltipEl = chart.canvas.parentNode.querySelector(".custom-tooltip");
    if (!tooltipEl) {
        tooltipEl = document.createElement("div");

        tooltipEl.className = "custom-tooltip";
        tooltipEl.style.background = "rgba(39, 39, 42, 0.95)";
        tooltipEl.style.borderRadius = "8px";

        tooltipEl.style.color = "white";
        tooltipEl.style.opacity = "0";

        tooltipEl.style.pointerEvents = "none";
        tooltipEl.style.position = "absolute";

        tooltipEl.style.transform = "translate(-50%, 0)";
        tooltipEl.style.transition = "all .1s ease";
        tooltipEl.style.border = "1px solid #52525b";

        tooltipEl.style.width = "auto";
        tooltipEl.style.zIndex = "100";

        tooltipEl.style.padding = "8px 12px";
        tooltipEl.style.fontSize = "14px";

        chart.canvas.parentNode.appendChild(tooltipEl);
    }

    return tooltipEl;
}

function externalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = "0";
        return;
    }

    if (tooltip.body) {
        const dataPoint = tooltip.dataPoints[0];
        const total = dataPoint.dataset.data.reduce((a, b) => a + b, 0);
        const percentage = ((dataPoint.raw / total) * 100).toFixed(1);

        tooltipEl.innerHTML = `<strong>${dataPoint.label}</strong><br/>${percentage}%`;
    }

    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
    const canvasRect = chart.canvas.getBoundingClientRect();

    const centerX = canvasRect.width / 2;
    const centerY = canvasRect.height / 2;

    const mouseX = tooltip.caretX;
    const mouseY = tooltip.caretY;

    let offsetX = mouseX;
    let offsetY = mouseY;

    const distanceFromCenter = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
    if (distanceFromCenter < 80) {
        const angle = Math.atan2(mouseY - centerY, mouseX - centerX);

        offsetX = centerX + Math.cos(angle) * 120;
        offsetY = centerY + Math.sin(angle) * 120;
    }

    tooltipEl.style.opacity = "1";
    tooltipEl.style.left = positionX + offsetX + "px";
    tooltipEl.style.top = positionY + offsetY - 30 + "px";
}

let domainsChart = null;
function updateDomainsChart(domainsData, totalDomainsCount) {
    const topDomains = domainsData.slice(0, 4);
    const totalCount = domainsData.reduce((sum, item) => sum + item.count, 0);

    const labels = [];
    const data = [];
    const colors = ["#6366f1", "#818cf8", "#a5b4fc", "#38bdf8", "#f472b6"];

    topDomains.forEach((domain, index) => {
        labels.push(domain.domain);
        data.push(domain.count);
    });

    if (domainsData.length > 4) {
        const othersCount = domainsData.slice(4).reduce((sum, item) => sum + item.count, 0);
        if (othersCount > 0) {
            labels.push("etc.");
            data.push(othersCount);
        }
    }

    if (!domainsChart) {
        const ctxDomains = document.getElementById("chart-domains");
        if (!ctxDomains) return;
        domainsChart = new Chart(ctxDomains.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    label: "Domains",
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    cutout: "60%"
                }]
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: externalTooltipHandler
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
            }
        });
    } else {
        domainsChart.data.labels = labels;
        domainsChart.data.datasets[0].data = data;
        domainsChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);

        domainsChart.update();
    }

    updateDomainsLegend(labels, data, colors, totalCount, totalDomainsCount);
    const chartContainer = document.querySelector(".chart-container");

    if (chartContainer) {
        const centerStat = chartContainer.querySelector(".text-2xl.font-bold.text-indigo-300"); if (centerStat)
            centerStat.textContent = totalDomainsCount || domainsData.length;

        const chartCanvas = chartContainer.querySelector("canvas"); if (chartCanvas) {
            chartCanvas.style.minHeight = "240px";
            chartCanvas.style.height = "240px";
            chartCanvas.height = 240;
        }

        const chartBox = chartContainer.querySelector(".w-48.h-48"); if (chartBox) {
            chartBox.classList.remove("w-48", "h-48");
            chartBox.classList.add("w-60", "h-60");
            chartBox.style.width = "15rem";
            chartBox.style.height = "15rem";
        }
    }
}

function updateDomainsLegend(labels, data, colors, totalCount, totalDomainsCount) {
    const legendContainer = document.querySelector(".domains-legend"); if (!legendContainer)
        return;

    if (totalCount === 0) {
        legendContainer.innerHTML = "<div class='text - zinc - 500 text - center text - sm'>No data to display</div>";
        return;
    }

    const legendHTML = labels.map((label, index) => {
        const percentage = ((data[index] / totalCount) * 100).toFixed(1);
        return
        `
                <div class="flex items-center justify-between p-2 bg-zinc-800/30 rounded-lg">
                    <span class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full" style="background-color: ${colors[index]}"></span>
                        ${label}
                    </span>
                    <span class="text-zinc-400">${percentage}%</span>
                </div>
            `;
    }).join("");

    legendContainer.innerHTML = legendHTML;
}

if (typeof updateStatsBlockById === "function") {
    document.addEventListener("DOMContentLoaded", function () {
        updateStatsBlockById(currentClicksRange);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    const passwordToggle = document.getElementById("password-toggle");
    if (passwordToggle) {
        passwordToggle.addEventListener("click", function () {
            togglePassword(passwordToggle);
        });
    }
});
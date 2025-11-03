function togglePassword(btn) {
    const input = btn.parentNode.querySelector("input"); if (!input)
        return;

    if (input.type === "password") {
        input.type = "text";
        btn.classList.add("text-indigo-300");
        btn.classList.remove("text-zinc-400");
    } else {
        input.type = "password";
        btn.classList.remove("text-indigo-300");
        btn.classList.add("text-zinc-400");
    }

    btn.classList.add("scale-110");
    setTimeout(() => btn.classList.remove("scale-110"), 120);
}

function openSettingsModal() {
    const modal = document.getElementById("settings-modal"); if (modal) {
        modal.classList.remove("hidden");
        loadSettingsData();
    }
}

function closeSettingsModal() {
    const modal = document.getElementById("settings-modal"); if (modal) {
        modal.classList.add("hidden");
        clearSettingsForm();
    }
}

function loadSettingsData() {
    const emailInput = document.getElementById("settings-email");
    const usernameInput = document.getElementById("settings-username");

    const createdAt = document.getElementById("settings-created-at");
    const emailVerified = document.getElementById("settings-email-verified");
    const status = document.getElementById("settings-status"); status.textContent = "";

    fetch("http://localhost/api/users/me", {
        headers: {
            "accept": "application/json",
            "Authorization": "Bearer " + TokenManager.getToken()
        }
    }).then(res => res.json()).then(data => {
        emailInput.value = data.email || "";
        usernameInput.value = data.username || "";
        createdAt.textContent = "Created at: " + (data.created_at ? new Date(data.created_at).toLocaleString() : "—");
        emailVerified.innerHTML = data.email_verified ? "<span class='text-green-400'>Email is verified</span>" : "<span class='text-red-400'>Email is not verified</span>";
    }).catch(() => {
        status.textContent = "Error loading profile data";
        status.className = "text-center text-sm text-red-400 mt-2";
    });
}

function clearSettingsForm() {
    document.getElementById("settings-form").reset();
    document.getElementById("settings-status").textContent = "";
}

function initSettingsModalEvents() {
    const form = document.getElementById("settings-form");
    if (form) {
        form.onsubmit = async function (e) {
            e.preventDefault();

            const email = document.getElementById("settings-email").value.trim();
            const username = document.getElementById("settings-username").value.trim();

            const password = document.getElementById("settings-password").value;
            const current_password = document.getElementById("settings-current-password").value;

            const status = document.getElementById("settings-status");
            status.textContent = ""; status.className = "text-center text-sm text-zinc-400 mt-2";

            if (!current_password) {
                status.textContent = "Enter your current password to confirm changes.";
                status.className = "text-center text-sm text-red-400 mt-2";

                return;
            }

            const body = { email, username, current_password }; if (password)
                body.password = password;

            try {
                const res = await fetch("http://localhost/api/users/me/update", {
                    method: "POST",
                    headers: {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + TokenManager.getToken()
                    },
                    body: JSON.stringify(body)
                });

                status.textContent = "";
                status.className = "text-center text-sm mt-2";

                if (!res.ok) {
                    let errText = "Profile update error";
                    try {
                        const err = await res.json();
                        if (err && err.detail) {
                            if (typeof err.detail === "string") {
                                errText = translateProfileError(err.detail);
                            } else if (typeof err.detail === "object") {
                                if (err.detail.message) {
                                    errText = translateProfileError(err.detail.message);
                                } else {
                                    const first = Object.values(err.detail)[0];

                                    if (typeof first === "string")
                                        errText = translateProfileError(first);
                                    else if (Array.isArray(first) && typeof first[0] === "string")
                                        errText = translateProfileError(first[0]);
                                    else
                                        errText = translateProfileError(JSON.stringify(err.detail));
                                }
                            }
                        }
                    } catch { }

                    if (typeof showNotification === "function")
                        showNotification(errText, "error");

                    status.textContent = "";
                    status.className = "text-center text-sm mt-2";

                    return;
                }

                if (typeof showNotification === "function") {
                    showNotification("Changes saved successfully", "success");
                }

                status.textContent = "";
                status.className = "text-center text-sm mt-2";

                setTimeout(() => { window.location.reload(); }, 700);
            } catch (err) {
                let errText = "Profile update error"; if (err && err.message)
                    errText = translateProfileError(err.message);

                if (typeof showNotification === "function")
                    showNotification(errText, "error");

                status.textContent = "";
                status.className = "text-center text-sm mt-2";
            }

            function translateProfileError(msg) {
                if (!msg)
                    return "Error";

                if (msg.includes("Current password is incorrect"))
                    return "The current password is incorrect.";

                if (msg.includes("already exists") && msg.includes("email"))
                    return "This email is already in use";

                if (msg.includes("already exists") && msg.includes("username"))
                    return "This username is already taken";

                if (msg.includes("Password must be at least"))
                    return "The password is too short";

                if (msg.includes("uppercase"))
                    return "The password must contain at least one uppercase letter";

                if (msg.includes("lowercase"))
                    return "The password must contain at least one lowercase letter";

                if (msg.includes("digit"))
                    return "The password must contain at least one number";

                if (msg.includes("special character"))
                    return "The password must contain at least one special character";
                
                if (msg.includes("Email is not verified"))
                    return "Email is not verified";

                if (msg.includes("Invalid credentials"))
                    return "Неверные учетные данные";

                if (msg.includes("User with"))
                    return "User not found";

                if (msg.includes("Please wait"))
                    return "Too frequent email activation requests";

                if (msg.includes("Invalid email"))
                    return "Incorrect email";

                if (msg.includes("Invalid username"))
                    return "Incorrect username";

                if (msg.includes("Invalid password"))
                    return "Incorrect password";

                if (msg.includes("No changes"))
                    return "No changes";

                if (msg.includes("Internal server error"))
                    return "Internal server error";

                return msg;
            }
        };
    }

    const logoutBtn = document.getElementById("logout-all-btn");
    if (logoutBtn) {
        logoutBtn.onclick = async function (e) {
            if (e)
                e.preventDefault();

            const status = document.getElementById("settings-status"); status.textContent = "";
            try {
                const res = await fetch("http://localhost/api/users/logout", {
                    method: "POST",
                    headers: {
                        "accept": "application/json",
                        "Authorization": "Bearer " + TokenManager.getToken()
                    }
                });

                if (!res.ok)
                    throw new Error("Error signing out from all devices");

                if (typeof showNotification === "function")
                    showNotification("You are signed out of all devices", "success");

                document.getElementById("settings-form").reset();
                setTimeout(() => { window.location.reload(); }, 700);
            } catch (err) {
                status.textContent = err.message || "Error signing out from all devices";
                status.className = "text-center text-sm text-red-400 mt-2";
            }
        };
    }

    const closeBtn = document.getElementById("close-settings");
    if (closeBtn) {
        closeBtn.onclick = closeSettingsModal;
    }
}

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;